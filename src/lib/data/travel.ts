import "server-only";
import { AuthorizationDeniedError, authorizeWeddingOperation, type WorkspaceContext } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listActiveMemberNames } from "@/lib/data/member-names";
import { localDateTimeToInstant } from "@/lib/planning/local-time";
import { guestTravelStates, stayNights, type AllocationStatus, type JourneyKind, type JourneyStatus, type LogisticsNeed, type PaymentResponsibility } from "@/lib/planning/travel-rules";

/** A user-safe message raised by a database rule (capacity, dates, overlap). */
export class TravelRuleError extends Error { constructor(message: string) { super(message); this.name = "TravelRuleError"; } }
export class TravelConflictError extends Error { constructor() { super("This record was changed by someone else. Refresh and review it before saving again."); this.name = "TravelConflictError"; } }

type DbError = { code?: string; message: string } | null;
/** A repeat of an already-saved submission (same submission key): treat as already done. */
export function isDuplicateSubmission(error: DbError) {
  return Boolean(error && error.code === "23505" && /submission_key/.test(error.message));
}
function check(error: DbError, fallback: string): void {
  if (!error) return;
  // 23514 messages come from our own triggers and constraints and are written for planners.
  if (error.code === "23514" && !/violates check constraint/.test(error.message)) throw new TravelRuleError(error.message);
  if (error.code === "23505") throw new TravelRuleError("That name or record already exists here.");
  if (error.code === "42501") throw new AuthorizationDeniedError();
  throw new Error(fallback);
}

export function canEditLogistics(context: WorkspaceContext) {
  return context.membership.role === "owner" || context.membership.role === "co_owner" || context.moduleAccess.logistics === "edit";
}

export type TravelGuest = { guest_id: string; full_name: string; household_name: string; phone: string | null; assistance_needs: string | null };

export async function getTravelWorkspace(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "logistics", "read");
  const supabase = await createSupabaseServerClient();
  const [guests, references, profiles, properties, roomTypes, rooms, inventory, stays, vehicles, groups, groupMembers, journeys, passengers] = await Promise.all([
    supabase.rpc("get_travel_guests", { p_wedding_id: weddingId }),
    supabase.rpc("get_catering_references", { p_wedding_id: weddingId }),
    supabase.from("guest_travel_profiles").select("guest_id,accommodation_need,arrival_transport_need,departure_transport_need,arrival_at,arrival_details,departure_at,departure_details,travel_notes,details_entered_by_user_id,details_entered_at,version").eq("wedding_id", weddingId),
    supabase.from("accommodation_properties").select("id,name,address,contact_name,contact_phone,contact_email,check_in_time,check_out_time,guest_facing_notes,internal_notes").eq("wedding_id", weddingId).order("name"),
    supabase.from("accommodation_room_types").select("id,property_id,name,standard_occupancy,max_extra_beds,notes").eq("wedding_id", weddingId).order("name"),
    supabase.from("accommodation_rooms").select("id,room_type_id,label,number_confirmed").eq("wedding_id", weddingId).order("label"),
    supabase.from("accommodation_inventory").select("room_type_id,night,rooms_held,hold_status").eq("wedding_id", weddingId).order("night"),
    supabase.from("accommodation_assignments").select("id,guest_id,room_id,check_in_date,check_out_date,status,uses_extra_bed,payment_responsibility,special_requirements,notes,version,updated_at").eq("wedding_id", weddingId).order("check_in_date"),
    supabase.from("transport_vehicles").select("id,label,vehicle_type,passenger_capacity,driver_name,driver_phone,notes").eq("wedding_id", weddingId).order("label"),
    supabase.from("transport_travel_groups").select("id,name,notes").eq("wedding_id", weddingId).order("name"),
    supabase.from("transport_travel_group_members").select("group_id,guest_id").eq("wedding_id", weddingId),
    supabase.from("transport_journeys").select("id,kind,function_id,title,pickup_location,dropoff_location,pickup_at,estimated_dropoff_at,vehicle_id,coordinator_user_id,status,status_note,shared_with_guests,notes,version,updated_at").eq("wedding_id", weddingId).order("pickup_at"),
    supabase.from("transport_passengers").select("journey_id,guest_id").eq("wedding_id", weddingId),
  ]);
  for (const result of [guests, references, profiles, properties, roomTypes, rooms, inventory, stays, vehicles, groups, groupMembers, journeys, passengers]) {
    if (result.error) throw new Error("Could not load accommodation and transport records.");
  }
  const members = await listActiveMemberNames(weddingId);
  const journeyKind = new Map((journeys.data ?? []).map((row) => [row.id, row]));
  const states = guestTravelStates({
    guestIds: (guests.data ?? []).map((row: TravelGuest) => row.guest_id),
    profiles: profiles.data ?? [],
    stays: stays.data ?? [],
    passengers: (passengers.data ?? []).flatMap((row) => {
      const journey = journeyKind.get(row.journey_id);
      return journey ? [{ guest_id: row.guest_id, kind: journey.kind as JourneyKind, status: journey.status as JourneyStatus }] : [];
    }),
  });
  const refs = (references.data ?? {}) as { functions?: Array<{ id: string; name: string }> };
  return {
    wedding: context.wedding,
    canEdit: canEditLogistics(context),
    canSeeGuestContacts: context.membership.role === "owner" || context.membership.role === "co_owner" || Boolean(context.moduleAccess.guests),
    guests: (guests.data ?? []) as TravelGuest[],
    states,
    functions: refs.functions ?? [],
    members,
    profiles: profiles.data ?? [],
    properties: properties.data ?? [],
    roomTypes: roomTypes.data ?? [],
    rooms: rooms.data ?? [],
    inventory: inventory.data ?? [],
    stays: stays.data ?? [],
    vehicles: vehicles.data ?? [],
    groups: (groups.data ?? []).map((group) => ({ ...group, guest_ids: (groupMembers.data ?? []).filter((row) => row.group_id === group.id).map((row) => row.guest_id) })),
    journeys: journeys.data ?? [],
    passengers: passengers.data ?? [],
    loadedAt: new Date().toISOString(),
  };
}
export type TravelWorkspace = Awaited<ReturnType<typeof getTravelWorkspace>>;

