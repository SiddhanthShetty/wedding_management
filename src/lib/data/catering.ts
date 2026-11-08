import type { LooseRow } from "@/lib/types/loose";
import "server-only";
import { AuthorizationDeniedError, authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveFunctionSchedule } from "@/lib/planning/schedule";

const categories = ["adult", "child", "vendor", "staff"] as const;
type Row = LooseRow;
const fail = (message: string): never => { throw new Error(message); };
function localDateTimeToInstant(value: string | null | undefined, timezone: string) {
  if (!value) return null;
  const [date, time] = value.split("T");
  const resolved = resolveFunctionSchedule({ date: date ?? "", startTime: time ?? "", endTime: "", timezone });
  if (!resolved.startsAt) fail("Enter a valid local date and time.");
  return resolved.startsAt;
}

export async function getCateringWorkspace(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "logistics", "read");
  const supabase = await createSupabaseServerClient();
  const [references, services] = await Promise.all([
    supabase.rpc("get_catering_references", { p_wedding_id: weddingId }),
    supabase.from("catering_meal_services").select("id,function_id,name,service_time,currency,caterer_supplier_id,booking_id,final_count_deadline,approved_guarantee,agreed_buffer,guarantee_approved_at,created_at").eq("wedding_id", weddingId).order("created_at"),
  ]);
  if ([references, services].some((row) => row.error)) fail("Could not load catering workspace records.");
  const refData = (references.data ?? {}) as { functions?: Row[]; caterers?: Row[] };
  const serviceIds = (services.data ?? []).map((service) => service.id);
  const [countResult, assignmentResult, menuResult, tastingResult, snapshotResult] = await Promise.all([
    serviceIds.length ? supabase.from("catering_service_counts").select("meal_service_id,category,manual_expected_count,actual_attendance,rate_text:per_plate_rate::text").eq("wedding_id", weddingId).in("meal_service_id", serviceIds) : Promise.resolve({ data: [], error: null }),
    serviceIds.length ? supabase.from("catering_guest_assignments").select("meal_service_id,guest_id,category").eq("wedding_id", weddingId).in("meal_service_id", serviceIds) : Promise.resolve({ data: [], error: null }),
    serviceIds.length ? supabase.from("catering_menus").select("id,meal_service_id,version_number,title,notes,status,approved_at,created_at").eq("wedding_id", weddingId).in("meal_service_id", serviceIds).order("version_number", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    serviceIds.length ? supabase.from("catering_tastings").select("id,meal_service_id,appointment_at,status,feedback").eq("wedding_id", weddingId).in("meal_service_id", serviceIds).order("appointment_at") : Promise.resolve({ data: [], error: null }),
    serviceIds.length ? supabase.from("catering_count_snapshots").select("id,meal_service_id,captured_at,final_count_deadline,invited_count,confirmed_count,manual_expected_count,approved_guarantee,agreed_buffer,final_catering_count,currency,category_totals,booking_id").eq("wedding_id", weddingId).in("meal_service_id", serviceIds).order("captured_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  if ([countResult, assignmentResult, menuResult, tastingResult, snapshotResult].some((row) => row.error)) fail("Could not load catering details.");
  const menuIds = (menuResult.data ?? []).map((menu) => menu.id);
  const itemResult = menuIds.length ? await supabase.from("catering_menu_items").select("id,menu_id,name,details,dietary_labels,allergen_summary,position").eq("wedding_id", weddingId).in("menu_id", menuIds).order("position") : { data: [], error: null };
  if (itemResult.error) fail("Could not load menu items.");
  const canSeeAllergies = context.membership.role === "owner" || context.membership.role === "co_owner" || context.moduleAccess.guests === "edit";
  const allergyByService: Record<string, Array<{ name: string; allergies: string }>> = {};
  if (canSeeAllergies) for (const service of services.data ?? []) {
    const { data, error } = await supabase.rpc("get_catering_allergy_details", { p_wedding_id: weddingId, p_service_id: service.id });
    if (error) fail("Could not load restricted allergy details.");
    allergyByService[service.id] = (data ?? []).map((item: Row) => ({ name: item.guest_name, allergies: item.allergies }));
  }
  const suppliersById = new Map((refData.caterers ?? []).map((supplier) => [supplier.id, supplier.name]));
  const bookingAccess = await authorizeWeddingOperation(weddingId, "suppliers_finance", "read").then(() => true).catch((error) => {
    if (error instanceof AuthorizationDeniedError) return false;
    throw error;
  });
  const bookings = bookingAccess ? await supabase.from("bookings").select("id,label,agreed_total::text,currency,status").eq("wedding_id", weddingId).neq("status", "cancelled").order("label") : { data: [], error: null };
  if (bookings.error) fail("Could not load linked budget records.");
  const bookingById = new Map((bookings.data ?? []).map((booking) => [booking.id, booking]));
  const serviceDtos = await Promise.all((services.data ?? []).map(async (service) => {
    const [invitedResult, dietaryResult] = await Promise.all([
      supabase.rpc("get_catering_invited_guests", { p_wedding_id: weddingId, p_service_id: service.id }),
      supabase.rpc("get_catering_dietary_summary", { p_wedding_id: weddingId, p_service_id: service.id }),
    ]);
    if (invitedResult.error || dietaryResult.error) fail("Could not load invited guests and dietary summary.");
    const counts = (countResult.data ?? []).filter((row) => row.meal_service_id === service.id);
    const assignments = (assignmentResult.data ?? []).filter((row) => row.meal_service_id === service.id);
    const menus = (menuResult.data ?? []).filter((row) => row.meal_service_id === service.id).map((menu) => ({ ...menu, items: (itemResult.data ?? []).filter((item) => item.menu_id === menu.id) }));
    const latestSnapshot = (snapshotResult.data ?? []).find((row) => row.meal_service_id === service.id) ?? null;
    return { ...service, caterer_name: suppliersById.get(service.caterer_supplier_id) ?? null, linked_booking: bookingById.get(service.booking_id) ?? null, counts, assignments, guests: invitedResult.data ?? [], dietary: dietaryResult.data, menus, tastings: (tastingResult.data ?? []).filter((row) => row.meal_service_id === service.id), latest_snapshot: latestSnapshot, allergy_details: allergyByService[service.id] ?? [] };
  }));
  return { wedding: context.wedding, canEdit: context.membership.role === "owner" || context.membership.role === "co_owner" || context.moduleAccess.logistics === "edit", canSeeAllergies, canLinkBookings: bookingAccess, functions: refData.functions ?? [], suppliers: refData.caterers ?? [], bookings: bookings.data ?? [], services: serviceDtos, categories };
}

export async function createCateringService(weddingId: string, input: Row) {
  const context = await authorizeWeddingOperation(weddingId, "logistics", "edit");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("catering_meal_services").insert({ ...input, final_count_deadline:localDateTimeToInstant(input.final_count_deadline,context.wedding.timezone), wedding_id: weddingId, created_by_user_id: context.user.id }).select("id").single();
  if (error || !data) fail("Could not create the meal service.");
  const counts = await supabase.from("catering_service_counts").insert(categories.map((category) => ({ wedding_id: weddingId, meal_service_id: data!.id, category })));
  if (counts.error) { await supabase.from("catering_meal_services").delete().eq("wedding_id", weddingId).eq("id", data!.id); fail("Could not initialize meal service counts."); }
}

export async function updateCateringService(weddingId: string, serviceId: string, input: Row) {
  const context = await authorizeWeddingOperation(weddingId, "logistics", "edit");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("catering_meal_services").update({ ...input, final_count_deadline:localDateTimeToInstant(input.final_count_deadline,context.wedding.timezone) }).eq("wedding_id",weddingId).eq("id",serviceId).select("id").maybeSingle();
  if (error || !data) fail("Could not update this meal service. Confirm the linked supplier or booking belongs to this wedding.");
}

export async function saveCateringMenu(weddingId: string, serviceId: string, title: string, notes: string, items: Array<Row>) {
  await authorizeWeddingOperation(weddingId, "logistics", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_catering_draft_menu", { p_wedding_id:weddingId,p_service_id:serviceId,p_title:title,p_notes:notes,p_items:items });
  if (error) fail("Could not save draft menu and its items.");
}

export async function runCateringRpc(weddingId: string, rpc: string, args: Row) {
  await authorizeWeddingOperation(weddingId, "logistics", "edit");
  const allowed = new Set(["approve_catering_guarantee", "approve_catering_menu", "save_catering_category_count", "save_catering_draft_menu", "capture_catering_count_snapshot"]);
  if (!allowed.has(rpc)) fail("Unsupported catering operation.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) fail(error.message.includes("deadline") ? "The final-count deadline has passed. Review the change before capturing a new snapshot." : "Could not save this catering change. Refresh and try again.");
  return data;
}

export async function setCateringCount(weddingId: string, serviceId: string, category: string, values: Row) {
  await runCateringRpc(weddingId,"save_catering_category_count",{p_wedding_id:weddingId,p_service_id:serviceId,p_category:category,p_values:values});
}

export async function setCateringGuestCategory(weddingId: string, serviceId: string, guestId: string, category: "adult" | "child" | null) {
  await authorizeWeddingOperation(weddingId, "logistics", "edit");
  const supabase = await createSupabaseServerClient();
  if (category) {
    const { error } = await supabase.from("catering_guest_assignments").upsert({ wedding_id: weddingId, meal_service_id: serviceId, guest_id: guestId, category }, { onConflict: "wedding_id,meal_service_id,guest_id" });
    if (error) fail("Could not assign this guest. Confirm they are invited to the meal service function.");
  } else {
    const { error } = await supabase.from("catering_guest_assignments").delete().eq("wedding_id", weddingId).eq("meal_service_id", serviceId).eq("guest_id", guestId);
    if (error) fail("Could not remove the meal category assignment.");
  }
}

export async function saveCateringTasting(weddingId: string, values: Row) {
  const context = await authorizeWeddingOperation(weddingId, "logistics", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("catering_tastings").insert({ ...values, appointment_at:localDateTimeToInstant(values.appointment_at,context.wedding.timezone), wedding_id: weddingId, created_by_user_id: context.user.id });
  if (error) fail("Could not save tasting appointment or feedback.");
}
