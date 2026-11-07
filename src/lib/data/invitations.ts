import "server-only";
import type { InvitationSite } from "@/lib/invitations/site";
import { AuthorizationDeniedError, authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { digestGuestPortalValue, newGuestPortalToken } from "@/lib/guest-portal/crypto";
import { createGuestPortalLink } from "@/lib/data/guests";
import { isDuplicateSubmission } from "@/lib/data/travel";
import { isLanguage, TEXT_KEYS, unknownInvitationPlaceholders, type LanguageCode, type TextOverrides, type ThemeId } from "@/lib/invitations/content";

export class InvitationRuleError extends Error { constructor(message: string) { super(message); this.name = "InvitationRuleError"; } }
export class InvitationConflictError extends Error { constructor() { super("This design was changed by someone else. Refresh and review it before saving again."); this.name = "InvitationConflictError"; } }

function check(error: { code?: string; message: string } | null, fallback: string) {
  if (!error) return;
  if (error.code === "42501") throw new AuthorizationDeniedError();
  if (error.code === "23505") throw new InvitationRuleError("A design with that name already exists.");
  throw new Error(fallback);
}

export async function getInvitationWorkspace(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "guests", "read");
  const supabase = await createSupabaseServerClient();
  const results = await Promise.all([
    supabase.from("invitation_designs").select("id,name,theme,accent,texts,site,photo_data,show_monogram,is_default,version,updated_at").eq("wedding_id", weddingId).order("created_at"),
    supabase.from("guest_households").select("id,name,contact_name,contact_email,contact_phone,preferred_language").eq("wedding_id", weddingId).order("name"),
    supabase.from("guests").select("id,household_id,full_name,email,phone").eq("wedding_id", weddingId).order("full_name"),
    supabase.from("guest_invitations").select("guest_id,function_id,status").eq("wedding_id", weddingId).eq("status", "invited"),
    supabase.rpc("get_guest_function_references", { p_wedding_id: weddingId }),
    supabase.from("weddings").select("partner_one_display_name,partner_two_display_name").eq("id", weddingId).maybeSingle(),
    supabase.from("communication_records").select("guest_id,channel,state,sent_at,dedupe_key").eq("wedding_id", weddingId).like("dedupe_key", "invite:%"),
    supabase.from("guest_blessings").select("id,guest_id,message,status,created_at,approved_at").eq("wedding_id", weddingId).order("created_at", { ascending: false }).limit(300),
    supabase.rpc("list_guest_portal_links", { p_wedding_id: weddingId, p_household_id: null }),
  ]);
  for (const result of results) if (result.error) throw new Error("Could not load invitations.");
  const [designs, households, guests, invitations, functions, wedding, records, blessings, links] = results;
  return {
    wedding: context.wedding,
    canEdit: context.membership.role === "owner" || context.membership.role === "co_owner" || context.moduleAccess.guests === "edit",
    coupleNames: [wedding.data?.partner_one_display_name, wedding.data?.partner_two_display_name].filter(Boolean).join(" & ") || context.wedding.name,
    couplePartners: [wedding.data?.partner_one_display_name, wedding.data?.partner_two_display_name].filter(Boolean) as string[],
    designs: (designs.data ?? []) as Array<{ id: string; name: string; theme: ThemeId; accent: string | null; texts: TextOverrides; site: unknown; photo_data: string | null; show_monogram: boolean; is_default: boolean; version: number; updated_at: string }>,
    households: (households.data ?? []) as Array<{ id: string; name: string; contact_name: string; contact_email: string; contact_phone: string; preferred_language: LanguageCode }>,
    guests: (guests.data ?? []) as Array<{ id: string; household_id: string | null; full_name: string; email: string; phone: string }>,
    invitations: (invitations.data ?? []) as Array<{ guest_id: string; function_id: string }>,
    functions: ((functions.data ?? []) as Array<{ id: string; name: string; function_date: string | null; start_time: string | null; venue_name: string | null; status: string; archived_at: string | null }>).filter((fn) => !fn.archived_at && fn.status !== "cancelled"),
    sent: (records.data ?? []) as Array<{ guest_id: string; channel: string; state: string; sent_at: string | null; dedupe_key: string }>,
    linkActivity: linkActivity((links.data ?? []) as Array<{ guest_id: string | null; active: boolean; last_opened_at: string | null }>),
    blessings: (blessings.data ?? []) as Array<{ id: string; guest_id: string; message: string; status: "pending" | "approved" | "hidden"; created_at: string; approved_at: string | null }>,
  };
}
export type InvitationWorkspace = Awaited<ReturnType<typeof getInvitationWorkspace>>;

