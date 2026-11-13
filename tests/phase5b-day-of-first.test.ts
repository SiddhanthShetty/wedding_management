import { describe, expect, it } from "vitest";
import { isFunctionDay, shouldOpenDayOfFirst } from "../src/lib/planning/day-of-first";
import { safeNextPath } from "../src/lib/auth/recovery";

const functions = [
  { function_date: "2027-12-02", status: "tentative" },
  { function_date: "2027-12-03", status: "confirmed" },
  { function_date: "2027-12-04", status: "cancelled" },
  { function_date: "2027-12-05", status: "confirmed", archived_at: "2027-11-01T00:00:00Z" },
];

describe("Day-of first on wedding days", () => {
  it("knows which days have a function, ignoring cancelled and archived ones", () => {
    expect(isFunctionDay(functions, "2027-12-02")).toBe(true);
    expect(isFunctionDay(functions, "2027-12-03")).toBe(true);
    expect(isFunctionDay(functions, "2027-12-04")).toBe(false);
    expect(isFunctionDay(functions, "2027-12-05")).toBe(false);
    expect(isFunctionDay(functions, "2027-11-30")).toBe(false);
  });
  it("only sends people who can see Day-of, and never when they asked for Home", () => {
    const base = { functions, today: "2027-12-03", canSeeDayOf: true, askedForHome: false };
    expect(shouldOpenDayOfFirst(base)).toBe(true);
    expect(shouldOpenDayOfFirst({ ...base, canSeeDayOf: false })).toBe(false);
    expect(shouldOpenDayOfFirst({ ...base, askedForHome: true })).toBe(false);
    expect(shouldOpenDayOfFirst({ ...base, today: "2027-12-10" })).toBe(false);
  });
  it("sends email links to the landing page, which picks Day-of or Home", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("/overview")).toBe("/overview");
  });
});
