import "server-only";

import { authorizeWeddingOperation, type WorkspaceContext } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  supplierAvailabilityInputSchema, supplierFollowUpTaskSchema, supplierInputSchema,
  supplierPreferenceSchema, supplierQuoteInputSchema, supplierSpaceInputSchema,
  supplierSpaceUpdateSchema, supplierVisitSchema,
} from "@/lib/planning/supplier-inputs";

export type WeddingSupplier = {
  id: string;
  wedding_id: string;
  kind: "venue" | "vendor";
  name: string;
  category: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  website_url: string | null;
  map_url: string | null;
  source: string;
  notes: string;
  responsible_user_id: string | null;
  responsible_name: string | null;
  status: "researching" | "contacted" | "visit_planned" | "shortlisted" | "selected" | "booked" | "rejected" | "archived";
  created_at: string;
  updated_at: string;
  venue: null | {
    room_availability_notes: string;
    catering_notes: string;
    outside_vendor_notes: string;
    parking_notes: string;
    accessibility_notes: string;
    pet_policy: string;
    alcohol_policy: string;
    music_policy: string;
    weather_backup_space: string;
    weather_backup_capacity: number | null;
  };
  spaces: Array<{ id: string; name: string; capacity: number | null; notes: string; archived_at: string | null }>;
  requested_dates: Array<{ id: string; requested_date: string; availability_status: string; checked_at: string | null; hold_expires_on: string | null; notes: string; created_at: string }>;
  quotes: Array<{ id: string; version_number: number; quoted_on: string; currency: string; total_amount: number | null; includes: string; excludes: string; expires_on: string | null; created_at: string; items: Array<{ id: string; kind: string; label: string; amount: number | null; position: number }> }>;
  preferences: Array<{ member_user_id: string; member_name: string; preference: "prefer" | "neutral" | "not_preferred"; note: string }>;
  visits: Array<{ id: string; visit_date: string | null; notes: string; created_by_user_id: string; author_name: string; created_at: string }>;
  follow_ups: Array<{ id: string; title: string; due_date: string | null; status: string }>;
};

export type SupplierAssignee = { userId: string; name: string };

function canReadPlanning(context: WorkspaceContext) {
  return context.membership.role === "owner" || context.membership.role === "co_owner"
    || Boolean(context.moduleAccess.planning);
}

export async function listSupplierAssignees(weddingId: string): Promise<SupplierAssignee[]> {
  await authorizeWeddingOperation(weddingId, "suppliers_finance", "read");
  const supabase = await createSupabaseServerClient();
  const { data: members, error } = await supabase.from("wedding_members")
    .select("user_id, created_at").eq("wedding_id", weddingId).eq("status", "active").order("created_at");
  if (error) throw new Error("Could not load responsible partners.");
  const ids = [...new Set((members ?? []).map((member) => member.user_id))];
  const { data: profiles, error: profileError } = ids.length
    ? await supabase.from("profiles").select("id, display_name").in("id", ids)
    : { data: [], error: null };
  if (profileError) throw new Error("Could not load partner names.");
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name || "Wedding member"]));
  return (members ?? []).map((member) => ({ userId: member.user_id, name: names.get(member.user_id) ?? "Wedding member" }));
}