/** Per guest: whether they have an active link and when they last opened any of their links. */
export function linkActivity(links: Array<{ guest_id: string | null; active: boolean; last_opened_at: string | null }>) {
  const byGuest: Record<string, { active: boolean; lastOpenedAt: string | null }> = {};
  for (const link of links) {
    if (!link.guest_id) continue;
    const current = byGuest[link.guest_id] ?? { active: false, lastOpenedAt: null };
    current.active ||= link.active;
    if (link.last_opened_at && (!current.lastOpenedAt || link.last_opened_at > current.lastOpenedAt)) current.lastOpenedAt = link.last_opened_at;
    byGuest[link.guest_id] = current;
  }
  return byGuest;
}

/** Keeps only known languages and text keys, trims values, and rejects unknown placeholders. */
export function cleanTextOverrides(input: unknown): TextOverrides {
  const result: TextOverrides = {};
  if (!input || typeof input !== "object") return result;
  for (const [language, values] of Object.entries(input as Record<string, unknown>)) {
    if (!isLanguage(language) || !values || typeof values !== "object") continue;
    const cleaned: Record<string, string> = {};
    for (const key of TEXT_KEYS) {
      const value = (values as Record<string, unknown>)[key];
      if (typeof value !== "string" || !value.trim()) continue;
      if (value.length > 600) throw new InvitationRuleError("Keep each line of wording under 600 characters.");
      const unknown = unknownInvitationPlaceholders(value);
      if (unknown.length) throw new InvitationRuleError(`Unknown placeholder ${unknown.map((name) => `{{${name}}}`).join(", ")}. Use {{name}}, {{couple}} or {{link}}.`);
      cleaned[key] = value.trim();
    }
    if (Object.keys(cleaned).length) result[language] = cleaned;
  }
  return result;
}

async function editor(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "guests", "edit");
  return { context, supabase: await createSupabaseServerClient() };
}

export async function saveDesign(weddingId: string, designId: string | null, expectedVersion: number | null, input: { name: string; theme: ThemeId; accent: string | null; texts: TextOverrides; show_monogram: boolean; site?: InvitationSite }) {
  const { context, supabase } = await editor(weddingId);
  if (!designId) {
    const existing = await supabase.from("invitation_designs").select("id").eq("wedding_id", weddingId).limit(1);
    check(existing.error, "Could not save the design.");
    const { data, error } = await supabase.from("invitation_designs").insert({ ...input, wedding_id: weddingId, created_by_user_id: context.user.id, updated_by_user_id: context.user.id }).select("id").single();
    check(error, "Could not save the design.");
    // The first design becomes the one guests see, so the portal is never left without a design by accident.
    if (!existing.data?.length) await setDefaultDesign(weddingId, data!.id);
    return data!.id as string;
  }
  const { data, error } = await supabase.from("invitation_designs").update(input).eq("wedding_id", weddingId).eq("id", designId).eq("version", expectedVersion ?? -1).select("id").maybeSingle();
  check(error, "Could not save the design.");
  if (!data) throw new InvitationConflictError();
  return designId;
}

export async function setDefaultDesign(weddingId: string, designId: string) {
  const { supabase } = await editor(weddingId);
  const { error } = await supabase.rpc("set_default_invitation_design", { p_wedding_id: weddingId, p_design_id: designId });
  check(error, "Could not choose this design.");
}

export async function setHouseholdLanguage(weddingId: string, householdId: string, language: LanguageCode) {
  const { supabase } = await editor(weddingId);
  const { error } = await supabase.rpc("set_household_language", { p_wedding_id: weddingId, p_household_id: householdId, p_language: language });
  check(error, "Could not save the language.");
}

/**
 * Issues a fresh private link for one household (replacing any earlier link) and returns the token
 * once, so the planner's device can put it into the message. The token is never stored.
 */
