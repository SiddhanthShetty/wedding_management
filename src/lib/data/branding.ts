import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { monogramFor } from "@/lib/invitations/card-data";
import { readableAccent, themeById, type ThemeId } from "@/lib/invitations/content";

export type WorkspaceBranding = { coupleNames: string; monogram: string | null; accent: string; accentText: string; background: string };

/**
 * The couple's monogram and their invitation theme colours, for the workspace chrome. Members who
 * cannot see invitation designs (RLS) simply get the neutral defaults; a failure never blocks a page.
 */
export const getWorkspaceBranding = cache(async (weddingId: string): Promise<WorkspaceBranding | null> => {
  try {
    const supabase = await createSupabaseServerClient();
    const [wedding, design] = await Promise.all([
      supabase.from("weddings").select("name,partner_one_display_name,partner_two_display_name").eq("id", weddingId).maybeSingle(),
      supabase.from("invitation_designs").select("theme,accent").eq("wedding_id", weddingId).eq("is_default", true).maybeSingle(),
    ]);
    const coupleNames = [wedding.data?.partner_one_display_name, wedding.data?.partner_two_display_name].filter(Boolean).join(" & ");
    const theme = themeById((design.data?.theme as ThemeId | undefined) ?? "mallige");
    return {
      coupleNames: coupleNames || wedding.data?.name || "",
      monogram: coupleNames ? monogramFor(coupleNames) : null,
      accent: design.data?.accent || theme.accent,
      accentText: readableAccent(theme.id, design.data?.accent),
      background: theme.background,
    };
  } catch {
    return null;
  }
});