export async function listWeddingSuppliers(weddingId: string): Promise<{ suppliers: WeddingSupplier[]; canEdit: boolean; canPlan: boolean }> {
  const context = await authorizeWeddingOperation(weddingId, "suppliers_finance", "read");
  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase.from("suppliers")
    .select("id, wedding_id, kind, name, category, contact_person, contact_email, contact_phone, website_url, map_url, source, notes, responsible_user_id, status, created_at, updated_at")
    .eq("wedding_id", context.wedding.id).order("name");
  if (error) throw new Error("Could not load the supplier directory.");
  const suppliers = rows ?? [];
  if (!suppliers.length) return { suppliers: [], canEdit: hasEditAccess(context), canPlan: hasPlanningEdit(context) };

  const ids = suppliers.map((supplier) => supplier.id);
  const userIds = [...new Set(suppliers.map((supplier) => supplier.responsible_user_id).filter((id): id is string => Boolean(id)))];
  const [venueResult, spacesResult, datesResult, quotesResult, preferencesResult, visitsResult, namesResult, tasksResult] = await Promise.all([
    supabase.from("supplier_venue_details").select("supplier_id, room_availability_notes, catering_notes, outside_vendor_notes, parking_notes, accessibility_notes, pet_policy, alcohol_policy, music_policy, weather_backup_space, weather_backup_capacity").eq("wedding_id", weddingId).in("supplier_id", ids),
    supabase.from("supplier_event_spaces").select("id, supplier_id, name, capacity, notes, archived_at").eq("wedding_id", weddingId).in("supplier_id", ids).order("name"),
    supabase.from("supplier_requested_dates").select("id, supplier_id, requested_date, availability_status, checked_at, hold_expires_on, notes, created_at").eq("wedding_id", weddingId).in("supplier_id", ids).order("created_at", { ascending: false }),
    supabase.from("supplier_quotes").select("id, supplier_id, version_number, quoted_on, currency, total_amount, includes, excludes, expires_on, created_at").eq("wedding_id", weddingId).in("supplier_id", ids).order("version_number", { ascending: false }),
    supabase.from("supplier_preferences").select("supplier_id, member_user_id, preference, note").eq("wedding_id", weddingId).in("supplier_id", ids),
    supabase.from("supplier_visits").select("id, supplier_id, visit_date, notes, created_by_user_id, created_at").eq("wedding_id", weddingId).in("supplier_id", ids).order("created_at", { ascending: false }),
    userIds.length ? supabase.from("profiles").select("id, display_name").in("id", userIds) : Promise.resolve({ data: [], error: null }),
    canReadPlanning(context)
      ? supabase.from("tasks").select("id, supplier_id, title, due_date, status").eq("wedding_id", weddingId).in("supplier_id", ids).neq("status", "cancelled").order("due_date", { nullsFirst: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const results = [venueResult, spacesResult, datesResult, quotesResult, preferencesResult, visitsResult, namesResult, tasksResult];
  if (results.some((result) => result.error)) throw new Error("Could not load supplier details.");

  const quoteIds = (quotesResult.data ?? []).map((quote) => quote.id);
  const itemResult = quoteIds.length
    ? await supabase.from("supplier_quote_items").select("id, quote_id, kind, label, amount, position").eq("wedding_id", weddingId).in("quote_id", quoteIds).order("position")
    : { data: [], error: null };
  if (itemResult.error) throw new Error("Could not load quote line items.");
  const identityIds = [...new Set([
    ...userIds,
    ...(preferencesResult.data ?? []).map((row) => row.member_user_id),
    ...(visitsResult.data ?? []).map((visit) => visit.created_by_user_id),
  ])];
  const identitiesResult = identityIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", identityIds)
    : { data: [], error: null };
  if (identitiesResult.error) throw new Error("Could not load supplier authors and partner names.");

  const profileNames = new Map([...(namesResult.data ?? []), ...(identitiesResult.data ?? [])].map((profile) => [profile.id, profile.display_name || "Wedding member"]));
  const venueBySupplier = new Map((venueResult.data ?? []).map((row) => [row.supplier_id, row]));
  const spacesBySupplier = groupBy(spacesResult.data ?? [], "supplier_id");
  const datesBySupplier = groupBy(datesResult.data ?? [], "supplier_id");
  const quotesBySupplier = groupBy(quotesResult.data ?? [], "supplier_id");
  const itemsByQuote = groupBy(itemResult.data ?? [], "quote_id");
  const preferenceBySupplier = groupBy(preferencesResult.data ?? [], "supplier_id");
  const visitsBySupplier = groupBy(visitsResult.data ?? [], "supplier_id");
  const tasksBySupplier = groupBy((tasksResult.data ?? []).filter((task) => Boolean(task.supplier_id)), "supplier_id");

  return {
    canEdit: hasEditAccess(context),
    canPlan: hasPlanningEdit(context),
    suppliers: suppliers.map((supplier) => {
      const venue = venueBySupplier.get(supplier.id);
      return {
        ...supplier,
        responsible_name: supplier.responsible_user_id ? profileNames.get(supplier.responsible_user_id) ?? "Wedding member" : null,
        venue: venue ? {
          room_availability_notes: venue.room_availability_notes,
          catering_notes: venue.catering_notes,
          outside_vendor_notes: venue.outside_vendor_notes,
          parking_notes: venue.parking_notes,
          accessibility_notes: venue.accessibility_notes,
          pet_policy: venue.pet_policy,
          alcohol_policy: venue.alcohol_policy,
          music_policy: venue.music_policy,
          weather_backup_space: venue.weather_backup_space,
          weather_backup_capacity: venue.weather_backup_capacity,
        } : null,
        spaces: spacesBySupplier.get(supplier.id) ?? [],
        requested_dates: datesBySupplier.get(supplier.id) ?? [],
        quotes: (quotesBySupplier.get(supplier.id) ?? []).map((quote) => ({
          ...quote,
          items: (itemsByQuote.get(quote.id) ?? []) as WeddingSupplier["quotes"][number]["items"],
        })) as WeddingSupplier["quotes"],
        preferences: (preferenceBySupplier.get(supplier.id) ?? []).map((preference) => ({
          ...preference,
          member_name: profileNames.get(preference.member_user_id) ?? "Wedding member",
        })) as WeddingSupplier["preferences"],
        visits: (visitsBySupplier.get(supplier.id) ?? []).map((visit) => ({
          ...visit, author_name: profileNames.get(visit.created_by_user_id) ?? "Wedding member",
        })) as WeddingSupplier["visits"],
        follow_ups: (tasksBySupplier.get(supplier.id) ?? []) as WeddingSupplier["follow_ups"],
      } as WeddingSupplier;
    }),
  };
}

function hasEditAccess(context: WorkspaceContext) {
  return context.membership.role === "owner" || context.membership.role === "co_owner" || context.moduleAccess.suppliers_finance === "edit";
}
function hasPlanningEdit(context: WorkspaceContext) {
  return context.membership.role === "owner" || context.membership.role === "co_owner" || context.moduleAccess.planning === "edit";
}

export async function createWeddingSupplier(weddingId: string, input: unknown) {
  const values = supplierInputSchema.parse(input);
  const context = await authorizeWeddingOperation(weddingId, "suppliers_finance", "edit");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_wedding_supplier", {
    p_wedding_id: context.wedding.id, p_supplier_id: null, p_values: values,
  });
  if (error || !data) throw new Error("Could not create this supplier. Check the selected responsible partner.");
  return data as string;
}

export async function updateWeddingSupplier(weddingId: string, supplierId: string, input: unknown) {
  const values = supplierInputSchema.parse(input);
  const context = await authorizeWeddingOperation(weddingId, "suppliers_finance", "edit");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_wedding_supplier", {
    p_wedding_id: context.wedding.id, p_supplier_id: supplierId, p_values: values,
  });
  if (error || !data) throw new Error("Could not update this supplier.");
  return data as string;
}

