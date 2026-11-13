import { describe, expect, it } from "vitest";
import { travelSteps } from "../src/lib/planning/travel-steps";

const base = { properties: 0, rooms: 0, activeStays: 0, journeys: 0, roomsNotAssigned: 0, arrivalsNotAssigned: 0, departuresNotAssigned: 0 };

describe("Stays & travel in three steps", () => {
  it("starts with nothing done", () => {
    expect(travelSteps(base).map((step) => [step.id, step.done, step.status])).toEqual([
      ["hotel", false, "Not started"], ["assign", false, "After the hotel"], ["pickups", false, "Not started"],
    ]);
  });
  it("needs rooms before the hotel step is done", () => {
    expect(travelSteps({ ...base, properties: 1 })[0]).toMatchObject({ done: false, status: "Add its rooms" });
    expect(travelSteps({ ...base, properties: 1, rooms: 12 })[0]).toMatchObject({ done: true, status: "1 place · 12 rooms" });
  });
  it("is done assigning only when everyone who needs a room has one", () => {
    const hotel = { ...base, properties: 2, rooms: 20 };
    expect(travelSteps({ ...hotel, activeStays: 10, roomsNotAssigned: 3 })[1]).toMatchObject({ done: false, status: "3 still need a room" });
    expect(travelSteps({ ...hotel, activeStays: 13 })[1]).toMatchObject({ done: true });
  });
  it("is done with pickups only when no rides are left to arrange", () => {
    expect(travelSteps({ ...base, journeys: 2, arrivalsNotAssigned: 1, departuresNotAssigned: 1 })[2]).toMatchObject({ done: false, status: "2 rides still to arrange" });
    expect(travelSteps({ ...base, journeys: 2 })[2]).toMatchObject({ done: true, status: "All rides arranged" });
  });
});
