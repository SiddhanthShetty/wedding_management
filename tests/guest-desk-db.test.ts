/** Simple guest desk: the bulk "add families" function, family links, one-tap replies and placeholders. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, FUNCTION_A_CEREMONY, OWNER_A, OWNER_B, READ_ONLY, SCOPED, WEDDING_A } from "./support/database";

let db: PGlite;
beforeEach(async () => { db = await createTestDatabase(); await assumeUser(db, OWNER_A); });
afterEach(async () => { await db.close(); });

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;
/** Reads tables directly, as the database owner (members can't select every table). Call assumeUser again afterwards. */
const peek = async <T>(sql: string, params: unknown[] = []) => { await db.exec("reset role"); return (await db.query<T>(sql, params)).rows; };
const peekOne = async <T>(sql: string, params: unknown[] = []) => (await peek<T>(sql, params))[0]!;
const count = async (table: string) => (await peekOne<{ n: number }>(`select count(*)::int n from public.${table} where wedding_id=$1`, [WEDDING_A])).n;
const expires = () => new Date(Date.now() + 30 * 86_400_000).toISOString();
const digest = (n: number) => n.toString(16).padStart(64, "a");
const family = (name: string, size: number, n: number, phone = "") => ({ name, phone, size, token_digest: digest(n) });
type BulkResult = { status: string; errors?: Array<{ index: number; code: string }>; families?: Array<{ index: number; household_id: string; lead_guest_id: string; link_id: string; people: number }> };
const bulk = async (families: unknown[], functions = [FUNCTION_A, FUNCTION_A_CEREMONY]) =>
  (await one<{ r: BulkResult }>("select public.create_guest_families_bulk($1,$2::jsonb,$3::uuid[],'couple_one','kn',$4::timestamptz) r", [WEDDING_A, JSON.stringify(families), functions, expires()])).r;

/** Opens the family's page as a guest would: a session from the link, then the guest's own calls as anon. */
async function openAsGuest(linkDigest: string, session = "9".repeat(64)) {
  await assumeUser(db, null, "anon");
  await db.query("select public.create_guest_portal_session($1,$2)", [linkDigest, session]);
  return session;
}
type Portal = { people: Array<{ id: string; full_name: string; is_proxy: boolean; invitations: Array<{ id: string; updated_at: string | null; response: string | null }> }> };
const portal = async (session: string) => (await one<{ d: Portal }>("select public.get_guest_portal_data($1) d", [session])).d;
const replyAll = (session: string, person: Portal["people"][number], response = "yes", stale = false) => one<{ r: { status: string; saved_count?: number } }>(
  "select public.record_guest_portal_rsvps($1,$2,$3::jsonb) r",
  [session, person.id, JSON.stringify(person.invitations.map((invitation) => ({ invitation_id: invitation.id, response, note: "", expected_updated_at: stale ? "2000-01-01T00:00:00Z" : invitation.updated_at, submission_key: crypto.randomUUID() })))],
);

