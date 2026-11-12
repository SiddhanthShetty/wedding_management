import { describe, expect, it } from "vitest";
import { groupTasksByWhen, monthsBeforeLabel } from "../src/lib/planning/task-timeline";
import { taskInputSchema } from "../src/lib/planning/task-inputs";
import { AREAS, areaForPath, currentSectionLabel, isActiveLink, NAV_GROUPS } from "../src/lib/navigation";

const task = (id: string, due_date: string | null, status = "not_started") => ({ id, title: `Task ${id}`, due_date, status });

describe("tasks grouped by when they're due", () => {
  const today = "2027-01-10";
  const groups = groupTasksByWhen([
    task("a", "2027-01-05"), task("b", "2027-01-20"), task("c", "2027-03-02"), task("d", null),
    task("e", "2026-12-01", "completed"), task("f", "2027-02-01", "cancelled"), task("g", "2027-01-10"),
  ], today, "2027-12-03");

  it("puts overdue first, then each month, then undated, then done", () => {
    expect(groups.map((group) => group.key)).toEqual(["overdue", "2027-01", "2027-03", "undated", "done"]);
    expect(groups[1].tasks.map((item) => item.id)).toEqual(["g", "b"]);
    expect(groups.at(-1)).toMatchObject({ done: true });
    expect(groups.at(-1)?.tasks.map((item) => item.id)).toEqual(["e", "f"]);
  });
  it("labels each month with how far it is from the wedding", () => {
    expect(groups[1].label).toBe("This month · January 2027");
    expect(groups[1].hint).toBe("11 months before the wedding");
    expect(monthsBeforeLabel("2027-12", "2027-12-03")).toBe("The wedding month");
    expect(monthsBeforeLabel("2027-11", "2027-12-03")).toBe("1 month before the wedding");
    expect(monthsBeforeLabel("2028-01", "2027-12-03")).toBe("1 month after the wedding");
    expect(monthsBeforeLabel("2027-06", null)).toBeNull();
  });
  it("shows nothing for an empty list", () => {
    expect(groupTasksByWhen([], today, null)).toEqual([]);
  });
});

describe("one-line task add", () => {
  it("is a valid task with only a title, or a title and a date", () => {
    const base = { description: "", functionId: "", ownerUserId: "", priority: "normal", status: "not_started", relatedVendorReference: "", relatedBookingReference: "", dependsOnTaskId: "" };
    expect(taskInputSchema.safeParse({ ...base, title: "Book the mehendi artist", dueDate: "" }).success).toBe(true);
    expect(taskInputSchema.safeParse({ ...base, title: "Book the mehendi artist", dueDate: "2027-06-01" }).success).toBe(true);
    expect(taskInputSchema.safeParse({ ...base, title: "   ", dueDate: "" }).success).toBe(false);
  });
});

describe("Decisions live under Tasks", () => {
  it("has one Tasks menu entry with To do and To decide tabs", () => {
    const links = NAV_GROUPS.flatMap((group) => group.links.map((link) => link.href));
    expect(links).toContain("/tasks");
    expect(links).not.toContain("/decisions");
    expect(AREAS.plan.map((tab) => tab.href)).toEqual(["/tasks", "/decisions"]);
    expect(areaForPath("/decisions")).toBe("plan");
    const tasksLink = NAV_GROUPS.flatMap((group) => group.links).find((link) => link.href === "/tasks")!;
    expect(isActiveLink("/decisions", tasksLink)).toBe(true);
    expect(currentSectionLabel("/decisions")).toBe("To decide");
  });
});
