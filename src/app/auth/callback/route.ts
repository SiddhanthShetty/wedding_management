import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { safeNextPath } from "@/lib/auth/recovery";

/** Email links (sign-up confirmation, password reset) land here with a one-time code. */
export async function GET(request: NextRequest) {
  const env = getSupabaseEnvironment();
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const failed = new URL(next === "/reset-password" ? "/forgot-password?error=link" : "/sign-in?error=callback", request.url);
  if (!env || !code) return NextResponse.redirect(failed);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(failed);
  return NextResponse.redirect(new URL(next, request.url));
}
