import { describe, expect, it } from "vitest";
import { AREAS, isActiveLink, NAV_GROUPS, visibleNavGroups } from "../src/lib/navigation";
import { addItemsFor, ADD_ITEMS } from "../src/lib/add-menu";
import { cleanSearchTerm, hitHref } from "../src/lib/planning/search-rules";
import { guestLine, moneyLine } from "../src/lib/planning/home-lines";
import { functionsByDay } from "../src/lib/planning/function-timeline";
import { PAGE_INTROS } from "../src/lib/page-intros";

describe("five-item menu", () => {
  it("has Home, Plan, Guests, Money and Wedding week, each opening an area", () => {
    const links = NAV_GROUPS.flatMap((group) => group.links);
    expect(links.map((link) => link.label)).toEqual(["Home", "Plan", "Guests", "Money", "Wedding week"]);
    expect(AREAS.money.map((tab) => tab.href)).toEqual(["/venues-vendors", "/budget"]);
    const money = links.find((link) => link.label === "Money")!;
    expect(isActiveLink("/budget", money)).toBe(true);
    expect(isActiveLink("/tasks", money)).toBe(false);
  });
  it("still hides areas a helper can't open", () => {
    expect(visibleNavGroups("read_only_collaborator", { guests: "read" }).flatMap((group) => group.links.map((link) => link.label))).toEqual(["Home", "Guests"]);
  });
});

describe("+ Add", () => {
  it("offers everything to the couple, and only what a helper can change", () => {
    expect(addItemsFor("owner", {})).toEqual(ADD_ITEMS);
    expect(addItemsFor("scoped_collaborator", { planning: "edit", guests: "read" }).map((item) => item.label)).toEqual(["Task", "Function", "File"]);
    expect(addItemsFor("read_only_collaborator", { planning: "read" }).map((item) => item.label)).toEqual(["File"]);
  });
  it("opens each page's own add form", () => {
    expect(ADD_ITEMS.find((item) => item.label === "Cost")?.href).toBe("/budget?add=cost");
    expect(ADD_ITEMS.find((item) => item.label === "Families")?.href).toBe("/guests/simple");
  });
});

describe("search", () => {
  it("cleans the term so it is safe to use in database filters", () => {
    expect(cleanSearchTerm("  Shetty  ")).toBe("Shetty");
    expect(cleanSearchTerm("a")).toBeNull();
    expect(cleanSearchTerm(undefined)).toBeNull();
    expect(cleanSearchTerm("rao,(name.eq.x)%_*")).toBe("rao name.eq.x");
    expect(cleanSearchTerm("ಶೆಟ್ಟಿ")).toBe("ಶೆಟ್ಟಿ");
    expect(cleanSearchTerm("D'Souza & Sons")).toBe("D'Souza & Sons");
    expect(cleanSearchTerm("x".repeat(100))?.length).toBe(60);
  });
  it("links each result to where it lives", () => {
    expect(hitHref("vendor", "1", "udupi caterers")).toBe("/venues-vendors?q=udupi%20caterers");
    expect(hitHref("task", "abc", "x")).toBe("/tasks?view=all#task-abc");
    expect(hitHref("function", "f1", "x")).toBe("/functions#function-f1");
  });
});

describe("Home lines", () => {
  it("sums up money in one line", () => {
    expect(moneyLine([{ currency: "INR", budget: "1500000.00", committed: "450000.00", outstanding: "350000.00" }], 2, "INR")).toBe("₹4,50,000.00 booked of ₹15,00,000.00 · ₹3,50,000.00 still to pay · 2 payments due in 30 days");
    expect(moneyLine([{ currency: "INR", budget: null, committed: "0.00", outstanding: "0.00" }], 0, "INR")).toBe("₹0.00 booked · ₹0.00 still to pay");
    expect(moneyLine([], 0, "INR")).toBeNull();
  });
  it("sums up families and replies in one line", () => {
    expect(guestLine({ families: 40, invited: 38, replied: 25, coming: 96 })).toBe("40 families · 25 of 38 replied · 96 guests coming");
    expect(guestLine({ families: 1, invited: 1, replied: 0, coming: 0 })).toBe("1 family · 0 of 1 replied");
    expect(guestLine({ families: 3, invited: 0, replied: 0, coming: 0 })).toBe("3 families · not invited to any event yet");
    expect(guestLine({ families: 0, invited: 0, replied: 0, coming: 0 })).toBeNull();
  });
});

describe("Functions timeline", () => {
  it("groups by day in time order, undated last", () => {
    const days = functionsByDay([
      { id: "r", name: "Reception", function_date: "2027-12-03", start_time: "19:00" },
      { id: "m", name: "Muhurtham", function_date: "2027-12-03", start_time: "10:30" },
      { id: "h", name: "Haldi", function_date: "2027-12-02", start_time: null },
      { id: "e", name: "Engagement", function_date: null, start_time: null },
    ]);
    expect(days.map((day) => [day.date, day.items.map((item) => item.id)])).toEqual([["2027-12-02", ["h"]], ["2027-12-03", ["m", "r"]], [null, ["e"]]]);
  });
});

describe("first-visit lines", () => {
  it("has a line for every menu page and tab", () => {
    const pages = [...NAV_GROUPS.flatMap((group) => group.links.map((link) => link.href)), ...Object.values(AREAS).flat().map((tab) => tab.href)];
    for (const page of new Set(pages)) expect(PAGE_INTROS[page], page).toBeTruthy();
  });
});
