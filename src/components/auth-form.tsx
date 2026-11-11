"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import type { AuthFormState } from "@/app/actions/auth";
import { Button } from "@/components/ui";
import { PASSWORD_HINT, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/recovery";

type AuthAction = (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;

function NotConfigured() {
  return <p className="auth-alert" role="status">Supabase is not configured. Copy local values from <code>npx supabase status</code> into <code>.env.local</code>, then restart Next.js.</p>;
}

/** Shown in place of a form once an email has gone out. */
function CheckEmail({ email, reason }: { email: string; reason: "sign-up" | "reset" }) {
  return <div className="auth-check-email" role="status">
    <MailCheck size={28} aria-hidden="true" />
    <h2>Check your email</h2>
    <p>{reason === "sign-up"
      ? <>We sent a link to <strong>{email}</strong>. Open it to confirm your email, then sign in.</>
      : <>If <strong>{email}</strong> has an account, we&apos;ve sent it a link to choose a new password.</>}</p>
    <p className="auth-small">Open the link on this phone or computer, in this browser. It can take a minute to arrive, so check your spam folder too.</p>
    <p className="auth-switch"><Link href="/sign-in">Back to sign in</Link></p>
  </div>;
}

export function AuthForm({ mode, action, configured, notice }: { mode: "sign-in" | "sign-up"; action: AuthAction; configured: boolean; notice?: string | null }) {
  const [state, formAction, pending] = useActionState(action, {});
  const signingUp = mode === "sign-up";
  if (signingUp && state.sentTo) return <CheckEmail email={state.sentTo} reason="sign-up" />;
  return <form action={formAction} className="auth-form">
    {!configured && <NotConfigured />}
    {notice && !state.error && <p className="auth-alert" role="status">{notice}</p>}
    {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
    {state.message && <p className="auth-success" role="status">{state.message}</p>}
    {signingUp && <div className="auth-field"><label htmlFor="displayName">Your name</label><input id="displayName" name="displayName" autoComplete="name" required maxLength={120} /></div>}
    <div className="auth-field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>
    <div className="auth-field">
      <div className="auth-label-row"><label htmlFor="password">Password</label>{!signingUp && <Link className="auth-inline-link" href="/forgot-password">Forgot password?</Link>}</div>
      <input id="password" name="password" type="password" autoComplete={signingUp ? "new-password" : "current-password"} required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} aria-describedby={signingUp ? "password-hint" : undefined} />
      {signingUp && <span id="password-hint">{PASSWORD_HINT}</span>}
    </div>
    <Button type="submit" disabled={pending || !configured}>{pending ? "Please wait…" : signingUp ? "Create account" : "Sign in"}</Button>
    <p className="auth-switch">{signingUp ? "Already have an account? " : "New here? "}<Link href={signingUp ? "/sign-in" : "/sign-up"}>{signingUp ? "Sign in" : "Create an account"}</Link></p>
  </form>;
}

/** Step 1 of a reset: ask for the email. */
export function ForgotPasswordForm({ action, configured, notice }: { action: AuthAction; configured: boolean; notice?: string | null }) {
  const [state, formAction, pending] = useActionState(action, {});
  if (state.sentTo) return <CheckEmail email={state.sentTo} reason="reset" />;
  return <form action={formAction} className="auth-form">
    {!configured && <NotConfigured />}
    {notice && !state.error && <p className="auth-alert" role="status">{notice}</p>}
    {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
    <div className="auth-field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>
    <Button type="submit" disabled={pending || !configured}>{pending ? "Sending…" : "Send reset link"}</Button>
    <p className="auth-switch">Remembered it? <Link href="/sign-in">Sign in</Link></p>
  </form>;
}

/** Step 2 of a reset: the email link has signed you in; choose a new password. */
export function NewPasswordForm({ action }: { action: AuthAction }) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className="auth-form">
    {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
    <div className="auth-field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} aria-describedby="password-hint" /><span id="password-hint">{PASSWORD_HINT}</span></div>
    <div className="auth-field"><label htmlFor="confirmPassword">Type it again</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} /></div>
    <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save new password"}</Button>
  </form>;
}