export async function prepareGuestInvitation(weddingId: string, guestId: string) {
  const workspace = await getInvitationWorkspace(weddingId);
  if (!workspace.canEdit) throw new AuthorizationDeniedError();
  const guest = workspace.guests.find((row) => row.id === guestId);
  if (!guest) throw new InvitationRuleError("Guest not found.");
  if (!workspace.invitations.some((row) => row.guest_id === guestId)) throw new InvitationRuleError("Invite this guest to a function first.");
  const link = await createGuestPortalLink(weddingId, guestId);
  return { token: link.token, expiresAt: link.expiresAt };
}

/** Records that the planner shared this individual's invitation themselves. It does not claim delivery. */
export async function recordInvitationShared(weddingId: string, input: { guestId: string; designId: string; channel: "whatsapp" | "email" | "other"; message: string }) {
  const { context, supabase } = await editor(weddingId);
  const workspace = await getInvitationWorkspace(weddingId);
  const design = workspace.designs.find((row) => row.id === input.designId);
  if (!design) throw new InvitationRuleError("Choose a saved design.");
  const guest = workspace.guests.find((row) => row.id === input.guestId);
  if (!guest || !workspace.invitations.some((row) => row.guest_id === input.guestId)) throw new InvitationRuleError("This guest is not invited to a function.");
  if (/#[A-Za-z0-9_-]{43}/.test(input.message)) throw new InvitationRuleError("Remove the private link before saving the message.");
  const sentAt = new Date().toISOString();
  const rows = [{
    wedding_id: weddingId, guest_id: guest.id, function_id: null, template_id: null, channel: input.channel, subject: "Wedding invitation",
    body_snapshot: input.message.slice(0, 6000), state: "sent", manual: true, sent_at: sentAt, notes: `Design “${design.name}” v${design.version}`,
    dedupe_key: `invite:${design.id}:${design.version}:${input.channel}:${guest.id}`, recorded_by_user_id: context.user.id,
  }];
  const { data, error } = await supabase.from("communication_records").upsert(rows, { onConflict: "wedding_id,dedupe_key", ignoreDuplicates: true }).select("id");
  if (isDuplicateSubmission(error)) return { recorded: 0 };
  check(error, "Could not record the invitation.");
  return { recorded: data?.length ?? 0 };
}

/** Saves the invitation website content of one design, if nobody changed the design meanwhile. */
/**
 * A 30-minute preview link to one design, for family to look at before invitations go out.
 * Only the digest is stored; the token is returned once, to be put after # in the link.
 */
export async function createPreviewLink(weddingId: string, designId: string) {
  const { supabase } = await editor(weddingId);
  const token = newGuestPortalToken();
  const { data, error } = await supabase.rpc("create_invitation_preview_link", { p_wedding_id: weddingId, p_design_id: designId, p_token_digest: digestGuestPortalValue("preview", token) });
  if (error?.code === "23514" || error?.code === "P0002") throw new InvitationRuleError(error.message);
  check(error, "Could not create the preview link.");
  return { token, expiresAt: String(data) };
}

/** Approves or hides a guest's blessing. Hidden blessings are never shown to guests. */
export async function moderateBlessing(weddingId: string, blessingId: string, status: "approved" | "hidden") {
  const { supabase } = await editor(weddingId);
  const { data, error } = await supabase.from("guest_blessings").update({ status, approved_at: status === "approved" ? new Date().toISOString() : null }).eq("wedding_id", weddingId).eq("id", blessingId).select("id").maybeSingle();
  check(error, "Could not update the blessing.");
  if (!data) throw new AuthorizationDeniedError();
}

/** Sets or removes the couple photo of a design. The image was already checked by the action. */
export async function saveDesignPhoto(weddingId: string, designId: string, expectedVersion: number, photoData: string | null) {
  const { supabase } = await editor(weddingId);
  const { data, error } = await supabase.from("invitation_designs").update({ photo_data: photoData }).eq("wedding_id", weddingId).eq("id", designId).eq("version", expectedVersion).select("id").maybeSingle();
  check(error, "Could not save the photo.");
  if (!data) throw new InvitationConflictError();
}
