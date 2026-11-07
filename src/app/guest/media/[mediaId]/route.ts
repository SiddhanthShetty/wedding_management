import { getGuestPortalMedia } from "@/lib/guest-portal/server";
import { isUuid, mediaResponse } from "@/lib/http/media-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Invitation music or a gallery photo, for a valid guest session only. */
export async function GET(_request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  return mediaResponse(isUuid(mediaId) ? await getGuestPortalMedia(mediaId) : null);
}
