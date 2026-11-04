import "server-only";

import { authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decisionInputSchema, decisionUpdateSchema } from "@/lib/planning/decision-inputs";

export class DecisionEditConflictError extends Error {
  constructor() { super("This decision changed while you were editing it."); this.name = "DecisionEditConflictError"; }
}

export type WeddingDecision = {
  id: string;
  wedding_id: string;
  question: string;
  status: "open" | "decided" | "deferred";
  final_option_id: string | null;
  decision_maker_user_id: string | null;
  decision_maker_name: string | null;
  decision_date: string | null;
  reason: string;
  version: number;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
  options: Array<{ id: string; label: string; position: number }>;
  preferences: Array<{ member_user_id: string; member_name: string; option_id: string; option_label: string; preference_note: string; updated_at: string }>;
  comments: Array<{ id: string; body: string; author_user_id: string; author_name: string; created_at: string }>;
  activity: Array<{ id: string; actor_user_id: string | null; actor_name: string; event_type: string; details: Record<string, unknown>; created_at: string }>;
};

export async function listWeddingDecisions(weddingId: string): Promise<WeddingDecision[]> {
  await authorizeWeddingOperation(weddingId, "planning", "read");
  const supabase = await createSupabaseServerClient();
  const { data: decisions, error } = await supabase.from("decisions")
    .select("id, wedding_id, question, status, final_option_id, decision_maker_user_id, decision_date, reason, version, created_by_user_id, updated_by_user_id, created_at, updated_at")
    .eq("wedding_id", weddingId).order("updated_at", { ascending: false });
  if (error) throw new Error("Could not load wedding decisions.");
  if (!decisions?.length) return [];
  const ids = decisions.map((decision) => decision.id);
  const [optionsResult, preferencesResult, commentsResult, activityResult] = await Promise.all([
    supabase.from("decision_options").select("id, decision_id, label, position").eq("wedding_id", weddingId).in("decision_id", ids).order("position"),
    supabase.from("decision_preferences").select("decision_id, member_user_id, option_id, preference_note, updated_at").eq("wedding_id", weddingId).in("decision_id", ids),
    supabase.from("decision_comments").select("id, decision_id, body, author_user_id, created_at").eq("wedding_id", weddingId).in("decision_id", ids).order("created_at"),
    supabase.from("decision_activity").select("id, decision_id, actor_user_id, event_type, details, created_at").eq("wedding_id", weddingId).in("decision_id", ids).order("created_at", { ascending: false }),
  ]);
  for (const result of [optionsResult, preferencesResult, commentsResult, activityResult]) {
    if (result.error) throw new Error("Could not load decision details.");
  }
  const profileIds = [...new Set([
    ...decisions.map((decision) => decision.decision_maker_user_id).filter((id): id is string => Boolean(id)),
    ...(preferencesResult.data ?? []).map((row) => row.member_user_id),
    ...(commentsResult.data ?? []).map((row) => row.author_user_id),
    ...(activityResult.data ?? []).map((row) => row.actor_user_id).filter((id): id is string => Boolean(id)),
  ])];
  const { data: profiles, error: profileError } = profileIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", profileIds)
    : { data: [], error: null };
  if (profileError) throw new Error("Could not load decision authors.");
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name || "Wedding member"]));
  const optionsByDecision = groupBy(optionsResult.data ?? [], "decision_id");
  const commentsByDecision = groupBy(commentsResult.data ?? [], "decision_id");
  const activityByDecision = groupBy(activityResult.data ?? [], "decision_id");
  const optionById = new Map((optionsResult.data ?? []).map((option) => [option.id, option]));
  const preferencesByDecision = groupBy(preferencesResult.data ?? [], "decision_id");

  return decisions.map((decision) => ({
    ...(decision as Omit<WeddingDecision, "options" | "preferences" | "comments" | "activity">),
    decision_maker_name: decision.decision_maker_user_id ? names.get(decision.decision_maker_user_id) ?? "Wedding member" : null,
    options: (optionsByDecision.get(decision.id) ?? []) as WeddingDecision["options"],
    preferences: (preferencesByDecision.get(decision.id) ?? []).map((preference) => ({
      ...preference,
      member_name: names.get(preference.member_user_id) ?? "Wedding member",
      option_label: optionById.get(preference.option_id)?.label ?? "Option unavailable",
    })) as WeddingDecision["preferences"],
    comments: (commentsByDecision.get(decision.id) ?? []).map((comment) => ({
      ...comment, author_name: names.get(comment.author_user_id) ?? "Wedding member",
    })) as WeddingDecision["comments"],
    activity: (activityByDecision.get(decision.id) ?? []).map((event) => ({
      ...event, actor_name: event.actor_user_id ? names.get(event.actor_user_id) ?? "Wedding member" : "System",
    })) as WeddingDecision["activity"],
  }));
}

