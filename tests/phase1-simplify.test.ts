import { describe, expect, it } from "vitest";
import { currencyOptions, DEFAULT_CURRENCY, DEFAULT_TIMEZONE, timeZoneOptions, workspaceNameFor } from "../src/lib/locale";
import { shiftDate, starterFunctionInputs, STARTER_FUNCTIONS } from "../src/lib/planning/starter-functions";
import { functionInputSchema, weddingSetupSchema } from "../src/lib/planning/inputs";
import { formatDate } from "../src/lib/format";

describe("India-first defaults", () => {
  it("defaults to India time and rupees, with India first in the time zone list", () => {
    expect(DEFAULT_TIMEZONE).toBe("Asia/Kolkata");
    expect(DEFAULT_CURRENCY).toBe("INR");
    expect(timeZoneOptions()[0]).toEqual({ id: "Asia/Kolkata", label: "India (IST)" });
    expect(timeZoneOptions("Pacific/Auckland").some((zone) => zone.id === "Pacific/Auckland")).toBe(true);
    expect(currencyOptions("CHF").at(-1)).toEqual({ code: "CHF", label: "CHF" });
  });
  it("formats dates the Indian way in India time by default", () => {
    expect(formatDate("2027-12-02T20:00:00Z")).toBe("3 Dec 2027"); // 1:30 am IST on the 3rd
  });
  it("names the workspace from your first names", () => {
    expect(workspaceNameFor("Sweekruti Rao", "Siddhanth Shetty")).toBe("Sweekruti & Siddhanth's Wedding");
    expect(workspaceNameFor("", "")).toBe("Our wedding");
  });
  it("accepts the short first-run form once defaults are filled in", () => {
    const parsed = weddingSetupSchema.safeParse({ name: workspaceNameFor("Swee", "Sid"), partnerOneDisplayName: "Swee", partnerTwoDisplayName: "Sid", weddingDate: "", weddingDateStatus: "tentative", timezone: DEFAULT_TIMEZONE, currency: DEFAULT_CURRENCY, mainLocations: "Mangaluru", overallBudget: "", planningNotes: "" });
    expect(parsed.success).toBe(true);
  });
});

describe("starter functions", () => {
  it("dates pre-wedding functions the day before and the rest on the day", () => {
    const items = starterFunctionInputs(["haldi", "muhurtham", "reception"], "2027-12-03");
    expect(items.map((item) => [item.name, item.functionDate, item.startTime])).toEqual([["Haldi", "2027-12-02", "09:00"], ["Muhurtham", "2027-12-03", "10:30"], ["Reception", "2027-12-03", "19:00"]]);
    for (const item of items) expect(functionInputSchema.safeParse(item).success).toBe(true);
  });
  it("leaves dates blank without a wedding day, and for the engagement", () => {
    expect(starterFunctionInputs(["haldi"], null)[0]).toMatchObject({ functionDate: "", startTime: "" });
    expect(starterFunctionInputs(["engagement"], "2027-12-03")[0]).toMatchObject({ functionDate: "", startTime: "" });
  });
  it("handles month and year boundaries", () => {
    expect(shiftDate("2028-01-01", -1)).toBe("2027-12-31");
    expect(shiftDate("2027-12-31", 1)).toBe("2028-01-01");
    expect(STARTER_FUNCTIONS.filter((item) => item.picked).map((item) => item.key)).toEqual(["haldi", "mehendi", "sangeet", "muhurtham", "reception"]);
  });
});
