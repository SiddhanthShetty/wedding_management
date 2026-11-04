"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { updateWeddingSetup } from "@/lib/data/weddings";
import { weddingSetupSchema } from "@/lib/planning/inputs";

export type SetupFormState = { error?: string; message?: string };

function readSetupForm(formData: FormData) {
  return {
    weddingId: String(formData.get("weddingId") ?? "") || undefined,
    name: formData.get("name"),
    partnerOneDisplayName: formData.get("partnerOneDisplayName"),
    partnerTwoDisplayName: formData.get("partnerTwoDisplayName"),
    weddingDate: formData.get("weddingDate"),
    weddingDateStatus: formData.get("weddingDateStatus"),
    timezone: formData.get("timezone"),
    currency: formData.get("currency"),
    mainLocations: formData.get("mainLocations"),
    overallBudget: formData.get("overallBudget"),
    planningNotes: formData.get("planningNotes"),
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
  if (error || !data) return { error: "The wedding workspace could not be created. Please review the details and try again." };
  revalidatePath("/overview");
  redirect("/overview");
}

export async function updateWeddingSetupAction(_previous: SetupFormState, formData: FormData): Promise<SetupFormState> {
  const parsed = weddingSetupSchema.safeParse(readSetupForm(formData));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  try {
    await updateWeddingSetup(parsed.data);
    revalidatePath("/settings");
    revalidatePath("/overview");
    revalidatePath("/functions");
    return { message: "Wedding details saved." };
  } catch {
    return { error: "Could not save these wedding details. Your access may have changed; refresh and try again." };
  }
}
