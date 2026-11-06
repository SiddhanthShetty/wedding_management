/**
 * Message templates, recipient selection and message states. There is no live sending:
 * messages are copied or exported, and members record what they sent by hand.
 */

export type MessageKind = "invitation" | "reminder" | "update";
export type MessageState = "drafted" | "queued" | "sent" | "failed" | "provider_confirmed";
export type MessageChannel = "email" | "sms" | "whatsapp" | "phone" | "in_person" | "post" | "other";

export const MESSAGE_STATE_LABELS: Record<MessageState, string> = {
  drafted: "Drafted", queued: "Queued (provider)", sent: "Marked sent manually", failed: "Failed", provider_confirmed: "Delivery confirmed by provider",
};
export const CHANNEL_LABELS: Record<MessageChannel, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp", phone: "Phone call", in_person: "In person", post: "Post", other: "Other" };
export const KIND_LABELS: Record<MessageKind, string> = { invitation: "Invitation", reminder: "RSVP reminder", update: "Update" };

export const PLACEHOLDERS = ["guest_name", "first_name", "household_name", "function_name", "function_date", "function_time", "venue", "couple_names"] as const;
export type Placeholder = typeof PLACEHOLDERS[number];
const TOKEN = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function unknownPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN)].map((match) => match[1]!).filter((name) => !(PLACEHOLDERS as readonly string[]).includes(name)))];
}

/** Replaces known placeholders. Missing values become a visible marker so nothing is silently blank. */
export function renderTemplate(text: string, values: Partial<Record<Placeholder, string | null>>): string {
  return text.replace(TOKEN, (whole, name: string) => {
    if (!(PLACEHOLDERS as readonly string[]).includes(name)) return whole;
    const value = values[name as Placeholder];
    return value && value.trim() ? value : `[${name.replace(/_/g, " ")} missing]`;
  });
}

export type AudienceGuest = { id: string; full_name: string; email: string; phone: string; household_id: string | null };
export type AudienceInvitation = { id: string; guest_id: string; function_id: string; status: "invited" | "withdrawn" };
export type AudienceRecord = { guest_id: string; function_id: string | null; template_id: string | null; state: MessageState };
export type Recipient = { guestId: string; included: boolean; reason: string; hasContact: boolean };

/**
 * Who should receive a message for one function.
 * - Invitations/updates: everyone with an active invitation.
 * - Reminders: active invitations with no response yet; people who responded are excluded.
 * Anyone already marked sent (or confirmed) for this template is excluded so they are not messaged twice.
 */
export function selectRecipients(input: {
  kind: MessageKind; functionId: string; functionCancelled: boolean; templateId: string | null;
  guests: AudienceGuest[]; invitations: AudienceInvitation[]; respondedInvitationIds: Set<string>; records: AudienceRecord[];
  householdContact?: Map<string, { email: string; phone: string }>;
}): Recipient[] {
  const byGuest = new Map(input.invitations.filter((row) => row.function_id === input.functionId).map((row) => [row.guest_id, row]));
  const done = new Set(input.records.filter((row) => row.template_id && row.template_id === input.templateId && row.function_id === input.functionId && (row.state === "sent" || row.state === "provider_confirmed")).map((row) => row.guest_id));
  return input.guests.flatMap((guest): Recipient[] => {
    const invitation = byGuest.get(guest.id);
    if (!invitation) return [];
    const household = guest.household_id ? input.householdContact?.get(guest.household_id) : undefined;
    const hasContact = Boolean(guest.email || guest.phone || household?.email || household?.phone);
    const base = { guestId: guest.id, hasContact };
    if (input.functionCancelled) return [{ ...base, included: false, reason: "Function cancelled" }];
    if (invitation.status !== "invited") return [{ ...base, included: false, reason: "No longer invited" }];
    if (input.kind === "reminder" && input.respondedInvitationIds.has(invitation.id)) return [{ ...base, included: false, reason: "Already responded" }];
    if (done.has(guest.id)) return [{ ...base, included: false, reason: "Already marked sent for this template" }];
    return [{ ...base, included: true, reason: hasContact ? "Needs this message" : "Needs this message · no email or phone on record" }];
  });
}

/** Mirrors the database state guard. Manual records can only be drafted, sent or failed. */
export function canTransition(from: MessageState, to: MessageState, manual: boolean): boolean {
  if (manual && (to === "queued" || to === "provider_confirmed")) return false;
  if (from === to) return true;
  if (from === "drafted") return to === "sent" || to === "failed" || to === "queued";
  if (from === "failed") return to === "drafted";
  if (from === "queued") return to === "sent" || to === "failed";
  if (from === "sent") return !manual && (to === "provider_confirmed" || to === "failed");
  return false;
}

export function dedupeKey(parts: { templateId: string | null; templateVersion: number | null; guestId: string; functionId: string | null }) {
  return ["msg", parts.templateId ?? "adhoc", parts.templateVersion ?? 0, parts.functionId ?? "none", parts.guestId].join(":");
}

/**
 * Splits requested guest ids into those that may be recorded now and those excluded, using the
 * current recipient selection. Run on the server so a stale preview or a crafted request cannot
 * record reminders for people who already responded or were already messaged.
 */
export function partitionRequestedRecipients(requested: string[], recipients: Recipient[]) {
  const byGuest = new Map(recipients.map((row) => [row.guestId, row]));
  const allowed: string[] = []; const excluded: Array<{ guestId: string; reason: string }> = [];
  for (const guestId of [...new Set(requested)]) {
    const row = byGuest.get(guestId);
    if (row?.included) allowed.push(guestId);
    else excluded.push({ guestId, reason: row?.reason ?? "Not invited to this function" });
  }
  return { allowed, excluded };
}
