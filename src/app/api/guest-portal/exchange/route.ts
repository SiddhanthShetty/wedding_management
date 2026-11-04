import { NextRequest, NextResponse } from "next/server";
import { consumePortalRateLimit, exchangeGuestPortalToken, GUEST_PORTAL_COOKIE } from "@/lib/guest-portal/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
const unavailable = () => NextResponse.json({ ok: false, message: "This invitation link is not available. Please contact your hosts for help." }, { status: 404, headers });

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    if (!origin || new URL(origin).origin !== request.nextUrl.origin) return unavailable();
    if (!(await consumePortalRateLimit("exchange", request.headers))) return NextResponse.json({ ok: false, message: "This invitation link is not available. Please contact your hosts for help." }, { status: 429, headers });
    if (Number(request.headers.get("content-length") ?? 0) > 1024) return unavailable();
    const body = JSON.parse(await request.text());
    const token = typeof body?.token === "string" ? body.token : "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return unavailable();
    const session = await exchangeGuestPortalToken(token);
    if (!session) return unavailable();
    const response = NextResponse.json({ ok: true }, { headers });
    response.cookies.set(GUEST_PORTAL_COOKIE, session.sessionToken, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/guest",
      expires: new Date(session.expiresAt),
    });
    return response;
  } catch {
    return unavailable();
  }
}
