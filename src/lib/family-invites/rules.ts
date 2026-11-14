/**
 * Family invitations, as on the couple's invitation site: one link per family that never changes,
 * one reply per family. Kept free of server imports so it can be unit-tested.
 */
import { z } from "zod";

/** One function a family is invited to, as Plan → Functions has it. */
export type InviteEvent = { id: string; name: string; type: string; description: string; date: string | null; start_time: string | null; end_time: string | null; venue: string | null; map_url: string | null; dress_code: string | null };

// ── Links ────────────────────────────────────────────────────────────────

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const CODE_PATTERN = /^[A-Za-z0-9]{12,32}$/;

/** 12 characters from a 56-letter alphabet, about 70 bits: links can't be guessed. */
export function newInviteCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  let out = "";
  while (out.length < 12) {
    for (const byte of random(16)) {
      // Rejection sampling keeps every character equally likely.
      if (byte < 224 && out.length < 12) out += ALPHABET[byte % 56];
    }
  }
  return out;
}

export const inviteLink = (origin: string, code: string) => `${origin.replace(/\/+$/, "")}/i/${code}`;

// ── Messages (English, as on the invitation site) ─────────────────────────

export function inviteMessage(family: string, link: string, couple: string): string {
  return `Dear ${family},\n\nWith the blessings of our families, we warmly invite you to the wedding of ${couple}.\n\nYour invitation, with the events, directions and a place to reply: ${link}`;
}

export function reminderMessage(family: string, link: string, couple: string): string {
  return `Dear ${family},\n\nA gentle reminder from ${couple}: please let us know if you can join us. It only takes a minute: ${link}`;
}

/** A WhatsApp link with the message ready. It opens that person's chat only for a number starting with +. */
export function whatsappLink(phone: string, message: string): { url: string; hasNumber: boolean } {
  const number = phone.trim().startsWith("+") ? phone.replace(/\D/g, "") : "";
  return { url: `https://wa.me/${number}?text=${encodeURIComponent(message)}`, hasNumber: Boolean(number) };
}

/** The message log never keeps a link: it is replaced by "[invitation link]". */
export const withoutLink = (message: string, link: string) => (link ? message.split(link).join("[invitation link]") : message);

// ── The family's reply ────────────────────────────────────────────────────

export const DIETARY_OPTIONS = [
  { value: "none", label: "No preference" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "non-vegetarian", label: "Non-vegetarian" },
  { value: "jain", label: "Jain" },
  { value: "vegan", label: "Vegan" },
  { value: "other", label: "Other (tell us below)" },
] as const;
export type Dietary = (typeof DIETARY_OPTIONS)[number]["value"];
const DIETARY = DIETARY_OPTIONS.map((option) => option.value) as [Dietary, ...Dietary[]];

// Control characters never reach the database or the CSV export.
const clean = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
const line = (max: number) => z.string().transform(clean).pipe(z.string().max(max));

/**
 * The reply form, checked the same way in the browser and on the server. With functionIds null
 * (the server action) the events are checked by the database, which knows the family's events.
 */
export function replySchema(maxGuests: number | null, functionIds: string[] | null) {
  const max = Math.min(20, maxGuests ?? 20);
  return z.object({
    fullName: z.string().transform(clean).pipe(z.string().min(2, "Please enter your full name.").max(120)),
    phone: z.string().transform(clean).pipe(z.string().regex(/^\+?[0-9][0-9 ()-]{6,19}$/, "Please enter a valid phone number.")),
    attending: z.enum(["accept", "decline"], "Please let us know if you can come."),
    guestCount: z.coerce.number().int().min(0).max(max, `This invitation is for up to ${max} ${max === 1 ? "guest" : "guests"}.`).default(0),
    events: z.array(z.string()).max(50).default([]),
    dietary: z.enum(DIETARY).default("none"),
    dietaryNotes: line(300).default(""),
    message: line(1000).default(""),
  }).superRefine((value, ctx) => {
    if (value.attending !== "accept") return;
    if (value.guestCount < 1) ctx.addIssue({ code: "custom", path: ["guestCount"], message: "Please tell us how many of you are coming." });
    if (!value.events.length) ctx.addIssue({ code: "custom", path: ["events"], message: "Please choose at least one event." });
    if (functionIds && value.events.some((id) => !functionIds.includes(id))) ctx.addIssue({ code: "custom", path: ["events"], message: "Please choose from the events listed." });
  }).transform((value) => {
    const coming = value.attending === "accept";
    return { ...value, attending: coming, guestCount: coming ? value.guestCount : 0, events: coming ? [...new Set(value.events)] : [], dietary: coming ? value.dietary : "none" as Dietary, dietaryNotes: coming ? value.dietaryNotes : "" };
  });
}
export type ReplyFields = "fullName" | "phone" | "attending" | "guestCount" | "events" | "dietary" | "dietaryNotes" | "message";

