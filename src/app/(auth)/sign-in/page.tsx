import { AuthForm } from "@/components/auth-form";
import { signInAction } from "@/app/actions/auth";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { linkErrorMessage } from "@/lib/auth/recovery";

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const notice = linkErrorMessage(typeof params.error === "string" ? params.error : undefined);
  return <><p className="auth-eyebrow">Welcome back</p><h1 className="auth-title">Sign in to Wedding Desk</h1><p className="auth-copy">Use your own account. Each partner has a separate sign-in.</p><AuthForm mode="sign-in" action={signInAction} configured={Boolean(getSupabaseEnvironment())} notice={notice} /></>;
}
