import "server-only";
import { AuthorizationDeniedError, authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dedupeKey, partitionRequestedRecipients, renderTemplate, selectRecipients, unknownPlaceholders, type MessageChannel, type MessageKind, type MessageState, type Placeholder } from "@/lib/planning/communications";

export class CommunicationRuleError extends Error { constructor(message: string) { super(message); this.name = "CommunicationRuleError"; } }
export class CommunicationConflictError extends Error { constructor() { super("This template was changed by someone else. Refresh and review it before saving again."); this.name = "CommunicationConflictError"; } }

function check(error: { code?: string; message: string } | null, fallback: string) {
  if (!error) return;
  if (error.code === "42501") throw new AuthorizationDeniedError();
  if (error.code === "23505") throw new CommunicationRuleError("A template with that name already exists.");
  if (error.code === "23514" && !/violates check constraint/.test(error.message)) throw new CommunicationRuleError(error.message);
  throw new Error(fallback);
}

export type CommsFunction = { id: string; name: string; function_date: string | null; start_time: string | null; venue_name: string | null; status: string };

export async function getCommunicationsWorkspace(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "guests", "read");
  const supabase = await createSupabaseServerClient();
  const results = await Promise.all([
    supabase.rpc("get_guest_function_references", { p_wedding_id: weddingId }),
    supabase.from("message_templates").select("id,kind,name,function_id,subject,body,archived_at,version,updated_at").eq("wedding_id", weddingId).order("name"),
    supabase.from("guests").select("id,full_name,email,phone,household_id").eq("wedding_id", weddingId).order("full_name"),
    supabase.from("guest_households").select("id,name,contact_email,contact_phone").eq("wedding_id", weddingId),
    supabase.from("guest_invitations").select("id,guest_id,function_id,status").eq("wedding_id", weddingId),
    supabase.from("guest_rsvps").select("invitation_id").eq("wedding_id", weddingId),
    supabase.from("communication_records").select("id,guest_id,function_id,template_id,channel,subject,body_snapshot,state,manual,sent_at,failure_reason,notes,recorded_by_user_id,created_at,updated_at").eq("wedding_id", weddingId).order("created_at", { ascending: false }).limit(1000),
    supabase.from("weddings").select("partner_one_display_name,partner_two_display_name").eq("id", weddingId).maybeSingle(),
  ]);
  for (const result of results) if (result.error) throw new Error("Could not load messages.");
  const [functions, templates, guests, households, invitations, rsvps, records, wedding] = results;
  return {
    wedding: context.wedding,
    canEdit: context.membership.role === "owner" || context.membership.role === "co_owner" || context.moduleAccess.guests === "edit",
    coupleNames: [wedding.data?.partner_one_display_name, wedding.data?.partner_two_display_name].filter(Boolean).join(" & "),
    functions: ((functions.data ?? []) as Array<CommsFunction & { archived_at: string | null }>).filter((fn) => !fn.archived_at),
    templates: (templates.data ?? []) as Array<{ id: string; kind: MessageKind; name: string; function_id: string | null; subject: string; body: string; archived_at: string | null; version: number; updated_at: string }>,
    guests: (guests.data ?? []) as Array<{ id: string; full_name: string; email: string; phone: string; household_id: string | null }>,
    households: (households.data ?? []) as Array<{ id: string; name: string; contact_email: string; contact_phone: string }>,
    invitations: (invitations.data ?? []) as Array<{ id: string; guest_id: string; function_id: string; status: "invited" | "withdrawn" }>,
    respondedInvitationIds: (rsvps.data ?? []).map((row) => row.invitation_id as string),
    records: (records.data ?? []) as Array<{ id: string; guest_id: string; function_id: string | null; template_id: string | null; channel: MessageChannel; subject: string; body_snapshot: string; state: MessageState; manual: boolean; sent_at: string | null; failure_reason: string; notes: string; recorded_by_user_id: string; created_at: string; updated_at: string }>,
    loadedAt: new Date().toISOString(),
  };
}
export type CommunicationsWorkspace = Awaited<ReturnType<typeof getCommunicationsWorkspace>>;

async function editor(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "guests", "edit");
  return { context, supabase: await createSupabaseServerClient() };
}

export type TemplateInput = { kind: MessageKind; name: string; function_id: string | null; subject: string; body: string };
function validateTemplate(input: TemplateInput) {
  const unknown = unknownPlaceholders(`${input.subject}\n${input.body}`);
  if (unknown.length) throw new CommunicationRuleError(`Unknown placeholder(s): ${unknown.map((name) => `{{${name}}}`).join(", ")}.`);
}

