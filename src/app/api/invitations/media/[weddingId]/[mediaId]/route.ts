import { readInvitationMedia } from "@/lib/data/invitation-media";
import { isUuid, mediaResponse } from "@/lib/http/media-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Music or a gallery photo for signed-in members with guest-list access (the studio preview). */
export async function GET(_request: Request, { params }: { params: Promise<{ weddingId: string; mediaId: string }> }) {
  const { weddingId, mediaId } = await params;
  if (!isUuid(weddingId) || !isUuid(mediaId)) return mediaResponse(null);
  try { return mediaResponse(await readInvitationMedia(weddingId, mediaId), "private, max-age=600"); } catch { return mediaResponse(null); }
}
