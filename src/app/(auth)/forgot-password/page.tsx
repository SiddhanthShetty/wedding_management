import { ForgotPasswordForm } from "@/components/auth-form";
import { requestPasswordResetAction } from "@/app/actions/auth";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { linkErrorMessage } from "@/lib/auth/recovery";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const notice = linkErrorMessage(typeof params.error === "string" ? params.error : undefined);
  return <><p className="auth-eyebrow">Forgot password</p><h1 className="auth-title">Reset your password</h1><p className="auth-copy">Enter the email you signed up with and we&apos;ll send you a link to choose a new password.</p><ForgotPasswordForm action={requestPasswordResetAction} configured={Boolean(getSupabaseEnvironment())} notice={notice} /></>;
}
