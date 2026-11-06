/** Planning helpers for bulk actions. The database still checks every record individually. */

export type HouseholdMember = { id: string; household_id: string | null; plus_one_for_guest_id: string | null };
export type ExistingInvitation = { guest_id: string; function_id: string; status: string; plus_one_allowed: boolean };

/**
 * Invitation changes that invite every household member (named plus-ones excluded; they follow their
 * primary guest) to each chosen function. Existing active invitations are left exactly as they are.
 */
export function householdInvitationChanges(householdId: string, functionIds: string[], members: HouseholdMember[], existing: ExistingInvitation[]) {
  const people = members.filter((member) => member.household_id === householdId && !member.plus_one_for_guest_id);
  const changes: Array<{ guestId: string; functionId: string; invited: true; plusOneAllowed: boolean }> = [];
  for (const person of people) for (const functionId of [...new Set(functionIds)]) {
    const current = existing.find((row) => row.guest_id === person.id && row.function_id === functionId);
    if (current?.status === "invited") continue;
    changes.push({ guestId: person.id, functionId, invited: true, plusOneAllowed: current?.plus_one_allowed ?? false });
  }
  return changes;
}

/** Fills the chosen rooms in order up to each room's occupancy. People who do not fit are returned separately. */
export function planHouseholdRooms<T extends { id: string }>(people: T[], rooms: Array<{ id: string; capacity: number }>) {
  const placements: Array<{ guest: T; roomId: string }> = [];
  const unplaced: T[] = [];
  let index = 0;
  for (const room of rooms) for (let seat = 0; seat < room.capacity && index < people.length; seat += 1) placements.push({ guest: people[index++]!, roomId: room.id });
  while (index < people.length) unplaced.push(people[index++]!);
  return { placements, unplaced };
}