export async function saveTemplate(weddingId: string, templateId: string | null, expectedVersion: number | null, input: TemplateInput) {
  validateTemplate(input);
  const { context, supabase } = await editor(weddingId);
  if (!templateId) {
    const { error } = await supabase.from("message_templates").insert({ ...input, wedding_id: weddingId, created_by_user_id: context.user.id, updated_by_user_id: context.user.id });
    check(error, "Could not save the template.");
    return;
  }
  const { data, error } = await supabase.from("message_templates").update({ ...input }).eq("wedding_id", weddingId).eq("id", templateId).eq("version", expectedVersion ?? -1).select("id").maybeSingle();
  check(error, "Could not save the template.");
  if (!data) throw new CommunicationConflictError();
}

function formatFunctionDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : null;
}

/**
 * Records drafts or manual "sent" marks for chosen guests. The message text is rendered on the
 * server from the saved template, so the stored snapshot is exactly what the template produced.
 * Duplicate records for the same template version, function and guest are skipped.
 */
export async function recordMessages(weddingId: string, input: { templateId: string; functionId: string; guestIds: string[]; channel: MessageChannel; state: "drafted" | "sent"; notes: string }) {
  const { context, supabase } = await editor(weddingId);
  const workspace = await getCommunicationsWorkspace(weddingId);
  const template = workspace.templates.find((row) => row.id === input.templateId && !row.archived_at);
  if (!template) throw new CommunicationRuleError("Choose an active template.");
  const fn = workspace.functions.find((row) => row.id === input.functionId);
  if (!fn) throw new CommunicationRuleError("Choose a function.");
  const households = new Map(workspace.households.map((row) => [row.id, row]));
  // Re-run the same selection the preview used, against current data.
  const { allowed, excluded } = partitionRequestedRecipients(input.guestIds, selectRecipients({
    kind: template.kind, functionId: fn.id, functionCancelled: fn.status === "cancelled", templateId: template.id,
    guests: workspace.guests, invitations: workspace.invitations, respondedInvitationIds: new Set(workspace.respondedInvitationIds), records: workspace.records,
  }));
  const rows = allowed.map((guestId) => {
    const guest = workspace.guests.find((row) => row.id === guestId)!;
    const values: Partial<Record<Placeholder, string | null>> = {
      guest_name: guest.full_name, first_name: guest.full_name.split(" ")[0] ?? guest.full_name, household_name: guest.household_id ? households.get(guest.household_id)?.name ?? null : null,
      function_name: fn.name, function_date: formatFunctionDate(fn.function_date), function_time: fn.start_time?.slice(0, 5) ?? null, venue: fn.venue_name, couple_names: workspace.coupleNames || null,
    };
    return {
      wedding_id: weddingId, guest_id: guestId, function_id: fn.id, template_id: template.id, channel: input.channel,
      subject: renderTemplate(template.subject, values), body_snapshot: renderTemplate(template.body, values),
      state: input.state, manual: true, sent_at: input.state === "sent" ? new Date().toISOString() : null, notes: input.notes,
      dedupe_key: dedupeKey({ templateId: template.id, templateVersion: template.version, guestId, functionId: fn.id }), recorded_by_user_id: context.user.id,
    };
  });
  if (!rows.length) throw new CommunicationRuleError(excluded.length ? `Nobody selected still needs this message (${[...new Set(excluded.map((row) => row.reason))].join("; ")}). Refresh the preview.` : "Choose at least one recipient.");
  const { data, error } = await supabase.from("communication_records").upsert(rows, { onConflict: "wedding_id,dedupe_key", ignoreDuplicates: true }).select("id");
  check(error, "Could not record the messages.");
  return { recorded: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0), excluded: excluded.length };
}

export async function setRecordState(weddingId: string, recordId: string, to: "sent" | "failed" | "drafted", failureReason: string) {
  const { supabase } = await editor(weddingId);
  if (to === "failed" && !failureReason.trim()) throw new CommunicationRuleError("Say why the message failed.");
  const values = to === "sent" ? { state: to, sent_at: new Date().toISOString() } : to === "failed" ? { state: to, failure_reason: failureReason.trim(), sent_at: null } : { state: to, sent_at: null };
  const { data, error } = await supabase.from("communication_records").update(values).eq("wedding_id", weddingId).eq("id", recordId).select("id").maybeSingle();
  check(error, "Could not update the message.");
  if (!data) throw new AuthorizationDeniedError();
}

export async function setTemplateArchived(weddingId: string, templateId: string, archived: boolean) {
  const { supabase } = await editor(weddingId);
  const { data, error } = await supabase.from("message_templates").update({ archived_at: archived ? new Date().toISOString() : null }).eq("wedding_id", weddingId).eq("id", templateId).select("id").maybeSingle();
  check(error, "Could not update the template.");
  if (!data) throw new AuthorizationDeniedError();
}
