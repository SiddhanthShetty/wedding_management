import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { emailLinkType, linkErrorMessage, newPasswordProblem, safeNextPath, signInErrorMessage, siteOrigin } from "../src/lib/auth/recovery";
import { earliestFunctionDate, moveSummary, planFunctionMove, sameDayNextYear } from "../src/lib/planning/move-functions";
import { assumeUser, createTestDatabase, FUNCTION_A, OWNER_A, READ_ONLY, WEDDING_A } from "./support/database";

describe("email links and passwords", () => {
  it("only sends people on to known pages after an email link", () => {
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
    expect(safeNextPath("/setup")).toBe("/setup");
    for (const bad of ["https://evil.example", "//evil.example", "/reset-password/../admin", "/budget", "", null, undefined]) expect(safeNextPath(bad)).toBe("/overview");
  });
  it("accepts only Supabase's email link types", () => {
    expect(emailLinkType("recovery")).toBe("recovery");
    expect(emailLinkType("magiclink")).toBeNull();
    expect(emailLinkType(null)).toBeNull();
  });
  it("checks a new password in plain words", () => {
    expect(newPasswordProblem("short", "short")).toMatch(/at least 8/);
    expect(newPasswordProblem("long enough", "long enougH")).toMatch(/don't match/);
    expect(newPasswordProblem("x".repeat(129), "x".repeat(129))).toMatch(/128/);
    expect(newPasswordProblem("long enough", "long enough")).toBeNull();
  });
  it("explains sign-in problems without saying whether the email exists", () => {
    expect(signInErrorMessage("email_not_confirmed")).toMatch(/confirm your email/);
    expect(signInErrorMessage("invalid_credentials")).toMatch(/reset your password/);
    expect(signInErrorMessage(undefined)).toBe(signInErrorMessage("user_not_found"));
    expect(linkErrorMessage("callback")).toMatch(/expired/);
    expect(linkErrorMessage("something-else")).toBeNull();
  });
  it("builds email links from the site address, and refuses odd host headers", () => {
    expect(siteOrigin("https://wedding.example/some/path", "attacker.example", "https")).toBe("https://wedding.example");
    expect(siteOrigin(undefined, "wedding.vercel.app", "https")).toBe("https://wedding.vercel.app");
    expect(siteOrigin(undefined, "localhost:3000", null)).toBe("http://localhost:3000");
    expect(siteOrigin(undefined, "evil.example/path?x=1", "https")).toBeNull();
    expect(siteOrigin(undefined, null, null)).toBeNull();
  });
});

describe("moving all function dates", () => {
  const functions = [
    { id: "1", name: "Haldi", function_date: "2026-12-01" },
    { id: "2", name: "Muhurtham", function_date: "2026-12-02" },
    { id: "3", name: "Engagement", function_date: null },
    { id: "4", name: "Old dinner", function_date: "2026-11-01", archived_at: "2026-11-05T00:00:00Z" },
  ];
  it("moves the first function to the chosen day and keeps the gaps", () => {
    expect(earliestFunctionDate(functions)).toBe("2026-12-01");
    const plan = planFunctionMove(functions, "2027-12-01");
    expect(plan.days).toBe(365);
    expect(plan.moves.map((move) => [move.name, move.from, move.to])).toEqual([["Haldi", "2026-12-01", "2027-12-01"], ["Muhurtham", "2026-12-02", "2027-12-02"]]);
    expect(moveSummary(plan.days)).toBe("365 days later");
  });
  it("leaves undated and archived functions alone, and does nothing for the same day", () => {
    expect(planFunctionMove(functions, "2026-11-28").moves.map((move) => move.id)).toEqual(["1", "2"]);
    expect(planFunctionMove(functions, "2026-12-01")).toEqual({ days: 0, moves: [] });
    expect(planFunctionMove([{ id: "3", name: "Engagement", function_date: null }], "2027-12-01").moves).toEqual([]);
    expect(moveSummary(-1)).toBe("1 day earlier");
  });
  it("rejects dates that aren't real", () => {
    expect(() => planFunctionMove(functions, "2027-02-30x")).toThrow(/valid date/);
    expect(() => planFunctionMove(functions, "")).toThrow(/valid date/);
  });
  it("finds the same day next year, across leap years", () => {
    expect(sameDayNextYear("2026-12-02")).toBe("2027-12-02");
    expect(sameDayNextYear("2028-02-29")).toBe("2029-02-28");
  });
});

describe("moving a function date in the database", () => {
  let db: PGlite;
  beforeAll(async () => { db = await createTestDatabase(); });
  afterAll(async () => { await db.close(); });

  it("recomputes start and end times in the wedding's time zone when only the date changes", async () => {
    await assumeUser(db, OWNER_A);
    await db.query("update public.functions set function_date = '2026-12-02', start_time = '10:30', end_time = '13:00' where id = $1", [FUNCTION_A]);
    await db.query("update public.functions set function_date = '2027-12-02' where id = $1 and function_date = '2026-12-02'", [FUNCTION_A]);
    const { rows } = await db.query<{ ok: boolean; date: string }>(
      `select f.function_date::text as date,
              f.starts_at = ((f.function_date + f.start_time) at time zone w.timezone)
          and f.ends_at = ((f.function_date + f.end_time) at time zone w.timezone) as ok
         from public.functions f join public.weddings w on w.id = f.wedding_id where f.id = $1`, [FUNCTION_A]);
    expect(rows[0]).toEqual({ date: "2027-12-02", ok: true });
  });

  it("doesn't let a view-only member move dates", async () => {
    await assumeUser(db, READ_ONLY);
    const result = await db.query("update public.functions set function_date = '2030-01-01' where wedding_id = $1 returning id", [WEDDING_A]).catch(() => ({ rows: [] }));
    expect(result.rows).toEqual([]);
    await assumeUser(db, OWNER_A);
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.functions where function_date = '2030-01-01'");
    expect(rows[0].n).toBe(0);
  });
});
