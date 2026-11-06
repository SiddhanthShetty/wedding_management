import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, OWNER_A, OWNER_B, READ_ONLY, SCOPED, WEDDING_A, WEDDING_B } from "./support/database";
import { guestTravelStates, intervalsOverlap, needState, stayCapacityIssues, stayNights, travelGapCounts, vehicleConflicts } from "../src/lib/planning/travel-rules";

let db: PGlite;
beforeEach(async () => { db = await createTestDatabase(); });
afterEach(async () => { await db.close(); });

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;

async function guest(name: string, weddingId = WEDDING_A) {
  return (await one<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [weddingId, JSON.stringify({ household_id: null, full_name: name, email: "", phone: "+353 1 000 0000", family_side: "shared", meal_preference: "", allergies: "", assistance_needs: "Step-free access", notes: "" })])).id;
}

async function roomFixture(options: { standard?: number; extraBeds?: number; roomsHeld?: number; nights?: string[] } = {}) {
  await assumeUser(db, OWNER_A);
  const property = await one<{ id: string }>("insert into public.accommodation_properties(wedding_id,name,created_by_user_id) values($1,'TEST Hotel',$2) returning id", [WEDDING_A, OWNER_A]);
  const type = await one<{ id: string }>("insert into public.accommodation_room_types(wedding_id,property_id,name,standard_occupancy,max_extra_beds) values($1,$2,'Twin',$3,$4) returning id", [WEDDING_A, property.id, options.standard ?? 2, options.extraBeds ?? 0]);
  const rooms: string[] = [];
  for (const label of ["Room 1", "Room 2"]) rooms.push((await one<{ id: string }>("insert into public.accommodation_rooms(wedding_id,room_type_id,label) values($1,$2,$3) returning id", [WEDDING_A, type.id, label])).id);
  for (const night of options.nights ?? ["2027-06-17", "2027-06-18"]) {
    await db.query("insert into public.accommodation_inventory(wedding_id,room_type_id,night,rooms_held) values($1,$2,$3,$4)", [WEDDING_A, type.id, night, options.roomsHeld ?? 1]);
  }
  return { propertyId: property.id, typeId: type.id, rooms };
}

const stay = (guestId: string, roomId: string, checkIn: string, checkOut: string, extra = false, status = "proposed") =>
  db.query<{ id: string }>("insert into public.accommodation_assignments(wedding_id,guest_id,room_id,check_in_date,check_out_date,uses_extra_bed,status,created_by_user_id) values($1,$2,$3,$4,$5,$6,$7,$8) returning id", [WEDDING_A, guestId, roomId, checkIn, checkOut, extra, status, OWNER_A]);

