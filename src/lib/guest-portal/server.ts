import "server-only";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { digestGuestPortalAddress, digestGuestPortalValue } from "@/lib/guest-portal/crypto";

export const GUEST_PORTAL_COOKIE = "__Secure-guest_portal";
const genericUnavailable = "This invitation link is not available. Please contact your hosts for help.";

export type PortalFunction = {
  id: string; name: string; type: string; date: string | null; start_time: string | null; end_time: string | null;
  timezone: string; location: string | null; map_url: string | null; dress_code: string | null; status: "tentative" | "confirmed";
};
export type PortalInvitation = { id: string; response: "yes" | "no" | "maybe" | null; response_note: string | null; updated_at: string | null; function: PortalFunction };
/** Confirmed stays only; room numbers, room-mates and payment responsibility are never included. */
export type PortalStay = { property: string; address: string; notes: string; room_type: string; check_in_date: string; check_out_date: string; check_in_time: string | null; check_out_time: string | null };
/** Journeys the planners explicitly shared; driver contact details are never included. */
export type PortalJourney = { kind: "arrival" | "departure" | "transfer"; title: string; pickup_at: string; pickup_location: string; dropoff_location: string; timezone: string };
export type PortalGuest = { id: string; full_name: string; is_proxy: boolean; meal_preference: string; allergies: string; assistance_needs: string; updated_at: string; invitations: PortalInvitation[]; stays?: PortalStay[]; journeys?: PortalJourney[] };
/** The wedding's chosen invitation design, with wording overrides for the household's language only. */
export type PortalInvitationDesign = {
  theme: string; accent: string | null; texts: Record<string, string>; has_photo?: boolean; show_monogram?: boolean;
  /** Previews only: wording for every language, and the photo as a data URL. */
  all_texts?: Record<string, Record<string, string>>; photo_url?: string | null;
};
export type PortalBlessing = { name: string; message: string; created_at: string };
export type GuestPortalData = {
  household: { name: string; language?: string }; portal_guest_id: string; invitation?: PortalInvitationDesign | null; couple_names: string[]; people: PortalGuest[];
  /** Invitation website content; validated when saved and re-read leniently on display. */
  site?: unknown; blessings?: PortalBlessing[]; my_pending_blessings?: number;
  /** A preview for the couple or their family: replies and blessings are switched off. */
  preview?: { expires_at: string | null };
};

