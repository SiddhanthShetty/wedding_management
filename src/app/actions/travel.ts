"use server";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { addPassengers, createJourney, createProperty, createRoom, createRoomType, createStay, createTravelGroup, createVehicle, removePassenger, saveTravelProfile, setInventoryRange, TravelConflictError, TravelRuleError, updateJourney, updateStay } from "@/lib/data/travel";

export type TravelActionState = { error?: string; message?: string; at?: number };

const text = (form: FormData, key: string) => { const value = form.get(key); return typeof value === "string" ? value : ""; };
const all = (form: FormData, key: string) => form.getAll(key).filter((value): value is string => typeof value === "string" && value.length > 0);
const id = z.uuid();
const optionalId = z.union([id, z.literal("")]).transform((value) => value || null);
const need = z.enum(["unknown", "required", "not_required"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Choose a date and time.");
const optionalLocalDateTime = z.union([localDateTime, z.literal("")]);
const optionalTime = z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal("")]).transform((value) => value || null);
const shortText = (max: number) => z.string().trim().max(max);
const submissionKey = (form: FormData) => z.union([id, z.literal("")]).transform((value) => value || null).parse(text(form, "submissionKey"));

function failure(error: unknown): TravelActionState {
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Check the entered values." };
  if (error instanceof TravelRuleError || error instanceof TravelConflictError) return { error: error.message };
  if (error instanceof AuthorizationDeniedError) return { error: "Your logistics edit access is no longer available. Refresh and try again." };
  return { error: "The change could not be saved. Nothing was recorded; refresh and try again." };
}

async function run(form: FormData, message: string, task: (weddingId: string) => Promise<string | void>): Promise<TravelActionState> {
  const wedding = id.safeParse(text(form, "weddingId"));
  if (!wedding.success) return { error: "Invalid wedding workspace." };
  try {
    const custom = await task(wedding.data);
    revalidatePath("/travel");
    revalidatePath("/overview");
    return { message: custom || message, at: Date.now() };
  } catch (error) {
    return failure(error);
  }
}

export async function saveTravelProfileAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  return run(form, "Travel needs saved.", async (weddingId) => {
    const values = z.object({
      guestId: id, version: z.union([z.literal(""), z.coerce.number().int().positive()]),
      accommodation_need: need, arrival_transport_need: need, departure_transport_need: need,
      arrival_at: optionalLocalDateTime, arrival_details: shortText(500), departure_at: optionalLocalDateTime, departure_details: shortText(500), travel_notes: shortText(2000),
    }).refine((value) => !value.arrival_at || !value.departure_at || value.departure_at > value.arrival_at, { message: "Departure must be after arrival." }).parse({
      guestId: text(form, "guestId"), version: text(form, "version"),
      accommodation_need: text(form, "accommodation_need"), arrival_transport_need: text(form, "arrival_transport_need"), departure_transport_need: text(form, "departure_transport_need"),
      arrival_at: text(form, "arrival_at"), arrival_details: text(form, "arrival_details"), departure_at: text(form, "departure_at"), departure_details: text(form, "departure_details"), travel_notes: text(form, "travel_notes"),
    });
    const { guestId, version, ...profile } = values;
    await saveTravelProfile(weddingId, guestId, version === "" ? null : version, profile);
  });
}

export async function createPropertyAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  return run(form, "Property added.", async (weddingId) => {
    await createProperty(weddingId, z.object({
      name: z.string().trim().min(1, "Enter the property name.").max(180), address: shortText(1200), contact_name: shortText(160), contact_phone: shortText(80),
      contact_email: z.union([z.literal(""), z.email("Enter a valid email or leave it blank.")]), check_in_time: optionalTime, check_out_time: optionalTime,
      guest_facing_notes: shortText(2000), internal_notes: shortText(4000), submission_key: z.union([id, z.null()]),
    }).parse({ submission_key: submissionKey(form), name: text(form, "name"), address: text(form, "address"), contact_name: text(form, "contact_name"), contact_phone: text(form, "contact_phone"), contact_email: text(form, "contact_email").trim(), check_in_time: text(form, "check_in_time"), check_out_time: text(form, "check_out_time"), guest_facing_notes: text(form, "guest_facing_notes"), internal_notes: text(form, "internal_notes") }));
  });
}

