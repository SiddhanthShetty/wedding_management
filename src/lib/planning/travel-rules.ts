/**
 * Accommodation and transport rules shared by the travel workspace, the dashboard and tests.
 * The database enforces the same limits (see 20261106100000_accommodation_transport.sql);
 * these helpers explain them in the UI and power warnings before a save is attempted.
 */

export type LogisticsNeed = "unknown" | "required" | "not_required";
export type AllocationStatus = "proposed" | "confirmed" | "cancelled";
export type JourneyKind = "arrival" | "departure" | "transfer";
export type JourneyStatus = "planned" | "assigned" | "collected" | "completed" | "cancelled";
export type PaymentResponsibility = "unknown" | "couple" | "guest" | "family" | "shared";

/** What a planner sees for one guest need. "not_assigned" is only ever derived. */
export type NeedState = "not_required" | "unknown" | "not_assigned" | "allocated";

export const NEED_STATE_LABELS: Record<NeedState, string> = {
  not_required: "Not required",
  unknown: "Unknown",
  not_assigned: "Not assigned",
  allocated: "Allocated",
};
export const NEED_LABELS: Record<LogisticsNeed, string> = { unknown: "Unknown", required: "Required", not_required: "Not required" };
export const ALLOCATION_LABELS: Record<AllocationStatus, string> = { proposed: "Proposed", confirmed: "Confirmed", cancelled: "Cancelled" };
export const JOURNEY_STATUS_LABELS: Record<JourneyStatus, string> = { planned: "Planned", assigned: "Assigned", collected: "Collected", completed: "Completed", cancelled: "Cancelled" };
export const JOURNEY_KIND_LABELS: Record<JourneyKind, string> = { arrival: "Arrival", departure: "Departure", transfer: "Transfer" };
export const PAYMENT_LABELS: Record<PaymentResponsibility, string> = { unknown: "Unknown", couple: "Couple", guest: "Guest", family: "Family", shared: "Shared" };

/**
 * An allocation always wins: a guest with a room is "allocated" whatever the recorded need.
 * Without one, "required" becomes "not_assigned"; unknown and not-required stay distinct.
 */
export function needState(need: LogisticsNeed, hasAllocation: boolean): NeedState {
  if (hasAllocation) return "allocated";
  if (need === "required") return "not_assigned";
  return need;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
function parseDate(value: string) {
  const match = DATE.exec(value);
  if (!match) throw new Error("Use a YYYY-MM-DD date.");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) throw new Error("Use a real calendar date.");
  return date;
}

/** Nights of a stay as a half-open range: check-in night included, check-out day excluded. */
export function stayNights(checkIn: string, checkOut: string): string[] {
  const start = parseDate(checkIn);
  const end = parseDate(checkOut);
  if (end <= start) throw new Error("Check-out must be after check-in.");
  const nights: string[] = [];
  for (let day = start; day < end; day = new Date(day.getTime() + 86_400_000)) nights.push(day.toISOString().slice(0, 10));
  if (nights.length > 60) throw new Error("A single stay cannot be longer than 60 nights.");
  return nights;
}

export function stayCoversNight(stay: { check_in_date: string; check_out_date: string }, night: string) {
  return stay.check_in_date <= night && stay.check_out_date > night;
}

export type StayForCapacity = { id?: string; guest_id: string; room_id: string; check_in_date: string; check_out_date: string; status: AllocationStatus; uses_extra_bed: boolean };
export type RoomCapacity = { standard_occupancy: number; max_extra_beds: number };

