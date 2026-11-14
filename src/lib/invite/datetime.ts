/** Offset of `timeZone` from UTC, in ms, at the given instant. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant at which a wall clock in `timeZone` reads `date` `time`. */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const first = wall - offsetAt(wall, timeZone);
  // Second pass settles dates that fall next to a daylight-saving change.
  return new Date(wall - offsetAt(first, timeZone));
}

export function formatDate(date: string): { weekday: string; long: string } {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d, 12));
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...o }).format(at);
  return { weekday: fmt({ weekday: "long" }), long: fmt({ day: "numeric", month: "long", year: "numeric" }) };
}

export function formatTime(time: string): string {
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${hh < 12 ? "am" : "pm"}`;
}

export function formatTimeRange(start: string, end: string | null): string {
  return end ? `${formatTime(start)} to ${formatTime(end)}` : `${formatTime(start)} onwards`;
}

export type CountdownParts = { days: number; hours: number; minutes: number; seconds: number; done: boolean };

export function countdownParts(targetMs: number, nowMs: number): CountdownParts {
  const diff = Math.max(0, targetMs - nowMs);
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    done: diff === 0,
  };
}