export async function addSupplierSpace(weddingId: string, input: unknown) {
  const values = supplierSpaceInputSchema.parse(input);
  const context = await authorizeWeddingOperation(weddingId, "suppliers_finance", "edit");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("supplier_event_spaces").insert({
    wedding_id: context.wedding.id, supplier_id: values.supplierId, name: values.name,
    capacity: values.capacity, notes: values.notes,
  }).select("id").single();
  if (error || !data) throw new Error("Could not add that event space.");
  return data.id as string;
}

export async function updateSupplierSpace(weddingId: string, input: unknown, archive = false) {
  const values = supplierSpaceUpdateSchema.parse(input);
  await authorizeWeddingOperation(weddingId, "suppliers_finance", "edit");
  const supabase = await createSupabaseServerClient();
  const update = archive ? { archived_at: new Date().toISOString() } : { name: values.name, capacity: values.capacity, notes: values.notes };
  const { data, error } = await supabase.from("supplier_event_spaces").update(update)
    .eq("wedding_id", weddingId).eq("supplier_id", values.supplierId).eq("id", values.spaceId).select("id").maybeSingle();
  if (error) throw new Error("Could not update that event space.");
  if (!data) throw new Error("Event space not found or access was revoked.");
  return data.id as string;
}

export async function addSupplierAvailability(weddingId: string, input: unknown) {
  const values = supplierAvailabilityInputSchema.parse(input);
  const context = await authorizeWeddingOperation(weddingId, "suppliers_finance", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("supplier_requested_dates").insert({
    wedding_id: context.wedding.id,
    supplier_id: values.supplierId,
    requested_date: values.requestedDate,
    availability_status: values.availabilityStatus,
    checked_at: values.checkedAt,
    hold_expires_on: values.holdExpiresOn,
    notes: values.notes,
    created_by_user_id: context.user.id,
  });
  if (error) throw new Error("Could not save the availability check.");
}

export async function createSupplierQuote(weddingId: string, input: unknown) {
  const values = supplierQuoteInputSchema.parse(input);
  const context = await authorizeWeddingOperation(weddingId, "suppliers_finance", "edit");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_supplier_quote", {
    p_wedding_id: context.wedding.id,
    p_supplier_id: values.supplierId,
    p_quoted_on: values.quotedOn,
    p_currency: values.currency,
    p_total_amount: values.totalAmount,
    p_includes: values.includes,
    p_excludes: values.excludes,
    p_expires_on: values.expiresOn,
    p_items: values.items.map((item) => ({ ...item, amount: item.amount?.toString() ?? null })),
  });
  if (error || !data) throw new Error("Could not save this quote version.");
  return data as string;
}

