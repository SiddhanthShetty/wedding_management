import { describe, expect, it } from "vitest";
import { areaForPath, currentSectionLabel, isActiveLink, NAV_GROUPS, visibleNavGroups } from "../src/lib/navigation";
import { attentionItems } from "../src/lib/planning/attention";
import { describeStatus, statusOptions } from "../src/lib/planning/status-vocabulary";

describe("grouped navigation", () => {
  it("shows owners every group and hides groups a collaborator cannot open", () => {
    expect(visibleNavGroups("owner", {}).map((group) => group.id)).toEqual(["home", "plan", "guests", "money", "week", "files"]);
    const scoped = visibleNavGroups("scoped_collaborator", { planning: "edit", logistics: "read" });
    expect(scoped.map((group) => group.id)).toEqual(["home", "plan", "week", "files"]);
    const readOnly = visibleNavGroups("read_only_collaborator", { guests: "read" });
    expect(readOnly.find((group) => group.id === "guests")?.links.map((link) => link.label)).toEqual(["Guests"]);
    expect(readOnly.some((group) => group.id === "money")).toBe(false);
  });

  it("names the current section, including nested pages", () => {
    expect(currentSectionLabel("/schedule/pack")).toBe("Run sheets");
    expect(currentSectionLabel("/invitations")).toBe("Invitations");
    expect(areaForPath("/today")).toBe("week");
    expect(areaForPath("/messages")).toBe("guests");
    expect(areaForPath("/budget")).toBeNull();
    expect(isActiveLink("/travel", NAV_GROUPS.find((group) => group.id === "week")!.links[0]!)).toBe(true);
    expect(currentSectionLabel("/travel")).toBe("Stays & travel");
    expect(currentSectionLabel("/settings")).toBe("Settings");
    expect(currentSectionLabel("/unknown")).toBe("Overview");
  });
});

describe("what needs you today", () => {
  const today = "2027-06-01";
  it("ranks urgent items first, limits the list and links to the exact filtered records", () => {
    const items = attentionItems({
      today,
      tasks: { mineOverdue: 2, overdue: 5 },
      decisions: { open: 1 },
      suppliers: { items: [{ supplierId: "s1", supplierName: "TEST Hall", kind: "hold", date: "2027-06-05" }, { supplierId: "s2", supplierName: "TEST Band", kind: "quote", date: "2027-06-14" }] },
      payments: [{ due_date: "2027-06-03", booking: "TEST Venue", remaining: "100.00", currency: "EUR" }, { due_date: "2027-06-20", booking: "TEST Later", remaining: "50.00", currency: "EUR" }],
      rsvp: [{ id: "f1", name: "Sangeet", date: "2027-06-10", pending: 4 }, { id: "f2", name: "Reception", date: "2027-08-01", pending: 9 }],
      catering: { flagged: [] },
      travel: { roomsNotAssigned: 0, arrivalsNotAssigned: 3, departuresNotAssigned: 0 },
      issues: { total: 3, critical: 1 },
    });
    expect(items.map((item) => item.id)).toEqual(["issues-critical", "tasks-mine-overdue", "payments-week", "suppliers-week", "rsvp-f1", "travel", "decisions"]);
    expect(items.find((item) => item.id === "suppliers-week")!.title).toBe("1 vendor hold or quote expires this week");
    expect(items.find((item) => item.id === "rsvp-f1")!.href).toBe("/messages?function=f1&kind=reminder");
    expect(items.find((item) => item.id === "travel")!.href).toBe("/travel?tab=needs&filter=arrivals-missing");
    expect(items.find((item) => item.id === "payments-week")!.href).toBe("/budget?due=7#upcoming-payments");
  });

  it("is empty when nothing is urgent and skips sections that were not loaded", () => {
    expect(attentionItems({ today })).toEqual([]);
    expect(attentionItems({ today, tasks: { mineOverdue: 0, overdue: 4 }, issues: { total: 0, critical: 0 } })).toEqual([]);
  });
});

