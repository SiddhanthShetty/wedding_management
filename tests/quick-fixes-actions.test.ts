import { beforeEach, describe, expect, it, vi } from "vitest";

// A small stand-in for the Supabase client: function rows in memory, and the auth calls the actions use.
type Row = { id: string; name: string; function_date: string | null; archived_at: string | null };
const state = vi.hoisted(() => ({ rows: [] as Row[], failOn: null as string | null, resetCalls: [] as unknown[], updateUserCalls: 0, user: { id: "u" } as { id: string } | null, signInError: null as null | { code: string } }));

function query(table: string) {
  const filters: Record<string, unknown> = {};
  let values: Partial<Row> | null = null;
  const run = async () => {
    if (!values) return { data: state.rows.filter((row) => !row.archived_at && row.function_date), error: null };
    if (filters.id === state.failOn) return { data: null, error: { message: "boom" } };
    const row = state.rows.find((item) => item.id === filters.id && item.function_date === filters.function_date && !item.archived_at);
    if (!row) return { data: null, error: null };
    Object.assign(row, values);
    return { data: { id: row.id }, error: null };
  };
  const chain: Record<string, unknown> = {
    select: () => chain, is: () => chain, not: () => chain,
    eq: (column: string, value: unknown) => { filters[column] = value; return chain; },
    update: (next: Partial<Row>) => { values = next; return chain; },
    maybeSingle: run,
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => run().then(resolve, reject),
  };
  void table;
  return chain;
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "wedding.example", "x-forwarded-proto": "https" }) }));
vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnvironment: () => ({ url: "x", publishableKey: "y" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: query,
    auth: {
      resetPasswordForEmail: async (...args: unknown[]) => { state.resetCalls.push(args); return { error: null }; },
      getUser: async () => ({ data: { user: state.user } }),
      updateUser: async () => { state.updateUserCalls += 1; return { error: null }; },
      signInWithPassword: async () => ({ error: state.signInError }),
    },
  }),
}));
vi.mock("@/lib/auth/access", async (original) => ({
  ...(await original<typeof import("@/lib/auth/access")>()),
  authorizeWeddingOperation: vi.fn(async () => ({ wedding: { id: "w", timezone: "Asia/Kolkata" }, user: { id: "u" }, membership: { role: "owner" } })),
}));

import { moveFunctionsAction } from "../src/app/actions/functions";
import { requestPasswordResetAction, signInAction, updatePasswordAction } from "../src/app/actions/auth";

const weddingId = "a0000000-0000-4000-8000-000000000001";
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };

describe("Move all dates", () => {
  beforeEach(() => {
    state.failOn = null;
    state.rows = [
      { id: "1", name: "Haldi", function_date: "2026-12-01", archived_at: null },
      { id: "2", name: "Muhurtham", function_date: "2026-12-02", archived_at: null },
      { id: "3", name: "Reception", function_date: "2026-12-02", archived_at: null },
    ];
  });

  it("moves every dated function and says how far", async () => {
    const result = await moveFunctionsAction({}, form({ weddingId, newFirstDate: "2027-12-01" }));
    expect(result.message).toMatch(/^Moved 3 functions 365 days later/);
    expect(state.rows.map((row) => row.function_date)).toEqual(["2027-12-01", "2027-12-02", "2027-12-02"]);
  });

  it("puts everything back if one function can't be moved", async () => {
    state.failOn = "3";
    const result = await moveFunctionsAction({}, form({ weddingId, newFirstDate: "2027-12-01" }));
    expect(result.error).toMatch(/nothing was moved/);
    expect(state.rows.map((row) => row.function_date)).toEqual(["2026-12-01", "2026-12-02", "2026-12-02"]);
  });

  it("refuses a missing date or no change", async () => {
    expect((await moveFunctionsAction({}, form({ weddingId, newFirstDate: "" }))).error).toMatch(/Choose the new date/);
    expect((await moveFunctionsAction({}, form({ weddingId, newFirstDate: "2026-12-01" }))).error).toMatch(/already on that date/);
  });
});

describe("Forgot password", () => {
  beforeEach(() => { state.resetCalls = []; state.updateUserCalls = 0; state.user = { id: "u" }; state.signInError = null; });

  it("gives the same answer for any email and links back to this site's reset page", async () => {
    const result = await requestPasswordResetAction({}, form({ email: " Someone@Example.com " }));
    expect(result).toEqual({ message: "Reset link sent.", sentTo: "someone@example.com" });
    expect(state.resetCalls[0]).toEqual(["someone@example.com", { redirectTo: "https://wedding.example/auth/callback?next=/reset-password" }]);
    expect((await requestPasswordResetAction({}, form({ email: "not-an-email" }))).error).toMatch(/email address/);
  });

  it("checks the new password before saving, and needs the link's sign-in", async () => {
    expect((await updatePasswordAction({}, form({ password: "long enough", confirmPassword: "different!" }))).error).toMatch(/don't match/);
    state.user = null;
    expect((await updatePasswordAction({}, form({ password: "long enough", confirmPassword: "long enough" }))).error).toMatch(/expired/);
    expect(state.updateUserCalls).toBe(0);
    state.user = { id: "u" };
    await expect(updatePasswordAction({}, form({ password: "long enough", confirmPassword: "long enough" }))).rejects.toThrow("REDIRECT");
    expect(state.updateUserCalls).toBe(1);
  });

  it("tells you to confirm your email instead of 'wrong password'", async () => {
    state.signInError = { code: "email_not_confirmed" };
    expect((await signInAction({}, form({ email: "a@b.co ", password: "long enough" }))).error).toMatch(/confirm your email/);
  });
});
