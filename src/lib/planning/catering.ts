import { fromMinorUnits, toMinorUnits } from "./money";

export type CateringCategory = "adult" | "child" | "vendor" | "staff";
export type CateringCounts = { invited: number; confirmed: number; manuallyExpected: number | null; guarantee: number | null; buffer: number };

/** Uses only explicitly entered values; null means unknown, never zero. */
export function calculateCateringCount(input: CateringCounts) {
  const expected = input.manuallyExpected ?? input.confirmed;
  const guaranteed = input.guarantee === null ? expected : Math.max(expected, input.guarantee);
  return { expected, guaranteeFloor: guaranteed, finalCount: guaranteed + input.buffer };
}

export function countCateringGuests(rows: Array<{ guestId: string; invited: boolean; response: string | null }>) {
  const invited = new Set(rows.filter((row) => row.invited).map((row) => row.guestId));
  const confirmed = new Set(rows.filter((row) => row.invited && row.response === "yes").map((row) => row.guestId));
  return { invited: invited.size, confirmed: confirmed.size };
}
export function calculatePlateEstimate(portions: number, perPlateRate: string): string {
  if (!Number.isSafeInteger(portions) || portions < 0) throw new Error("Portions must be a non-negative whole number.");
  return fromMinorUnits(toMinorUnits(perPlateRate) * BigInt(portions));
}

export type CateringReviewInput = {
  guests: Array<{ guest_id: string; response: string | null }>;
  assignedGuestIds: Set<string>;
  latestSnapshotConfirmed: number | null;
  finalCountDeadline: string | null;
  hasSnapshot: boolean;
  now?: Date;
};

/**
 * Reasons a meal service needs review. Shared by the catering page and the dashboard so both
 * flag exactly the same services.
 */
export function cateringReviewReasons(input: CateringReviewInput): string[] {
  const now = input.now ?? new Date();
  const confirmed = countCateringGuests(input.guests.map((guest) => ({ guestId: guest.guest_id, invited: true, response: guest.response }))).confirmed;
  const reasons: string[] = [];
  if (input.latestSnapshotConfirmed !== null && input.latestSnapshotConfirmed !== confirmed) reasons.push(`Confirmed guests changed since the last snapshot (${input.latestSnapshotConfirmed} → ${confirmed}).`);
  const unassigned = input.guests.filter((guest) => guest.response === "yes" && !input.assignedGuestIds.has(guest.guest_id)).length;
  if (unassigned) reasons.push(`${unassigned} confirmed guest(s) have no adult or child meal category.`);
  if (input.finalCountDeadline && new Date(input.finalCountDeadline) < now && !input.hasSnapshot) reasons.push("The final-count deadline has passed without a captured count.");
  return reasons;
}
