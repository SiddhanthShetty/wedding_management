import { beforeEach, describe, expect, it, vi } from "vitest";

const created = vi.hoisted(() => [] as Array<{ title: string; dueDate: string }>);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/access", async (original) => ({
  ...(await original<typeof import("@/lib/auth/access")>()),
  authorizeWeddingOperation: vi.fn(async () => ({ wedding: { id: "w", timezone: "Asia/Kolkata" }, user: { id: "u" }, membership: { role: "owner" } })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { wedding_date: "2027-12-03" }, error: null }) }) }) }) }),
}));
vi.mock("@/lib/data/tasks", () => ({
  listWeddingTasks: async () => [{ title: "Book the caterer" }],
  createWeddingTask: async (_wedding: string, input: { title: string; dueDate: string }) => { created.push({ title: input.title, dueDate: input.dueDate }); return { id: "t" }; },
}));

import { applyTaskChecklistAction } from "../src/app/actions/setup";

const weddingId = "a0000000-0000-4000-8000-000000000001";
const form = (entries: Array<[string, string]>) => { const data = new FormData(); for (const [key, value] of entries) data.append(key, value); return data; };

describe("starter checklist on the Tasks page", () => {
  beforeEach(() => { created.length = 0; });

  it("adds only the ticked tasks, skipping ones already in the list", async () => {
    const result = await applyTaskChecklistAction({}, form([["weddingId", weddingId], ["picking", "1"], ["starterTask", "Draft the guest list"], ["starterTask", "Book the caterer"], ["starterTask", "Not a real template"]]));
    expect(created.map((item) => item.title)).toEqual(["Draft the guest list"]);
    expect(result.message).toMatch(/Added 1 task.*1 already existed/);
  });

  it("asks you to tick something rather than adding everything", async () => {
    const result = await applyTaskChecklistAction({}, form([["weddingId", weddingId], ["picking", "1"]]));
    expect(result.error).toBe("Tick at least one task.");
    expect(created).toEqual([]);
  });
});
