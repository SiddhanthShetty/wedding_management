import "server-only";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { digestGuestPortalAddress, digestGuestPortalValue } from "@/lib/guest-portal/crypto";
import type { PortalMedia } from "@/lib/invitations/media";

export const GUEST_PORTAL_COOKIE = "__Secure-guest_portal";
/** Holds a family preview token so the preview page can load its music and photos. */
export const PREVIEW_COOKIE = "__Secure-invite_preview";
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
  /** Music and gallery photos; `base` + id is where this viewer loads each file. */
  media?: PortalMedia;
  /** A preview for the couple or their family: replies and blessings are switched off. */
  preview?: { expires_at: string | null };
  /** People the hosts added as "<family> guest N", whom this link may name. */
  placeholder_ids?: string[];
};

function publicSupabase() {
  const env = getSupabaseEnvironment();
  if (!env) throw new Error("Guest portal is not available.");
  return createClient(env.url, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/**
 * The caller's network address for rate limiting. On Vercel (VERCEL is set only there) the
 * platform's own header is used, which clients cannot set. Elsewhere the hosting proxy must
 * overwrite x-real-ip / x-forwarded-for. With no address, callers share the "unknown" bucket.
 */
export function clientAddress(headersList: Headers, onVercel = Boolean(process.env.VERCEL)) {
  if (onVercel) {
    const vercel = headersList.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
    if (vercel) return vercel;
  }
  const forwarded = headersList.get("x-forwarded-for")?.split(",")[0]?.trim();
  return headersList.get("x-real-ip")?.trim() || forwarded || "unknown";
}

export async function consumePortalRateLimit(scope: "exchange" | "submit" | "read" | "media", headersList?: Headers) {
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
    const [portal, media, placeholders] = await Promise.all([
      supabase.rpc("get_guest_portal_data", { p_session_digest: sessionDigest }),
      supabase.rpc("list_guest_portal_media", { p_session_digest: sessionDigest }),
      supabase.rpc("get_guest_portal_placeholders", { p_session_digest: sessionDigest }),
    ]);
    if (portal.error || !portal.data || typeof portal.data !== "object") return null;
    const listing = !media.error && media.data && typeof media.data === "object" ? media.data as Omit<PortalMedia, "base"> : null;
    // Before the guest-desk migration is applied there are no placeholders; the page works the same.
    const placeholderIds = !placeholders.error && Array.isArray(placeholders.data) ? (placeholders.data as unknown[]).filter((id): id is string => typeof id === "string") : [];
    return { ...(portal.data as GuestPortalData), media: listing ? { base: "/guest/media/", ...listing } : undefined, placeholder_ids: placeholderIds };
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

type PortalStatus = "saved" | "duplicate" | "conflict" | "invalid" | "unavailable";

/**
 * "All of us, to all events": saves each person's answers through the same batch reply function
 * (one transaction per person, with stale-write and duplicate checks). Counts as one submission
 * for rate limiting. Stops at the first person whose answers could not be saved.
 */
export async function recordPortalFamilyRsvps(people: Array<{ guestId: string; responses: Array<{ invitationId: string; response: "yes" | "no" | "maybe"; note: string; expectedUpdatedAt: string | null; submissionKey: string }> }>) {
  const saved: string[] = [];
  try {
    if (!(await consumePortalRateLimit("submit"))) return { status: "unavailable" as PortalStatus, saved };
    const sessionDigest = await getGuestPortalSessionDigest();
    if (!sessionDigest) return { status: "unavailable" as PortalStatus, saved };
    const supabase = publicSupabase();
    for (const person of people) {
      const { data, error } = await supabase.rpc("record_guest_portal_rsvps", {
        p_session_digest: sessionDigest, p_guest_id: person.guestId,
        p_responses: person.responses.map((entry) => ({ invitation_id: entry.invitationId, response: entry.response, note: entry.note, expected_updated_at: entry.expectedUpdatedAt, submission_key: entry.submissionKey })),
      });
      const status = (error || !data || typeof data !== "object" ? "unavailable" : (data as { status: PortalStatus }).status) as PortalStatus;
      if (status !== "saved" && status !== "duplicate") return { status, saved };
      saved.push(person.guestId);
    }
    return { status: "saved" as PortalStatus, saved };
  } catch { return { status: "unavailable" as PortalStatus, saved }; }
}

/** The family names someone the hosts added as "<family> guest N". Allowed once per person. */
export async function renamePortalPlaceholder(input: { guestId: string; fullName: string; submissionKey: string }) {
  try {
    if (!(await consumePortalRateLimit("submit"))) return { status: "unavailable" } as const;
    const sessionDigest = await getGuestPortalSessionDigest();
    if (!sessionDigest) return { status: "unavailable" } as const;
    const { data, error } = await publicSupabase().rpc("rename_guest_portal_placeholder", { p_session_digest: sessionDigest, p_guest_id: input.guestId, p_full_name: input.fullName, p_submission_key: input.submissionKey });
    if (error || !data || typeof data !== "object") return { status: "unavailable" } as const;
    return data as { status: PortalStatus };
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
    if (!sessionDigest || !(await consumePortalRateLimit("media"))) return null;
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

type MediaFile = { mime: string; bytes: Buffer };
function decodeMedia(data: unknown): MediaFile | null {
  if (!data || typeof data !== "object") return null;
  const { mime, data: base64 } = data as { mime?: unknown; data?: unknown };
  if (typeof mime !== "string" || typeof base64 !== "string" || !/^(image\/(jpeg|webp)|audio\/(mpeg|mp4|ogg))$/.test(mime)) return null;
  return { mime, bytes: Buffer.from(base64, "base64") };
}

/** One music file or gallery photo, for a valid guest session and the design guests see. */
export async function getGuestPortalMedia(mediaId: string): Promise<MediaFile | null> {
  try {
    const sessionDigest = await getGuestPortalSessionDigest();
    if (!sessionDigest || !(await consumePortalRateLimit("media"))) return null;
    const { data, error } = await publicSupabase().rpc("get_guest_portal_media", { p_session_digest: sessionDigest, p_media_id: mediaId });
    return error ? null : decodeMedia(data);
  } catch { return null; }
}

export async function listPreviewMedia(token: string): Promise<Omit<PortalMedia, "base"> | null> {
  try {
    const { data, error } = await publicSupabase().rpc("list_invitation_preview_media", { p_token_digest: digestGuestPortalValue("preview", token) });
    return error || !data || typeof data !== "object" ? null : data as Omit<PortalMedia, "base">;
  } catch { return null; }
}

/** One file of a family preview, using the preview token kept in an httpOnly cookie. */
export async function getPreviewMedia(mediaId: string): Promise<MediaFile | null> {
  try {
    const token = (await cookies()).get(PREVIEW_COOKIE)?.value;
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || !(await consumePortalRateLimit("media"))) return null;
    const { data, error } = await publicSupabase().rpc("get_invitation_preview_media", { p_token_digest: digestGuestPortalValue("preview", token), p_media_id: mediaId });
    return error ? null : decodeMedia(data);
  } catch { return null; }
}

export function unavailableMessage() { return genericUnavailable; }
