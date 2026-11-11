/**
 * Moving every dated function together, keeping the gaps between them.
 * Pure date arithmetic on YYYY-MM-DD strings: times of day and time zones are untouched.
 */
import { shiftDate } from "@/lib/planning/starter-functions";

export type MovableFunction = { id: string; name: string; function_date: string | null; archived_at?: string | null };
export type FunctionMove = { id: string; name: string; from: string; to: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(date: string) {
  return Math.round(Date.parse(`${date}T12:00:00Z`) / 86_400_000);
}

/** The earliest date among functions that are not archived, or null when none has a date. */
export function earliestFunctionDate(functions: MovableFunction[]): string | null {
  const dates = functions.filter((item) => !item.archived_at && item.function_date).map((item) => item.function_date as string).sort();
  return dates[0] ?? null;
}

/** The same calendar day a year later (29 Feb becomes 28 Feb). */
export function sameDayNextYear(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year + 1, month - 1, 1));
  const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Moves so the earliest function lands on `newFirstDate` and the others keep their spacing.
 * Archived functions and functions without a date stay as they are.
 */
export function planFunctionMove(functions: MovableFunction[], newFirstDate: string): { days: number; moves: FunctionMove[] } {
  if (!ISO_DATE.test(newFirstDate) || Number.isNaN(Date.parse(`${newFirstDate}T12:00:00Z`))) throw new Error("Choose a valid date.");
  const first = earliestFunctionDate(functions);
  if (!first) return { days: 0, moves: [] };
  const days = dayNumber(newFirstDate) - dayNumber(first);
  if (days === 0) return { days, moves: [] };
  const moves = functions
    .filter((item) => !item.archived_at && item.function_date)
    .map((item) => ({ id: item.id, name: item.name, from: item.function_date as string, to: shiftDate(item.function_date as string, days) }))
    .sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
  return { days, moves };
}

/** For example "365 days later" or "2 days earlier". */
export function moveSummary(days: number): string {
  const count = Math.abs(days);
  return `${count} day${count === 1 ? "" : "s"} ${days > 0 ? "later" : "earlier"}`;
}
