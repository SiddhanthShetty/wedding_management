"use server";

import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import {
  addDecisionComment, addDecisionOption, createWeddingDecision,
  DecisionEditConflictError, saveDecisionPreference, updateWeddingDecision,
} from "@/lib/data/decisions";
import { decisionInputSchema, decisionUpdateSchema } from "@/lib/planning/decision-inputs";

export type DecisionFormState = { error?: string; message?: string; savedId?: string };

const value = (formData: FormData, key: string) => {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry : "";
};

function actionError(error: unknown) {
  if (error instanceof DecisionEditConflictError) return "Someone else changed this decision. Refresh and review the latest version before saving.";
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Check the decision details.";
  if (error instanceof AuthorizationDeniedError) return "You can no longer change this. Refresh the page, and ask the couple if it keeps happening.";
  return "The change could not be saved. No success was recorded; refresh and try again.";
}

export async function createDecisionAction(_previous: DecisionFormState, formData: FormData): Promise<DecisionFormState> {
  const weddingId = z.uuid().safeParse(value(formData, "weddingId"));
  const input = decisionInputSchema.safeParse({
    question: value(formData, "question"),
    options: value(formData, "options").split(/\r?\n/).map((option) => option.trim()).filter(Boolean),
  });
  if (!weddingId.success) return { error: "Something went wrong with this page. Refresh it and try again." };
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Add at least two unique options." };
  try {
    const decisionId = await createWeddingDecision(weddingId.data, input.data);
    revalidatePath("/decisions");
    return { message: "Decision created.", savedId: decisionId };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function updateDecisionAction(_previous: DecisionFormState, formData: FormData): Promise<DecisionFormState> {
  const input = decisionUpdateSchema.safeParse({
    decisionId: value(formData, "decisionId"),
    version: Number(value(formData, "version")),
    question: value(formData, "question"),
    status: value(formData, "status"),
    finalOptionId: value(formData, "finalOptionId"),
    decisionDate: value(formData, "decisionDate"),
    reason: value(formData, "reason"),
  });
  const weddingId = z.uuid().safeParse(value(formData, "weddingId"));
  if (!weddingId.success || !input.success) return { error: input.success ? "Something went wrong with this page. Refresh it and try again." : input.error.issues[0]?.message ?? "Check the decision details." };
  try {
    await updateWeddingDecision(weddingId.data, input.data);
    revalidatePath("/decisions");
    return { message: "Decision updated.", savedId: input.data.decisionId };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function addDecisionOptionAction(_previous: DecisionFormState, formData: FormData): Promise<DecisionFormState> {
  const weddingId = z.uuid().safeParse(value(formData, "weddingId"));
  const decisionId = z.uuid().safeParse(value(formData, "decisionId"));
  const label = z.string().trim().min(1).max(500).safeParse(value(formData, "label"));
  if (!weddingId.success || !decisionId.success || !label.success) return { error: "Enter a decision option under 500 characters." };
  try {
    await addDecisionOption(weddingId.data, decisionId.data, label.data);
    revalidatePath("/decisions");
    return { message: "Option added." };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function saveDecisionPreferenceAction(_previous: DecisionFormState, formData: FormData): Promise<DecisionFormState> {
  const weddingId = z.uuid().safeParse(value(formData, "weddingId"));
  const decisionId = z.uuid().safeParse(value(formData, "decisionId"));
  const optionId = z.uuid().safeParse(value(formData, "optionId"));
  const note = z.string().max(2000).safeParse(value(formData, "note"));
  if (!weddingId.success || !decisionId.success || !optionId.success || !note.success) return { error: "Choose an option and keep the note under 2,000 characters." };
  try {
    await saveDecisionPreference(weddingId.data, decisionId.data, optionId.data, note.data);
    revalidatePath("/decisions");
    return { message: "Your preference was saved." };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function addDecisionCommentAction(_previous: DecisionFormState, formData: FormData): Promise<DecisionFormState> {
  const weddingId = z.uuid().safeParse(value(formData, "weddingId"));
  const decisionId = z.uuid().safeParse(value(formData, "decisionId"));
  const body = z.string().trim().min(1).max(4000).safeParse(value(formData, "body"));
  if (!weddingId.success || !decisionId.success || !body.success) return { error: "Enter a decision comment under 4,000 characters." };
  try {
    await addDecisionComment(weddingId.data, decisionId.data, body.data);
    revalidatePath("/decisions");
    return { message: "Comment added." };
  } catch (error) {
    return { error: actionError(error) };
  }
}
