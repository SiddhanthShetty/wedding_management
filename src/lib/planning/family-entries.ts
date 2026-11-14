/**
 * Adding families on the Guest desk: one row per family, with a name, a phone number (optional)
 * and the most guests they may bring (optional). The same checks run in the browser and on the
 * server. Kept free of server imports so it can be unit-tested.
 */

export const MAX_FAMILIES_AT_ONCE = 50;
export const MAX_GUESTS_PER_FAMILY = 20;
export const MAX_FAMILY_NAME = 120;

export type FamilyEntry = { name: string; phone: string; guests: string };
export type EntryField = keyof FamilyEntry;
/** One problem with one box: row is the row's position (0-based) in the form. */
export type EntryError = { row: number; field: EntryField; message: string };
/** A checked family, ready to save. maxGuests is null when no number was given. */
export type CheckedFamily = { row: number; name: string; phone: string; maxGuests: number | null };

export const emptyEntry = (): FamilyEntry => ({ name: "", phone: "", guests: "" });
const isBlank = (entry: FamilyEntry) => !entry.name.trim() && !entry.phone.trim() && !entry.guests.trim();

/** Same comparison as the database: ignoring case, surrounding spaces and repeated spaces. */
export const familyNameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase();

/**
 * Tidies a phone number. A bare 10-digit Indian mobile (starting 6–9), or one written with +91 or
 * 0091 already, becomes "+91 98765 43210" so WhatsApp can open that chat. Other numbers need a + and
 * their country code; they are kept as typed.
 */
export function tidyPhone(raw: string): string {
  const typed = raw.trim().replace(/\s+/g, " ");
  if (!typed) return "";
  const compact = typed.replace(/[\s().-]/g, "");
  const indian = /^(?:\+91|0091|91)?([6-9]\d{9})$/.exec(compact);
  if (indian) return `+91 ${indian[1]!.slice(0, 5)} ${indian[1]!.slice(5)}`;
  if (/^00\d{8,15}$/.test(compact)) return `+${compact.slice(2)}`;
  return typed;
}

/** A problem with a phone number, in plain words, or null when it's fine (or empty). */
export function phoneProblem(phone: string): string | null {
  if (!phone) return null;
  if (/[^0-9+\s().-]/.test(phone)) return "Use digits only, for example 98765 43210.";
  const digits = phone.replace(/\D/g, "");
  if (!phone.startsWith("+")) return "Enter a 10-digit mobile number, or + and the country code for numbers outside India.";
  if (digits.length < 8 || digits.length > 15 || !/^\+[0-9][0-9 ()-]{6,19}$/.test(phone)) return "That number doesn't look right. Check the digits and the country code.";
  return null;
}

function nameProblem(name: string): string | null {
  if (!name) return "Enter the family's name, for example “Rao family”.";
  if (name.length < 2) return "Use at least 2 letters.";
  if (name.length > MAX_FAMILY_NAME) return `Keep the name under ${MAX_FAMILY_NAME} characters.`;
  if (!/\p{L}/u.test(name)) return "The name needs letters, not just numbers or symbols.";
  if (/[\u0000-\u001F\u007F<>]/.test(name)) return "Leave out < and > and special characters.";
  return null;
}

function guestsProblem(guests: string): string | null {
  if (!guests) return null;
  if (!/^\d+$/.test(guests)) return "Enter a whole number, like 4.";
  const n = Number(guests);
  if (n < 1 || n > MAX_GUESTS_PER_FAMILY) return `Enter a number from 1 to ${MAX_GUESTS_PER_FAMILY}.`;
  return null;
}

/**
 * Checks every row. Empty rows are ignored. Any problem means nothing is added; every problem is
 * reported against its own box so the form can show it there.
 */
export function checkFamilyEntries(entries: FamilyEntry[]): { families: CheckedFamily[]; errors: EntryError[] } {
  const families: CheckedFamily[] = [];
  const errors: EntryError[] = [];
  const seen = new Map<string, number>();
  entries.forEach((entry, row) => {
    if (isBlank(entry)) return;
    const name = entry.name.trim().replace(/\s+/g, " ");
    const phone = tidyPhone(entry.phone);
    const guests = entry.guests.trim();
    const found: EntryError[] = [];
    const nameIssue = nameProblem(name);
    if (nameIssue) found.push({ row, field: "name", message: nameIssue });
    const phoneIssue = phoneProblem(phone);
    if (phoneIssue) found.push({ row, field: "phone", message: phoneIssue });
    const guestsIssue = guestsProblem(guests);
    if (guestsIssue) found.push({ row, field: "guests", message: guestsIssue });
    if (!nameIssue) {
      const earlier = seen.get(familyNameKey(name));
      if (earlier !== undefined) found.push({ row, field: "name", message: `This family is already in row ${earlier + 1}.` });
      else seen.set(familyNameKey(name), row);
    }
    if (found.length) { errors.push(...found); return; }
    families.push({ row, name, phone, maxGuests: guests ? Number(guests) : null });
  });
  if (!families.length && !errors.length) errors.push({ row: 0, field: "name", message: "Enter at least one family." });
  if (entries.filter((entry) => !isBlank(entry)).length > MAX_FAMILIES_AT_ONCE) errors.push({ row: MAX_FAMILIES_AT_ONCE, field: "name", message: `Add up to ${MAX_FAMILIES_AT_ONCE} families at a time.` });
  return { families, errors };
}

/** Message shown on the name box when the database refuses a family, by its code. */
export function databaseProblem(code: string): string {
  if (code === "exists") return "A family with this name is already on your list. Use a different name, or edit the existing family.";
  if (code === "repeat") return "This family is already in an earlier row.";
  return "This family couldn't be added.";
}