async function editor(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "logistics", "edit");
  return { context, supabase: await createSupabaseServerClient() };
}

export type TravelProfileInput = {
  accommodation_need: LogisticsNeed; arrival_transport_need: LogisticsNeed; departure_transport_need: LogisticsNeed;
  arrival_at: string; arrival_details: string; departure_at: string; departure_details: string; travel_notes: string;
};

export async function saveTravelProfile(weddingId: string, guestId: string, expectedVersion: number | null, input: TravelProfileInput) {
  const { context, supabase } = await editor(weddingId);
  const tz = context.wedding.timezone;
  const detailsEntered = Boolean(input.arrival_at || input.arrival_details || input.departure_at || input.departure_details);
  const values = {
    ...input,
    arrival_at: localDateTimeToInstant(input.arrival_at, tz),
    departure_at: localDateTimeToInstant(input.departure_at, tz),
    // Manual entry is attributed; it is never treated as live-verified.
    details_entered_by_user_id: detailsEntered ? context.user.id : null,
    details_entered_at: detailsEntered ? new Date().toISOString() : null,
  };
  if (expectedVersion === null) {
    const { error } = await supabase.from("guest_travel_profiles").insert({ wedding_id: weddingId, guest_id: guestId, ...values });
    if (error?.code === "23505") throw new TravelConflictError();
    check(error, "Could not save travel needs.");
    return;
  }
  const { data, error } = await supabase.from("guest_travel_profiles").update(values).eq("wedding_id", weddingId).eq("guest_id", guestId).eq("version", expectedVersion).select("version").maybeSingle();
  check(error, "Could not save travel needs.");
  if (!data) throw new TravelConflictError();
}

export async function createProperty(weddingId: string, input: { submission_key: string | null; name: string; address: string; contact_name: string; contact_phone: string; contact_email: string; check_in_time: string | null; check_out_time: string | null; guest_facing_notes: string; internal_notes: string }) {
  const { context, supabase } = await editor(weddingId);
  const { error } = await supabase.from("accommodation_properties").insert({ ...input, wedding_id: weddingId, created_by_user_id: context.user.id });
  if (isDuplicateSubmission(error)) return;
  check(error, "Could not add the property.");
}

export async function createRoomType(weddingId: string, input: { property_id: string; name: string; standard_occupancy: number; max_extra_beds: number; notes: string; room_count: number }) {
  const { supabase } = await editor(weddingId);
  const { room_count: roomCount, ...values } = input;
  const { data, error } = await supabase.from("accommodation_room_types").insert({ ...values, wedding_id: weddingId }).select("id").single();
  check(error, "Could not add the room type.");
  if (roomCount > 0) {
    const rows = Array.from({ length: roomCount }, (_, index) => ({ wedding_id: weddingId, room_type_id: data!.id, label: `${values.name} ${index + 1}`, number_confirmed: false }));
    const created = await supabase.from("accommodation_rooms").insert(rows);
    check(created.error, "The room type was added, but its rooms could not be created. Add rooms individually.");
  }
}

export async function createRoom(weddingId: string, input: { room_type_id: string; label: string; number_confirmed: boolean }) {
  const { supabase } = await editor(weddingId);
  const { error } = await supabase.from("accommodation_rooms").insert({ ...input, wedding_id: weddingId });
  check(error, "Could not add the room.");
}

