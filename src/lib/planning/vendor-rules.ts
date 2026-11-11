/**
 * Small rules for the vendor cards: Indian wedding categories, call and WhatsApp links,
 * the latest quote, and whether a booked vendor still needs a budget entry.
 */

/** Suggestions for the category box. Any other category can still be typed. */
export const VENDOR_CATEGORIES = [
  "Venue / hall", "Caterer", "Decorator", "Photographer", "Videographer", "Pandit / purohit", "Mehendi artist",
  "Makeup artist", "Nadaswaram / band", "DJ / sound", "Florist", "Invitations / printing", "Jewellery",
  "Clothing / tailor", "Transport", "Return gifts", "Hotel / rooms", "Cake / sweets",
] as const;

/** Digits only, keeping a leading +. Returns null when there aren't enough digits to call. */
function cleanPhone(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function callLink(phone: string): string | null {
  const clean = cleanPhone(phone);
  return clean ? `tel:${clean}` : null;
}

/**
 * A wa.me link. A 10-digit number (or one starting 0 then 10 digits) is treated as Indian (+91);
 * numbers written with + or 00 keep their own country code. Opening it only starts a chat; nothing is sent.
 */
export function whatsAppLink(phone: string, defaultCountryCode = "91"): string | null {
  const clean = cleanPhone(phone);
  if (!clean) return null;
  let digits = clean.replace(/^\+/, "");
  if (!clean.startsWith("+")) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith("0")) digits = defaultCountryCode + digits.slice(1);
    else if (digits.length === 10) digits = defaultCountryCode + digits;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
}

type QuoteLike = { version_number: number; total_amount: number | null; currency: string };

/** The newest quote that has a total, or null. */
export function latestQuoteTotal(quotes: QuoteLike[]): { amount: number; currency: string } | null {
  const withTotal = quotes.filter((quote) => quote.total_amount !== null).sort((a, b) => b.version_number - a.version_number);
  return withTotal[0] ? { amount: withTotal[0].total_amount as number, currency: withTotal[0].currency } : null;
}

/** Marked booked (or selected), but nothing in the budget points at this vendor yet. */
export function needsBudgetEntry(supplier: { id: string; status: string }, suppliersInBudget: ReadonlySet<string>): boolean {
  return (supplier.status === "booked" || supplier.status === "selected") && !suppliersInBudget.has(supplier.id);
}