describe("adding families in bulk", () => {
  it("creates households, people, invitations, the lead's link and proxies in one go", async () => {
    const result = await bulk([family("Rao family", 4, 1, "+91 98765 43210"), family("Pai family", 1, 2)]);
    expect(result.status).toBe("saved");
    expect(result.families!.map((row) => row.people)).toEqual([4, 1]);
    const people = (await peek<{ full_name: string; phone: string; is_placeholder: boolean; family_side: string }>("select g.full_name,g.phone,g.is_placeholder,g.family_side from public.guests g join public.guest_households h on h.id=g.household_id where h.name='Rao family' order by g.created_at,g.full_name"));
    expect(people.map((row) => row.full_name)).toEqual(["Rao family", "Rao family guest 2", "Rao family guest 3", "Rao family guest 4"]);
    expect(people[0]!.phone).toBe("+91 98765 43210");
    expect(people.every((row) => row.is_placeholder && row.family_side === "couple_one")).toBe(true);
    const household = await peekOne<{ preferred_language: string; contact_phone: string }>("select preferred_language,contact_phone from public.guest_households where name='Rao family'");
    expect(household).toEqual({ preferred_language: "kn", contact_phone: "+91 98765 43210" });
    expect(await count("guest_invitations")).toBe(10); // 5 people × 2 functions
    expect(await count("guest_portal_links")).toBe(2);
    const rao = result.families![0]!;
    const link = await peekOne<{ guest_id: string; proxies: number }>("select l.guest_id,(select count(*)::int from public.guest_portal_link_proxies p where p.link_id=l.id) proxies from public.guest_portal_links l where l.id=$1", [rao.link_id]);
    expect(link).toEqual({ guest_id: rao.lead_guest_id, proxies: 3 });
  });

  it("refuses names already used and repeats in the same paste, and writes nothing", async () => {
    await db.query("select public.save_guest_household($1,null,$2::jsonb)", [WEDDING_A, JSON.stringify({ name: "Shetty  Family" })]);
    const before = await count("guest_households");
    const result = await bulk([family("Kini family", 2, 1), family(" shetty family ", 2, 2), family("KINI   family", 1, 3)]);
    expect(result).toEqual({ status: "invalid", errors: [{ index: 1, code: "exists" }, { index: 2, code: "repeat" }] });
    expect([await count("guest_households"), await count("guests"), await count("guest_invitations"), await count("guest_portal_links")]).toEqual([before, 0, 0, 0]);
  });

  it("rolls everything back when one row is bad", async () => {
    await expectDenied(bulk([family("Good family", 3, 1), family("Bad family", 21, 2)]), /Invalid family row/);
    await expectDenied(bulk([family("Good family", 3, 1), { ...family("Bad digest", 2, 2), token_digest: "nope" }]), /Invalid family row/);
    await expectDenied(bulk([family("Good family", 3, 1)], []), /at least one function/);
    expect([await count("guest_households"), await count("guests"), await count("guest_invitations"), await count("guest_portal_links")]).toEqual([0, 0, 0, 0]);
  });

  it("refuses people without guest edit permission, read-only members and other weddings", async () => {
    await db.exec("reset role");
    await db.query("insert into public.member_module_permissions(wedding_id,membership_id,module,access_level) values($1,'a1000000-0000-4000-8000-000000000004','guests','read')", [WEDDING_A]);
    for (const user of [SCOPED, READ_ONLY, OWNER_B]) {
      await assumeUser(db, user);
      await expectDenied(bulk([family("Sneaky family", 2, 1)]), /permission/);
    }
    await assumeUser(db, null, "anon");
    await expectDenied(bulk([family("Sneaky family", 2, 1)]));
    await assumeUser(db, OWNER_A);
    expect(await count("guest_households")).toBe(0);
  });
});

describe("one link per family", () => {
  it("lets the family link reply for everyone, and the one-tap reply records every invitation", async () => {
    await bulk([family("Rao family", 3, 1)]);
    const session = await openAsGuest(digest(1));
    const data = await portal(session);
    expect(data.people.map((person) => [person.full_name, person.is_proxy])).toEqual([["Rao family", false], ["Rao family guest 2", true], ["Rao family guest 3", true]]);
    for (const person of data.people) expect((await replyAll(session, person)).r).toEqual({ status: "saved", saved_count: 2 });
    await assumeUser(db, OWNER_A);
    expect(await peekOne<{ n: number }>("select count(*)::int n from public.guest_rsvps where wedding_id=$1 and response='yes' and response_source='portal'", [WEDDING_A])).toEqual({ n: 6 });
  });

  it("rolls back a stale write for that person", async () => {
    await bulk([family("Rao family", 2, 1)]);
    const session = await openAsGuest(digest(1));
    const [lead] = (await portal(session)).people;
    expect((await replyAll(session, lead!, "no")).r.status).toBe("saved");
    // The page still shows the old version: both answers are refused together.
    expect((await replyAll(session, lead!, "yes")).r.status).toBe("conflict");
    expect((await replyAll(session, lead!, "yes", true)).r.status).toBe("conflict");
    await assumeUser(db, OWNER_A);
    expect((await peek<{ response: string }>("select response from public.guest_rsvps")).map((row) => row.response)).toEqual(["no", "no"]);
  });

  it("keeps links made before this change working", async () => {
    const household = await one<{ id: string }>("select public.save_guest_household($1,null,$2::jsonb) id", [WEDDING_A, JSON.stringify({ name: "Older family" })]);
    const guest = await one<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: household.id, full_name: "Older guest", email: "", phone: "", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })]);
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)", [WEDDING_A, guest.id, FUNCTION_A]);
    await db.query("select public.create_guest_portal_link($1,$2,'{}'::uuid[],$3,$4::timestamptz)", [WEDDING_A, guest.id, digest(7), expires()]);
    expect((await peekOne<{ is_placeholder: boolean }>("select is_placeholder from public.guests where id=$1", [guest.id])).is_placeholder).toBe(false);
    const session = await openAsGuest(digest(7));
    const data = await portal(session);
    expect(data.people.map((person) => person.full_name)).toEqual(["Older guest"]);
    expect((await replyAll(session, data.people[0]!)).r.status).toBe("saved");
    expect((await one<{ ids: string[] }>("select public.get_guest_portal_placeholders($1) ids", [session])).ids).toEqual([]);
  });
});