/** Problems that would stop a stay being saved; mirrors the database trigger. */
export function stayCapacityIssues(input: {
  stay: StayForCapacity;
  room: RoomCapacity & { room_type_id: string };
  roomTypeOfRoom: Map<string, string>;
  heldRoomsByNight: Map<string, number>;
  existing: StayForCapacity[];
}): string[] {
  const { stay, room, roomTypeOfRoom, heldRoomsByNight } = input;
  if (stay.status === "cancelled") return [];
  const issues: string[] = [];
  if (stay.uses_extra_bed && room.max_extra_beds === 0) issues.push("This room type does not allow extra beds.");
  const others = input.existing.filter((row) => row.id !== stay.id && row.status !== "cancelled");
  for (const night of stayNights(stay.check_in_date, stay.check_out_date)) {
    const held = heldRoomsByNight.get(night) ?? 0;
    if (held === 0) { issues.push(`The night of ${night} is outside the booked nights for this room type.`); continue; }
    const tonight = others.filter((row) => stayCoversNight(row, night));
    if (tonight.some((row) => row.guest_id === stay.guest_id)) issues.push(`This guest already has a room for the night of ${night}.`);
    const inRoom = tonight.filter((row) => row.room_id === stay.room_id);
    const beds = inRoom.filter((row) => !row.uses_extra_bed).length + (stay.uses_extra_bed ? 0 : 1);
    const extras = inRoom.filter((row) => row.uses_extra_bed).length + (stay.uses_extra_bed ? 1 : 0);
    if (beds > room.standard_occupancy) issues.push(`The room is already at its occupancy limit (${room.standard_occupancy}) on the night of ${night}.`);
    if (extras > room.max_extra_beds) issues.push(`No extra bed is left in this room on the night of ${night}.`);
    const roomsUsed = new Set(tonight.filter((row) => roomTypeOfRoom.get(row.room_id) === room.room_type_id).map((row) => row.room_id));
    roomsUsed.add(stay.room_id);
    if (roomsUsed.size > held) issues.push(`Only ${held} room(s) of this type are held for the night of ${night}.`);
  }
  return issues;
}

/** Half-open interval overlap: an interval ending exactly when another starts does not overlap. */
export function intervalsOverlap(aStart: string | Date, aEnd: string | Date, bStart: string | Date, bEnd: string | Date) {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(bStart).getTime() < new Date(aEnd).getTime();
}

export type JourneyForConflicts = { id: string; vehicle_id: string | null; pickup_at: string; estimated_dropoff_at: string; status: JourneyStatus };

/** Pairs of active journeys that use the same vehicle at overlapping times. */
export function vehicleConflicts(journeys: JourneyForConflicts[]): Array<[string, string]> {
  const active = journeys.filter((journey) => journey.vehicle_id && journey.status !== "cancelled");
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < active.length; i += 1) for (let j = i + 1; j < active.length; j += 1) {
    const a = active[i]!; const b = active[j]!;
    if (a.vehicle_id === b.vehicle_id && intervalsOverlap(a.pickup_at, a.estimated_dropoff_at, b.pickup_at, b.estimated_dropoff_at)) pairs.push([a.id, b.id]);
  }
  return pairs;
}

export function seatsRemaining(capacity: number | null, passengers: number): number | null {
  return capacity === null ? null : capacity - passengers;
}

export type TravelProfile = { guest_id: string; accommodation_need: LogisticsNeed; arrival_transport_need: LogisticsNeed; departure_transport_need: LogisticsNeed };
export type GuestTravelGap = { guestId: string; accommodation: NeedState; arrival: NeedState; departure: NeedState };

/**
 * Per-guest room, arrival and departure states. Guests without a travel profile are "unknown".
 * Used by the travel workspace and by the dashboard, so both always agree.
 */
export function guestTravelStates(input: {
  guestIds: string[];
  profiles: TravelProfile[];
  stays: Array<{ guest_id: string; status: AllocationStatus }>;
  passengers: Array<{ guest_id: string; kind: JourneyKind; status: JourneyStatus }>;
}): GuestTravelGap[] {
  const profiles = new Map(input.profiles.map((profile) => [profile.guest_id, profile]));
  const withRoom = new Set(input.stays.filter((stay) => stay.status !== "cancelled").map((stay) => stay.guest_id));
  const ride = (kind: JourneyKind) => new Set(input.passengers.filter((row) => row.kind === kind && row.status !== "cancelled").map((row) => row.guest_id));
  const arriving = ride("arrival"); const departing = ride("departure");
  return input.guestIds.map((guestId) => {
    const profile = profiles.get(guestId);
    return {
      guestId,
      accommodation: needState(profile?.accommodation_need ?? "unknown", withRoom.has(guestId)),
      arrival: needState(profile?.arrival_transport_need ?? "unknown", arriving.has(guestId)),
      departure: needState(profile?.departure_transport_need ?? "unknown", departing.has(guestId)),
    };
  });
}

