/** Family invitations: the paste action (all or nothing) and the guest's reply action. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ calls: [] as Array<{ name: string; args: Record<string, unknown> }>, result: null as unknown, error: null as null | { code?: string; message: string }, denied: false, limited: false }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }) }));
vi.mock("@/lib/guest-portal/crypto", () => ({ digestGuestPortalAddress: () => "d".repeat(64) }));
vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnvironment: () => ({ url: "https://db.example", publishableKey: "publishable" }) }));
const rpc = async (name: string, args: Record<string, unknown>) => {
  state.calls.push({ name, args });
  if (name === "consume_guest_portal_rate_limit") return { data: !state.limited, error: null };
  return { data: state.result, error: state.error };
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/lib/auth/access", async (original) => {
  const actual = await original<typeof import("@/lib/auth/access")>();
  return { ...actual, authorizeWeddingOperation: vi.fn(async () => { if (state.denied) throw new actual.AuthorizationDeniedError(); return { wedding: { id: "w", timezone: "Asia/Kolkata" }, user: { id: "u" }, membership: { role: "owner" }, moduleAccess: {} }; }) };
});

import { addFamiliesAction } from "../src/app/actions/family-invites";
import { submitFamilyReplyAction } from "../src/app/actions/family-reply";

const weddingId = "a0000000-0000-4000-8000-000000000001";
const fn = "a2000000-0000-4000-8000-000000000001";
const form = (rows: Array<[string, string?, string?]>, inviteTo: string[] = [fn]) => {
  const data = new FormData();
  data.set("weddingId", weddingId); data.set("familySide", "couple_two");
  for (const [name, phone = "", guests = ""] of rows) { data.append("familyName", name); data.append("familyPhone", phone); data.append("familyGuests", guests); }
  for (const id of inviteTo) data.append("inviteTo", id);
  return data;
};
const reply = { fullName: "Ravi Rao", phone: "+91 98765 43210", attending: "accept", guestCount: "3", events: [fn], dietary: "jain", dietaryNotes: "", message: "See you!" };

beforeEach(() => { state.calls = []; state.result = null; state.error = null; state.denied = false; state.limited = false; });

describe("Add families", () => {
  it("returns each problem against its box and never calls the database when any box is wrong", async () => {
    expect((await addFamiliesAction({}, form([["Rao family", "+91 98765 43210", "4"], ["Pai family", "", "25"]]))).errors).toEqual([{ row: 1, field: "guests", message: "Enter a number from 1 to 20." }]);
    expect((await addFamiliesAction({}, form([["Rao family"]], []))).error).toBe("Choose at least one event to invite them to.");
    expect(state.calls).toEqual([]);
  });

  it("refuses a tampered form", async () => {
    const data = form([["Rao family"]]); data.append("familyName", "Extra");
    expect((await addFamiliesAction({}, data)).error).toMatch(/Refresh it/);
    expect(state.calls).toEqual([]);
  });

  it("sends every family in one call, each with its own code", async () => {
    state.result = { status: "saved", families: [{}, {}] };
    const result = await addFamiliesAction({}, form([["Rao family", "98765 43210", "4"], ["", "", ""], ["Pai family"]]));
    expect(state.calls).toHaveLength(1);
    const { name, args } = state.calls[0]!;
    expect(name).toBe("create_family_invites_bulk");
    expect(args).toMatchObject({ p_wedding_id: weddingId, p_function_ids: [fn], p_family_side: "couple_two" });
    const sent = args.p_families as Array<{ name: string; phone: string; max_guests: number | null; code: string }>;
    expect(sent.map((row) => [row.name, row.phone, row.max_guests])).toEqual([["Rao family", "+91 98765 43210", 4], ["Pai family", "", null]]);
    expect(sent[0]!.code).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(sent[0]!.code).not.toBe(sent[1]!.code);
    expect(result.message).toMatch(/^Added 2 families\./);
  });

  it("shows names already on the list on that row's name box, and refuses without permission", async () => {
    state.result = { status: "invalid", errors: [{ index: 1, code: "exists" }] };
    expect((await addFamiliesAction({}, form([["Rao family"], ["", "", ""], ["Shetty family", "", "3"]]))).errors).toEqual([{ row: 2, field: "name", message: "A family with this name is already on your list. Use a different name, or edit the existing family." }]);
    state.denied = true;
    expect((await addFamiliesAction({}, form([["Rao family"]]))).error).toMatch(/no longer change this/);
    state.denied = false; state.error = { message: "boom" };
    expect((await addFamiliesAction({}, form([["Rao family"]]))).error).toBe("Couldn't add these families. Nothing was saved; refresh and try again.");
  });
});

describe("the family's reply", () => {
  it("checks the form, then saves through the link code with the publishable key only", async () => {
    expect(await submitFamilyReplyAction("ABCDEFGHJKLM", { ...reply, phone: "x" })).toEqual({ status: "invalid", field: "phone" });
    expect(state.calls).toEqual([]);
    state.result = { status: "saved" };
    expect(await submitFamilyReplyAction("ABCDEFGHJKLM", reply)).toEqual({ status: "saved" });
    const save = state.calls.find((call) => call.name === "submit_family_reply")!;
    expect(save.args).toEqual({ p_code: "ABCDEFGHJKLM", p_attending: true, p_guest_count: 3, p_function_ids: [fn], p_dietary: "jain", p_dietary_notes: "", p_message: "See you!", p_name: "Ravi Rao", p_phone: "+91 98765 43210" });
  });

  it("refuses bad codes, too many attempts and database refusals", async () => {
    expect(await submitFamilyReplyAction("bad code", reply)).toEqual({ status: "unavailable" });
    state.limited = true;
    expect(await submitFamilyReplyAction("ABCDEFGHJKLM", reply)).toEqual({ status: "busy" });
    state.limited = false; state.result = { status: "invalid", field: "guestCount" };
    expect(await submitFamilyReplyAction("ABCDEFGHJKLM", reply)).toEqual({ status: "invalid", field: "guestCount" });
    state.error = { message: "down" };
    expect(await submitFamilyReplyAction("ABCDEFGHJKLM", reply)).toEqual({ status: "unavailable" });
  });
});
