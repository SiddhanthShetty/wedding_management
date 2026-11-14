import "server-only";

import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { digestGuestPortalAddress } from "@/lib/guest-portal/crypto";
import { CODE_PATTERN, type InviteEvent } from "@/lib/family-invites/rules";

/** What a family's link shows. */
export type FamilyInvitation = {
  family: string;
  max_guests: number | null;
  wedding: { date: string | null; timezone: string };
  functions: InviteEvent[];
  reply: null | { attending: boolean; guest_count: number; function_ids: string[]; dietary: string; dietary_notes: string; message: string; name: string; phone: string; updated_at: string };
};

/** The guest's side uses the publishable key only: the database functions check the link code. */
function publicSupabase() {
  const env = getSupabaseEnvironment();
  if (!env) throw new Error("Invitations are not available.");
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

async function withinLimit(scope: "read" | "submit") {
  const keyDigest = digestGuestPortalAddress(clientAddress(await headers()), scope);
  const { data, error } = await publicSupabase().rpc("consume_guest_portal_rate_limit", { p_scope: scope, p_key_digest: keyDigest });
  return !error && data === true;
}

/** The invitation for a code, or null (unknown code, removed family, too many requests, or no database). */
export async function getFamilyInvitation(code: string): Promise<FamilyInvitation | null> {
  try {
    if (!CODE_PATTERN.test(code) || !(await withinLimit("read"))) return null;
    const { data, error } = await publicSupabase().rpc("get_family_invitation", { p_code: code });
    return error || !data || typeof data !== "object" ? null : data as FamilyInvitation;
  } catch { return null; }
}

export type ReplyResult = { status: "saved" | "invalid" | "unavailable" | "busy"; field?: string };

export async function submitFamilyReply(code: string, reply: { attending: boolean; guestCount: number; functionIds: string[]; dietary: string; dietaryNotes: string; message: string; name: string; phone: string }): Promise<ReplyResult> {
  try {
    if (!CODE_PATTERN.test(code)) return { status: "unavailable" };
    if (!(await withinLimit("submit"))) return { status: "busy" };
    const { data, error } = await publicSupabase().rpc("submit_family_reply", {
      p_code: code, p_attending: reply.attending, p_guest_count: reply.guestCount, p_function_ids: reply.functionIds, p_dietary: reply.dietary,
      p_dietary_notes: reply.dietaryNotes, p_message: reply.message, p_name: reply.name, p_phone: reply.phone,
    });
    if (error || !data || typeof data !== "object") return { status: "unavailable" };
    return data as ReplyResult;
  } catch { return { status: "unavailable" }; }
}
