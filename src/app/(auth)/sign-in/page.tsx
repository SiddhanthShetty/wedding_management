import { AuthForm } from "@/components/auth-form";
import { signInAction } from "@/app/actions/auth";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

export default function SignInPage() {
  return <><p className="auth-eyebrow">Welcome back</p><h1 className="auth-title">Sign in to Wedding Desk</h1><p className="auth-copy">Use your own account. Each partner has a separate sign-in.</p><AuthForm mode="sign-in" action={signInAction} configured={Boolean(getSupabaseEnvironment())} /></>;
}
