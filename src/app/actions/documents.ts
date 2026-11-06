"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationDeniedError } from "@/lib/auth/access";
import { DocumentRuleError, purgeDocument, setDocumentArchived } from "@/lib/data/documents";

export type DocumentActionState = { error?: string; message?: string; at?: number };
const text = (form: FormData, key: string) => { const value = form.get(key); return typeof value === "string" ? value : ""; };

async function run(form: FormData, message: string, task: (weddingId: string, documentId: string) => Promise<void>): Promise<DocumentActionState> {
  const parsed = z.object({ weddingId: z.uuid(), documentId: z.uuid() }).safeParse({ weddingId: text(form, "weddingId"), documentId: text(form, "documentId") });
  if (!parsed.success) return { error: "Invalid document." };
  try {
    await task(parsed.data.weddingId, parsed.data.documentId);
    revalidatePath("/documents");
    return { message, at: Date.now() };
  } catch (error) {
    if (error instanceof DocumentRuleError) return { error: error.message };
    if (error instanceof AuthorizationDeniedError) return { error: "You do not have permission for this document." };
    return { error: error instanceof Error && /^(Stored files|Files were)/.test(error.message) ? error.message : "The change could not be saved. Refresh and try again." };
  }
}

export async function archiveDocumentAction(_state: DocumentActionState, form: FormData) {
  return run(form, "Document archived. It can be restored.", (weddingId, documentId) => setDocumentArchived(weddingId, documentId, true));
}
export async function restoreDocumentAction(_state: DocumentActionState, form: FormData) {
  return run(form, "Document restored.", (weddingId, documentId) => setDocumentArchived(weddingId, documentId, false));
}
export async function purgeDocumentAction(_state: DocumentActionState, form: FormData) {
  if (text(form, "confirm") !== "DELETE") return { error: "Type DELETE to confirm permanent deletion." };
  return run(form, "Stored files deleted permanently. The record is kept as history.", purgeDocument);
}
