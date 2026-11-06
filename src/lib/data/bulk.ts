import "server-only";
import { authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createHouseholdPortalLink, setGuestInvitationsBulk } from "@/lib/data/guests";
import { createStay, TravelRuleError } from "@/lib/data/travel";
import { householdInvitationChanges, planHouseholdRooms } from "@/lib/planning/bulk-rules";
import type { AllocationStatus, PaymentResponsibility } from "@/lib/planning/travel-rules";

/** Invites every member of a household to the chosen functions in one all-or-nothing save. */
export async function inviteHousehold(weddingId: string, householdId: string, functionIds: string[]) {
  await authorizeWeddingOperation(weddingId, "guests", "edit");
  const supabase = await createSupabaseServerClient();
  const [members, invitations] = await Promise.all([
    supabase.from("guests").select("id,household_id,plus_one_for_guest_id").eq("wedding_id", weddingId).eq("household_id", householdId),
    supabase.from("guest_invitations").select("guest_id,function_id,status,plus_one_allowed").eq("wedding_id", weddingId),
  ]);
  if (members.error || invitations.error) throw new Error("Could not load the household.");
  const changes = householdInvitationChanges(householdId, functionIds, members.data ?? [], invitations.data ?? []);
  if (!changes.length) return { invited: 0, people: (members.data ?? []).length };
  await setGuestInvitationsBulk(weddingId, changes);
  return { invited: changes.length, people: new Set(changes.map((change) => change.guestId)).size };
}

/** Places a household's members into the chosen rooms. Each stay is checked by the database; failures are reported per guest. */
export async function allocateHousehold(weddingId: string, input: { householdId: string; roomIds: string[]; checkIn: string; checkOut: string; status: AllocationStatus; payment: PaymentResponsibility }) {
  await authorizeWeddingOperation(weddingId, "logistics", "edit");
  const supabase = await createSupabaseServerClient();
  const [people, rooms] = await Promise.all([
    supabase.rpc("get_travel_guests", { p_wedding_id: weddingId }),
    supabase.from("accommodation_rooms").select("id,room_type_id").eq("wedding_id", weddingId).in("id", input.roomIds),
  ]);
  if (people.error || rooms.error) throw new Error("Could not load the household or rooms.");
  const types = await supabase.from("accommodation_room_types").select("id,standard_occupancy").eq("wedding_id", weddingId).in("id", [...new Set((rooms.data ?? []).map((room) => room.room_type_id))]);
  if (types.error) throw new Error("Could not load room types.");
  const capacityOf = new Map((types.data ?? []).map((type) => [type.id, type.standard_occupancy as number]));
  const households = await supabase.from("guests").select("id,household_id").eq("wedding_id", weddingId).eq("household_id", input.householdId);
  // Logistics members may not read the guest table; fall back to the logistics guest lookup when needed.
  const memberIds = households.error ? [] : (households.data ?? []).map((row) => row.id);
  const members = ((people.data ?? []) as Array<{ guest_id: string; full_name: string }>).filter((row) => memberIds.includes(row.guest_id)).map((row) => ({ id: row.guest_id, name: row.full_name }));
  if (!members.length) throw new TravelRuleError("Nobody in this household could be found. You may need guest-list access to allocate by household.");
  const ordered = input.roomIds.map((id) => (rooms.data ?? []).find((room) => room.id === id)).filter((room): room is { id: string; room_type_id: string } => Boolean(room));
  const plan = planHouseholdRooms(members, ordered.map((room) => ({ id: room.id, capacity: capacityOf.get(room.room_type_id) ?? 1 })));
  const failed: string[] = plan.unplaced.map((person) => `${person.name}: no bed left in the chosen rooms.`);
  let placed = 0;
  for (const placement of plan.placements) {
    try {
      await createStay(weddingId, { guest_id: placement.guest.id, room_id: placement.roomId, check_in_date: input.checkIn, check_out_date: input.checkOut, status: input.status, uses_extra_bed: false, payment_responsibility: input.payment, special_requirements: "", notes: "" });
      placed += 1;
    } catch (error) {
      failed.push(`${placement.guest.name}: ${error instanceof TravelRuleError ? error.message : "could not be placed."}`);
    }
  }
  return { placed, failed };
}

/** Marks tasks completed, each only if it is unchanged since the list was loaded. */
export async function completeTasks(weddingId: string, tasks: Array<{ id: string; version: number }>) {
  await authorizeWeddingOperation(weddingId, "planning", "edit");
  const supabase = await createSupabaseServerClient();
  let done = 0; let conflicts = 0;
  for (const task of tasks) {
    const { data, error } = await supabase.from("tasks").update({ status: "completed" }).eq("wedding_id", weddingId).eq("id", task.id).eq("version", task.version).select("id").maybeSingle();
    if (error) throw new Error("Could not update the tasks.");
    if (data) done += 1; else conflicts += 1;
  }
  return { done, conflicts };
}

/**
 * Creates private links for invited households that have no active link. Tokens are returned once,
 * for the planner to share, and never stored.
 */
export async function createMissingHouseholdLinks(weddingId: string) {
  await authorizeWeddingOperation(weddingId, "guests", "edit");
  const supabase = await createSupabaseServerClient();
  const [households, guests, invitations, links] = await Promise.all([
    supabase.from("guest_households").select("id,name").eq("wedding_id", weddingId).order("name"),
    supabase.from("guests").select("id,household_id").eq("wedding_id", weddingId),
    supabase.from("guest_invitations").select("guest_id").eq("wedding_id", weddingId).eq("status", "invited"),
    supabase.rpc("list_guest_portal_links", { p_wedding_id: weddingId, p_household_id: null }),
  ]);
  if (households.error || guests.error || invitations.error || links.error) throw new Error("Could not load households.");
  const invited = new Set((invitations.data ?? []).map((row) => row.guest_id));
  const invitedHouseholds = new Set((guests.data ?? []).filter((guest) => invited.has(guest.id)).map((guest) => guest.household_id));
  const active = new Set(((links.data ?? []) as Array<{ household_id: string; revoked_at: string | null; expires_at: string }>).filter((link) => !link.revoked_at && new Date(link.expires_at) > new Date()).map((link) => link.household_id));
  const missing = (households.data ?? []).filter((household) => invitedHouseholds.has(household.id) && !active.has(household.id));
  const created: Array<{ householdId: string; name: string; token: string }> = [];
  for (const household of missing.slice(0, 200)) {
    const link = await createHouseholdPortalLink(weddingId, household.id);
    created.push({ householdId: household.id, name: household.name, token: link.token });
  }
  return created;
}
