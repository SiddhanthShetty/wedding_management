export type FunctionScheduleInput = {
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
};

export type ResolvedFunctionSchedule = {
  functionDate: string | null;
  startTime: string | null;
  endTime: string | null;
  startsAt: string | null;
  endsAt: string | null;
  spansMidnight: boolean;
};

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number };

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function parseDate(value: string): LocalParts {
  const match = datePattern.exec(value);
  if (!match) throw new Error("Enter a valid calendar date.");
  const [, yearText, monthText, dayText] = match;
  const parts = { year: Number(yearText), month: Number(monthText), day: Number(dayText), hour: 0, minute: 0 };
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (check.getUTCFullYear() !== parts.year || check.getUTCMonth() !== parts.month - 1 || check.getUTCDate() !== parts.day) {
    throw new Error("Enter a valid calendar date.");
  }
  return parts;
}

function parseTime(value: string): Pick<LocalParts, "hour" | "minute"> {
  if (!timePattern.test(value)) throw new Error("Enter a valid time in 24-hour format.");
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function zonedParts(instant: number, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute),
  };
}

function sameWallTime(left: LocalParts, right: LocalParts): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day
    && left.hour === right.hour && left.minute === right.minute;
}

function resolveWallTime(parts: LocalParts, timezone: string): Date {
  if (!isValidTimeZone(timezone)) throw new Error("Use a valid IANA planning timezone.");
  const wallEpoch = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const offsets = new Set<number>();

  // Gather the offsets on either side of a possible daylight-saving transition.
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = wallEpoch + hours * 60 * 60 * 1000;
    const local = zonedParts(probe, timezone);
    const localEpoch = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    offsets.add(localEpoch - probe);
  }

  const candidates = [...offsets]
    .map((offset) => wallEpoch - offset)
    .filter((candidate) => sameWallTime(zonedParts(candidate, timezone), parts))
    .sort((left, right) => left - right);

  if (candidates.length === 0) {
    throw new Error("That local time does not exist because of a daylight-saving change. Choose another time.");
  }

  // For the repeated hour at the autumn clock change, use the later (standard-time)
  // occurrence, matching PostgreSQL's AT TIME ZONE behavior.
  return new Date(candidates[candidates.length - 1]);
}

function addLocalDay(parts: LocalParts): LocalParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return { ...parts, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function resolveFunctionSchedule(input: FunctionScheduleInput): ResolvedFunctionSchedule {
  const { date, startTime, endTime, timezone } = input;
  if (!date && !startTime && !endTime) {
    if (!isValidTimeZone(timezone)) throw new Error("Use a valid IANA planning timezone.");
    return { functionDate: null, startTime: null, endTime: null, startsAt: null, endsAt: null, spansMidnight: false };
  }
  if (!date) throw new Error("Choose a function date before entering its times.");
  const base = parseDate(date);
  if (!startTime && !endTime) {
    if (!isValidTimeZone(timezone)) throw new Error("Use a valid IANA planning timezone.");
    return { functionDate: date, startTime: null, endTime: null, startsAt: null, endsAt: null, spansMidnight: false };
  }
  if (!startTime && endTime) throw new Error("Enter a start time before the end time.");

  const start = { ...base, ...parseTime(startTime) };
  const startsAt = resolveWallTime(start, timezone);
  if (!endTime) {
    return {
      functionDate: date, startTime, endTime: null,
      startsAt: startsAt.toISOString(), endsAt: null, spansMidnight: false,
    };
  }
  const parsedEnd = parseTime(endTime);
  if (start.hour === parsedEnd.hour && start.minute === parsedEnd.minute) {
    throw new Error("End time must be later than start time.");
  }
  const spansMidnight = parsedEnd.hour * 60 + parsedEnd.minute < start.hour * 60 + start.minute;
  const end = { ...(spansMidnight ? addLocalDay(base) : base), ...parsedEnd };
  const endsAt = resolveWallTime(end, timezone);
  if (endsAt.getTime() <= startsAt.getTime()) throw new Error("End time must be later than start time.");

  return {
    functionDate: date,
    startTime,
    endTime,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    spansMidnight,
  };
}

export function functionScheduleChanged(
  before: { function_date: string | null; start_time: string | null; end_time: string | null },
  after: ResolvedFunctionSchedule,
): boolean {
  return before.function_date !== after.functionDate
    || before.start_time?.slice(0, 5) !== after.startTime
    || before.end_time?.slice(0, 5) !== after.endTime;
}
