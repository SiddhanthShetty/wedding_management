import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError, AuthorizationDeniedError } from "@/lib/auth/access";
import { DocumentRuleError, uploadDocument, type DocumentEntity } from "@/lib/data/documents";
import { MAX_DOCUMENT_BYTES } from "@/lib/documents/file-type";
import { isSameOriginRequest } from "@/lib/http/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const reply = (status: number, body: { ok: boolean; message: string }) => NextResponse.json(body, { status, headers });
const entities = ["wedding", "function", "supplier", "supplier_quote", "booking", "booking_transaction", "guest_household", "schedule_item", "arrangement"] as const;

/** Upload one document version. Same-origin only; size and type are checked on the server. */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return reply(403, { ok: false, message: "Uploads must come from this app." });
  // Reject oversized bodies before buffering them (multipart adds a little overhead).
  if (Number(request.headers.get("content-length") ?? 0) > MAX_DOCUMENT_BYTES + 64 * 1024) return reply(413, { ok: false, message: "Files can be up to 8 MB." });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return reply(400, { ok: false, message: "Choose a file to upload." });
    const fields = z.object({
      weddingId: z.uuid(), documentId: z.union([z.uuid(), z.literal("")]), entityType: z.enum(entities),
      entityId: z.union([z.uuid(), z.literal("")]), title: z.string().trim().max(200), category: z.string().trim().max(80),
    }).safeParse(Object.fromEntries(["weddingId", "documentId", "entityType", "entityId", "title", "category"].map((key) => [key, typeof form.get(key) === "string" ? form.get(key) : ""])));
    if (!fields.success) return reply(400, { ok: false, message: "Choose what the document belongs to and try again." });
    const entityType = fields.data.entityType as DocumentEntity;
    if ((entityType === "wedding") !== (fields.data.entityId === "")) return reply(400, { ok: false, message: "Choose a record for this document." });
    const result = await uploadDocument({ weddingId: fields.data.weddingId, documentId: fields.data.documentId || null, entityType, entityId: fields.data.entityId || null, title: fields.data.title, category: fields.data.category, file });
    return reply(201, { ok: true, message: `Uploaded ${result.filename} (${result.label}). Not malware-scanned.` });
  } catch (error) {
    if (error instanceof DocumentRuleError) return reply(400, { ok: false, message: error.message });
    if (error instanceof AuthenticationRequiredError) return reply(401, { ok: false, message: "Sign in again to upload." });
    if (error instanceof AuthorizationDeniedError) return reply(403, { ok: false, message: "You can't add files to that." });
    return reply(500, { ok: false, message: error instanceof Error && error.message.startsWith("The file") ? error.message : "The upload failed. Nothing was saved as available." });
  }
}
