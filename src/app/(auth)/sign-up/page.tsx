import { AuthForm } from "@/components/auth-form";
import { signUpAction } from "@/app/actions/auth";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

export default function SignUpPage() {
  return <><p className="auth-eyebrow">Your own secure account</p><h1 className="auth-title">Create an account</h1><p className="auth-copy">Create a separate account for each partner. You can join the same wedding workspace after signing up.</p><AuthForm mode="sign-up" action={signUpAction} configured={Boolean(getSupabaseEnvironment())} /></>;
}
