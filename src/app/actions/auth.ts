"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { newPasswordProblem, PASSWORD_MAX, PASSWORD_MIN, signInErrorMessage, siteOrigin } from "@/lib/auth/recovery";

/** `sentTo` is set when an email has gone out, so the page can show a "check your email" screen. */
export type AuthFormState = { error?: string; message?: string; sentTo?: string };

/** Trim first: phone keyboards often add a space after an email address. */
const emailField = z.string().trim().toLowerCase().pipe(z.email());

const credentialsSchema = z.object({
  email: emailField,
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export async function signInAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!getSupabaseEnvironment()) return { error: "Local authentication is not configured. Follow the environment setup instructions." };
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email and a password of at least 8 characters." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: signInErrorMessage(error.code) };
  redirect("/overview");
}

export async function signUpAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!getSupabaseEnvironment()) return { error: "Local authentication is not configured. Follow the environment setup instructions." };
  const parsed = credentialsSchema.extend({ displayName: z.string().trim().min(1).max(120) }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) return { error: "Enter your name, a valid email, and a password with at least 8 characters." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName } },
  });
  if (error) return { error: error.code === "weak_password" ? "Choose a longer or less common password." : "Could not create the account. If you already have one, sign in or reset your password." };
  if (!data.session) return { message: "Account created.", sentTo: parsed.data.email };
  redirect("/setup");
}

async function emailLinkBase() {
  const list = await headers();
  return siteOrigin(process.env.NEXT_PUBLIC_SITE_URL, list.get("x-forwarded-host") ?? list.get("host"), list.get("x-forwarded-proto"));
}

/**
 * Emails a reset link. The reply is the same whether or not the email has an account,
 * so the form can't be used to find out who has signed up.
 */
export async function requestPasswordResetAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!getSupabaseEnvironment()) return { error: "Local authentication is not configured. Follow the environment setup instructions." };
  const email = emailField.safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter the email address you signed up with." };
  const origin = await emailLinkBase();
  if (!origin) return { error: "Could not work out this site's address. Try again from the sign-in page." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")) {
    return { error: "Too many reset emails were asked for. Wait a few minutes and try again." };
  }
  return { message: "Reset link sent.", sentTo: email.data };
}

/** Sets a new password for the person the reset link signed in. */
export async function updatePasswordAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!getSupabaseEnvironment()) return { error: "Local authentication is not configured. Follow the environment setup instructions." };
  const password = String(formData.get("password") ?? "");
  const problem = newPasswordProblem(password, String(formData.get("confirmPassword") ?? ""));
  if (problem) return { error: problem };

  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase.auth.getUser();
  if (!current.user) return { error: "Your reset link has expired. Ask for a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "That's your current password. Choose a new one." };
    if (error.code === "weak_password") return { error: "Choose a longer or less common password." };
    return { error: "Could not save your new password. Ask for a new reset link and try again." };
  }
  redirect("/overview");
}

export async function signOutAction() {
  if (getSupabaseEnvironment()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/sign-in");
}

