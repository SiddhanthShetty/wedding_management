import "server-only";

import { AuthorizationDeniedError, authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { digestGuestPortalValue, newGuestPortalToken } from "@/lib/guest-portal/crypto";
import { createGuestPortalLink } from "@/lib/data/guests";
import { isDuplicateSubmission } from "@/lib/data/travel";
import { readSite } from "@/lib/invitations/site";
import { isLanguage, messageWithoutLink, type LanguageCode, type TextOverrides } from "@/lib/invitations/content";
import { deskTotals, familyLead, familyProxies, familyRows, headcounts, sortFamilies, type DeskGuest, type DeskHousehold, type DeskInvitation, type DeskLink, type DeskMessage, type DeskReply } from "@/lib/planning/guest-desk";
import type { PastedFamily } from "@/lib/planning/family-paste";

/** A rule the planner can fix (shown as written). */
export class GuestDeskRuleError extends Error { constructor(message: string) { super(message); this.name = "GuestDeskRuleError"; } }

const LINK_DAYS = 30;
const canEditGuests = (context: Awaited<ReturnType<typeof authorizeWeddingOperation>>) =>
  context.membership.role === "owner" || context.membership.role === "co_owner" || context.moduleAccess.guests === "edit";

function check(error: { code?: string } | null, message: string) {
  if (!error) return;
  if (error.code === "42501") throw new AuthorizationDeniedError();
  throw new Error(message);
}

async function load(weddingId: string, householdId?: string) {
  const supabase = await createSupabaseServerClient();
  const [households, guests, invitations, replies, links, invites, reminders] = await Promise.all([
    householdId
      ? supabase.from("guest_households").select("id,name,contact_name,contact_phone,preferred_language").eq("wedding_id", weddingId).eq("id", householdId)
      : supabase.from("guest_households").select("id,name,contact_name,contact_phone,preferred_language").eq("wedding_id", weddingId).order("name"),
    householdId
      ? supabase.from("guests").select("id,household_id,full_name,phone,is_placeholder,created_at").eq("wedding_id", weddingId).eq("household_id", householdId)
      : supabase.from("guests").select("id,household_id,full_name,phone,is_placeholder,created_at").eq("wedding_id", weddingId),
    supabase.from("guest_invitations").select("id,guest_id,function_id,status").eq("wedding_id", weddingId),
    supabase.from("guest_rsvps").select("invitation_id,response").eq("wedding_id", weddingId),
    supabase.rpc("list_guest_portal_links", { p_wedding_id: weddingId, p_household_id: householdId ?? null }),
    supabase.from("communication_records").select("guest_id,sent_at,dedupe_key").eq("wedding_id", weddingId).like("dedupe_key", "invite:%"),
    supabase.from("communication_records").select("guest_id,sent_at,dedupe_key").eq("wedding_id", weddingId).like("dedupe_key", "remind:%"),
  ]);
  for (const result of [households, guests, invitations, replies, links, invites, reminders]) check(result.error, "Could not load the guest desk.");
  return {
    supabase,
    households: (households.data ?? []) as DeskHousehold[],
    guests: (guests.data ?? []) as DeskGuest[],
    invitations: (invitations.data ?? []) as DeskInvitation[],
    replies: (replies.data ?? []) as DeskReply[],
    links: (links.data ?? []) as DeskLink[],
    messages: [...(invites.data ?? []), ...(reminders.data ?? [])] as DeskMessage[],
  };
}

export async function getGuestDesk(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "guests", "read");
  const data = await load(weddingId);
  const [functions, wedding, design] = await Promise.all([
    data.supabase.rpc("get_guest_function_references", { p_wedding_id: weddingId }),
    data.supabase.from("weddings").select("partner_one_display_name,partner_two_display_name").eq("id", weddingId).maybeSingle(),
    data.supabase.from("invitation_designs").select("id,name,texts,site").eq("wedding_id", weddingId).eq("is_default", true).maybeSingle(),
  ]);
  check(functions.error, "Could not load the guest desk."); check(wedding.error, "Could not load the guest desk."); check(design.error, "Could not load the guest desk.");
  const active = ((functions.data ?? []) as Array<{ id: string; name: string; function_date: string | null; status: string; archived_at: string | null }>).filter((fn) => !fn.archived_at && fn.status !== "cancelled");
  const families = sortFamilies(familyRows(data));
  const defaultDesign = design.data as { id: string; name: string; texts: TextOverrides; site: unknown } | null;
  return {
    weddingId,
    canEdit: canEditGuests(context),
    timezone: context.wedding.timezone as string,
    familySideLabels: { couple_one: context.wedding.partner_one_display_name.trim() || "Couple one", couple_two: context.wedding.partner_two_display_name.trim() || "Couple two", shared: "Both sides", unknown: "Not sure" },
    coupleNames: [wedding.data?.partner_one_display_name, wedding.data?.partner_two_display_name].filter(Boolean).join(" & ") || context.wedding.name,
    functions: active.map((fn) => ({ id: fn.id, name: fn.name, date: fn.function_date })),
    design: defaultDesign ? { id: defaultDesign.id, name: defaultDesign.name, texts: defaultDesign.texts, kind: readSite(defaultDesign.site).kind } : null,
    families,
    totals: deskTotals(families),
    headcounts: headcounts(active, data.invitations, data.replies),
  };
}
export type GuestDesk = Awaited<ReturnType<typeof getGuestDesk>>;

