/**
 * The couple's invitation preview (Guests → Invitation): the same invitation a family's link shows,
 * built from the app's own records, and a list of what's still missing. Pure, so it can be tested
 * against the database function the family links use.
 */
import type { InvitationConfig } from "@/config/invitation";
import type { FamilyInvitation } from "@/lib/family-invites/public";
import type { InviteEvent } from "@/lib/family-invites/rules";

export const SAMPLE_FAMILY = "sample";

/** A function row as stored in Plan → Functions. */
export type FunctionRecord = {
  id: string; name: string; function_type: string; description: string | null; function_date: string | null; start_time: string | null; end_time: string | null;
  venue_name: string | null; guest_map_url: string | null; dress_code: string | null; status: string; archived_at: string | null;
};
export type ReplyRecord = NonNullable<FamilyInvitation["reply"]>;

const active = (fn: FunctionRecord) => !fn.archived_at && fn.status !== "cancelled";
const nullsLast = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1);

/** Functions as the family link shows them: active only, by date, then start time, then name. */
export function inviteEvents(functions: FunctionRecord[]): InviteEvent[] {
  return functions.filter(active)
    .sort((a, b) => nullsLast(a.function_date, b.function_date) || nullsLast(a.start_time, b.start_time) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((fn) => ({ id: fn.id, name: fn.name, type: fn.function_type, description: fn.description ?? "", date: fn.function_date, start_time: fn.start_time, end_time: fn.end_time, venue: fn.venue_name, map_url: fn.guest_map_url, dress_code: fn.dress_code }));
}

/**
 * One family's invitation, or the sample family's (every active function, no limit, no reply).
 * Mirrors `get_family_invitation`, which the family links use.
 */
export function previewInvitation(input: {
  family: { name: string; max_guests: number | null; function_ids: string[] } | typeof SAMPLE_FAMILY;
  functions: FunctionRecord[]; reply: ReplyRecord | null; wedding: { date: string | null; timezone: string };
}): FamilyInvitation {
  if (input.family === SAMPLE_FAMILY) return { family: "Sample family", max_guests: null, wedding: input.wedding, functions: inviteEvents(input.functions), reply: null };
  const invited = new Set(input.family.function_ids);
  return { family: input.family.name, max_guests: input.family.max_guests, wedding: input.wedding, functions: inviteEvents(input.functions.filter((fn) => invited.has(fn.id))), reply: input.reply };
}

export type ChecklistItem = { text: string; href?: string };

/** What's still missing from the invitation, for the couple. Empty when everything is filled in. */
export function invitationChecklist(input: { config: InvitationConfig; functions: FunctionRecord[]; weddingDate: string | null; familiesWithoutLink: number; canSeeFunctions: boolean }): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const { config } = input;
  if (!input.weddingDate) items.push({ text: "No wedding date yet, so the countdown and the date on the cover are hidden.", href: "/settings" });
  for (const [who, lines] of [[config.brideName, config.families.brideGrandparents], [config.groomName, config.families.groomGrandparents]] as const) {
    if (!lines) items.push({ text: `${who}'s grandparents line is empty, so it's left out.` });
  }
  if (!Object.values(config.goodToKnow).some(Boolean)) items.push({ text: "\"Good to know\" is empty (weather, what to wear, a photo hashtag, parking, drivers), so the section is hidden." });
  if (!config.rsvp.respondBy) items.push({ text: "No reply-by date, so families aren't asked to reply by a date." });
  if (input.canSeeFunctions) {
    const events = inviteEvents(input.functions);
    if (!events.length) items.push({ text: "No functions yet, so the invitation has no events.", href: "/functions" });
    for (const event of events) {
      const missing = [!event.date && "date", !event.start_time && "start time", !event.venue && "venue", !event.map_url && "map link"].filter(Boolean);
      if (missing.length) items.push({ text: `${event.name}: no ${missing.join(", ").replace(/, ([^,]*)$/, " or $1")}.`, href: "/functions" });
    }
  }
  if (input.familiesWithoutLink > 0) items.push({ text: `${input.familiesWithoutLink} ${input.familiesWithoutLink === 1 ? "family has" : "families have"} no link yet: tap Make their link on the families list.`, href: "/guests/simple#families" });
  return items;
}