describe("plain-language statuses", () => {
  const databaseStatuses: Record<Parameters<typeof describeStatus>[0], string[]> = {
    function: ["tentative", "confirmed", "cancelled"],
    task: ["not_started", "in_progress", "blocked", "completed", "cancelled"],
    decision: ["open", "decided", "deferred"],
    supplier: ["researching", "contacted", "visit_planned", "shortlisted", "selected", "booked", "rejected", "archived"],
    booking: ["tentative", "confirmed", "cancelled"],
    stay: ["proposed", "confirmed", "cancelled"],
    journey: ["planned", "assigned", "collected", "completed", "cancelled"],
    schedule: ["planned", "confirmed", "in_progress", "delayed", "done", "cancelled"],
    arrangement: ["not_started", "in_progress", "ready", "done", "cancelled"],
    issue: ["open", "in_progress", "resolved"],
  };

  it("maps every database status to the shared stages, keeping useful detail", () => {
    const stages = new Set(["Idea", "Planned", "In progress", "Confirmed", "Done", "Cancelled"]);
    for (const [kind, statuses] of Object.entries(databaseStatuses)) {
      for (const status of statuses) expect(stages.has(describeStatus(kind as keyof typeof databaseStatuses, status).label), `${kind}:${status}`).toBe(true);
      expect(statusOptions(kind as keyof typeof databaseStatuses).map((option) => option.value).sort()).toEqual([...statuses].sort());
    }
    expect(describeStatus("supplier", "booked").text).toBe("Confirmed · Booked");
    expect(describeStatus("schedule", "delayed").text).toBe("In progress · Running late");
    expect(describeStatus("stay", "proposed").text).toBe("Planned");
  });
});

describe("starter templates and setup progress", async () => {
  const { FUNCTION_SETS, functionDate, newTemplateItems, setupSteps, TASK_CHECKLIST, templateDueDate } = await import("../src/lib/planning/starter-templates");
  it("dates template tasks before the wedding, never in the past, and skips existing names", () => {
    expect(templateDueDate("2027-12-10", 12, "2027-01-01")).toBe("2027-01-01"); // 12 months back is in the past -> due today
    expect(templateDueDate("2027-12-10", 1, "2027-01-01")).toBe("2027-11-10");
    expect(templateDueDate(null, 1, "2027-01-01")).toBeNull();
    expect(functionDate("2027-12-10", -2)).toBe("2027-12-08");
    expect(functionDate(null, -2)).toBe("");
    const fresh = newTemplateItems(FUNCTION_SETS[0]!.functions, ["  sangeet ", "RECEPTION"], (fn) => fn.name);
    expect(fresh.map((fn) => fn.name)).toEqual(["Haldi (Arishina)", "Mehendi", "Muhurtham"]);
    expect(new Set(TASK_CHECKLIST.map((task) => task.title)).size).toBe(TASK_CHECKLIST.length);
  });

  it("shows only steps the member can act on and reports what is done", () => {
    const counts = { weddingDetails: true, members: 1, functions: 3, guests: 0, suppliers: null, tasks: 0, designs: null };
    expect(setupSteps(counts, true).map((step) => `${step.id}:${step.done}`)).toEqual(["details:true", "functions:true", "partner:false", "guests:false", "tasks:false"]);
    expect(setupSteps(counts, false).map((step) => step.id)).toEqual(["functions", "guests", "tasks"]);
  });
});

