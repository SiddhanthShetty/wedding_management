"use server";

import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import {
  archiveWeddingFunction,
  createWeddingFunction,
  updateWeddingFunction,
} from "@/lib/data/functions";
import { AuthorizationDeniedError } from "@/lib/auth/access";

export type FunctionFormState = { error?: string; message?: string; savedId?: string };

function functionFormValues(formData: FormData) {
  return {
    name: formData.get("name"),
    functionType: formData.get("functionType"),
    functionDate: formData.get("functionDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    venueName: formData.get("venueName"),
    guestMapUrl: formData.get("guestMapUrl"),
    status: formData.get("status"),
    expectedAttendance: formData.get("expectedAttendance"),
    budgetAllocation: formData.get("budgetAllocation"),
    coordinatorName: formData.get("coordinatorName"),
    dressCode: formData.get("dressCode"),
    notes: formData.get("notes"),
  };
}

function getActionError(error: unknown) {
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Check the function details.";
  if (error instanceof Error && /time|date|timezone/i.test(error.message)) return error.message;
  if (error instanceof AuthorizationDeniedError) return "Your planning edit access is no longer available. Refresh and try again.";
  return "The function could not be saved. No changes were confirmed; refresh and try again.";
}

export async function createFunctionAction(_previous: FunctionFormState, formData: FormData): Promise<FunctionFormState> {
  const weddingId = z.uuid().safeParse(formData.get("weddingId"));
  if (!weddingId.success) return { error: "Invalid wedding workspace." };
  try {
    const created = await createWeddingFunction(weddingId.data, functionFormValues(formData));
    revalidatePath("/functions");
    return { message: "Function saved.", savedId: created.id };
  } catch (error) {
    return { error: getActionError(error) };
  }
}

export async function updateFunctionAction(_previous: FunctionFormState, formData: FormData): Promise<FunctionFormState> {
  const weddingId = z.uuid().safeParse(formData.get("weddingId"));
  const functionId = z.uuid().safeParse(formData.get("functionId"));
  if (!weddingId.success || !functionId.success) return { error: "Invalid function selection." };
  try {
    const updated = await updateWeddingFunction(weddingId.data, functionId.data, functionFormValues(formData));
    revalidatePath("/functions");
    return { message: "Function details saved.", savedId: updated.id };
  } catch (error) {
    return { error: getActionError(error) };
  }
}

export async function archiveFunctionAction(_previous: FunctionFormState, formData: FormData): Promise<FunctionFormState> {
  const weddingId = z.uuid().safeParse(formData.get("weddingId"));
  const functionId = z.uuid().safeParse(formData.get("functionId"));
  if (!weddingId.success || !functionId.success) return { error: "Invalid function selection." };
  try {
    await archiveWeddingFunction(weddingId.data, functionId.data);
    revalidatePath("/functions");
    return { message: "Function archived." };
  } catch (error) {
    return { error: getActionError(error) };
  }
}
