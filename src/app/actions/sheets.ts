"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { deleteSheet, renameSheet } from "@/lib/data/sheets";
import { SheetRuleError, tableNameSchema } from "@/lib/sheets/rules";

export type SheetActionState = { error?: string; message?: string; at?: number };
const text = (form: FormData, key: string) => { const value = form.get(key); return typeof value === "string" ? value : ""; };
const ids = (form: FormData) => z.object({ weddingId: z.uuid(), tableId: z.uuid() }).safeParse({ weddingId: text(form, "weddingId"), tableId: text(form, "tableId") });

function failure(error: unknown): SheetActionState {
  if (error instanceof SheetRuleError) return { error: error.message };
  if (error instanceof AuthorizationDeniedError) return { error: "You can't change tables. Ask the couple for Plan edit access." };
  return { error: "Couldn't save this change. Nothing was changed; refresh and try again." };
}

export async function renameSheetAction(_state: SheetActionState, form: FormData): Promise<SheetActionState> {
  const parsed = ids(form);
  if (!parsed.success) return { error: "Refresh the page and try again." };
  const name = tableNameSchema.safeParse(text(form, "name"));
  if (!name.success) return { error: name.error.issues[0]?.message ?? "Check the name." };
  try {
    await renameSheet(parsed.data.weddingId, parsed.data.tableId, name.data);
  } catch (error) { return failure(error); }
  revalidatePath("/sheets");
  revalidatePath(`/sheets/${parsed.data.tableId}`);
  return { message: "Renamed.", at: Date.now() };
}

export async function deleteSheetAction(_state: SheetActionState, form: FormData): Promise<SheetActionState> {
  const parsed = ids(form);
  if (!parsed.success) return { error: "Refresh the page and try again." };
  try {
    await deleteSheet(parsed.data.weddingId, parsed.data.tableId);
  } catch (error) { return failure(error); }
  revalidatePath("/sheets");
  redirect("/sheets?deleted=1");
}
