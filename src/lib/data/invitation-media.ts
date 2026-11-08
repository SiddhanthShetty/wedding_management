import "server-only";
import { authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkMedia, MAX_GALLERY_PHOTOS, type MediaKind } from "@/lib/invitations/media";
import { InvitationRuleError } from "@/lib/data/invitations";

export type MediaRow = { id: string; design_id: string; kind: MediaKind; position: number; mime: string; byte_size: number; caption: string; created_at: string };

/** Music and gallery photos of a design. Bytes are checked again here, whatever the browser sent. */
export async function uploadInvitationMedia(input: { weddingId: string; designId: string; kind: MediaKind; caption: string; bytes: Uint8Array }) {
  const context = await authorizeWeddingOperation(input.weddingId, "guests", "edit");
  const checked = checkMedia(input.kind, input.bytes);
  if ("error" in checked) throw new InvitationRuleError(checked.error);
  const supabase = await createSupabaseServerClient();
  const design = await supabase.from("invitation_designs").select("id").eq("wedding_id", input.weddingId).eq("id", input.designId).maybeSingle();
  if (design.error || !design.data) throw new InvitationRuleError("Save the design first, then add music or photos.");
  let position = 0;
  if (input.kind === "gallery") {
    const existing = await supabase.from("invitation_media").select("position").eq("wedding_id", input.weddingId).eq("design_id", input.designId).eq("kind", "gallery");
    if (existing.error) throw new Error("Could not add the photo.");
    const taken = new Set((existing.data ?? []).map((row) => row.position as number));
    position = Array.from({ length: MAX_GALLERY_PHOTOS }, (_, index) => index).find((index) => !taken.has(index)) ?? -1;
    if (position < 0) throw new InvitationRuleError(`The gallery holds up to ${MAX_GALLERY_PHOTOS} photos. Remove one first.`);
  } else {
    // One music file and one artwork per design: a new one replaces the old.
    const removed = await supabase.from("invitation_media").delete().eq("wedding_id", input.weddingId).eq("design_id", input.designId).eq("kind", input.kind);
    if (removed.error) throw new Error("Could not replace the file.");
  }
  const { data, error } = await supabase.from("invitation_media").insert({
    wedding_id: input.weddingId, design_id: input.designId, kind: input.kind, position, mime: checked.mime,
    data: Buffer.from(input.bytes).toString("base64"), byte_size: input.bytes.length, caption: input.caption.trim().slice(0, 80), created_by_user_id: context.user.id,
  }).select("id").single();
  if (error?.code === "23505") throw new InvitationRuleError("Another photo was added at the same time. Refresh and try again.");
  if (error || !data) throw new Error("Could not save the file.");
  return data.id as string;
}

export async function deleteInvitationMedia(weddingId: string, mediaId: string) {
  await authorizeWeddingOperation(weddingId, "guests", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("invitation_media").delete().eq("wedding_id", weddingId).eq("id", mediaId);
  if (error) throw new Error("Could not remove the file.");
}

export async function captionInvitationMedia(weddingId: string, mediaId: string, caption: string) {
  await authorizeWeddingOperation(weddingId, "guests", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("invitation_media").update({ caption: caption.trim().slice(0, 80) }).eq("wedding_id", weddingId).eq("id", mediaId);
  if (error) throw new Error("Could not save the caption.");
}

/** File bytes for signed-in members with guest-list read access (the studio preview). */
export async function readInvitationMedia(weddingId: string, mediaId: string): Promise<{ mime: string; bytes: Buffer } | null> {
  await authorizeWeddingOperation(weddingId, "guests", "read");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("invitation_media").select("mime,data").eq("wedding_id", weddingId).eq("id", mediaId).maybeSingle();
  if (error || !data) return null;
  return { mime: data.mime as string, bytes: Buffer.from(data.data as string, "base64") };
}
