import "server-only";

import { authorizeWeddingOperation, AuthorizationDeniedError } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { draftConfig, loadInvitationEditor } from "@/lib/data/invitation-settings";
import { invitationChecklist, previewInvitation, SAMPLE_FAMILY, type FunctionRecord, type ReplyRecord } from "@/lib/family-invites/preview";

export type PreviewFamily = { id: string; name: string; code: string | null; linkOff: boolean };

/**
 * Everything the Invitation tab needs: the families to choose from, the chosen family's invitation
 * (or the sample family's), and what's still missing. Reads with the member's own access (guest
 * list read; the events need Plan read, which the couple always has). Nothing is written.
 */
export async function getInvitationPreview(weddingId: string, familyId: string | null) {
  const context = await authorizeWeddingOperation(weddingId, "guests", "read");
  const supabase = await createSupabaseServerClient();
  const [families, invites, functions, replies, editor] = await Promise.all([
    supabase.from("guest_households").select("id,name,invite_code,invite_max_guests,invite_removed_at").eq("wedding_id", weddingId).order("name"),
    supabase.from("family_function_invites").select("household_id,function_id").eq("wedding_id", weddingId),
    supabase.from("functions").select("id,name,function_type,description,function_date,start_time,end_time,venue_name,guest_map_url,dress_code,status,archived_at").eq("wedding_id", weddingId),
    supabase.from("family_replies").select("household_id,attending,guest_count,function_ids,dietary,dietary_notes,message,updated_at").eq("wedding_id", weddingId),
    loadInvitationEditor(supabase, weddingId, context.membership.role),
  ]);
  // The preview shows the draft wording; family links show the published one.
  const config = draftConfig(editor);
  for (const result of [families, invites, functions, replies]) {
    if (result.error?.code === "42501") throw new AuthorizationDeniedError();
    if (result.error) throw new Error("Could not load the invitation preview.");
  }
  const isOwner = context.membership.role === "owner" || context.membership.role === "co_owner";
  const canSeeFunctions = isOwner || Boolean(context.moduleAccess.planning);
  const list: PreviewFamily[] = (families.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name), code: (row.invite_code as string | null) ?? null, linkOff: Boolean(row.invite_removed_at) }));
  const chosen = familyId && familyId !== SAMPLE_FAMILY ? (families.data ?? []).find((row) => row.id === familyId) : undefined;
  const wedding = { date: context.wedding.wedding_date, timezone: context.wedding.timezone };
  const records = (functions.data ?? []) as FunctionRecord[];
  const reply = chosen ? (replies.data ?? []).find((row) => row.household_id === chosen.id) : undefined;
  const invitation = previewInvitation({
    family: chosen ? { name: String(chosen.name), max_guests: (chosen.invite_max_guests as number | null) ?? null, function_ids: (invites.data ?? []).filter((row) => row.household_id === chosen.id).map((row) => String(row.function_id)) } : SAMPLE_FAMILY,
    functions: records,
    // Who replied and their phone are never shown on the invitation, so they aren't read here.
    reply: reply ? { ...(reply as unknown as Omit<ReplyRecord, "name" | "phone">), name: "", phone: "" } : null,
    wedding,
  });
  return {
    families: list,
    selected: chosen ? String(chosen.id) : SAMPLE_FAMILY,
    invitation,
    canSeeFunctions,
    editor,
    config,
    checklist: invitationChecklist({ config, functions: records, weddingDate: wedding.date, familiesWithoutLink: list.filter((family) => !family.code && !family.linkOff).length, canSeeFunctions }),
  };
}
export type InvitationPreview = Awaited<ReturnType<typeof getInvitationPreview>>;
