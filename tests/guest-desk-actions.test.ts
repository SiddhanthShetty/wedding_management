/** Simple guest desk: the paste action's all-or-nothing behaviour and permission handling. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>, rpcResult: null as unknown, rpcError: null as null | { code?: string; message: string }, denied: false }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/guest-portal/crypto", () => ({ newGuestPortalToken: (() => { let n = 0; return () => `token-${++n}`; })(), digestGuestPortalValue: (_kind: string, value: string) => `digest-of-${value}` }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (name: string, args: Record<string, unknown>) => { state.rpcCalls.push({ name, args }); return { data: state.rpcResult, error: state.rpcError }; },
  }),
}));
vi.mock("@/lib/auth/access", async (original) => {
  const actual = await original<typeof import("@/lib/auth/access")>();
  return {
    ...actual,
    authorizeWeddingOperation: vi.fn(async () => {
      if (state.denied) throw new actual.AuthorizationDeniedError();
      return { wedding: { id: "w", timezone: "Asia/Kolkata" }, user: { id: "u" }, membership: { role: "owner" }, moduleAccess: {} };
    }),
  };
});

import { addFamiliesAction } from "../src/app/actions/guest-desk";

const weddingId = "a0000000-0000-4000-8000-000000000001";
const fn = "a2000000-0000-4000-8000-000000000001";
const form = (families: string, inviteTo: string[] = [fn]) => {
  const data = new FormData();
  data.set("weddingId", weddingId); data.set("families", families); data.set("familySide", "couple_two"); data.set("language", "hi");
  for (const id of inviteTo) data.append("inviteTo", id);
  return data;
};

describe("Add families", () => {
  beforeEach(() => { state.rpcCalls = []; state.rpcResult = null; state.rpcError = null; state.denied = false; });

  it("lists line problems and never calls the database when any line is wrong", async () => {
    const result = await addFamiliesAction({}, form("Rao family, +91 98765 43210, 4\nPai family, , 25"));
    expect(result.problems).toEqual(["Line 2 (Pai family): number of guests should be 1 to 20."]);
    expect(state.rpcCalls).toEqual([]);
  });

  it("asks for a function", async () => {
    const result = await addFamiliesAction({}, form("Rao family", []));
    expect(result.problems).toEqual(["Choose at least one function to invite them to."]);
    expect(state.rpcCalls).toEqual([]);
  });

  it("sends every family in one call, with only link digests, and returns each token once", async () => {
    state.rpcResult = { status: "saved", families: [{ index: 0, household_id: "h1", lead_guest_id: "g1", people: 4 }, { index: 1, household_id: "h2", lead_guest_id: "g2", people: 1 }] };
    const result = await addFamiliesAction({}, form("Rao family, 98765 43210, 4\nPai family"));
    expect(state.rpcCalls).toHaveLength(1);
    const call = state.rpcCalls[0]!;
    expect(call.name).toBe("create_guest_families_bulk");
    expect(call.args).toMatchObject({ p_wedding_id: weddingId, p_function_ids: [fn], p_family_side: "couple_two", p_language: "hi" });
    const sent = call.args.p_families as Array<Record<string, unknown>>;
    expect(sent.map((row) => [row.name, row.phone, row.size])).toEqual([["Rao family", "+91 98765 43210", 4], ["Pai family", "", 1]]);
    expect(JSON.stringify(call.args)).not.toMatch(/"token-\d"/); // tokens never reach the database
    expect(result.created!.map((row) => [row.name, row.token, row.leadGuestId])).toEqual([["Rao family", expect.stringMatching(/^token-/), "g1"], ["Pai family", expect.stringMatching(/^token-/), "g2"]]);
    expect(result.message).toBe("Added 2 families (5 people).");
  });

  it("shows names already on the list as line problems", async () => {
    state.rpcResult = { status: "invalid", errors: [{ index: 1, code: "exists" }] };
    const result = await addFamiliesAction({}, form("Rao family\n\nShetty family, , 3"));
    expect(result.problems).toEqual(["Line 3 (Shetty family): a family with this name is already on your list. Give this one a different name, or edit the existing family."]);
    expect(result.created).toBeUndefined();
  });

  it("refuses without permission and on database errors, saying nothing was saved", async () => {
    state.denied = true;
    expect((await addFamiliesAction({}, form("Rao family"))).error).toMatch(/no longer change this/);
    state.denied = false; state.rpcError = { code: "42501", message: "Guest edit permission required." };
    expect((await addFamiliesAction({}, form("Rao family"))).error).toMatch(/no longer change this/);
    state.rpcError = { message: "boom" };
    expect((await addFamiliesAction({}, form("Rao family"))).error).toBe("Couldn't add these families. Nothing was saved; refresh and try again.");
  });
});