export async function saveSupplierPreference(weddingId: string, input: unknown) {
  const values = supplierPreferenceSchema.parse(input);
  const context = await authorizeWeddingOperation(weddingId, "suppliers_finance", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("supplier_preferences").upsert({
    wedding_id: context.wedding.id, supplier_id: values.supplierId,
    member_user_id: context.user.id, preference: values.preference, note: values.note,
  }, { onConflict: "wedding_id,supplier_id,member_user_id" });
  if (error) throw new Error("Could not save your supplier preference.");
}

export async function addSupplierVisit(weddingId: string, input: unknown) {
  const values = supplierVisitSchema.parse(input);
  const context = await authorizeWeddingOperation(weddingId, "suppliers_finance", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("supplier_visits").insert({
    wedding_id: context.wedding.id, supplier_id: values.supplierId,
    visit_date: values.visitDate, notes: values.notes, created_by_user_id: context.user.id,
  });
  if (error) throw new Error("Could not save the visit note.");
}

export async function addSupplierFollowUpTask(weddingId: string, input: unknown) {
  const values = supplierFollowUpTaskSchema.parse(input);
  const supplierContext = await authorizeWeddingOperation(weddingId, "suppliers_finance", "edit");
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  const supabase = await createSupabaseServerClient();
  const { data: supplier, error: supplierError } = await supabase.from("suppliers").select("id, name")
    .eq("wedding_id", supplierContext.wedding.id).eq("id", values.supplierId).maybeSingle();
  if (supplierError || !supplier) throw new Error("Supplier not found or access was revoked.");
  const { data, error } = await supabase.from("tasks").insert({
    wedding_id: context.wedding.id,
    supplier_id: supplier.id,
    title: values.title,
    description: values.description,
    owner_user_id: values.ownerUserId,
    due_date: values.dueDate,
    priority: values.priority,
    status: "not_started",
    related_vendor_reference: supplier.name,
    created_by_user_id: context.user.id,
    updated_by_user_id: context.user.id,
  }).select("id").single();
  if (error || !data) throw new Error("Could not create the supplier follow-up task.");
  return data.id as string;
}

function groupBy<T extends Record<string, unknown>>(rows: T[], key: keyof T): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = String(row[key]);
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}
