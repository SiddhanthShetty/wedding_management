/**
 * The guest desk's paste box: one family per line, `name, phone (optional), number of guests (optional)`.
 * Kept free of server imports so it can be unit-tested.
 */

export const MAX_FAMILIES_PER_PASTE = 100;
export const MAX_GUESTS_PER_FAMILY = 20;
export const MAX_FAMILY_NAME = 120;

export type PastedFamily = { line: number; name: string; phone: string; size: number };
export type PasteProblem = { line: number; name: string; message: string };

/** Same comparison as the database: ignoring case, surrounding spaces and repeated spaces. */
export const familyNameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase();

/**
 * Tidies a phone number. A bare 10-digit Indian mobile (starting 6–9) gets "+91" so WhatsApp can
 * open that chat, and a leading 00 becomes +. Anything else is kept as typed.
 */
export function tidyPhone(raw: string): string {
  const typed = raw.trim().replace(/\s+/g, " ");
  if (!typed) return "";
  const compact = typed.replace(/[\s().-]/g, "");
  if (compact.startsWith("00") && /^00\d{8,15}$/.test(compact)) return `+${compact.slice(2)}`;
  if (/^[6-9]\d{9}$/.test(compact)) return `+91 ${compact.slice(0, 5)} ${compact.slice(5)}`;
  return typed;
}

const PHONE = /^\+?[0-9][0-9 ()-]{6,24}$/;

function label(line: number, name: string) { return name ? `Line ${line} (${name})` : `Line ${line}`; }

/** Message shown for a line the database refused, by its code. */
export function databaseProblem(code: string): string {
  if (code === "exists") return "a family with this name is already on your list. Give this one a different name, or edit the existing family.";
  if (code === "repeat") return "this family is already on an earlier line.";
  return "couldn't be added.";
}

export function problemText(problem: PasteProblem) { return `${label(problem.line, problem.name)}: ${problem.message}`; }

/** Reads the paste box. Any problem means nothing is added; every problem is listed with its line. */
export function parseFamilyLines(text: string): { families: PastedFamily[]; problems: PasteProblem[] } {
  const families: PastedFamily[] = [];
  const problems: PasteProblem[] = [];
  const seen = new Map<string, number>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;
    const parts = raw.split(",").map((part) => part.trim());
    const name = (parts[0] ?? "").replace(/\s+/g, " ");
    if (parts.length > 3) { problems.push({ line, name, message: "use at most two commas (name, phone, number of guests). Leave commas out of the name." }); return; }
    const [, phoneRaw = "", sizeRaw = ""] = parts;
    if (!name) { problems.push({ line, name, message: "add the family's name first, for example “Rao family”." }); return; }
    if (name.length > MAX_FAMILY_NAME) { problems.push({ line, name: `${name.slice(0, 30)}…`, message: `keep the name under ${MAX_FAMILY_NAME} characters.` }); return; }
    let size = 1;
    if (sizeRaw) {
      const n = Number(sizeRaw);
      if (!/^\d+$/.test(sizeRaw) || !Number.isInteger(n) || n < 1 || n > MAX_GUESTS_PER_FAMILY) { problems.push({ line, name, message: `number of guests should be 1 to ${MAX_GUESTS_PER_FAMILY}.` }); return; }
      size = n;
    }
    // "Rao family, 4" is a common shortcut: a short number in the phone place is the number of guests.
    let phoneText = phoneRaw;
    if (!sizeRaw && /^\d{1,2}$/.test(phoneRaw)) {
      const n = Number(phoneRaw);
      if (n < 1 || n > MAX_GUESTS_PER_FAMILY) { problems.push({ line, name, message: `number of guests should be 1 to ${MAX_GUESTS_PER_FAMILY}.` }); return; }
      size = n; phoneText = "";
    }
    const phone = tidyPhone(phoneText);
    if (phone && !PHONE.test(phone)) { problems.push({ line, name, message: "that phone number doesn't look right. Use digits, starting with + and the country code, for example +91 98765 43210." }); return; }
    const key = familyNameKey(name);
    const earlier = seen.get(key);
    if (earlier) { problems.push({ line, name, message: `this family is already on line ${earlier}.` }); return; }
    seen.set(key, line);
    families.push({ line, name, phone, size });
  });
  if (!families.length && !problems.length) problems.push({ line: 1, name: "", message: "paste at least one family, one per line." });
  if (families.length > MAX_FAMILIES_PER_PASTE) problems.push({ line: families[MAX_FAMILIES_PER_PASTE]!.line, name: "", message: `add up to ${MAX_FAMILIES_PER_PASTE} families at a time. Split the rest into another paste.` });
  return { families, problems };
}
