import "server-only";

import { AuthorizationDeniedError, authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDuplicateSubmission } from "@/lib/data/travel";
import { deskTotals, familyRows, functionHeadcounts, newInviteCode, sortFamilies, withoutLink, type DeskFamily, type DeskInvite, type DeskMessage, type DeskReply } from "@/lib/family-invites/rules";
import type { PastedFamily } from "@/lib/planning/family-paste";

/** A rule the planner can fix (shown as written). */
export class FamilyInviteRuleError extends Error { constructor(message: string) { super(message); this.name = "FamilyInviteRuleError"; } }

const canEditGuests = (context: Awaited<ReturnType<typeof authorizeWeddingOperation>>) =>
  context.membership.role === "owner" || context.membership.role === "co_owner" || context.moduleAccess.guests === "edit";

function check(error: { code?: string; message?: string } | null, message: string) {
  if (!error) return;
  if (error.code === "42501") throw new AuthorizationDeniedError();
  if (error.code === "22023" && error.message) throw new FamilyInviteRuleError(error.message);
  throw new Error(message);
}

async function editor(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "guests", "edit");
  if (!canEditGuests(context)) throw new AuthorizationDeniedError();
  return { context, supabase: await createSupabaseServerClient() };
}

const KINDS = { "family-invite:": "invite", "family-remind:": "remind" } as const;

export async function getInviteDesk(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "guests", "read");
  const supabase = await createSupabaseServerClient();
  const [families, invites, replies, guests, records, functions, wedding] = await Promise.all([
    supabase.from("guest_households").select("id,name,contact_phone,invite_code,invite_max_guests,invite_removed_at,created_at").eq("wedding_id", weddingId).order("name"),
    supabase.from("family_function_invites").select("household_id,function_id").eq("wedding_id", weddingId),
    supabase.from("family_replies").select("household_id,attending,guest_count,function_ids,dietary,dietary_notes,message,reply_name,reply_phone,source,updated_at").eq("wedding_id", weddingId),
    supabase.from("guests").select("id,household_id").eq("wedding_id", weddingId),
    supabase.from("communication_records").select("guest_id,sent_at,dedupe_key").eq("wedding_id", weddingId).like("dedupe_key", "family-%"),
    supabase.rpc("get_guest_function_references", { p_wedding_id: weddingId }),
    supabase.from("weddings").select("partner_one_display_name,partner_two_display_name").eq("id", weddingId).maybeSingle(),
  ]);
  for (const result of [families, invites, replies, guests, records, functions, wedding]) check(result.error, "Could not load the Guest desk.");
  const householdOf = new Map((guests.data ?? []).map((row) => [String(row.id), String(row.household_id)]));
  const messages: DeskMessage[] = (records.data ?? []).flatMap((row) => {
    const prefix = (Object.keys(KINDS) as Array<keyof typeof KINDS>).find((key) => String(row.dedupe_key).startsWith(key));
    const household = householdOf.get(String(row.guest_id));
    return prefix && household ? [{ household_id: household, sent_at: row.sent_at as string | null, kind: KINDS[prefix] }] : [];
  });
  const rows = sortFamilies(familyRows({ families: (families.data ?? []) as DeskFamily[], invites: (invites.data ?? []) as DeskInvite[], replies: (replies.data ?? []) as DeskReply[], messages }));
  const active = ((functions.data ?? []) as Array<{ id: string; name: string; function_date: string | null; status: string; archived_at: string | null }>)
    .filter((fn) => !fn.archived_at && fn.status !== "cancelled")
    .sort((a, b) => (a.function_date ?? "9999").localeCompare(b.function_date ?? "9999"));
  return {
    weddingId,
    canEdit: canEditGuests(context),
    timezone: context.wedding.timezone,
    coupleNames: [wedding.data?.partner_one_display_name, wedding.data?.partner_two_display_name].filter(Boolean).join(" & ") || context.wedding.name,
    familySideLabels: { couple_one: context.wedding.partner_one_display_name.trim() || "Couple one", couple_two: context.wedding.partner_two_display_name.trim() || "Couple two", shared: "Both sides", unknown: "Not sure" },
    functions: active.map((fn) => ({ id: fn.id, name: fn.name, date: fn.function_date })),
    families: rows.filter((row) => !row.removed),
    removed: rows.filter((row) => row.removed),
    totals: deskTotals(rows),
    headcounts: functionHeadcounts(active, rows),
  };
}
export type InviteDesk = Awaited<ReturnType<typeof getInviteDesk>>;