describe("smart defaults", async () => {
  const { addMinutesToLocal, defaultScheduleStart } = await import("../src/lib/planning/local-time");
  const { defaultStayDates, pickupSuggestions } = await import("../src/lib/planning/travel-rules");
  it("starts a new run-sheet item after the previous one, else at the function start", () => {
    const tz = "Asia/Kolkata";
    expect(defaultScheduleStart({ lastItemEnd: "2027-06-18T05:30:00Z", functionStart: "2027-06-18T04:00:00Z", functionDate: "2027-06-18", timezone: tz })).toBe("2027-06-18T11:00");
    expect(defaultScheduleStart({ lastItemEnd: null, functionStart: "2027-06-18T04:00:00Z", functionDate: "2027-06-18", timezone: tz })).toBe("2027-06-18T09:30");
    expect(defaultScheduleStart({ lastItemEnd: null, functionStart: null, functionDate: "2027-06-18", timezone: tz })).toBe("2027-06-18T09:00");
    expect(addMinutesToLocal("2027-06-18T23:30", 60)).toBe("2027-06-19T00:30");
  });

  it("suggests stay dates from travel details or the function span", () => {
    const tz = "Asia/Kolkata";
    expect(defaultStayDates({ functionDates: ["2027-06-18", "2027-06-16", null], arrivalAt: null, departureAt: null, timezone: tz })).toEqual({ checkIn: "2027-06-16", checkOut: "2027-06-19" });
    expect(defaultStayDates({ functionDates: ["2027-06-18"], arrivalAt: "2027-06-15T20:00:00Z", departureAt: "2027-06-19T03:00:00Z", timezone: tz })).toEqual({ checkIn: "2027-06-16", checkOut: "2027-06-19" });
    expect(defaultStayDates({ functionDates: [], arrivalAt: null, departureAt: null, timezone: tz })).toEqual({ checkIn: "", checkOut: "" });
  });

  it("groups guests who need rides by hour and skips those already arranged", () => {
    const tz = "Asia/Kolkata";
    const states = [
      { guestId: "a", accommodation: "unknown" as const, arrival: "not_assigned" as const, departure: "not_required" as const },
      { guestId: "b", accommodation: "unknown" as const, arrival: "not_assigned" as const, departure: "not_assigned" as const },
      { guestId: "c", accommodation: "unknown" as const, arrival: "allocated" as const, departure: "unknown" as const },
    ];
    const profiles = [
      { guest_id: "a", arrival_at: "2027-06-17T04:40:00Z", arrival_details: "6E 101 BLR", departure_at: null, departure_details: "" },
      { guest_id: "b", arrival_at: "2027-06-17T04:55:00Z", arrival_details: "AI 202", departure_at: "2027-06-19T09:00:00Z", departure_details: "Train" },
      { guest_id: "c", arrival_at: "2027-06-17T04:45:00Z", arrival_details: "6E 101 BLR", departure_at: null, departure_details: "" },
    ];
    const suggestions = pickupSuggestions({ states, profiles, timezone: tz });
    expect(suggestions.map((row) => ({ kind: row.kind, guests: row.guestIds, pickup: row.pickupLocal, dropoff: row.dropoffLocal, detail: row.detail }))).toEqual([
      { kind: "arrival", guests: ["a", "b"], pickup: "2027-06-17T10:40", dropoff: "2027-06-17T12:10", detail: "6E 101 BLR, AI 202" },
      { kind: "departure", guests: ["b"], pickup: "2027-06-19T11:30", dropoff: "2027-06-19T13:00", detail: "Train" },
    ]);
  });
});

describe("bulk actions", async () => {
  const { householdInvitationChanges, planHouseholdRooms } = await import("../src/lib/planning/bulk-rules");
  it("invites each household member once per function and leaves existing invitations alone", () => {
    const members = [
      { id: "a", household_id: "h", plus_one_for_guest_id: null },
      { id: "b", household_id: "h", plus_one_for_guest_id: null },
      { id: "plus", household_id: "h", plus_one_for_guest_id: "a" },
      { id: "x", household_id: "other", plus_one_for_guest_id: null },
    ];
    const existing = [
      { guest_id: "a", function_id: "f1", status: "invited", plus_one_allowed: true },
      { guest_id: "b", function_id: "f1", status: "withdrawn", plus_one_allowed: true },
    ];
    expect(householdInvitationChanges("h", ["f1", "f2", "f2"], members, existing)).toEqual([
      { guestId: "a", functionId: "f2", invited: true, plusOneAllowed: false },
      { guestId: "b", functionId: "f1", invited: true, plusOneAllowed: true },
      { guestId: "b", functionId: "f2", invited: true, plusOneAllowed: false },
    ]);
  });

  it("fills rooms in order up to capacity and reports who does not fit", () => {
    const people = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
    const plan = planHouseholdRooms(people, [{ id: "r1", capacity: 2 }, { id: "r2", capacity: 2 }]);
    expect(plan.placements.map((row) => `${row.guest.id}->${row.roomId}`)).toEqual(["a->r1", "b->r1", "c->r2", "d->r2"]);
    expect(plan.unplaced.map((row) => row.id)).toEqual(["e"]);
  });
});

