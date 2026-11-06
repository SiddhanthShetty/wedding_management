/**
 * The guest's combined itinerary: functions, confirmed stays and shared rides for the whole
 * household, in time order, plus calendar files. Pure and client-safe.
 */
import { resolveFunctionSchedule } from "@/lib/planning/schedule";

type PortalFunctionLike = { id: string; name: string; date: string | null; start_time: string | null; end_time: string | null; timezone: string; location: string | null; map_url: string | null; dress_code: string | null; status: string };
type PersonLike = {
  full_name: string;
  invitations: Array<{ function: PortalFunctionLike }>;
  stays?: Array<{ property: string; address: string; room_type: string; check_in_date: string; check_out_date: string; check_in_time: string | null; check_out_time: string | null }>;
  journeys?: Array<{ kind: string; title: string; pickup_at: string; pickup_location: string; dropoff_location: string; timezone: string }>;
};

export type ItineraryEntry =
  | { type: "function"; key: string; sortKey: string; date: string | null; fn: PortalFunctionLike; people: string[] }
  | { type: "stay"; key: string; sortKey: string; date: string; stay: NonNullable<PersonLike["stays"]>[number]; people: string[] }
  | { type: "ride"; key: string; sortKey: string; date: string; ride: NonNullable<PersonLike["journeys"]>[number]; people: string[] };

const localDate = (instant: string, timezone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));

/** One entry per function / stay / ride, listing which household members it applies to. Undated functions sort last. */
export function buildItinerary(people: PersonLike[]): ItineraryEntry[] {
  const entries = new Map<string, ItineraryEntry>();
  const add = (entry: ItineraryEntry, person: string) => {
    const existing = entries.get(entry.key);
    if (existing) { if (!existing.people.includes(person)) existing.people.push(person); return; }
    entries.set(entry.key, { ...entry, people: [person] } as ItineraryEntry);
  };
  for (const person of people) {
    for (const invitation of person.invitations) {
      const fn = invitation.function;
      add({ type: "function", key: `f:${fn.id}`, sortKey: `${fn.date ?? "9999-12-31"}T${fn.start_time ?? "99:99"}`, date: fn.date, fn, people: [] }, person.full_name);
    }
    for (const stay of person.stays ?? []) add({ type: "stay", key: `s:${stay.property}:${stay.check_in_date}:${stay.check_out_date}`, sortKey: `${stay.check_in_date}T${stay.check_in_time ?? "12:00"}`, date: stay.check_in_date, stay, people: [] }, person.full_name);
    for (const ride of person.journeys ?? []) {
      const date = localDate(ride.pickup_at, ride.timezone);
      add({ type: "ride", key: `r:${ride.pickup_at}:${ride.pickup_location}`, sortKey: `${date}T${new Intl.DateTimeFormat("en-GB", { timeZone: ride.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ride.pickup_at))}`, date, ride, people: [] }, person.full_name);
    }
  }
  return [...entries.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

const icsText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (match) => `\\${match}`);
const icsStamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * A calendar file for one function. Timed events are written in UTC; date-only functions become
 * all-day events. Returns null when the function has no date yet.
 */
export function functionIcs(fn: PortalFunctionLike, now = new Date()): string | null {
  if (!fn.date) return null;
  let start: string; let end: string;
  try {
    const schedule = resolveFunctionSchedule({ date: fn.date, startTime: fn.start_time?.slice(0, 5) ?? "", endTime: fn.end_time?.slice(0, 5) ?? "", timezone: fn.timezone });
    if (schedule.startsAt) {
      start = `DTSTART:${icsStamp(schedule.startsAt)}`;
      end = `DTEND:${icsStamp(schedule.endsAt ?? new Date(new Date(schedule.startsAt).getTime() + 3 * 3_600_000).toISOString())}`;
    } else {
      const next = new Date(`${fn.date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
      start = `DTSTART;VALUE=DATE:${fn.date.replace(/-/g, "")}`; end = `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`;
    }
  } catch { return null; }
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wedding Desk//Invitation//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${fn.id}@wedding-desk`, `DTSTAMP:${icsStamp(now.toISOString())}`, start, end, `SUMMARY:${icsText(fn.name)}`,
    fn.location ? `LOCATION:${icsText(fn.location)}` : "",
    `DESCRIPTION:${icsText([fn.dress_code ? `Dress code: ${fn.dress_code}` : "", fn.status === "tentative" ? "Timing to be confirmed." : "", fn.map_url ?? ""].filter(Boolean).join("\n"))}`,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n") + "\r\n";
}

/** A maps search link when the hosts did not give one. Only the venue text is sent, nothing about the guest. */
export function mapLink(fn: Pick<PortalFunctionLike, "map_url" | "location">): string | null {
  if (fn.map_url) return fn.map_url;
  return fn.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fn.location)}` : null;
}