describe("stay date rules (pure)", () => {
  it("treats the check-out day as not a night and rejects inverted or impossible dates", () => {
    expect(stayNights("2027-06-17", "2027-06-19")).toEqual(["2027-06-17", "2027-06-18"]);
    expect(stayNights("2027-12-31", "2028-01-01")).toEqual(["2027-12-31"]);
    expect(stayNights("2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29"]);
    expect(() => stayNights("2027-06-17", "2027-06-17")).toThrow();
    expect(() => stayNights("2027-06-18", "2027-06-17")).toThrow();
    expect(() => stayNights("2027-02-30", "2027-03-02")).toThrow();
  });

  it("distinguishes not required, unknown and not assigned", () => {
    expect(needState("not_required", false)).toBe("not_required");
    expect(needState("unknown", false)).toBe("unknown");
    expect(needState("required", false)).toBe("not_assigned");
    expect(needState("required", true)).toBe("allocated");
    const states = guestTravelStates({
      guestIds: ["a", "b", "c", "d"],
      profiles: [
        { guest_id: "a", accommodation_need: "required", arrival_transport_need: "required", departure_transport_need: "not_required" },
        { guest_id: "b", accommodation_need: "required", arrival_transport_need: "unknown", departure_transport_need: "required" },
        { guest_id: "c", accommodation_need: "not_required", arrival_transport_need: "not_required", departure_transport_need: "not_required" },
      ],
      stays: [{ guest_id: "b", status: "proposed" }, { guest_id: "a", status: "cancelled" }],
      passengers: [{ guest_id: "a", kind: "arrival", status: "planned" }, { guest_id: "b", kind: "departure", status: "cancelled" }],
    });
    expect(states).toEqual([
      { guestId: "a", accommodation: "not_assigned", arrival: "allocated", departure: "not_required" },
      { guestId: "b", accommodation: "allocated", arrival: "unknown", departure: "not_assigned" },
      { guestId: "c", accommodation: "not_required", arrival: "not_required", departure: "not_required" },
      { guestId: "d", accommodation: "unknown", arrival: "unknown", departure: "unknown" },
    ]);
    expect(travelGapCounts(states)).toEqual({ roomsNotAssigned: 1, arrivalsNotAssigned: 0, departuresNotAssigned: 1, guestsMissingAny: 2, roomNeedUnknown: 1 });
  });

  it("predicts the same room capacity problems the database enforces", () => {
    const base = { room: { standard_occupancy: 2, max_extra_beds: 1, room_type_id: "t" }, roomTypeOfRoom: new Map([["r1", "t"], ["r2", "t"]]), heldRoomsByNight: new Map([["2027-06-17", 1], ["2027-06-18", 1]]) };
    const existing = [
      { id: "s1", guest_id: "g1", room_id: "r1", check_in_date: "2027-06-17", check_out_date: "2027-06-19", status: "confirmed" as const, uses_extra_bed: false },
      { id: "s2", guest_id: "g2", room_id: "r1", check_in_date: "2027-06-17", check_out_date: "2027-06-18", status: "proposed" as const, uses_extra_bed: false },
    ];
    const third = { guest_id: "g3", room_id: "r1", check_in_date: "2027-06-17", check_out_date: "2027-06-18", status: "proposed" as const, uses_extra_bed: false };
    expect(stayCapacityIssues({ ...base, stay: third, existing })).toEqual(["The room is already at its occupancy limit (2) on the night of 2027-06-17."]);
    expect(stayCapacityIssues({ ...base, stay: { ...third, check_in_date: "2027-06-18", check_out_date: "2027-06-19" }, existing })).toEqual([]);
    expect(stayCapacityIssues({ ...base, stay: { ...third, uses_extra_bed: true }, existing })).toEqual([]);
    expect(stayCapacityIssues({ ...base, stay: { ...third, room_id: "r2" }, existing })).toEqual(["Only 1 room(s) of this type are held for the night of 2027-06-17."]);
    expect(stayCapacityIssues({ ...base, stay: { ...third, check_out_date: "2027-06-20" }, existing })[1]).toMatch(/2027-06-19 is outside/);
    expect(stayCapacityIssues({ ...base, stay: { ...third, guest_id: "g1", check_in_date: "2027-06-18", check_out_date: "2027-06-19" }, existing })).toEqual(["This guest already has a room for the night of 2027-06-18."]);
  });

  it("treats back-to-back journeys as non-overlapping and finds real vehicle clashes", () => {
    expect(intervalsOverlap("2027-06-17T10:00:00Z", "2027-06-17T11:00:00Z", "2027-06-17T11:00:00Z", "2027-06-17T12:00:00Z")).toBe(false);
    expect(intervalsOverlap("2027-06-17T10:00:00Z", "2027-06-17T11:00:00Z", "2027-06-17T10:59:00Z", "2027-06-17T12:00:00Z")).toBe(true);
    expect(vehicleConflicts([
      { id: "j1", vehicle_id: "v", pickup_at: "2027-06-17T10:00:00Z", estimated_dropoff_at: "2027-06-17T11:00:00Z", status: "assigned" },
      { id: "j2", vehicle_id: "v", pickup_at: "2027-06-17T10:30:00Z", estimated_dropoff_at: "2027-06-17T11:30:00Z", status: "planned" },
      { id: "j3", vehicle_id: "v", pickup_at: "2027-06-17T10:30:00Z", estimated_dropoff_at: "2027-06-17T11:30:00Z", status: "cancelled" },
      { id: "j4", vehicle_id: "w", pickup_at: "2027-06-17T10:30:00Z", estimated_dropoff_at: "2027-06-17T11:30:00Z", status: "assigned" },
    ])).toEqual([["j1", "j2"]]);
  });
});