function groupBy<T extends Record<string, unknown>>(rows: T[], key: keyof T): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = String(row[key]);
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}

export async function createWeddingDecision(weddingId: string, input: unknown) {
  const values = decisionInputSchema.parse(input);
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_wedding_decision", {
    p_wedding_id: context.wedding.id,
    p_question: values.question,
    p_options: values.options,
  });
  if (error || !data) throw new Error("Could not create the decision.");
  return data as string;
}

export async function updateWeddingDecision(weddingId: string, input: unknown) {
  const values = decisionUpdateSchema.parse(input);
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  const supabase = await createSupabaseServerClient();
  const update = {
    question: values.question,
    status: values.status,
    final_option_id: values.status === "decided" ? values.finalOptionId : null,
    decision_maker_user_id: values.status === "decided" ? context.user.id : null,
    decision_date: values.status === "decided" ? values.decisionDate : null,
    reason: values.reason,
  };
  const { data, error } = await supabase.from("decisions").update(update)
    .eq("wedding_id", context.wedding.id).eq("id", values.decisionId).eq("version", values.version)
    .select("id, version").maybeSingle();
  if (error) throw new Error("Could not update the decision. Check the final option and status.");
  if (!data) {
    const { data: current, error: currentError } = await supabase.from("decisions").select("version")
      .eq("wedding_id", context.wedding.id).eq("id", values.decisionId).maybeSingle();
    if (currentError) throw new Error("Could not verify the latest decision version.");
    if (current) throw new DecisionEditConflictError();
    throw new Error("Decision not found or access was revoked.");
  }
  return data;
}

export async function addDecisionOption(weddingId: string, decisionId: string, label: string) {
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  const supabase = await createSupabaseServerClient();
  const { data: rows, error: readError } = await supabase.from("decision_options").select("position")
    .eq("wedding_id", context.wedding.id).eq("decision_id", decisionId).order("position", { ascending: false }).limit(1);
  if (readError) throw new Error("Could not load decision options.");
  const { error } = await supabase.from("decision_options").insert({
    wedding_id: context.wedding.id, decision_id: decisionId, label: label.trim(),
    position: (rows?.[0]?.position ?? -1) + 1,
  });
  if (error) throw new Error("Could not add this decision option.");
}

export async function saveDecisionPreference(weddingId: string, decisionId: string, optionId: string, note: string) {
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("decision_preferences").upsert({
    wedding_id: context.wedding.id,
    decision_id: decisionId,
    member_user_id: context.user.id,
    option_id: optionId,
    preference_note: note.trim(),
  }, { onConflict: "wedding_id,decision_id,member_user_id" });
  if (error) throw new Error("Could not save your preference.");
}

export async function addDecisionComment(weddingId: string, decisionId: string, body: string) {
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("decision_comments").insert({
    wedding_id: context.wedding.id,
    decision_id: decisionId,
    body: body.trim(),
  });
  if (error) throw new Error("Could not add the decision comment.");
}
