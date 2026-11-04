import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

export async function updateSupabaseSession(request: NextRequest) {
  const isGuestPortal = request.nextUrl.pathname === "/guest" || request.nextUrl.pathname.startsWith("/guest/") || request.nextUrl.pathname.startsWith("/api/guest-portal/");
  const securePortalHeaders = (response: NextResponse) => {
    if (isGuestPortal) {
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      response.headers.set("Referrer-Policy", "no-referrer");
      response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    }
    return response;
  };
  // Portal access is a separate bearer-session flow; do not refresh or attach
  // a planner's Supabase Auth session to guest-facing requests.
  if (isGuestPortal) return securePortalHeaders(NextResponse.next({ request }));
  const env = getSupabaseEnvironment();
  if (!env) return securePortalHeaders(NextResponse.next({ request }));

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        for (const header of ["cache-control", "expires", "pragma"]) {
          const value = cacheHeaders?.[header as keyof typeof cacheHeaders];
          if (value) response.headers.set(header, value);
        }
      },
    },
  });

  // Refresh/verify the session cookie only. Authorization remains in the DAL and RLS.
  await supabase.auth.getClaims();
  return securePortalHeaders(response);
}
