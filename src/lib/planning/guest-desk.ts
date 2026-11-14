/**
 * The guest desk: one row per family, built from the single guest list (households, people,
 * invitations, replies, links and the message log). Kept free of server imports so it can be
 * unit-tested.
 */
import { trackInvites } from "@/lib/invitations/tracking";

export type DeskHousehold = { id: string; name: string; contact_name: string; contact_phone: string; preferred_language: string };
export type DeskGuest = { id: string; household_id: string | null; full_name: string; phone: string; is_placeholder: boolean; created_at: string };
export type DeskInvitation = { id: string; guest_id: string; function_id: string; status: string };
export type DeskReply = { invitation_id: string; response: "yes" | "no" | "maybe" };
export type DeskLink = { guest_id: string | null; household_id: string; active: boolean; created_at: string; expires_at: string; last_opened_at: string | null; proxy_guest_ids: string[] };
export type DeskMessage = { guest_id: string; sent_at: string | null; dedupe_key: string };
export type DeskFunction = { id: string; name: string };

export type ReplyState = "not_yet" | "accepts" | "declines" | "not_invited";
export type FamilyRow = {
  id: string; name: string; phone: string; language: string;
  leadId: string | null; leadName: string; people: number; invitedPeople: number;
  state: ReplyState; coming: number; repliedPeople: number;
  /** The lead's link can still be used, so a reminder can ask them to use it. */
  linkActive: boolean; linkExpiresAt: string | null;
  invitedAt: string | null; remindedAt: string | null; reminders: number; openedAt: string | null;
  /** Withdrawn invitations exist, so "Put back" makes sense. */
  canPutBack: boolean;
  placeholders: number;
};

/** The person the family link belongs to: whoever had the latest link, else the contact, else the first added. */
export function familyLead(household: DeskHousehold, people: DeskGuest[], links: DeskLink[]): DeskGuest | null {
  const ids = new Set(people.map((person) => person.id));
  const latest = links.filter((link) => link.household_id === household.id && link.guest_id && ids.has(link.guest_id)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (latest) return people.find((person) => person.id === latest.guest_id) ?? null;
  return people.find((person) => person.full_name === household.contact_name)
    ?? [...people].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.full_name.localeCompare(b.full_name))[0] ?? null;
}

/** "Accepts, 3 of 4" / "Declines" / "Not yet" / "Not invited". */
export function replyLabel(row: Pick<FamilyRow, "state" | "coming" | "invitedPeople" | "repliedPeople">): string {
  if (row.state === "not_invited") return "Not invited";
  if (row.state === "declines") return "Declines";
  if (row.state === "accepts") return `Accepts, ${row.coming} of ${row.invitedPeople}`;
  return row.repliedPeople ? `Not yet (${row.repliedPeople} of ${row.invitedPeople} replied)` : "Not yet";
}

const latest = (values: Array<string | null>) => values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;

export function familyRows(input: { households: DeskHousehold[]; guests: DeskGuest[]; invitations: DeskInvitation[]; replies: DeskReply[]; links: DeskLink[]; messages: DeskMessage[] }): FamilyRow[] {
  const replyByInvitation = new Map(input.replies.map((reply) => [reply.invitation_id, reply.response]));
  const active = input.invitations.filter((row) => row.status === "invited");
  return input.households.map((household) => {
    const people = input.guests.filter((guest) => guest.household_id === household.id);
    const peopleIds = new Set(people.map((person) => person.id));
    const mine = active.filter((row) => peopleIds.has(row.guest_id));
    const invitedIds = [...new Set(mine.map((row) => row.guest_id))];
    const tracked = trackInvites(invitedIds, new Set(), new Set(), mine, new Set(mine.filter((row) => replyByInvitation.has(row.id)).map((row) => row.id)));
    const coming = invitedIds.filter((id) => mine.some((row) => row.guest_id === id && replyByInvitation.get(row.id) === "yes")).length;
    const state: ReplyState = !invitedIds.length ? "not_invited" : tracked.replied < invitedIds.length ? "not_yet" : coming ? "accepts" : "declines";
    const lead = familyLead(household, people, input.links);
    const leadLinks = input.links.filter((link) => link.guest_id === lead?.id);
    const activeLink = leadLinks.filter((link) => link.active).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const messages = input.messages.filter((message) => peopleIds.has(message.guest_id));
    const reminders = messages.filter((message) => message.dedupe_key.startsWith("remind:"));
    return {
      id: household.id, name: household.name, phone: household.contact_phone || lead?.phone || "", language: household.preferred_language || "en",
      leadId: lead?.id ?? null, leadName: lead?.full_name ?? household.name, people: people.length, invitedPeople: invitedIds.length,
      state, coming, repliedPeople: tracked.replied,
      linkActive: Boolean(activeLink), linkExpiresAt: activeLink?.expires_at ?? null,
      invitedAt: latest(messages.filter((message) => message.dedupe_key.startsWith("invite:")).map((message) => message.sent_at)),
      remindedAt: latest(reminders.map((message) => message.sent_at)), reminders: reminders.length,
      openedAt: latest(input.links.filter((link) => link.household_id === household.id).map((link) => link.last_opened_at)),
      canPutBack: input.invitations.some((row) => row.status === "withdrawn" && peopleIds.has(row.guest_id)),
      placeholders: people.filter((person) => person.is_placeholder).length,
    };
  });
}

/** Not-yet-replied families first, then by name. Families with nobody invited go last. */
export function sortFamilies(rows: FamilyRow[]): FamilyRow[] {
  const rank: Record<ReplyState, number> = { not_yet: 0, accepts: 1, declines: 1, not_invited: 2 };
  return [...rows].sort((a, b) => rank[a.state] - rank[b.state] || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** The three tiles. Families with nobody invited are left out. */
export function deskTotals(rows: FamilyRow[]) {
  const invited = rows.filter((row) => row.state !== "not_invited");
  const replied = invited.filter((row) => row.state === "accepts" || row.state === "declines").length;
  return { invited: invited.length, replied, waiting: invited.length - replied };
}

/** Yes / maybe / no / waiting per function, counting people. */
export function headcounts(functions: DeskFunction[], invitations: DeskInvitation[], replies: DeskReply[]) {
  const replyByInvitation = new Map(replies.map((reply) => [reply.invitation_id, reply.response]));
  return functions.map((fn) => {
    const rows = invitations.filter((row) => row.function_id === fn.id && row.status === "invited");
    const of = (response: DeskReply["response"]) => rows.filter((row) => replyByInvitation.get(row.id) === response).length;
    return { id: fn.id, name: fn.name, yes: of("yes"), maybe: of("maybe"), no: of("no"), waiting: rows.filter((row) => !replyByInvitation.has(row.id)).length };
  });
}

/**
 * Who a new family link may answer for: the people the lead's previous link could answer for, if
 * it answered for anyone; otherwise (no link yet, or one made for the lead alone on the Invitations
 * page) everyone else in the family who is invited.
 */
export function familyProxies(leadId: string, people: DeskGuest[], invitations: DeskInvitation[], links: DeskLink[]): string[] {
  const invited = new Set(invitations.filter((row) => row.status === "invited").map((row) => row.guest_id));
  const others = people.filter((person) => person.id !== leadId && invited.has(person.id)).map((person) => person.id);
  const previous = links.filter((link) => link.guest_id === leadId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const kept = (previous?.proxy_guest_ids ?? []).filter((id) => others.includes(id));
  return kept.length ? kept : others;
}