describe("accommodation database rules", () => {
  it("allows a stay only on held nights and treats check-out day as free", async () => {
    const { rooms } = await roomFixture();
    const a = await guest("TEST Guest A");
    await expectDenied(stay(a, rooms[0]!, "2027-06-16", "2027-06-18"), /2027-06-16 is outside the booked nights/);
    await expectDenied(stay(a, rooms[0]!, "2027-06-17", "2027-06-20"), /2027-06-19 is outside the booked nights/);
    await stay(a, rooms[0]!, "2027-06-17", "2027-06-19");
    // Check-out on the 19th leaves no night on the 19th to collide with.
    const count = await one<{ n: string }>("select count(*)::text n from public.accommodation_assignments where wedding_id=$1", [WEDDING_A]);
    expect(count.n).toBe("1");
  });

  it("enforces room occupancy, extra beds and rooms held per night", async () => {
    const { rooms, typeId } = await roomFixture({ standard: 2, extraBeds: 1, roomsHeld: 1 });
    const [a, b, c, d] = [await guest("TEST A"), await guest("TEST B"), await guest("TEST C"), await guest("TEST D")];
    await stay(a, rooms[0]!, "2027-06-17", "2027-06-19");
    await stay(b, rooms[0]!, "2027-06-17", "2027-06-18");
    await expectDenied(stay(c, rooms[0]!, "2027-06-17", "2027-06-18"), /occupancy limit \(2\)/);
    // Night of the 18th has one free bed because B checks out that morning.
    await stay(c, rooms[0]!, "2027-06-18", "2027-06-19");
    await stay(d, rooms[0]!, "2027-06-17", "2027-06-18", true);
    const e = await guest("TEST E");
    await expectDenied(stay(e, rooms[0]!, "2027-06-17", "2027-06-18", true), /No extra bed/);
    await expectDenied(stay(e, rooms[1]!, "2027-06-17", "2027-06-18"), /Only 1 room\(s\) of this type are held/);
    // Reducing the hold below rooms in use, or shrinking occupancy, is rejected.
    await expectDenied(db.query("update public.accommodation_inventory set rooms_held=0 where wedding_id=$1 and room_type_id=$2 and night='2027-06-17'", [WEDDING_A, typeId]), /already allocated/);
    await expectDenied(db.query("delete from public.accommodation_inventory where wedding_id=$1 and room_type_id=$2 and night='2027-06-17'", [WEDDING_A, typeId]), /move or cancel/);
    await expectDenied(db.query("update public.accommodation_room_types set standard_occupancy=1 where id=$1", [typeId]), /exceed the new occupancy/);
    // Cancelled stays release capacity.
    await db.query("update public.accommodation_assignments set status='cancelled' where guest_id=$1", [b]);
    await stay(e, rooms[0]!, "2027-06-17", "2027-06-18");
  });

  it("prevents duplicate rooms for the same guest on the same night, across rooms and properties", async () => {
    const { rooms } = await roomFixture({ roomsHeld: 2 });
    const a = await guest("TEST Duplicate");
    await stay(a, rooms[0]!, "2027-06-17", "2027-06-18");
    await expectDenied(stay(a, rooms[1]!, "2027-06-17", "2027-06-19"), /already has a room for the night of 2027-06-17/);
    await stay(a, rooms[1]!, "2027-06-18", "2027-06-19");
    const updated = await one<{ version: number }>("update public.accommodation_assignments set status='confirmed' where guest_id=$1 and check_in_date='2027-06-17' returning version", [a]);
    expect(updated.version).toBe(2);
  });

  it("keeps accommodation inside the logistics module and the wedding boundary", async () => {
    const { rooms } = await roomFixture();
    const a = await guest("TEST Boundary");
    await assumeUser(db, READ_ONLY);
    expect((await db.query("select * from public.accommodation_rooms")).rows).toHaveLength(0);
    await assumeUser(db, SCOPED); // planning edit + logistics read
    expect((await db.query("select * from public.accommodation_rooms")).rows).toHaveLength(2);
    await expectDenied(stay(a, rooms[0]!, "2027-06-17", "2027-06-18"));
    await assumeUser(db, OWNER_B);
    expect((await db.query("select * from public.accommodation_rooms")).rows).toHaveLength(0);
    await expectDenied(db.query("insert into public.accommodation_properties(wedding_id,name,created_by_user_id) values($1,'Intrusion',$2)", [WEDDING_A, OWNER_B]));
    const guestB = await guest("TEST Other wedding guest", WEDDING_B);
    await assumeUser(db, OWNER_A);
    // Composite foreign keys block a room from wedding A being linked to a guest from wedding B.
    await expectDenied(db.query("insert into public.accommodation_assignments(wedding_id,guest_id,room_id,check_in_date,check_out_date,created_by_user_id) values($1,$2,$3,'2027-06-17','2027-06-18',$4)", [WEDDING_A, guestB, rooms[0], OWNER_A]));
    await expectDenied(db.query("delete from public.accommodation_assignments"), /permission denied/);
  });

  it("limits contact and assistance details in the logistics guest lookup", async () => {
    await assumeUser(db, OWNER_A);
    await guest("TEST Sensitive");
    const owner = await one<{ phone: string | null; assistance_needs: string | null }>("select phone,assistance_needs from public.get_travel_guests($1) where full_name='TEST Sensitive'", [WEDDING_A]);
    expect(owner).toEqual({ phone: "+353 1 000 0000", assistance_needs: "Step-free access" });
    await assumeUser(db, SCOPED); // logistics read only, no guest module access
    const scoped = await one<{ phone: string | null; assistance_needs: string | null }>("select phone,assistance_needs from public.get_travel_guests($1) where full_name='TEST Sensitive'", [WEDDING_A]);
    expect(scoped).toEqual({ phone: null, assistance_needs: null });
    await assumeUser(db, READ_ONLY);
    await expectDenied(db.query("select * from public.get_travel_guests($1)", [WEDDING_A]), /Logistics read permission/);
  });
});

