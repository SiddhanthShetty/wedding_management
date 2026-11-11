import { AuthForm } from "@/components/auth-form";
import { signUpAction } from "@/app/actions/auth";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

export default function SignUpPage() {
  return <><p className="auth-eyebrow">Your own secure account</p><h1 className="auth-title">Create an account</h1><p className="auth-copy">Each partner creates their own account, then you share the same wedding.</p><AuthForm mode="sign-up" action={signUpAction} configured={Boolean(getSupabaseEnvironment())} /></>;
}
