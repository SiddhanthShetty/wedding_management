"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { AuthenticationRequiredError, AuthorizationDeniedError, requireAuthenticatedUser } from "@/lib/auth/access";
import { updateWeddingSetup } from "@/lib/data/weddings";
import { weddingSetupSchema } from "@/lib/planning/inputs";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE, workspaceNameFor } from "@/lib/locale";

export type SetupFormState = { error?: string; message?: string };

function readSetupForm(formData: FormData) {
  const text = (key: string) => { const value = formData.get(key); return typeof value === "string" ? value : ""; };
  // The short first-run form sends only names, date and city; the rest gets sensible defaults.
  const name = text("name").trim() || workspaceNameFor(text("partnerOneDisplayName"), text("partnerTwoDisplayName"));
  const weddingDateStatus = formData.has("weddingDateStatus") ? formData.get("weddingDateStatus") : formData.get("dateNotFinal") === "on" || !text("weddingDate") ? "tentative" : "confirmed";
  return {
    weddingId: String(formData.get("weddingId") ?? "") || undefined,
    name,
    partnerOneDisplayName: formData.get("partnerOneDisplayName"),
    partnerTwoDisplayName: formData.get("partnerTwoDisplayName"),
    weddingDate: formData.get("weddingDate"),
    weddingDateStatus,
    timezone: text("timezone") || DEFAULT_TIMEZONE,
    currency: text("currency") || DEFAULT_CURRENCY,
    mainLocations: text("mainLocations"),
    overallBudget: text("overallBudget"),
    planningNotes: text("planningNotes"),
  };
}

function validationMessage(error: ZodError) {
  return error.issues[0]?.message ?? "Check the wedding details and try again.";
}

export async function createWeddingAction(_previous: SetupFormState, formData: FormData): Promise<SetupFormState> {
  const parsed = weddingSetupSchema.safeParse(readSetupForm(formData));
  if (!parsed.success) return { error: validationMessage(parsed.error) };

  const { supabase } = await requireAuthenticatedUser();
  const { data, error } = await supabase.rpc("create_wedding", {
    p_name: parsed.data.name,
    p_timezone: parsed.data.timezone,
    p_currency: parsed.data.currency,
    p_partner_one_display_name: parsed.data.partnerOneDisplayName,
    p_partner_two_display_name: parsed.data.partnerTwoDisplayName,
    p_wedding_date: parsed.data.weddingDate,
    p_wedding_date_status: parsed.data.weddingDateStatus,
    p_main_locations: parsed.data.mainLocations,
    p_overall_budget: parsed.data.overallBudget,
    p_planning_notes: parsed.data.planningNotes,
  });
  if (error || !data) return { error: "Your wedding couldn't be created. Check the details and try again." };
  revalidatePath("/overview");
  redirect("/overview");
}

export async function updateWeddingSetupAction(_previous: SetupFormState, formData: FormData): Promise<SetupFormState> {
  const input = readSetupForm(formData);
  const parsed = weddingSetupSchema.safeParse(input);
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  try {
    // updateWeddingSetup validates for itself, so it takes the raw form values, not parsed.data
    // (the schema converts values, and converted values do not pass it a second time).
    await updateWeddingSetup(input);
    revalidatePath("/settings");
    revalidatePath("/overview");
    revalidatePath("/functions");
    revalidatePath("/", "layout");
    return { message: "Wedding details saved." };
  } catch (error) {
    if (error instanceof AuthorizationDeniedError || error instanceof AuthenticationRequiredError) return { error: "Your access to change wedding details is no longer available. Refresh and try again." };
    return { error: "Could not save these wedding details. Nothing was changed; please try again." };
  }
}
