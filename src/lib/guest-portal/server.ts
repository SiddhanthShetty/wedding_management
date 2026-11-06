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
export type PortalGuest = { id: string; full_name: string; meal_preference: string; allergies: string; assistance_needs: string; updated_at: string; invitations: PortalInvitation[]; stays?: PortalStay[]; journeys?: PortalJourney[] };
export type GuestPortalData = { household: { name: string }; couple_names: string[]; people: PortalGuest[] };

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

export function unavailableMessage() { return genericUnavailable; }