export async function createRoomTypeAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  return run(form, "Room type added.", async (weddingId) => {
    await createRoomType(weddingId, z.object({
      property_id: id, name: z.string().trim().min(1, "Enter the room type name.").max(120),
      standard_occupancy: z.coerce.number().int().min(1, "Occupancy must be at least 1.").max(20), max_extra_beds: z.coerce.number().int().min(0).max(10),
      notes: shortText(2000), room_count: z.coerce.number().int().min(0).max(100),
    }).parse({ property_id: text(form, "property_id"), name: text(form, "name"), standard_occupancy: text(form, "standard_occupancy"), max_extra_beds: text(form, "max_extra_beds") || "0", notes: text(form, "notes"), room_count: text(form, "room_count") || "0" }));
  });
}

export async function createRoomAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  return run(form, "Room added.", async (weddingId) => {
    await createRoom(weddingId, z.object({ room_type_id: id, label: z.string().trim().min(1, "Enter a room label.").max(60), number_confirmed: z.boolean() })
      .parse({ room_type_id: text(form, "room_type_id"), label: text(form, "label"), number_confirmed: text(form, "number_confirmed") === "on" }));
  });
}

export async function setInventoryAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  return run(form, "Room nights saved.", async (weddingId) => {
    const nights = await setInventoryRange(weddingId, z.object({ room_type_id: id, from: date, to: date, rooms_held: z.coerce.number().int().min(0).max(500), hold_status: z.enum(["proposed", "confirmed"]) })
      .parse({ room_type_id: text(form, "room_type_id"), from: text(form, "from"), to: text(form, "to"), rooms_held: text(form, "rooms_held"), hold_status: text(form, "hold_status") }));
    return `Saved ${nights} night(s).`;
  });
}

const stayFields = (form: FormData) => ({
  guest_id: text(form, "guest_id"), room_id: text(form, "room_id"), check_in_date: text(form, "check_in_date"), check_out_date: text(form, "check_out_date"),
  status: text(form, "status"), uses_extra_bed: text(form, "uses_extra_bed") === "on", payment_responsibility: text(form, "payment_responsibility") || "unknown",
  special_requirements: text(form, "special_requirements"), notes: text(form, "notes"),
});
const staySchema = z.object({
  guest_id: id, room_id: id, check_in_date: date, check_out_date: date, status: z.enum(["proposed", "confirmed", "cancelled"]), uses_extra_bed: z.boolean(),
  payment_responsibility: z.enum(["unknown", "couple", "guest", "family", "shared"]), special_requirements: shortText(2000), notes: shortText(2000),
});

export async function createStayAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  return run(form, "Room allocated.", async (weddingId) => { await createStay(weddingId, staySchema.parse(stayFields(form))); });
}

export async function updateStayAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  return run(form, "Stay updated.", async (weddingId) => {
    const stayId = id.parse(text(form, "stayId"));
    const version = z.coerce.number().int().positive().parse(text(form, "version"));
    await updateStay(weddingId, stayId, version, staySchema.parse(stayFields(form)));
  });
}

export async function setStayStatusAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  return run(form, "Stay status updated.", async (weddingId) => {
    const parsed = z.object({ stayId: id, version: z.coerce.number().int().positive(), status: z.enum(["proposed", "confirmed", "cancelled"]) })
      .parse({ stayId: text(form, "stayId"), version: text(form, "version"), status: text(form, "status") });
    await updateStay(weddingId, parsed.stayId, parsed.version, { status: parsed.status });
  });
}

export async function createVehicleAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  return run(form, "Vehicle added.", async (weddingId) => {
    await createVehicle(weddingId, z.object({ label: z.string().trim().min(1, "Enter a vehicle name.").max(120), vehicle_type: shortText(80), passenger_capacity: z.coerce.number().int().min(1, "Capacity must be at least 1.").max(100), driver_name: shortText(160), driver_phone: shortText(80), notes: shortText(2000) })
      .parse({ label: text(form, "label"), vehicle_type: text(form, "vehicle_type"), passenger_capacity: text(form, "passenger_capacity"), driver_name: text(form, "driver_name"), driver_phone: text(form, "driver_phone"), notes: text(form, "notes") }));
  });
}

