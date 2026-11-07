import { getPreviewMedia } from "@/lib/guest-portal/server";
import { isUuid, mediaResponse } from "@/lib/http/media-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Music or a gallery photo for an open family preview (token kept in an httpOnly cookie). */
export async function GET(_request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  return mediaResponse(isUuid(mediaId) ? await getPreviewMedia(mediaId) : null, "private, max-age=600");
}
