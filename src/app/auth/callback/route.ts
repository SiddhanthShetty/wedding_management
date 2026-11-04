import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const env = getSupabaseEnvironment();
  const code = request.nextUrl.searchParams.get("code");
  if (!env || !code) return NextResponse.redirect(new URL("/sign-in?error=callback", request.url));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/sign-in?error=callback", request.url));
  return NextResponse.redirect(new URL("/overview", request.url));
}