function publicSupabase() {
  const env = getSupabaseEnvironment();
  if (!env) throw new Error("Guest portal is not available.");
  return createClient(env.url, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function clientAddress(headersList: Headers) {
  // Hosting must overwrite forwarded IP headers. If no trusted address is supplied,
  // all callers share the fail-closed "unknown" rate-limit bucket.
  const forwarded = headersList.get("x-forwarded-for")?.split(",")[0]?.trim();
  return headersList.get("x-real-ip")?.trim() || forwarded || "unknown";
}

export async function consumePortalRateLimit(scope: "exchange" | "submit" | "read", headersList?: Headers) {
  const list = headersList ?? await headers();
  const keyDigest = digestGuestPortalAddress(clientAddress(list), scope);
  const supabase = publicSupabase();
  const { data, error } = await supabase.rpc("consume_guest_portal_rate_limit", { p_scope: scope, p_key_digest: keyDigest });
  if (error || data !== true) return false;
  return true;
}

export async function exchangeGuestPortalToken(token: string) {
  const supabase = publicSupabase();
  const tokenDigest = digestGuestPortalValue("link", token);
  const sessionToken = randomBytes(32).toString("base64url");
  const sessionDigest = digestGuestPortalValue("session", sessionToken);
  const { data, error } = await supabase.rpc("create_guest_portal_session", { p_token_digest: tokenDigest, p_session_digest: sessionDigest });
  if (error || !data) return null;
  return { sessionToken, expiresAt: String(data) };
}

export async function getGuestPortalSessionDigest() {
  const cookie = (await cookies()).get(GUEST_PORTAL_COOKIE)?.value;
  if (!cookie || !/^[A-Za-z0-9_-]{43}$/.test(cookie)) return null;
  return digestGuestPortalValue("session", cookie);
}

export async function getGuestPortalData(): Promise<GuestPortalData | null> {
  try {
    const sessionDigest = await getGuestPortalSessionDigest();
    if (!sessionDigest || !(await consumePortalRateLimit("read"))) return null;
    const supabase = publicSupabase();
    const { data, error } = await supabase.rpc("get_guest_portal_data", { p_session_digest: sessionDigest });
    if (error || !data || typeof data !== "object") return null;
    return data as GuestPortalData;
  } catch { return null; }
}

export async function recordPortalRsvps(input: { guestId: string; responses: Array<{ invitationId: string; response: "yes" | "no" | "maybe"; note: string; expectedUpdatedAt: string | null; submissionKey: string }> }) {
  try {
    if (!(await consumePortalRateLimit("submit"))) return { status: "unavailable" } as const;
    const sessionDigest = await getGuestPortalSessionDigest();
    if (!sessionDigest) return { status: "unavailable" } as const;
    const supabase = publicSupabase();
    const { data, error } = await supabase.rpc("record_guest_portal_rsvps", {
      p_session_digest: sessionDigest,
      p_guest_id: input.guestId,
      p_responses: input.responses.map((entry) => ({
        invitation_id: entry.invitationId,
        response: entry.response,
        note: entry.note,
        expected_updated_at: entry.expectedUpdatedAt,
        submission_key: entry.submissionKey,
      })),
    });
    if (error || !data || typeof data !== "object") return { status: "unavailable" } as const;
    return data as { status: "saved" | "duplicate" | "conflict" | "invalid" | "unavailable"; saved_count?: number };
  } catch { return { status: "unavailable" } as const; }
}

export async function recordPortalGuestProfile(input: { guestId: string; mealPreference: string; allergies: string; assistanceNeeds: string; expectedUpdatedAt: string; submissionKey: string }) {
  try {
    if (!(await consumePortalRateLimit("submit"))) return { status: "unavailable" } as const;
    const sessionDigest = await getGuestPortalSessionDigest();
    if (!sessionDigest) return { status: "unavailable" } as const;
    const supabase = publicSupabase();
    const { data, error } = await supabase.rpc("record_guest_portal_profile", {
      p_session_digest: sessionDigest, p_guest_id: input.guestId, p_meal_preference: input.mealPreference,
      p_allergies: input.allergies, p_assistance_needs: input.assistanceNeeds,
      p_expected_updated_at: input.expectedUpdatedAt, p_submission_key: input.submissionKey,
    });
    if (error || !data || typeof data !== "object") return { status: "unavailable" } as const;
    return data as { status: "saved" | "duplicate" | "conflict" | "invalid" | "unavailable" };
  } catch { return { status: "unavailable" } as const; }
}

/** A guest's blessing for the couple; it stays private until a guest-list editor approves it. */
export async function submitPortalBlessing(input: { message: string; submissionKey: string }) {
  try {
    if (!(await consumePortalRateLimit("submit"))) return { status: "unavailable" } as const;
    const sessionDigest = await getGuestPortalSessionDigest();
    if (!sessionDigest) return { status: "unavailable" } as const;
    const { data, error } = await publicSupabase().rpc("submit_guest_portal_blessing", { p_session_digest: sessionDigest, p_message: input.message, p_submission_key: input.submissionKey });
    if (error || !data || typeof data !== "object") return { status: "unavailable" } as const;
    return data as { status: "saved" | "duplicate" | "limit" | "invalid" | "unavailable" };
  } catch { return { status: "unavailable" } as const; }
}

/** The couple photo for a valid guest session, as bytes; null when there is none or the session is invalid. */
export async function getGuestPortalPhoto(): Promise<{ type: string; bytes: Buffer } | null> {
  try {
    const sessionDigest = await getGuestPortalSessionDigest();
    if (!sessionDigest || !(await consumePortalRateLimit("read"))) return null;
    const { data, error } = await publicSupabase().rpc("get_guest_portal_photo", { p_session_digest: sessionDigest });
    if (error || typeof data !== "string") return null;
    const match = /^data:(image\/(?:jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(data);
    return match ? { type: match[1]!, bytes: Buffer.from(match[2]!, "base64") } : null;
  } catch { return null; }
}

/** A family preview of one design, or null when the link is wrong or has expired. */
export async function getInvitationPreview(token: string): Promise<{ expires_at: string; couple_names: string[]; design: { theme: string; accent: string | null; texts: Record<string, Record<string, string>>; site: unknown; photo_data: string | null; show_monogram: boolean }; functions: PortalFunction[] } | null> {
  try {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const { data, error } = await publicSupabase().rpc("get_invitation_preview", { p_token_digest: digestGuestPortalValue("preview", token) });
    if (error || !data || typeof data !== "object") return null;
    return data as never;
  } catch { return null; }
}

export function unavailableMessage() { return genericUnavailable; }
