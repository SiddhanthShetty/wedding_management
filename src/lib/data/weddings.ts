import "server-only";

import { AuthorizationDeniedError, authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { weddingSetupSchema, type WeddingSetupInput } from "@/lib/planning/inputs";

export type WeddingSetup = {
  id: string;
  name: string;
  partner_one_display_name: string;
  partner_two_display_name: string;
  wedding_date: string | null;
  wedding_date_status: "tentative" | "confirmed";
  timezone: string;
  currency: string;
  main_locations: string[];
  overall_budget: number | string | null;
  planning_notes: string;
};

const weddingColumns = "id, name, partner_one_display_name, partner_two_display_name, wedding_date, wedding_date_status, timezone, currency, main_locations, overall_budget, planning_notes";

export async function getWeddingSetup(weddingId: string): Promise<WeddingSetup> {
  await authorizeWeddingOperation(weddingId, "planning", "read");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("weddings").select(weddingColumns).eq("id", weddingId).maybeSingle();
  if (error) throw new Error("Could not load wedding details.");
  if (!data) throw new AuthorizationDeniedError();
  return data as WeddingSetup;
}

export async function updateWeddingSetup(input: unknown) {
  const values = weddingSetupSchema.parse(input);
  if (!values.weddingId) throw new Error("Wedding ID is required.");
  const context = await authorizeWeddingOperation(values.weddingId);
  if (context.membership.role !== "owner" && context.membership.role !== "co_owner") {
    throw new AuthorizationDeniedError();
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("weddings").update({
    name: values.name,
    partner_one_display_name: values.partnerOneDisplayName,
    partner_two_display_name: values.partnerTwoDisplayName,
    wedding_date: values.weddingDate,
    wedding_date_status: values.weddingDateStatus,
    timezone: values.timezone,
    currency: values.currency,
    main_locations: values.mainLocations,
    overall_budget: values.overallBudget,
    planning_notes: values.planningNotes,
  }).eq("id", values.weddingId).select(weddingColumns).maybeSingle();
  if (error) throw new Error("Could not update wedding details.");
  if (!data) throw new AuthorizationDeniedError();
  return data as WeddingSetup;
}

export function parseWeddingSetupInput(input: unknown): WeddingSetupInput {
  return weddingSetupSchema.parse(input);
}
