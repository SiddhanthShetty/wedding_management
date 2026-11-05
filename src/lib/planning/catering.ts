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