describe("day-of view", async () => {
  const { dayOfView, defaultDayOfFunction } = await import("../src/lib/planning/operations-rules");
  const item = (id: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({
    id, function_id: "f", activity: id, location: "", planned_start: `2027-06-18T${start}:00Z`, planned_end: `2027-06-18T${end}:00Z`,
    actual_start: null as string | null, actual_end: null as string | null, owner_user_id: null, owner_name: "", vendor_arrival_at: null as string | null, status: "planned" as const, ...extra,
  });
  it("splits a run sheet into now, late, next and vendor arrivals", () => {
    const now = new Date("2027-06-18T10:30:00Z");
    const items = [
      item("Setup", "08:00", "09:00", { status: "done" }),
      item("Photos", "09:30", "10:00"), // should have started and ended, never started
      item("Ceremony", "10:00", "11:00", { actual_start: "2027-06-18T10:05:00Z", status: "in_progress" }),
      item("Lunch", "11:30", "12:30", { vendor_arrival_at: "2027-06-18T11:00:00Z" }),
      item("Speeches", "12:30", "13:00"), item("Games", "13:00", "14:00"), item("Send-off", "14:00", "14:30"),
      item("Cancelled", "10:00", "12:00", { status: "cancelled" }),
    ];
    const view = dayOfView(items as never, now);
    expect(view.now.map((row) => row.id)).toEqual(["Ceremony"]);
    expect(view.late.map((row) => row.id)).toEqual(["Photos"]);
    expect(view.next.map((row) => row.id)).toEqual(["Lunch", "Speeches", "Games"]);
    expect(view.arrivals.map((row) => row.id)).toEqual(["Lunch"]);
  });
  it("defaults to today's function, else the next one", () => {
    const fns = [{ id: "a", function_date: "2027-06-16" }, { id: "b", function_date: "2027-06-18" }, { id: "c", function_date: null }];
    expect(defaultDayOfFunction(fns, "2027-06-18")?.id).toBe("b");
    expect(defaultDayOfFunction(fns, "2027-06-17")?.id).toBe("b");
    expect(defaultDayOfFunction(fns, "2027-07-01")?.id).toBe("a");
  });
});

describe("guest portal itinerary", async () => {
  const { buildItinerary, functionIcs, mapLink } = await import("../src/lib/guest-portal/itinerary");
  const fn = (id: string, date: string | null, start: string | null) => ({ id, name: id === "w" ? "Wedding, Muhurtham" : "Sangeet", date, start_time: start, end_time: null, timezone: "Asia/Kolkata", location: "Kudroli; Mangaluru", map_url: null, dress_code: null, status: "confirmed" });
  it("merges the household's functions, stays and rides in time order with who each applies to", () => {
    const entries = buildItinerary([
      { full_name: "Asha", invitations: [{ function: fn("w", "2027-06-18", "10:30") }, { function: fn("s", "2027-06-17", "19:00") }], stays: [{ property: "TEST Inn", address: "", room_type: "Double", check_in_date: "2027-06-17", check_out_date: "2027-06-19", check_in_time: "14:00", check_out_time: null }] },
      { full_name: "Ravi", invitations: [{ function: fn("w", "2027-06-18", "10:30") }], journeys: [{ kind: "arrival", title: "Pickup", pickup_at: "2027-06-17T05:00:00Z", pickup_location: "Airport", dropoff_location: "TEST Inn", timezone: "Asia/Kolkata" }] },
    ]);
    expect(entries.map((entry) => `${entry.type}:${entry.people.join("+")}`)).toEqual(["ride:Ravi", "stay:Asha", "function:Asha", "function:Asha+Ravi"]);
  });
  it("writes valid calendar files and escapes text", () => {
    const ics = functionIcs(fn("w", "2027-06-18", "10:30"), new Date("2027-01-01T00:00:00Z"))!;
    expect(ics).toContain("DTSTART:20270618T050000Z");
    expect(ics).toContain("DTEND:20270618T080000Z");
    expect(ics).toContain("SUMMARY:Wedding\\, Muhurtham");
    expect(ics).toContain("LOCATION:Kudroli\\; Mangaluru");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(functionIcs(fn("s", "2027-06-17", null))!).toContain("DTSTART;VALUE=DATE:20270617");
    expect(functionIcs(fn("s", null, null))).toBeNull();
    expect(mapLink({ map_url: null, location: "Kudroli Temple" })).toBe("https://www.google.com/maps/search/?api=1&query=Kudroli%20Temple");
  });
});
