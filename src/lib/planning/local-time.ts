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