export function replyErrors(error: z.ZodError): Partial<Record<ReplyFields, string>> {
  const out: Partial<Record<ReplyFields, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as ReplyFields | undefined;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** What the database says when it refuses a field. */
export function databaseFieldMessage(field: string | undefined, maxGuests: number | null): Partial<Record<ReplyFields, string>> {
  if (field === "guestCount") return { guestCount: maxGuests ? `This invitation is for up to ${maxGuests} ${maxGuests === 1 ? "guest" : "guests"}.` : "Please tell us how many of you are coming." };
  if (field === "events") return { events: "Please choose from the events listed." };
  if (field === "fullName") return { fullName: "Please enter your full name." };
  if (field === "phone") return { phone: "Please enter a valid phone number." };
  if (field === "attending") return { attending: "Please let us know if you can come." };
  return {};
}

// ── The Guest desk ───────────────────────────────────────────────────────

export type DeskFamily = {
  id: string; name: string; contact_phone: string; invite_code: string | null; invite_max_guests: number | null; invite_removed_at: string | null; created_at: string;
};
export type DeskReply = { household_id: string; attending: boolean; guest_count: number; function_ids: string[]; dietary: string; dietary_notes: string; message: string; reply_name: string; reply_phone: string; source: string; updated_at: string };
export type DeskInvite = { household_id: string; function_id: string };
export type DeskMessage = { household_id: string; sent_at: string | null; kind: "invite" | "remind" };
export type DeskFunction = { id: string; name: string };

export type FamilyRow = {
  id: string; name: string; phone: string; code: string | null; maxGuests: number | null; removed: boolean;
  functionIds: string[]; reply: DeskReply | null; status: "accepts" | "declines" | "waiting" | "no_events";
  invitedAt: string | null; remindedAt: string | null; reminders: number;
};

export function familyRows(input: { families: DeskFamily[]; invites: DeskInvite[]; replies: DeskReply[]; messages: DeskMessage[] }): FamilyRow[] {
  const replyOf = new Map(input.replies.map((reply) => [reply.household_id, reply]));
  const latest = (values: Array<string | null>) => values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return input.families.map((family) => {
    const functionIds = input.invites.filter((row) => row.household_id === family.id).map((row) => row.function_id);
    const reply = replyOf.get(family.id) ?? null;
    const messages = input.messages.filter((row) => row.household_id === family.id);
    const reminders = messages.filter((row) => row.kind === "remind");
    return {
      id: family.id, name: family.name, phone: family.contact_phone, code: family.invite_code, maxGuests: family.invite_max_guests, removed: Boolean(family.invite_removed_at),
      functionIds, reply,
      status: reply ? (reply.attending ? "accepts" : "declines") : functionIds.length ? "waiting" : "no_events",
      invitedAt: latest(messages.filter((row) => row.kind === "invite").map((row) => row.sent_at)),
      remindedAt: latest(reminders.map((row) => row.sent_at)), reminders: reminders.length,
    };
  });
}

/** "Coming, 4" / "Not coming" / "Not yet" / "No events chosen". */
export function replyLabel(row: Pick<FamilyRow, "status" | "reply">): string {
  if (row.status === "accepts") return `Coming, ${row.reply!.guest_count}`;
  if (row.status === "declines") return "Not coming";
  if (row.status === "no_events") return "No events chosen";
  return "Not yet";
}

/** Families who haven't replied first, then by name. Removed families are listed separately. */
export function sortFamilies(rows: FamilyRow[]): FamilyRow[] {
  const rank = (row: FamilyRow) => (row.status === "waiting" ? 0 : row.status === "no_events" ? 1 : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function deskTotals(rows: FamilyRow[]) {
  const active = rows.filter((row) => !row.removed && row.status !== "no_events");
  const replied = active.filter((row) => row.reply);
  return {
    invited: active.length, replied: replied.length, waiting: active.length - replied.length,
    coming: replied.filter((row) => row.reply!.attending).reduce((total, row) => total + row.reply!.guest_count, 0),
  };
}

/** Per function: people coming, families not coming, families yet to reply. Removed families are left out. */
export function functionHeadcounts(functions: DeskFunction[], rows: FamilyRow[]) {
  const active = rows.filter((row) => !row.removed);
  return functions.map((fn) => {
    const invited = active.filter((row) => row.functionIds.includes(fn.id));
    const coming = invited.filter((row) => row.reply?.attending && row.reply.function_ids.includes(fn.id));
    return {
      id: fn.id, name: fn.name, families: invited.length,
      people: coming.reduce((total, row) => total + row.reply!.guest_count, 0),
      notComing: invited.filter((row) => row.reply && !(row.reply.attending && row.reply.function_ids.includes(fn.id))).length,
      waiting: invited.filter((row) => !row.reply).length,
    };
  });
}

/** Meal counts for the caterer: each family's choice, counted once per person coming. */
export type FamilyMeals = { functionId: string; coming: number; veg: number; nonveg: number; jain: number; vegan: number; other: number; notSaid: number };
export function mealsByFunction(functionIds: string[], replies: Array<Pick<DeskReply, "attending" | "guest_count" | "function_ids" | "dietary">>): FamilyMeals[] {
  return functionIds.map((functionId) => {
    const counts: FamilyMeals = { functionId, coming: 0, veg: 0, nonveg: 0, jain: 0, vegan: 0, other: 0, notSaid: 0 };
    for (const reply of replies) {
      if (!reply.attending || !reply.function_ids.includes(functionId)) continue;
      const n = reply.guest_count;
      counts.coming += n;
      if (reply.dietary === "vegetarian") counts.veg += n;
      else if (reply.dietary === "non-vegetarian") counts.nonveg += n;
      else if (reply.dietary === "jain") counts.jain += n;
      else if (reply.dietary === "vegan") counts.vegan += n;
      else if (reply.dietary === "other") counts.other += n;
      else counts.notSaid += n;
    }
    return counts;
  });
}

/** CSV of families and replies; cells starting with = + - @ are defused for spreadsheets. */
export function repliesCsv(rows: FamilyRow[], functions: DeskFunction[]): string {
  const names = new Map(functions.map((fn) => [fn.id, fn.name]));
  const cell = (value: string | number) => {
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ["Family", "Phone", "Most guests", "Invited to", "Reply", "Coming", "Events", "Food", "Food notes", "Message", "Replied by", "Reply phone", "Replied on"];
  const lines = rows.map((row) => [
    row.name, row.phone, row.maxGuests ?? "", row.functionIds.map((id) => names.get(id) ?? "").join("; "), replyLabel(row), row.reply?.guest_count ?? "",
    (row.reply?.function_ids ?? []).map((id) => names.get(id) ?? "").join("; "), row.reply?.dietary ?? "", row.reply?.dietary_notes ?? "", row.reply?.message ?? "",
    row.reply?.reply_name ?? "", row.reply?.reply_phone ?? "", row.reply?.updated_at?.slice(0, 10) ?? "",
  ].map(cell).join(","));
  return [header.join(","), ...lines].join("\r\n");
}
