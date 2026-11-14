import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type WorkspaceBranding = { coupleNames: string; monogram: string | null; accent: string; accentText: string; background: string };

/** The invitation's own colours (from the couple's emblem), used for the workspace chrome. */
const INVITATION_COLOURS = { accent: "#b9853a", accentText: "#5e0b12", background: "#f5e5d1" };

/** "Priya & Arjun" → "P · A". Uses the first letter (grapheme) of each name; null when there are none. */
export function monogramFor(couple: string): string | null {
  const names = couple.split(/\s*(?:&|and|\+)\s*/i).map((name) => name.trim()).filter(Boolean).slice(0, 2);
  const initials = names.map((name) => typeof Intl !== "undefined" && "Segmenter" in Intl
    ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name), (part) => part.segment)[0]!
    : Array.from(name)[0]!).map((letter) => letter.toLocaleUpperCase());
  return initials.length ? initials.join(" · ") : null;
}

/** The couple's monogram and the invitation colours. A failure never blocks a page. */
export const getWorkspaceBranding = cache(async (weddingId: string): Promise<WorkspaceBranding | null> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("weddings").select("name,partner_one_display_name,partner_two_display_name").eq("id", weddingId).maybeSingle();
    const coupleNames = [data?.partner_one_display_name, data?.partner_two_display_name].filter(Boolean).join(" & ");
    return { coupleNames: coupleNames || data?.name || "", monogram: coupleNames ? monogramFor(coupleNames) : null, ...INVITATION_COLOURS };
  } catch {
    return null;
  }
});
