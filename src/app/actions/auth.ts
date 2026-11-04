"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthFormState = { error?: string; message?: string };

const credentialsSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(128),
});

export async function signInAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!getSupabaseEnvironment()) return { error: "Local authentication is not configured. Follow the environment setup instructions." };
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter a valid email and password (at least 8 characters)." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Could not sign in. Check your email and password." };
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
  if (error) return { error: "Could not create the account. Check the details and try again." };
  if (!data.session) return { message: "Account created. Verify your email, then sign in." };
  redirect("/setup");
}

export async function signOutAction() {
  if (getSupabaseEnvironment()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/sign-in");
}

