/** Guests → Invitation: the preview shows what the family link shows, never sends replies, and lists what's missing. */
import { afterEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { assumeUser, createTestDatabase, FUNCTION_A, FUNCTION_A_CEREMONY, OWNER_A, WEDDING_A } from "./support/database";
import { invitationChecklist, inviteEvents, previewInvitation, SAMPLE_FAMILY, type FunctionRecord } from "../src/lib/family-invites/preview";
import { CODE_PATTERN } from "../src/lib/family-invites/rules";
import { invitationConfig, type InvitationConfig } from "../src/config/invitation";

const fn = (id: string, name: string, overrides: Partial<FunctionRecord> = {}): FunctionRecord => ({
  id, name, function_type: "custom", description: "", function_date: "2027-12-05", start_time: "10:00:00", end_time: null, venue_name: "Hall", guest_map_url: "https://maps.example/x", dress_code: null, status: "planned", archived_at: null, ...overrides,
});
const wedding = { date: "2027-12-05", timezone: "Asia/Kolkata" };

describe("the invitation in the preview", () => {
  it("shows active events by date, time and name, leaving out cancelled and archived ones", () => {
    const events = inviteEvents([fn("3", "Reception", { function_date: "2027-12-06" }), fn("1", "Muhurtham", { start_time: "09:00:00" }), fn("2", "Haldi", { function_date: null, start_time: null }), fn("4", "Mehendi", { status: "cancelled" }), fn("5", "Sangeet", { archived_at: "2027-01-01" }), fn("6", "Akshate")]);
    expect(events.map((event) => event.name)).toEqual(["Muhurtham", "Akshate", "Reception", "Haldi"]);
    expect(events[0]).toEqual({ id: "1", name: "Muhurtham", type: "custom", description: "", date: "2027-12-05", start_time: "09:00:00", end_time: null, venue: "Hall", map_url: "https://maps.example/x", dress_code: null });
  });

  it("shows a family only its own events, limit and reply; the sample family sees every event", () => {
    const functions = [fn("1", "Muhurtham"), fn("2", "Reception", { function_date: "2027-12-06" })];
    const reply = { attending: true, guest_count: 3, function_ids: ["1"], dietary: "veg", dietary_notes: "", message: "", name: "", phone: "", updated_at: "" };
    expect(previewInvitation({ family: { name: "Rao family", max_guests: 4, function_ids: ["2"] }, functions, reply, wedding })).toMatchObject({ family: "Rao family", max_guests: 4, functions: [{ id: "2" }], reply: { guest_count: 3 } });
    expect(previewInvitation({ family: SAMPLE_FAMILY, functions, reply, wedding })).toMatchObject({ family: "Sample family", max_guests: null, reply: null, functions: [{ id: "1" }, { id: "2" }] });
  });

  it("can never send a reply: the preview's code isn't a valid link code", () => {
    expect(CODE_PATTERN.test("preview")).toBe(false);
  });
});

describe("what's still missing", () => {
  const config = (overrides: Partial<InvitationConfig> = {}): InvitationConfig => ({ ...invitationConfig, ...overrides });
  const filled = config({
    families: { ...invitationConfig.families, brideGrandparents: ["A and B"], groomGrandparents: ["C and D"] },
    goodToKnow: { ...invitationConfig.goodToKnow, weather: "Warm" }, rsvp: { respondBy: "2027-11-01" },
  });

  it("is empty when everything is filled in", () => {
    expect(invitationChecklist({ config: filled, functions: [fn("1", "Muhurtham")], weddingDate: "2027-12-05", familiesWithoutLink: 0, canSeeFunctions: true })).toEqual([]);
  });

  it("names each gap, with a link to where it's fixed", () => {
    const empty = config({ families: { ...invitationConfig.families, brideGrandparents: null, groomGrandparents: null }, goodToKnow: { weather: null, dressCode: null, hashtag: null, parking: null, driversAndStaff: null }, rsvp: { respondBy: null } });
    const items = invitationChecklist({ config: empty, functions: [fn("1", "Muhurtham", { venue_name: null, guest_map_url: null }), fn("2", "Haldi", { function_date: null, start_time: null }), fn("3", "Old", { status: "cancelled", venue_name: null })], weddingDate: null, familiesWithoutLink: 2, canSeeFunctions: true });
    expect(items.map((item) => item.text)).toEqual([
      "No wedding date yet, so the countdown and the date on the cover are hidden.",
      `${invitationConfig.brideName}'s grandparents line is empty, so it's left out.`,
      `${invitationConfig.groomName}'s grandparents line is empty, so it's left out.`,
      "\"Good to know\" is empty (weather, what to wear, a photo hashtag, parking, drivers), so the section is hidden.",
      "No reply-by date, so families aren't asked to reply by a date.",
      "Muhurtham: no venue or map link.",
      "Haldi: no date or start time.",
      "2 families have no link yet: tap Make their link on the families list.",
    ]);
    expect(items.find((item) => item.text.startsWith("Muhurtham"))?.href).toBe("/functions");
  });

  it("leaves out events for members who can't see Plan, and says when there are none", () => {
    expect(invitationChecklist({ config: filled, functions: [fn("1", "Muhurtham", { venue_name: null })], weddingDate: "2027-12-05", familiesWithoutLink: 0, canSeeFunctions: false })).toEqual([]);
    expect(invitationChecklist({ config: filled, functions: [], weddingDate: "2027-12-05", familiesWithoutLink: 1, canSeeFunctions: true }).map((item) => item.text)).toEqual(["No functions yet, so the invitation has no events.", "1 family has no link yet: tap Make their link on the families list."]);
  });
});

describe("matches the family link", () => {
  let db: PGlite;
  afterEach(async () => { await db?.close(); });

  it("builds the same invitation as get_family_invitation from the app's own records", async () => {
    db = await createTestDatabase();
    await assumeUser(db, OWNER_A);
    const code = "CODE00000001";
    await db.query("select public.create_family_invites_bulk($1,$2::jsonb,$3::uuid[],'couple_one')", [WEDDING_A, JSON.stringify([{ name: "Rao family", phone: "", max_guests: 4, code }]), [FUNCTION_A, FUNCTION_A_CEREMONY]]);
    await db.exec("reset role");
    await db.query("update public.functions set guest_map_url='https://maps.example/hall', dress_code='Traditional', description='Morning rites' where id=$1", [FUNCTION_A]);
    const family = (await db.query<{ id: string; name: string; invite_max_guests: number | null }>("select id,name,invite_max_guests from public.guest_households where invite_code=$1", [code])).rows[0]!;
    const invited = (await db.query<{ function_id: string }>("select function_id from public.family_function_invites where household_id=$1", [family.id])).rows.map((row) => row.function_id);
    const functions = (await db.query<FunctionRecord>("select id,name,function_type,description,function_date::text,start_time::text,end_time::text,venue_name,guest_map_url,dress_code,status::text,archived_at::text from public.functions where wedding_id=$1", [WEDDING_A])).rows;
    const weddingRow = (await db.query<{ date: string | null; timezone: string }>("select wedding_date::text date, timezone from public.weddings where id=$1", [WEDDING_A])).rows[0]!;
    await assumeUser(db, null, "anon");
    const fromLink = (await db.query<{ d: unknown }>("select public.get_family_invitation($1) d", [code])).rows[0]!.d;
    const preview = previewInvitation({ family: { name: family.name, max_guests: family.invite_max_guests, function_ids: invited }, functions, reply: null, wedding: weddingRow });
    expect(preview).toEqual(fromLink);
  });
});