describe("placeholder names", () => {
  it("lets the family name a placeholder once, records history, and refuses others", async () => {
    await bulk([family("Rao family", 2, 1)]);
    await bulk([family("Pai family", 2, 2)]);
    const pai = await peekOne<{ id: string }>("select id from public.guests where full_name='Pai family guest 2'");
    const session = await openAsGuest(digest(1));
    const placeholders = (await one<{ ids: string[] }>("select public.get_guest_portal_placeholders($1) ids", [session])).ids;
    expect(placeholders).toHaveLength(2);
    const guest2 = (await portal(session)).people.find((person) => person.full_name === "Rao family guest 2")!;
    const rename = (id: string, name: string, key = crypto.randomUUID()) => one<{ r: { status: string } }>("select public.rename_guest_portal_placeholder($1,$2,$3,$4) r", [session, id, name, key]);
    expect((await rename(pai.id, "Not mine")).r.status).toBe("unavailable");
    expect((await rename(guest2.id, "   ")).r.status).toBe("invalid");
    const key = crypto.randomUUID();
    expect((await rename(guest2.id, "  Meera   Rao ", key)).r.status).toBe("saved");
    expect((await rename(guest2.id, "Meera Rao", key)).r.status).toBe("duplicate");
    expect((await rename(guest2.id, "Someone else")).r.status).toBe("conflict");
    await assumeUser(db, OWNER_A);
    expect(await peekOne("select full_name,is_placeholder from public.guests where id=$1", [guest2.id])).toEqual({ full_name: "Meera Rao", is_placeholder: false });
    expect(await peekOne("select old_values,new_values,source from public.guest_profile_edit_history where guest_id=$1", [guest2.id])).toEqual({ old_values: { full_name: "Rao family guest 2" }, new_values: { full_name: "Meera Rao" }, source: "guest_portal" });
  });

  it("stops being a placeholder when a planner renames the person", async () => {
    const result = await bulk([family("Rao family", 2, 1)]);
    const lead = result.families![0]!.lead_guest_id;
    await peek("update public.guests set full_name='Ramesh Rao' where id=$1", [lead]);
    expect(await peekOne("select is_placeholder from public.guests where id=$1", [lead])).toEqual({ is_placeholder: false });
  });
});

describe("removing and putting back a family", () => {
  it("withdraws invitations and cancels the link, keeping replies; putting back re-invites", async () => {
    const result = await bulk([family("Rao family", 2, 1)]);
    const household = result.families![0]!.household_id;
    const session = await openAsGuest(digest(1));
    const [lead] = (await portal(session)).people;
    await replyAll(session, lead!);
    await assumeUser(db, SCOPED);
    await expectDenied(db.query("select public.set_guest_household_invited($1,$2,false)", [WEDDING_A, household]), /permission/);
    await assumeUser(db, OWNER_A);
    expect((await one<{ n: number }>("select public.set_guest_household_invited($1,$2,false) n", [WEDDING_A, household])).n).toBe(4);
    expect([await count("guests"), await count("guest_rsvps"), await count("guest_rsvp_history")]).toEqual([2, 2, 2]);
    expect(await peekOne("select count(*)::int n from public.guest_portal_links where revoked_at is null")).toEqual({ n: 0 });
    await assumeUser(db, null, "anon");
    expect(await portal(session)).toBeNull();
    await assumeUser(db, OWNER_A);
    expect((await one<{ n: number }>("select public.set_guest_household_invited($1,$2,true) n", [WEDDING_A, household])).n).toBe(4);
    expect(await peekOne("select count(*)::int n from public.guest_invitations where status='invited'")).toEqual({ n: 4 });
  });
});
