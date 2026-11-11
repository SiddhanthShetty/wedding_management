import Link from "next/link";
import { NewPasswordForm } from "@/components/auth-form";
import { updatePasswordAction } from "@/app/actions/auth";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Reached from the reset email: the link has already signed you in for this one step. */
export default async function ResetPasswordPage() {
  let signedIn = false;
  if (getSupabaseEnvironment()) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  }
  if (!signedIn) return <><p className="auth-eyebrow">Reset password</p><h1 className="auth-title">This link has expired</h1><p className="auth-copy">Reset links work once, for a short time, in the browser where you asked for them.</p><Link className="button button-primary auth-wide" href="/forgot-password">Send a new link</Link></>;
  return <><p className="auth-eyebrow">Reset password</p><h1 className="auth-title">Choose a new password</h1><p className="auth-copy">You&apos;ll stay signed in afterwards.</p><NewPasswordForm action={updatePasswordAction} /></>;
}
