"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthFormState } from "@/app/actions/auth";
import { Button } from "@/components/ui";

type AuthAction = (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;

export function AuthForm({ mode, action, configured }: { mode: "sign-in" | "sign-up"; action: AuthAction; configured: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  const signingUp = mode === "sign-up";
  return <form action={formAction} className="auth-form">
    {!configured && <p className="auth-alert" role="status">Supabase is not configured. Copy local values from <code>npx supabase status</code> into <code>.env.local</code>, then restart Next.js.</p>}
    {state.error && <p className="auth-alert" role="alert">{state.error}</p>}
    {state.message && <p className="auth-success" role="status">{state.message}</p>}
    {signingUp && <div className="auth-field"><label htmlFor="displayName">Your name</label><input id="displayName" name="displayName" autoComplete="name" required maxLength={120} /></div>}
    <div className="auth-field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} /></div>
    <div className="auth-field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={signingUp ? "new-password" : "current-password"} required minLength={8} maxLength={128} /><span>Use at least 8 characters.</span></div>
    <Button type="submit" disabled={pending || !configured}>{pending ? "Please wait…" : signingUp ? "Create account" : "Sign in"}</Button>
    <p className="auth-switch">{signingUp ? "Already have an account? " : "New to the workspace? "}<Link href={signingUp ? "/sign-in" : "/sign-up"}>{signingUp ? "Sign in" : "Create an account"}</Link></p>
  </form>;
}
