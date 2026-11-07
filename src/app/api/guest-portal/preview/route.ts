import { NextRequest, NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import { consumePortalRateLimit, getInvitationPreview, listPreviewMedia, PREVIEW_COOKIE } from "@/lib/guest-portal/server";
import { buildPreviewData } from "@/lib/invitations/preview";
import { PORTAL_STRINGS } from "@/lib/guest-portal/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };
const unavailable = (status = 404) => NextResponse.json({ ok: false }, { status, headers });

/** Returns the guest page for a family preview link. The token comes in the body, never the URL. */
export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request.headers)) return unavailable();
    if (!(await consumePortalRateLimit("read", request.headers))) return unavailable(429);
    if (Number(request.headers.get("content-length") ?? 0) > 1024) return unavailable();
    const body = JSON.parse(await request.text());
    const token = typeof body?.token === "string" ? body.token : "";
    const preview = await getInvitationPreview(token);
    if (!preview) return unavailable();
    const data = buildPreviewData({
      coupleNames: preview.couple_names, guestName: PORTAL_STRINGS.en.previewGuest, language: "en", expiresAt: preview.expires_at, functions: preview.functions,
      design: { theme: preview.design.theme, accent: preview.design.accent, texts: preview.design.texts, site: preview.design.site, show_monogram: preview.design.show_monogram, photo_url: preview.design.photo_data },
    });
    const media = await listPreviewMedia(token);
    if (media) data.media = { base: "/guest/preview/media/", ...media };
    const response = NextResponse.json({ ok: true, data }, { headers });
    // The page loads music and photos with plain <img>/<audio> requests, so the token rides in a cookie.
    response.cookies.set(PREVIEW_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/guest/preview", expires: new Date(preview.expires_at) });
    return response;
  } catch {
    return unavailable();
  }
}
