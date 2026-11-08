/**
 * The usual functions of a South Indian / Mangalorean wedding, with typical times, for one-tap setup.
 * Days are relative to the wedding day; everything stays editable afterwards.
 */
export type StarterFunction = { key: string; name: string; functionType: string; dayOffset: number | null; startTime: string; picked: boolean };

export const STARTER_FUNCTIONS: StarterFunction[] = [
  { key: "engagement", name: "Nischitartha (engagement)", functionType: "Engagement", dayOffset: null, startTime: "", picked: false },
  { key: "haldi", name: "Haldi", functionType: "Haldi", dayOffset: -1, startTime: "09:00", picked: true },
  { key: "mehendi", name: "Mehendi", functionType: "Mehendi", dayOffset: -1, startTime: "16:00", picked: true },
  { key: "sangeet", name: "Sangeet", functionType: "Sangeet", dayOffset: -1, startTime: "19:00", picked: true },
  { key: "muhurtham", name: "Muhurtham", functionType: "Wedding", dayOffset: 0, startTime: "10:30", picked: true },
  { key: "reception", name: "Reception", functionType: "Reception", dayOffset: 0, startTime: "19:00", picked: true },
  { key: "grihapravesha", name: "Grihapravesha", functionType: "Grihapravesha", dayOffset: 1, startTime: "11:00", picked: false },
];

/** Suggestions for the function type field; any other type can still be typed. */
export const FUNCTION_TYPES = ["Engagement", "Haldi", "Mehendi", "Sangeet", "Wedding", "Reception", "Grihapravesha", "Pooja", "Bachelor party", "Welcome dinner", "Other"];

/** YYYY-MM-DD `offset` days from `date` (calendar arithmetic, no time zone involved). */
export function shiftDate(date: string, offset: number) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

/** The picked starter functions with their dates (blank when the wedding date or offset is unknown). */
export function starterFunctionInputs(picked: string[], weddingDate: string | null) {
  return STARTER_FUNCTIONS.filter((item) => picked.includes(item.key)).map((item) => ({
    name: item.name, functionType: item.functionType,
    functionDate: weddingDate && item.dayOffset !== null ? shiftDate(weddingDate, item.dayOffset) : "",
    startTime: weddingDate && item.dayOffset !== null ? item.startTime : "",
    endTime: "", venueName: "", guestMapUrl: "", status: "tentative" as const,
    expectedAttendance: "", budgetAllocation: "", coordinatorName: "", dressCode: "", notes: "",
  }));
}
