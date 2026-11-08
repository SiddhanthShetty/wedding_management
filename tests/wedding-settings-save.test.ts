import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: () => ({ update: (values: unknown) => { update(values); return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: "w" }, error: null }) }) }) }; } }) }),
}));
vi.mock("@/lib/auth/access", async (original) => ({
  ...(await original<typeof import("@/lib/auth/access")>()),
  authorizeWeddingOperation: vi.fn(async () => ({ membership: { role: "owner" } })),
}));

import { updateWeddingSetupAction } from "../src/app/actions/weddings";
import * as access from "../src/lib/auth/access";

const weddingId = "a0000000-0000-4000-8000-000000000001";
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ weddingId, name: "Swee & Sid's Wedding", partnerOneDisplayName: "Siddhanth", partnerTwoDisplayName: "Sweekruti", weddingDate: "", timezone: "Asia/Kolkata", currency: "INR", mainLocations: "", overallBudget: "", planningNotes: "", ...values })) data.set(key, value);
  return data;
}

describe("saving wedding details from Settings", () => {
  beforeEach(() => update.mockClear());

  it("saves the form as it is really submitted, including blanks", async () => {
    const result = await updateWeddingSetupAction({}, form({ dateNotFinal: "on" }));
    expect(result).toEqual({ message: "Wedding details saved." });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ timezone: "Asia/Kolkata", currency: "INR", wedding_date: null, wedding_date_status: "tentative", main_locations: [], overall_budget: null }));
  });

  it("saves a confirmed date, places and budget", async () => {
    const result = await updateWeddingSetupAction({}, form({ weddingDate: "2027-12-03", mainLocations: "Mangaluru\nUdupi", overallBudget: "2500000" }));
    expect(result.message).toBe("Wedding details saved.");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ wedding_date: "2027-12-03", wedding_date_status: "confirmed", main_locations: ["Mangaluru", "Udupi"], overall_budget: 2500000 }));
  });

  it("generates the workspace name when it is left blank", async () => {
    await updateWeddingSetupAction({}, form({ name: "" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: "Siddhanth & Sweekruti's Wedding" }));
  });

  it("only blames access when access is really the problem", async () => {
    vi.mocked(access.authorizeWeddingOperation).mockRejectedValueOnce(new access.AuthorizationDeniedError());
    expect((await updateWeddingSetupAction({}, form({}))).error).toMatch(/access/i);
    vi.mocked(access.authorizeWeddingOperation).mockRejectedValueOnce(new Error("network"));
    const other = await updateWeddingSetupAction({}, form({}));
    expect(other.error).toMatch(/Nothing was changed/);
    expect(other.error).not.toMatch(/access/i);
  });
});
