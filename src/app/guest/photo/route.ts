import { getGuestPortalPhoto } from "@/lib/guest-portal/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The couple photo for the signed-in guest session only. Private, short-lived browser cache. */
export async function GET() {
  const photo = await getGuestPortalPhoto();
  if (!photo) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  return new Response(new Uint8Array(photo.bytes), { headers: {
    "Content-Type": photo.type, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'", "Referrer-Policy": "no-referrer",
  } });
}