/** Adds every pasted family in one database transaction, each with its own link code. */
export async function addFamilies(weddingId: string, families: PastedFamily[], input: { functionIds: string[]; familySide: string }):
  Promise<{ status: "invalid"; errors: Array<{ index: number; code: string }> } | { status: "saved"; added: number }> {
  const { supabase } = await editor(weddingId);
  const { data, error } = await supabase.rpc("create_family_invites_bulk", {
    p_wedding_id: weddingId,
    p_families: families.map((family) => ({ name: family.name, phone: family.phone, max_guests: family.maxGuests, code: newInviteCode() })),
    p_function_ids: input.functionIds, p_family_side: input.familySide,
  });
  check(error, "Couldn't add these families. Nothing was saved; refresh and try again.");
  const result = data as { status: "invalid"; errors: Array<{ index: number; code: string }> } | { status: "saved"; families: unknown[] };
  return result.status === "invalid" ? result : { status: "saved", added: result.families.length };
}

/** The family's link code: an existing one, or a new one (replacing the old link when asked). */
export async function familyCode(weddingId: string, householdId: string, replace: boolean) {
  const { supabase } = await editor(weddingId);
  const { data, error } = await supabase.rpc("set_family_invite_code", { p_wedding_id: weddingId, p_household_id: householdId, p_code: newInviteCode(), p_replace: replace });
  check(error, "Couldn't make the link. Nothing was changed; refresh and try again.");
  return String(data);
}

export async function updateFamily(weddingId: string, householdId: string, maxGuests: number | null, functionIds: string[]) {
  const { supabase } = await editor(weddingId);
  const { error } = await supabase.rpc("update_family_invite", { p_wedding_id: weddingId, p_household_id: householdId, p_max_guests: maxGuests, p_function_ids: functionIds });
  check(error, "Couldn't save these changes. Nothing was changed; refresh and try again.");
}

export async function setFamilyRemoved(weddingId: string, householdId: string, removed: boolean) {
  const { supabase } = await editor(weddingId);
  const { error } = await supabase.rpc("set_family_removed", { p_wedding_id: weddingId, p_household_id: householdId, p_removed: removed });
  check(error, "Couldn't change this family. Nothing was changed; refresh and try again.");
}

export async function recordFamilyReply(weddingId: string, householdId: string, reply: { attending: boolean; guestCount: number; functionIds: string[]; dietary: string; message: string }) {
  const { supabase } = await editor(weddingId);
  const { data, error } = await supabase.rpc("record_family_reply", { p_wedding_id: weddingId, p_household_id: householdId, p_attending: reply.attending, p_guest_count: reply.guestCount, p_function_ids: reply.functionIds, p_dietary: reply.dietary, p_message: reply.message });
  check(error, "Couldn't save this reply. Nothing was changed; refresh and try again.");
  return data as { status: "saved" | "invalid"; field?: string };
}

/**
 * Records that the planner sent the invitation or a reminder themselves, against the family's
 * contact person (at most one record of each kind a day). The link is never stored.
 */
export async function recordFamilySend(weddingId: string, input: { householdId: string; kind: "invite" | "remind"; message: string; link: string }) {
  const { context, supabase } = await editor(weddingId);
  const { data: people, error: peopleError } = await supabase.from("guests").select("id,full_name").eq("wedding_id", weddingId).eq("household_id", input.householdId).order("created_at").limit(1);
  check(peopleError, "Could not record this.");
  const contact = people?.[0];
  if (!contact) throw new FamilyInviteRuleError("Add a person to this family on the People page first, so the send can be recorded against them.");
  const sentAt = new Date().toISOString();
  const { data, error } = await supabase.from("communication_records").upsert([{
    wedding_id: weddingId, guest_id: contact.id, function_id: null, template_id: null, channel: "whatsapp", subject: input.kind === "invite" ? "Wedding invitation" : "Reminder",
    body_snapshot: withoutLink(input.message, input.link).slice(0, 6000), state: "sent", manual: true, sent_at: sentAt,
    notes: input.kind === "invite" ? "Family invitation" : "Reminder to reply",
    dedupe_key: `family-${input.kind}:${input.householdId}:${sentAt.slice(0, 10)}`, recorded_by_user_id: context.user.id,
  }], { onConflict: "wedding_id,dedupe_key", ignoreDuplicates: true }).select("id");
  if (isDuplicateSubmission(error)) return { recorded: 0 };
  check(error, "Could not record this.");
  return { recorded: data?.length ?? 0 };
}