/** Sets rooms held for each night in [from, to). Zero keeps the night on record with nothing held. */
export async function setInventoryRange(weddingId: string, input: { room_type_id: string; from: string; to: string; rooms_held: number; hold_status: "proposed" | "confirmed" }) {
  const { supabase } = await editor(weddingId);
  const rows = stayNights(input.from, input.to).map((night) => ({ wedding_id: weddingId, room_type_id: input.room_type_id, night, rooms_held: input.rooms_held, hold_status: input.hold_status, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from("accommodation_inventory").upsert(rows, { onConflict: "wedding_id,room_type_id,night" });
  check(error, "Could not save room inventory.");
  return rows.length;
}

export type StayInput = { guest_id: string; room_id: string; check_in_date: string; check_out_date: string; status: AllocationStatus; uses_extra_bed: boolean; payment_responsibility: PaymentResponsibility; special_requirements: string; notes: string };

export async function createStay(weddingId: string, input: StayInput) {
  const { context, supabase } = await editor(weddingId);
  stayNights(input.check_in_date, input.check_out_date);
  const { error } = await supabase.from("accommodation_assignments").insert({ ...input, wedding_id: weddingId, created_by_user_id: context.user.id });
  check(error, "Could not allocate this room.");
}

export async function updateStay(weddingId: string, stayId: string, expectedVersion: number, input: Partial<StayInput>) {
  const { supabase } = await editor(weddingId);
  if (input.check_in_date && input.check_out_date) stayNights(input.check_in_date, input.check_out_date);
  const { data, error } = await supabase.from("accommodation_assignments").update(input).eq("wedding_id", weddingId).eq("id", stayId).eq("version", expectedVersion).select("id").maybeSingle();
  check(error, "Could not update this stay.");
  if (!data) throw new TravelConflictError();
}

export async function createVehicle(weddingId: string, input: { label: string; vehicle_type: string; passenger_capacity: number; driver_name: string; driver_phone: string; notes: string }) {
  const { context, supabase } = await editor(weddingId);
  const { error } = await supabase.from("transport_vehicles").insert({ ...input, wedding_id: weddingId, created_by_user_id: context.user.id });
  check(error, "Could not add the vehicle.");
}

export async function createTravelGroup(weddingId: string, input: { name: string; notes: string; guest_ids: string[] }) {
  const { context, supabase } = await editor(weddingId);
  const { data, error } = await supabase.from("transport_travel_groups").insert({ wedding_id: weddingId, name: input.name, notes: input.notes, created_by_user_id: context.user.id }).select("id").single();
  check(error, "Could not create the travel group.");
  if (input.guest_ids.length) {
    const members = await supabase.from("transport_travel_group_members").insert(input.guest_ids.map((guestId) => ({ wedding_id: weddingId, group_id: data!.id, guest_id: guestId })));
    check(members.error, "The group was created, but its members could not be added.");
  }
}

export type JourneyInput = { kind: JourneyKind; function_id: string | null; title: string; pickup_location: string; dropoff_location: string; pickup_at: string; estimated_dropoff_at: string; vehicle_id: string | null; coordinator_user_id: string | null; status: JourneyStatus; status_note: string; shared_with_guests: boolean; notes: string };

function journeyInstants(input: Pick<JourneyInput, "pickup_at" | "estimated_dropoff_at">, timezone: string) {
  const pickup = localDateTimeToInstant(input.pickup_at, timezone);
  const dropoff = localDateTimeToInstant(input.estimated_dropoff_at, timezone);
  if (!pickup || !dropoff) throw new TravelRuleError("Enter pickup and estimated drop-off times.");
  if (new Date(dropoff) <= new Date(pickup)) throw new TravelRuleError("Drop-off must be after pickup.");
  return { pickup_at: pickup, estimated_dropoff_at: dropoff };
}

export async function createJourney(weddingId: string, input: JourneyInput, submissionKey: string | null) {
  const { context, supabase } = await editor(weddingId);
  const { error } = await supabase.from("transport_journeys").insert({ ...input, ...journeyInstants(input, context.wedding.timezone), wedding_id: weddingId, created_by_user_id: context.user.id, submission_key: submissionKey });
  if (isDuplicateSubmission(error)) return;
  check(error, "Could not create the journey.");
}

export async function updateJourney(weddingId: string, journeyId: string, expectedVersion: number, input: JourneyInput) {
  const { context, supabase } = await editor(weddingId);
  const { data, error } = await supabase.from("transport_journeys").update({ ...input, ...journeyInstants(input, context.wedding.timezone) }).eq("wedding_id", weddingId).eq("id", journeyId).eq("version", expectedVersion).select("id").maybeSingle();
  check(error, "Could not update the journey.");
  if (!data) throw new TravelConflictError();
}

/** Boards guests one at a time so one full seat or clash does not hide which guests were added. */
export async function addPassengers(weddingId: string, journeyId: string, guestIds: string[]) {
  const { context, supabase } = await editor(weddingId);
  const added: string[] = []; const rejected: string[] = [];
  for (const guestId of [...new Set(guestIds)]) {
    const { error } = await supabase.from("transport_passengers").insert({ wedding_id: weddingId, journey_id: journeyId, guest_id: guestId, added_by_user_id: context.user.id });
    if (!error || error.code === "23505") { added.push(guestId); continue; }
    if (error.code === "23514") { rejected.push(error.message); continue; }
    check(error, "Could not add passengers.");
  }
  return { added: added.length, rejected };
}

export async function removePassenger(weddingId: string, journeyId: string, guestId: string) {
  const { supabase } = await editor(weddingId);
  const { error } = await supabase.from("transport_passengers").delete().eq("wedding_id", weddingId).eq("journey_id", journeyId).eq("guest_id", guestId);
  check(error, "Could not remove the passenger.");
}
