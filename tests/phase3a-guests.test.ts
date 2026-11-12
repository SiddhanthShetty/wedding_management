import { beforeEach, describe, expect, it, vi } from "vitest";
import { familyInvitations, parseFamilyMembers } from "../src/lib/planning/family-input";

const rpc = vi.hoisted(() => ({ calls: [] as Array<{ name: string; args: Record<string, unknown> }>, failGuestNamed: null as string | null, bulkCount: null as number | null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/access", async (original) => ({
  ...(await original<typeof import("@/lib/auth/access")>()),
  authorizeWeddingOperation: vi.fn(async () => ({ wedding: { id: "w" }, user: { id: "u" }, membership: { role: "owner" } })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpc.calls.push({ name, args });
      if (name === "save_guest_household") return { data: "a0000000-0000-4000-8000-0000000000f1", error: null };
      if (name === "save_guest") {
        const values = args.p_values as { full_name: string };
        if (values.full_name === rpc.failGuestNamed) return { data: null, error: { code: "23514", message: "bad" } };
        return { data: `a0000000-0000-4000-8000-00000000${String(rpc.calls.length).padStart(4, "0")}`, error: null };
      }
      if (name === "set_guest_invitations_bulk") return { data: rpc.bulkCount ?? (args.p_invitations as unknown[]).length, error: null };
      if (name === "delete_guest_household") return { data: 1, error: null };
      return { data: null, error: { message: "unexpected" } };
    },
  }),
}));

import { createFamilyAction } from "../src/app/actions/guests";

const weddingId = "a0000000-0000-4000-8000-000000000001";
const F1 = "a0000000-0000-4000-8000-0000000000c1";
const F2 = "a0000000-0000-4000-8000-0000000000c2";
const form = (entries: Array<[string, string]>) => { const data = new FormData(); for (const [key, value] of entries) data.append(key, value); return data; };

describe("family names, one per line", () => {
  it("drops blank lines and repeats, and tidies spacing", () => {
    expect(parseFamilyMembers("Ramesh Rao\n\n  Sunita   Rao \nramesh rao\r\nAnanya Rao")).toEqual({ names: ["Ramesh Rao", "Sunita Rao", "Ananya Rao"], error: null });
  });
  it("needs at least one and at most 30 people", () => {
    expect(parseFamilyMembers("  \n ").error).toMatch(/at least one/);
    expect(parseFamilyMembers(Array.from({ length: 31 }, (_, index) => `Person ${index}`).join("\n")).error).toMatch(/up to 30/);
    expect(parseFamilyMembers("x".repeat(181)).error).toMatch(/too long/);
  });
  it("invites everyone to every chosen function", () => {
    expect(familyInvitations(["g1", "g2"], ["f1", "f2"])).toHaveLength(4);
    expect(familyInvitations(["g1"], [])).toEqual([]);
  });
});

describe("Add a family", () => {
  beforeEach(() => { rpc.calls = []; rpc.failGuestNamed = null; rpc.bulkCount = null; });

  it("adds the family, each person and their invitations", async () => {
    const result = await createFamilyAction({}, form([["weddingId", weddingId], ["name", "Rao family"], ["familySide", "couple_one"], ["contactPhone", ""], ["members", "Ramesh Rao\nSunita Rao"], ["inviteTo", F1], ["inviteTo", F2]]));
    expect(result.message).toBe("Added Rao family: 2 people, invited to 2 functions.");
    expect(rpc.calls.map((call) => call.name)).toEqual(["save_guest_household", "save_guest", "save_guest", "set_guest_invitations_bulk"]);
    expect((rpc.calls[0].args.p_values as { contact_name: string }).contact_name).toBe("Ramesh Rao");
    expect(rpc.calls[3].args.p_invitations).toHaveLength(4);
  });

  it("removes the family again if someone can't be added", async () => {
    rpc.failGuestNamed = "Sunita Rao";
    const result = await createFamilyAction({}, form([["weddingId", weddingId], ["name", "Rao family"], ["members", "Ramesh Rao\nSunita Rao"], ["inviteTo", F1]]));
    expect(result.error).toMatch(/nothing was saved/);
    expect(rpc.calls.at(-1)).toMatchObject({ name: "delete_guest_household", args: { p_delete_members: true } });
    expect(rpc.calls.some((call) => call.name === "set_guest_invitations_bulk")).toBe(false);
  });

  it("removes the family again if the invitations don't all save", async () => {
    rpc.bulkCount = 1;
    const result = await createFamilyAction({}, form([["weddingId", weddingId], ["name", "Rao family"], ["members", "Ramesh Rao\nSunita Rao"], ["inviteTo", F1]]));
    expect(result.error).toMatch(/nothing was saved/);
    expect(rpc.calls.at(-1)?.name).toBe("delete_guest_household");
  });

  it("checks the form before saving anything", async () => {
    expect((await createFamilyAction({}, form([["weddingId", weddingId], ["name", ""], ["members", "A"]]))).error).toMatch(/family a name/);
    expect((await createFamilyAction({}, form([["weddingId", weddingId], ["name", "Rao family"], ["members", " "]]))).error).toMatch(/at least one/);
    expect((await createFamilyAction({}, form([["weddingId", weddingId], ["name", "Rao family"], ["members", "A"], ["inviteTo", "not-an-id"]]))).error).toBeTruthy();
    expect(rpc.calls).toEqual([]);
  });

  it("can add a family without inviting them yet", async () => {
    const result = await createFamilyAction({}, form([["weddingId", weddingId], ["name", "Rao family"], ["members", "Ramesh Rao"]]));
    expect(result.message).toBe("Added Rao family: 1 person, not invited to anything yet.");
    expect(rpc.calls.map((call) => call.name)).toEqual(["save_guest_household", "save_guest"]);
  });
});
