/** India-first defaults for new weddings, and the time zones and currencies offered in pickers. */
export const APP_LOCALE = "en-IN";
export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const DEFAULT_CURRENCY = "INR";

export const COMMON_TIMEZONES: Array<{ id: string; label: string }> = [
  { id: "Asia/Kolkata", label: "India (IST)" },
  { id: "Asia/Dubai", label: "UAE (Gulf time)" },
  { id: "Asia/Muscat", label: "Oman" },
  { id: "Asia/Qatar", label: "Qatar" },
  { id: "Asia/Singapore", label: "Singapore" },
  { id: "Europe/London", label: "United Kingdom" },
  { id: "Europe/Dublin", label: "Ireland" },
  { id: "America/New_York", label: "US Eastern" },
  { id: "America/Los_Angeles", label: "US Pacific" },
  { id: "America/Toronto", label: "Canada (Toronto)" },
  { id: "Australia/Sydney", label: "Australia (Sydney)" },
];

export const COMMON_CURRENCIES: Array<{ code: string; label: string }> = [
  { code: "INR", label: "₹ Indian rupee" }, { code: "AED", label: "AED UAE dirham" }, { code: "USD", label: "$ US dollar" },
  { code: "GBP", label: "£ British pound" }, { code: "EUR", label: "€ Euro" }, { code: "SGD", label: "S$ Singapore dollar" },
  { code: "AUD", label: "A$ Australian dollar" }, { code: "CAD", label: "C$ Canadian dollar" },
];

/** Every time zone the runtime knows, common ones first; always includes `current`. */
export function timeZoneOptions(current?: string | null): Array<{ id: string; label: string }> {
  const common = new Set(COMMON_TIMEZONES.map((zone) => zone.id));
  let all: string[] = [];
  try { all = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { all = []; }
  const rest = [...new Set([...all, ...(current ? [current] : [])])].filter((zone) => !common.has(zone)).sort().map((id) => ({ id, label: id.replace(/_/g, " ") }));
  return [...COMMON_TIMEZONES, ...rest];
}

export function currencyOptions(current?: string | null) {
  return current && !COMMON_CURRENCIES.some((item) => item.code === current) ? [...COMMON_CURRENCIES, { code: current, label: current }] : COMMON_CURRENCIES;
}

/** "Priya & Arjun's Wedding" from the two names (first names only), or a neutral default. */
export function workspaceNameFor(one: string, two: string) {
  const first = (name: string) => name.trim().split(/\s+/)[0] ?? "";
  const names = [first(one), first(two)].filter(Boolean);
  return names.length ? `${names.join(" & ")}'s Wedding` : "Our wedding";
}