export async function createTravelGroupAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  return run(form, "Travel group created.", async (weddingId) => {
    await createTravelGroup(weddingId, z.object({ name: z.string().trim().min(1, "Enter a group name.").max(160), notes: shortText(2000), guest_ids: z.array(id).max(200) })
      .parse({ name: text(form, "name"), notes: text(form, "notes"), guest_ids: all(form, "guest_ids") }));
  });
}

const journeySchema = z.object({
  kind: z.enum(["arrival", "departure", "transfer"]), function_id: optionalId, title: z.string().trim().min(1, "Enter a journey title.").max(180),
  pickup_location: z.string().trim().min(1, "Enter a pickup location.").max(300), dropoff_location: z.string().trim().min(1, "Enter a drop-off location.").max(300),
  pickup_at: localDateTime, estimated_dropoff_at: localDateTime, vehicle_id: optionalId, coordinator_user_id: optionalId,
  status: z.enum(["planned", "assigned", "collected", "completed", "cancelled"]), status_note: shortText(1000), shared_with_guests: z.boolean(), notes: shortText(2000),
}).superRefine((value, ctx) => {
  if (!["planned", "cancelled"].includes(value.status) && !value.vehicle_id) ctx.addIssue({ code: "custom", message: "Choose a vehicle before marking the journey assigned, collected or completed." });
  if (value.shared_with_guests && (!value.vehicle_id || value.status === "cancelled")) ctx.addIssue({ code: "custom", message: "Only a journey with a vehicle that is not cancelled can be shared with guests." });
});
const journeyFields = (form: FormData) => ({
  kind: text(form, "kind"), function_id: text(form, "function_id"), title: text(form, "title"), pickup_location: text(form, "pickup_location"), dropoff_location: text(form, "dropoff_location"),
  pickup_at: text(form, "pickup_at"), estimated_dropoff_at: text(form, "estimated_dropoff_at"), vehicle_id: text(form, "vehicle_id"), coordinator_user_id: text(form, "coordinator_user_id"),
  status: text(form, "status") || "planned", status_note: text(form, "status_note"), shared_with_guests: text(form, "shared_with_guests") === "on", notes: text(form, "notes"),
});

export async function createJourneyAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  return run(form, "Journey created.", async (weddingId) => { await createJourney(weddingId, journeySchema.parse(journeyFields(form)), submissionKey(form)); });
}

export async function updateJourneyAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  return run(form, "Journey updated.", async (weddingId) => {
    const journeyId = id.parse(text(form, "journeyId"));
    const version = z.coerce.number().int().positive().parse(text(form, "version"));
    await updateJourney(weddingId, journeyId, version, journeySchema.parse(journeyFields(form)));
  });
}

export async function addPassengersAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  const wedding = id.safeParse(text(form, "weddingId"));
  if (!wedding.success) return { error: "Invalid wedding workspace." };
  try {
    const journeyId = id.parse(text(form, "journeyId"));
    const guestIds = z.array(id).max(100).parse(all(form, "guest_ids"));
    if (!guestIds.length) return { error: "Choose at least one guest or travel group." };
    const result = await addPassengers(wedding.data, journeyId, guestIds);
    revalidatePath("/travel"); revalidatePath("/overview");
    if (result.rejected.length) return { error: `${result.added} added. ${result.rejected.length} not added: ${[...new Set(result.rejected)].join(" ")}`, at: Date.now() };
    return { message: `${result.added} passenger(s) on board.`, at: Date.now() };
  } catch (error) {
    return failure(error);
  }
}

export async function removePassengerAction(_state: TravelActionState, form: FormData): Promise<TravelActionState> {
  return run(form, "Passenger removed.", async (weddingId) => {
    await removePassenger(weddingId, id.parse(text(form, "journeyId")), id.parse(text(form, "guestId")));
  });
}