describe("transport database rules", () => {
  async function vehicle(capacity: number, label = "TEST Minibus") {
    return (await one<{ id: string }>("insert into public.transport_vehicles(wedding_id,label,passenger_capacity,driver_name,created_by_user_id) values($1,$2,$3,'TEST Driver',$4) returning id", [WEDDING_A, label, capacity, OWNER_A])).id;
  }
  const journey = (vehicleId: string | null, pickup: string, dropoff: string, status = vehicleId ? "assigned" : "planned", kind = "arrival") =>
    db.query<{ id: string }>("insert into public.transport_journeys(wedding_id,kind,function_id,title,pickup_location,dropoff_location,pickup_at,estimated_dropoff_at,vehicle_id,status,created_by_user_id) values($1,$2,$3,'TEST run','Airport','TEST Hotel',$4,$5,$6,$7,$8) returning id", [WEDDING_A, kind, FUNCTION_A, pickup, dropoff, vehicleId, status, OWNER_A]);
  const board = (journeyId: string, guestId: string) => db.query("insert into public.transport_passengers(wedding_id,journey_id,guest_id,added_by_user_id) values($1,$2,$3,$4)", [WEDDING_A, journeyId, guestId, OWNER_A]);

  it("enforces seat capacity on boarding, on vehicle change and on capacity edits", async () => {
    await assumeUser(db, OWNER_A);
    const small = await vehicle(2, "TEST Car");
    const big = await vehicle(3, "TEST Van");
    const run = (await journey(null, "2027-06-17T10:00:00Z", "2027-06-17T11:00:00Z")).rows[0]!.id;
    const people = [await guest("TEST P1"), await guest("TEST P2"), await guest("TEST P3")];
    for (const person of people) await board(run, person);
    await expectDenied(db.query("update public.transport_journeys set vehicle_id=$1,status='assigned' where id=$2", [small, run]), /seats 2 passengers but 3/);
    await db.query("update public.transport_journeys set vehicle_id=$1,status='assigned' where id=$2", [big, run]);
    await expectDenied(board(run, await guest("TEST P4")), /journey is full/);
    await expectDenied(db.query("update public.transport_vehicles set passenger_capacity=2 where id=$1", [big]), /more passengers than the new capacity/);
    await expectDenied(db.query("update public.transport_journeys set status='assigned',vehicle_id=null where id=$1", [run]));
  });

  it("rejects overlapping vehicle use but allows back-to-back runs", async () => {
    await assumeUser(db, OWNER_A);
    const van = await vehicle(8);
    await journey(van, "2027-06-17T10:00:00Z", "2027-06-17T11:00:00Z");
    await expectDenied(journey(van, "2027-06-17T10:59:00Z", "2027-06-17T12:00:00Z"), /overlapping journey/);
    await journey(van, "2027-06-17T11:00:00Z", "2027-06-17T12:00:00Z");
    const cancelled = await journey(null, "2027-06-17T10:30:00Z", "2027-06-17T11:30:00Z", "cancelled");
    expect(cancelled.rows).toHaveLength(1);
  });

  it("stops one guest being on two overlapping journeys", async () => {
    await assumeUser(db, OWNER_A);
    const person = await guest("TEST Traveller");
    const first = (await journey(null, "2027-06-17T10:00:00Z", "2027-06-17T11:00:00Z")).rows[0]!.id;
    const second = (await journey(null, "2027-06-17T10:30:00Z", "2027-06-17T11:30:00Z")).rows[0]!.id;
    const later = (await journey(null, "2027-06-17T11:00:00Z", "2027-06-17T12:00:00Z")).rows[0]!.id;
    await board(first, person);
    await expectDenied(board(second, person), /another journey at the same time/);
    await board(later, person);
    await expectDenied(db.query("update public.transport_journeys set pickup_at='2027-06-17T10:15:00Z' where id=$1", [later]), /same time/);
  });

  it("shows guests only confirmed stays and journeys explicitly shared with them", async () => {
    const { rooms } = await roomFixture({ roomsHeld: 2 });
    const household = await one<{ id: string }>("select public.save_guest_household($1,null,$2::jsonb) id", [WEDDING_A, JSON.stringify({ name: "TEST Portal household" })]);
    const person = await one<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: household.id, full_name: "TEST Portal traveller", email: "", phone: "", family_side: "shared", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })]);
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)", [WEDDING_A, person.id, FUNCTION_A]);
    await stay(person.id, rooms[0]!, "2027-06-17", "2027-06-18", false, "proposed");
    await stay(person.id, rooms[1]!, "2027-06-18", "2027-06-19", false, "confirmed");
    const van = await vehicle(4);
    const hidden = (await journey(van, "2027-06-17T10:00:00Z", "2027-06-17T11:00:00Z")).rows[0]!.id;
    const shared = (await journey(van, "2027-06-19T10:00:00Z", "2027-06-19T11:00:00Z", "assigned", "departure")).rows[0]!.id;
    await db.query("update public.transport_journeys set shared_with_guests=true where id=$1", [shared]);
    await board(hidden, person.id); await board(shared, person.id);
    await db.query("select public.create_guest_portal_link($1,$2,$3,$4::timestamptz)", [WEDDING_A, household.id, "d".repeat(64), new Date(Date.now() + 86_400_000).toISOString()]);
    await assumeUser(db, null, "anon");
    await db.query("select public.create_guest_portal_session($1,$2)", ["d".repeat(64), "e".repeat(64)]);
    const data = await one<{ data: { people: Array<{ stays: Array<Record<string, unknown>>; journeys: Array<Record<string, unknown>> }> } }>("select public.get_guest_portal_data($1) data", ["e".repeat(64)]);
    const visible = data.data.people[0]!;
    expect(visible.stays).toHaveLength(1);
    expect(visible.stays[0]).toMatchObject({ property: "TEST Hotel", check_in_date: "2027-06-18", check_out_date: "2027-06-19" });
    expect(Object.keys(visible.stays[0]!)).not.toContain("room");
    expect(visible.journeys).toHaveLength(1);
    expect(visible.journeys[0]).toMatchObject({ kind: "departure", pickup_location: "Airport" });
    expect(JSON.stringify(visible.journeys)).not.toContain("TEST Driver");
  });
});
