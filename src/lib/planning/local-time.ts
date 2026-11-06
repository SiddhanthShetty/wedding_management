import { resolveFunctionSchedule } from "@/lib/planning/schedule";

/**
 * Converts a `datetime-local` value ("2027-06-17T18:00"), entered in the wedding's timezone,
 * to a UTC instant. Throws for impossible local times (for example in a daylight-saving gap).
 */
export function localDateTimeToInstant(value: string | null | undefined, timezone: string): string | null {
  if (!value) return null;
  const [date, time] = value.split("T");
  const resolved = resolveFunctionSchedule({ date: date ?? "", startTime: (time ?? "").slice(0, 5), endTime: "", timezone });
  if (!resolved.startsAt) throw new Error("Enter a valid local date and time.");
  return resolved.startsAt;
}

/** Formats an instant as a `datetime-local` value in the wedding's timezone (for form defaults). */
export function instantToLocalInput(value: string | null | undefined, timezone: string): string {
  if (!value) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Calendar date (YYYY-MM-DD) of an instant in the wedding's timezone. */
export function instantToLocalDate(value: string | Date, timezone: string): string {
  return instantToLocalInput(typeof value === "string" ? value : value.toISOString(), timezone).slice(0, 10);
}

/** Adds minutes to a `datetime-local` value as wall-clock time (for form defaults only). */
export function addMinutesToLocal(value: string, minutes: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return "";
  const date = new Date(Date.UTC(+match[1]!, +match[2]! - 1, +match[3]!, +match[4]!, +match[5]! + minutes));
  return date.toISOString().slice(0, 16);
}

/**
 * Default start for a new run-sheet item: right after the function's last item, otherwise the
 * function's own start, otherwise 09:00 on its date. Empty when nothing is known.
 */
export function defaultScheduleStart(input: { lastItemEnd: string | null; functionStart: string | null; functionDate: string | null; timezone: string }): string {
  if (input.lastItemEnd) return instantToLocalInput(input.lastItemEnd, input.timezone);
  if (input.functionStart) return instantToLocalInput(input.functionStart, input.timezone);
  return input.functionDate ? `${input.functionDate}T09:00` : "";
}