export function travelGapCounts(states: GuestTravelGap[]) {
  return {
    roomsNotAssigned: states.filter((row) => row.accommodation === "not_assigned").length,
    arrivalsNotAssigned: states.filter((row) => row.arrival === "not_assigned").length,
    departuresNotAssigned: states.filter((row) => row.departure === "not_assigned").length,
    guestsMissingAny: states.filter((row) => row.accommodation === "not_assigned" || row.arrival === "not_assigned" || row.departure === "not_assigned").length,
    roomNeedUnknown: states.filter((row) => row.accommodation === "unknown").length,
  };
}

const addDays = (date: string, days: number) => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + days)).toISOString().slice(0, 10);
const localParts = (instant: string, timezone: string) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
const localInput = (instant: string, timezone: string) => { const p = localParts(instant, timezone); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
const shiftLocal = (value: string, minutes: number) => new Date(Date.UTC(+value.slice(0, 4), +value.slice(5, 7) - 1, +value.slice(8, 10), +value.slice(11, 13), +value.slice(14, 16) + minutes)).toISOString().slice(0, 16);

/**
 * Suggested stay dates: the guest's recorded arrival/departure days when known, otherwise the
 * first function day to the day after the last one.
 */
export function defaultStayDates(input: { functionDates: Array<string | null>; arrivalAt: string | null; departureAt: string | null; timezone: string }): { checkIn: string; checkOut: string } {
  const dates = input.functionDates.filter((date): date is string => Boolean(date)).sort();
  let checkIn = input.arrivalAt ? localInput(input.arrivalAt, input.timezone).slice(0, 10) : dates[0] ?? "";
  let checkOut = input.departureAt ? localInput(input.departureAt, input.timezone).slice(0, 10) : dates.length ? addDays(dates.at(-1)!, 1) : "";
  if (checkIn && checkOut && checkOut <= checkIn) checkOut = addDays(checkIn, 1);
  if (!checkIn && checkOut) checkIn = addDays(checkOut, -1);
  return { checkIn, checkOut };
}

export type PickupSuggestion = { key: string; kind: "arrival" | "departure"; title: string; detail: string; guestIds: string[]; pickupLocal: string; dropoffLocal: string; location: string };

/**
 * Groups guests who need a ride but have none, by local date and hour of their recorded arrival
 * or departure. Arrivals are collected 30 minutes after landing; departures leave 3 hours before.
 */
export function pickupSuggestions(input: {
  states: GuestTravelGap[]; profiles: Array<{ guest_id: string; arrival_at: string | null; arrival_details: string; departure_at: string | null; departure_details: string }>; timezone: string;
}): PickupSuggestion[] {
  const states = new Map(input.states.map((state) => [state.guestId, state]));
  const groups = new Map<string, PickupSuggestion & { earliest: string }>();
  for (const profile of input.profiles) {
    const state = states.get(profile.guest_id);
    for (const kind of ["arrival", "departure"] as const) {
      const at = kind === "arrival" ? profile.arrival_at : profile.departure_at;
      if (!at || state?.[kind] !== "not_assigned") continue;
      const local = localInput(at, input.timezone);
      const key = `${kind}:${local.slice(0, 13)}`;
      const details = (kind === "arrival" ? profile.arrival_details : profile.departure_details).trim();
      const existing = groups.get(key);
      if (existing) {
        existing.guestIds.push(profile.guest_id);
        if (details && !existing.detail.includes(details)) existing.detail = existing.detail ? `${existing.detail}, ${details}` : details;
        if (local < existing.earliest) existing.earliest = local;
        continue;
      }
      groups.set(key, { key, kind, title: "", detail: details, guestIds: [profile.guest_id], pickupLocal: "", dropoffLocal: "", location: details, earliest: local });
    }
  }
  return [...groups.values()].map(({ earliest, ...group }) => {
    const pickupLocal = group.kind === "arrival" ? shiftLocal(earliest, 30) : shiftLocal(earliest, -180);
    return { ...group, pickupLocal, dropoffLocal: shiftLocal(pickupLocal, 90), title: `${group.kind === "arrival" ? "Arrival pickup" : "Departure drop-off"} · ${earliest.slice(0, 10)} around ${earliest.slice(11, 13)}:00 · ${group.guestIds.length} guest(s)` };
  }).sort((a, b) => a.pickupLocal.localeCompare(b.pickupLocal));
}
