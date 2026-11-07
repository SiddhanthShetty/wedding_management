/**
 * Builds guest-page data for previews (the studio's phone preview and family preview links), so
 * the couple sees exactly the page guests get, with a sample guest invited to the given functions.
 * No real guest data is included, and the page switches replies and blessings off.
 */
import type { GuestPortalData, PortalFunction } from "@/lib/guest-portal/server";
import type { LanguageCode, TextOverrides } from "@/lib/invitations/content";

export type PreviewDesign = { theme: string; accent: string | null; texts: TextOverrides; show_monogram: boolean; photo_url: string | null; site: unknown };

export const PREVIEW_MINUTES = 30;

export function buildPreviewData(input: {
  coupleNames: string[]; guestName: string; language: LanguageCode; design: PreviewDesign; functions: PortalFunction[]; expiresAt?: string | null;
}): GuestPortalData {
  const guestId = "preview-guest";
  return {
    preview: { expires_at: input.expiresAt ?? null },
    household: { name: input.guestName, language: input.language },
    portal_guest_id: guestId,
    couple_names: input.coupleNames.filter(Boolean),
    site: input.design.site,
    blessings: [], my_pending_blessings: 0,
    invitation: {
      theme: input.design.theme, accent: input.design.accent, texts: input.design.texts[input.language] ?? {},
      all_texts: input.design.texts as Record<string, Record<string, string>>,
      has_photo: Boolean(input.design.photo_url), photo_url: input.design.photo_url, show_monogram: input.design.show_monogram,
    },
    people: [{
      id: guestId, full_name: input.guestName, is_proxy: false, meal_preference: "", allergies: "", assistance_needs: "", updated_at: "",
      invitations: input.functions.map((fn) => ({ id: `preview-${fn.id}`, response: null, response_note: null, updated_at: null, function: fn })),
    }],
  };
}

/** Studio function rows → the shape the guest page shows. Details the studio does not load stay empty. */
export function previewFunction(fn: { id: string; name: string; function_date: string | null; start_time: string | null; venue_name: string | null; status: string }, timezone: string): PortalFunction {
  return { id: fn.id, name: fn.name, type: "", date: fn.function_date, start_time: fn.start_time, end_time: null, timezone, location: fn.venue_name, map_url: null, dress_code: null, status: fn.status === "confirmed" ? "confirmed" : "tentative" };
}
