/** Family invitations: one link per family, one reply per family. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, FUNCTION_A_CEREMONY, FUNCTION_B, OWNER_A, OWNER_B, READ_ONLY, SCOPED, WEDDING_A } from "./support/database";

let db: PGlite;
beforeEach(async () => { db = await createTestDatabase(); await assumeUser(db, OWNER_A); });
afterEach(async () => { await db.close(); });

const peek = async <T>(sql: string, params: unknown[] = []) => { await db.exec("reset role"); return (await db.query<T>(sql, params)).rows; };
const peekOne = async <T>(sql: string, params: unknown[] = []) => (await peek<T>(sql, params))[0]!;
const count = async (table: string) => (await peekOne<{ n: number }>(`select count(*)::int n from public.${table} where wedding_id=$1`, [WEDDING_A])).n;
const code = (n: number) => `CODE${String(n).padStart(8, "0")}`;
const family = (name: string, n: number, max: number | null = null, phone = "") => ({ name, phone, max_guests: max, code: code(n) });
type Bulk = { status: string; errors?: Array<{ index: number; code: string }>; families?: Array<{ index: number; household_id: string; contact_guest_id: string }> };
const bulk = async (families: unknown[], functions = [FUNCTION_A, FUNCTION_A_CEREMONY]) =>
  (await db.query<{ r: Bulk }>("select public.create_family_invites_bulk($1,$2::jsonb,$3::uuid[],'couple_one') r", [WEDDING_A, JSON.stringify(families), functions])).rows[0]!.r;

type Invitation = { family: string; max_guests: number | null; functions: Array<{ id: string; name: string }>; reply: null | { attending: boolean; guest_count: number; function_ids: string[]; dietary: string; name: string } };
const asGuest = async () => assumeUser(db, null, "anon");
const open = async (c: string) => (await db.query<{ d: Invitation | null }>("select public.get_family_invitation($1) d", [c])).rows[0]!.d;
const reply = async (c: string, values: { attending: boolean; count?: number; functions?: string[]; dietary?: string; name?: string; phone?: string }) =>
  (await db.query<{ r: { status: string; field?: string } }>("select public.submit_family_reply($1,$2,$3,$4::uuid[],$5,'',$6,$7,$8) r",
    [c, values.attending, values.count ?? 0, values.functions ?? [], values.dietary ?? "none", "Congratulations!", values.name ?? "Ravi Rao", values.phone ?? "+91 98765 43210"])).rows[0]!.r;

describe("adding families", () => {
  it("creates the family, a contact person and its functions in one go", async () => {
    const result = await bulk([family("Rao family", 1, 4, "+91 98765 43210"), family("Pai family", 2)]);
    expect(result.status).toBe("saved");
    expect(await peekOne("select name,contact_phone,invite_code,invite_max_guests from public.guest_households where name='Rao family'")).toEqual({ name: "Rao family", contact_phone: "+91 98765 43210", invite_code: code(1), invite_max_guests: 4 });
    expect(await peekOne("select full_name,phone from public.guests where id=$1", [result.families![0]!.contact_guest_id])).toEqual({ full_name: "Rao family", phone: "+91 98765 43210" });
    expect([await count("guest_households"), await count("guests"), await count("family_function_invites"), await count("guest_invitations")]).toEqual([2, 2, 4, 0]);
  });

  it("refuses duplicate names and repeats, and writes nothing", async () => {
    await db.query("select public.save_guest_household($1,null,$2::jsonb)", [WEDDING_A, JSON.stringify({ name: "Shetty  Family" })]);
    expect(await bulk([family("Kini family", 1), family(" shetty family ", 2), family("KINI family", 3)])).toEqual({ status: "invalid", errors: [{ index: 1, code: "exists" }, { index: 2, code: "repeat" }] });
    expect([await count("guest_households"), await count("family_function_invites")]).toEqual([1, 0]);
  });

  it("rolls back on a bad row or function, and refuses people without guest edit access", async () => {
    await expectDenied(bulk([family("Good family", 1), family("Bad family", 2, 21)]), /Invalid family row/);
    await expectDenied(bulk([family("Good family", 1), { ...family("Bad code", 2), code: "short" }]), /Invalid family row/);
    await expectDenied(bulk([family("Good family", 1)], [FUNCTION_B]), /still on/);
    await expectDenied(bulk([family("Good family", 1)], []), /at least one function/);
    await db.exec("reset role");
    await db.query("insert into public.member_module_permissions(wedding_id,membership_id,module,access_level) values($1,'a1000000-0000-4000-8000-000000000004','guests','read')", [WEDDING_A]);
    for (const user of [SCOPED, READ_ONLY, OWNER_B]) { await assumeUser(db, user); await expectDenied(bulk([family("Sneaky family", 3)]), /permission/); }
    await asGuest(); await expectDenied(bulk([family("Sneaky family", 3)]));
    expect(await count("guest_households")).toBe(0);
  });
});

describe("the family's link", () => {
  it("shows the family, its limit and only its functions, and saves one reply for the family", async () => {
    await bulk([family("Rao family", 1, 4)], [FUNCTION_A]);
    await asGuest();
    const invitation = (await open(code(1)))!;
    expect(invitation).toMatchObject({ family: "Rao family", max_guests: 4, reply: null });
    expect(invitation.functions.map((fn) => fn.id)).toEqual([FUNCTION_A]);
    expect(await reply(code(1), { attending: true, count: 3, functions: [FUNCTION_A], dietary: "vegetarian" })).toEqual({ status: "saved" });
    // Replying again from any phone updates the same reply.
    expect(await reply(code(1), { attending: true, count: 4, functions: [FUNCTION_A], name: "Meera Rao" })).toEqual({ status: "saved" });
    expect((await open(code(1)))!.reply).toMatchObject({ attending: true, guest_count: 4, function_ids: [FUNCTION_A], name: "Meera Rao" });
    expect([await count("family_replies"), await count("family_reply_history")]).toEqual([1, 2]);
  });

  it("checks the guest limit, the functions, the name and the phone", async () => {
    await bulk([family("Rao family", 1, 2)], [FUNCTION_A]);
    await asGuest();
    expect(await reply(code(1), { attending: true, count: 3, functions: [FUNCTION_A] })).toEqual({ status: "invalid", field: "guestCount" });
    expect(await reply(code(1), { attending: true, count: 0, functions: [FUNCTION_A] })).toEqual({ status: "invalid", field: "guestCount" });
    expect(await reply(code(1), { attending: true, count: 2, functions: [FUNCTION_A_CEREMONY] })).toEqual({ status: "invalid", field: "events" });
    expect(await reply(code(1), { attending: true, count: 2, functions: [] })).toEqual({ status: "invalid", field: "events" });
    expect(await reply(code(1), { attending: true, count: 2, functions: [FUNCTION_A], name: "R" })).toEqual({ status: "invalid", field: "fullName" });
    expect(await reply(code(1), { attending: true, count: 2, functions: [FUNCTION_A], phone: "call me" })).toEqual({ status: "invalid", field: "phone" });
    // Declining clears the count and functions.
    expect(await reply(code(1), { attending: false, count: 2, functions: [FUNCTION_A] })).toEqual({ status: "saved" });
    expect(await peekOne("select attending,guest_count,function_ids from public.family_replies")).toEqual({ attending: false, guest_count: 0, function_ids: [] });
  });

  it("stops working for unknown codes and removed families, keeping the reply; works again when put back", async () => {
    const result = await bulk([family("Rao family", 1)], [FUNCTION_A]);
    await asGuest();
    expect(await open("NOPE00000000")).toBeNull();
    expect(await open("bad code")).toBeNull();
    await reply(code(1), { attending: true, count: 2, functions: [FUNCTION_A] });
    await assumeUser(db, OWNER_A);
    await db.query("select public.set_family_removed($1,$2,true)", [WEDDING_A, result.families![0]!.household_id]);
    await asGuest();
    expect(await open(code(1))).toBeNull();
    expect(await reply(code(1), { attending: false })).toEqual({ status: "unavailable" });
    expect(await count("family_replies")).toBe(1);
    await assumeUser(db, OWNER_A);
    await db.query("select public.set_family_removed($1,$2,false)", [WEDDING_A, result.families![0]!.household_id]);
    await asGuest();
    expect((await open(code(1)))!.reply).toMatchObject({ attending: true, guest_count: 2 });
  });

  it("gives older families a code once, and replaces it only when asked", async () => {
    const household = (await db.query<{ id: string }>("select public.save_guest_household($1,null,$2::jsonb) id", [WEDDING_A, JSON.stringify({ name: "Older family" })])).rows[0]!.id;
    const set = async (c: string, replace: boolean) => (await db.query<{ c: string }>("select public.set_family_invite_code($1,$2,$3,$4) c", [WEDDING_A, household, c, replace])).rows[0]!.c;
    expect(await set(code(5), false)).toBe(code(5));
    expect(await set(code(6), false)).toBe(code(5));
    expect(await set(code(7), true)).toBe(code(7));
    await assumeUser(db, SCOPED);
    await expectDenied(set(code(8), true), /permission/);
  });

  it("lets a planner change functions and limit, and record a phone reply", async () => {
    const result = await bulk([family("Rao family", 1, 2)], [FUNCTION_A]);
    const household = result.families![0]!.household_id;
    await db.query("select public.update_family_invite($1,$2,5,$3::uuid[])", [WEDDING_A, household, [FUNCTION_A_CEREMONY]]);
    expect((await peek<{ function_id: string }>("select function_id from public.family_function_invites")).map((row) => row.function_id)).toEqual([FUNCTION_A_CEREMONY]);
    await assumeUser(db, OWNER_A);
    expect((await db.query<{ r: unknown }>("select public.record_family_reply($1,$2,true,5,$3::uuid[],'jain','By phone') r", [WEDDING_A, household, [FUNCTION_A_CEREMONY]])).rows[0]!.r).toEqual({ status: "saved" });
    expect(await peekOne("select source,guest_count,dietary,recorded_by_user_id from public.family_replies")).toEqual({ source: "planner", guest_count: 5, dietary: "jain", recorded_by_user_id: OWNER_A });
    await assumeUser(db, SCOPED);
    await expectDenied(db.query("select public.record_family_reply($1,$2,false,0,'{}'::uuid[],'none','')", [WEDDING_A, household]), /permission/);
  });

  it("keeps guests and other members out of the tables directly", async () => {
    await bulk([family("Rao family", 1)], [FUNCTION_A]);
    await asGuest();
    await expectDenied(db.query("select * from public.family_replies"));
    await expectDenied(db.query("select invite_code from public.guest_households"));
    await assumeUser(db, OWNER_B);
    expect((await db.query("select * from public.family_function_invites")).rows).toEqual([]);
    await assumeUser(db, OWNER_A);
    await expectDenied(db.query("insert into public.family_replies(wedding_id,household_id,attending,guest_count,source) select wedding_id,id,false,0,'planner' from public.guest_households"));
  });
});

describe("backfill", () => {
  it("invites existing families to the functions their people were invited to", async () => {
    // Runs the migration's backfill statement again on data made the old way.
    const household = (await db.query<{ id: string }>("select public.save_guest_household($1,null,$2::jsonb) id", [WEDDING_A, JSON.stringify({ name: "Old family" })])).rows[0]!.id;
    const guest = (await db.query<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: household, full_name: "Old guest", email: "", phone: "", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })])).rows[0]!.id;
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)", [WEDDING_A, guest, FUNCTION_A]);
    await db.exec("reset role");
    const sql = (await import("node:fs/promises")).readFile("supabase/migrations/20261120100000_family_invitations.sql", "utf8");
    const backfill = /-- Backfill:[^\n]*\n(insert into public\.family_function_invites[\s\S]*?on conflict do nothing;)/.exec(await sql)![1]!;
    await db.exec(backfill);
    expect(await peek("select household_id,function_id from public.family_function_invites")).toEqual([{ household_id: household, function_id: FUNCTION_A }]);
  });
});

describe("deleting a family", () => {
  it("deletes the family, everyone in it, its events, reply and messages together", async () => {
    const result = await bulk([family("Rao family", 1, 4)], [FUNCTION_A]);
    const household = result.families![0]!.household_id;
    await db.query("select public.save_guest($1,null,$2::jsonb,null)", [WEDDING_A, JSON.stringify({ household_id: household, full_name: "Meera Rao", email: "", phone: "", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })]);
    await db.query("insert into public.communication_records(wedding_id,guest_id,channel,body_snapshot,dedupe_key,recorded_by_user_id,state,sent_at) values($1,$2,'whatsapp','Hi','family-invite:x:1',$3,'sent',now())", [WEDDING_A, result.families![0]!.contact_guest_id, OWNER_A]);
    await asGuest();
    await reply(code(1), { attending: true, count: 2, functions: [FUNCTION_A] });
    await assumeUser(db, SCOPED);
    await expectDenied(db.query("select public.delete_guest_household($1,$2,true)", [WEDDING_A, household]), /permission/);
    await assumeUser(db, OWNER_A);
    expect((await db.query<{ n: number }>("select public.delete_guest_household($1,$2,true) n", [WEDDING_A, household])).rows[0]!.n).toBe(2);
    expect([await count("guest_households"), await count("guests"), await count("family_function_invites"), await count("family_replies"), await count("family_reply_history"), await count("communication_records")]).toEqual([0, 0, 0, 0, 0, 0]);
    await asGuest();
    expect(await open(code(1))).toBeNull();
  });

});
