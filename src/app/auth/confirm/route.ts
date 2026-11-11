import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { emailLinkType, safeNextPath } from "@/lib/auth/recovery";

/**
 * Email links that carry a token hash instead of a code. Unlike /auth/callback, these work
 * when the link is opened on a different phone or browser from the one that asked for it.
 * Used only if the Supabase email templates are switched to this address (docs/deploy-vercel.md).
 */
export async function GET(request: NextRequest) {
  const env = getSupabaseEnvironment();
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = emailLinkType(request.nextUrl.searchParams.get("type"));
  const next = safeNextPath(request.nextUrl.searchParams.get("next") ?? (type === "recovery" ? "/reset-password" : null));
  const failed = new URL(type === "recovery" ? "/forgot-password?error=link" : "/sign-in?error=link", request.url);
  if (!env || !tokenHash || !type) return NextResponse.redirect(failed);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return NextResponse.redirect(failed);
  return NextResponse.redirect(new URL(next, request.url));
}