export type CreatedFamily = { householdId: string; leadGuestId: string; name: string; phone: string; language: LanguageCode; token: string; people: number };

/**
 * Adds every pasted family in one database transaction. Each family's link token is returned once,
 * for the planner's device to put into the WhatsApp message; only its digest is stored.
 */
export async function addFamilies(weddingId: string, families: PastedFamily[], input: { functionIds: string[]; familySide: string; language: LanguageCode }):
  Promise<{ status: "invalid"; errors: Array<{ index: number; code: string }> } | { status: "saved"; created: CreatedFamily[] }> {
  const context = await authorizeWeddingOperation(weddingId, "guests", "edit");
  if (!canEditGuests(context)) throw new AuthorizationDeniedError();
  const supabase = await createSupabaseServerClient();
  const tokens = families.map(() => newGuestPortalToken());
  const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase.rpc("create_guest_families_bulk", {
    p_wedding_id: weddingId,
    p_families: families.map((family, index) => ({ name: family.name, phone: family.phone, size: family.size, token_digest: digestGuestPortalValue("link", tokens[index]!) })),
    p_function_ids: input.functionIds, p_family_side: input.familySide, p_language: input.language, p_expires_at: expiresAt,
  });
  check(error, "Couldn't add these families. Nothing was saved; refresh and try again.");
  const result = data as { status: "invalid"; errors: Array<{ index: number; code: string }> } | { status: "saved"; families: Array<{ index: number; household_id: string; lead_guest_id: string; people: number }> };
  if (result.status === "invalid") return result;
  return {
    status: "saved",
    created: result.families.map((row) => ({ householdId: row.household_id, leadGuestId: row.lead_guest_id, name: families[row.index]!.name, phone: families[row.index]!.phone, language: input.language, token: tokens[row.index]!, people: row.people })),
  };
}

/**
 * A new family link for the lead person, replacing their earlier one. It answers for the same
 * people as before (or the whole invited family when there was no family link yet).
 */
export async function prepareFamilyLink(weddingId: string, householdId: string) {
  const context = await authorizeWeddingOperation(weddingId, "guests", "edit");
  if (!canEditGuests(context)) throw new AuthorizationDeniedError();
  const data = await load(weddingId, householdId);
  const household = data.households[0];
  if (!household) throw new GuestDeskRuleError("This family is no longer on your list. Refresh the page.");
  const lead = familyLead(household, data.guests, data.links);
  const invited = new Set(data.invitations.filter((row) => row.status === "invited").map((row) => row.guest_id));
  if (!lead || !invited.has(lead.id)) throw new GuestDeskRuleError("Invite this family to a function first, on the Guests page.");
  const link = await createGuestPortalLink(weddingId, lead.id, familyProxies(lead.id, data.guests, data.invitations, data.links));
  return { token: link.token, expiresAt: link.expiresAt, leadGuestId: lead.id, language: (isLanguage(household.preferred_language) ? household.preferred_language : "en") as LanguageCode };
}

/** Records a WhatsApp reminder the planner sent themselves (at most one record per family per day). The link is never stored. */
export async function recordReminder(weddingId: string, input: { guestId: string; message: string; link: string }) {
  const context = await authorizeWeddingOperation(weddingId, "guests", "edit");
  if (!canEditGuests(context)) throw new AuthorizationDeniedError();
  const supabase = await createSupabaseServerClient();
  const { data: guest, error: guestError } = await supabase.from("guests").select("id").eq("wedding_id", weddingId).eq("id", input.guestId).maybeSingle();
  check(guestError, "Could not record the reminder.");
  if (!guest) throw new GuestDeskRuleError("This person is no longer on your list. Refresh the page.");
  const body = (input.link ? messageWithoutLink(input.message, input.link) : input.message).slice(0, 6000);
  if (/#[A-Za-z0-9_-]{43}/.test(body)) throw new GuestDeskRuleError("Remove the private link before saving the message.");
  const sentAt = new Date().toISOString();
  const { data, error } = await supabase.from("communication_records").upsert([{
    wedding_id: weddingId, guest_id: input.guestId, function_id: null, template_id: null, channel: "whatsapp", subject: "Reminder",
    body_snapshot: body, state: "sent", manual: true, sent_at: sentAt, notes: input.link ? "Reminder with a new link" : "Reminder to use their existing link",
    dedupe_key: `remind:${input.guestId}:${sentAt.slice(0, 10)}`, recorded_by_user_id: context.user.id,
  }], { onConflict: "wedding_id,dedupe_key", ignoreDuplicates: true }).select("id");
  if (isDuplicateSubmission(error)) return { recorded: 0 };
  check(error, "Could not record the reminder.");
  return { recorded: data?.length ?? 0 };
}

/** "Remove from list" (false) and "Put back" (true). People, replies and history are kept. */
export async function setFamilyInvited(weddingId: string, householdId: string, invited: boolean) {
  await authorizeWeddingOperation(weddingId, "guests", "edit");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_guest_household_invited", { p_wedding_id: weddingId, p_household_id: householdId, p_invited: invited });
  check(error, invited ? "Couldn't put this family back. Nothing was changed." : "Couldn't remove this family. Nothing was changed.");
  return Number(data ?? 0);
}
