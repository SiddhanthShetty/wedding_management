const DEFAULT_LOCALE = "en-IE";
const DEFAULT_TIME_ZONE = "Europe/Dublin";

export function formatDate(value: string | Date, timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    day: "numeric", month: "short", year: "numeric", timeZone,
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date, timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone,
  }).format(new Date(value));
}

export function formatTime(value: string | Date, timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value));
}

export function formatMonth(value: string | Date, timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, { month: "short", timeZone }).format(new Date(value));
}

export function formatDay(value: string | Date, timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, { day: "numeric", timeZone }).format(new Date(value));
}

export function formatCurrency(value: number, currency = "EUR", locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function formatNumber(value: number, locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale).format(value);
}
