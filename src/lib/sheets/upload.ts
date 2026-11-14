import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError, AuthorizationDeniedError } from "@/lib/auth/access";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import { readSpreadsheet } from "@/lib/sheets/read";
import { SHEET_LIMITS, SheetRuleError, type RawSheet } from "@/lib/sheets/rules";

export const noStore = { "Cache-Control": "private, no-store, max-age=0" };
export const replyJson = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: noStore });

/**
 * Shared first steps of the Sheets upload routes: same origin, size before buffering, a file and a
 * wedding id, the caller allowed to add tables (checked by `authorize`), then the file read.
 */
export async function readUploadedSheets(request: Request, authorize: (weddingId: string) => Promise<void>):
  Promise<{ ok: true; form: FormData; weddingId: string; filename: string; file: File; sheets: RawSheet[] } | { ok: false; response: NextResponse }> {
  const fail = (status: number, message: string) => ({ ok: false as const, response: replyJson(status, { ok: false, message }) });
  if (!isSameOriginRequest(request.headers)) return fail(403, "Uploads must come from this app.");
  if (Number(request.headers.get("content-length") ?? 0) > SHEET_LIMITS.bytes + 64 * 1024) return fail(413, "Files can be up to 5 MB.");
  let form: FormData;
  try { form = await request.formData(); } catch { return fail(400, "The upload was incomplete. Try again."); }
  const file = form.get("file");
  const weddingId = z.uuid().safeParse(form.get("weddingId"));
  if (!(file instanceof File)) return fail(400, "Choose a file to upload.");
  if (!weddingId.success) return fail(400, "Refresh the page and try again.");
  try {
    await authorize(weddingId.data);
    if (file.size > SHEET_LIMITS.bytes) return fail(400, "Files can be up to 5 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== file.size) return fail(400, "The upload was incomplete. Try again.");
    const filename = file.name.replace(/[\u0000-\u001f\\/]/g, "").slice(0, 255) || "spreadsheet";
    return { ok: true, form, weddingId: weddingId.data, filename, file, sheets: await readSpreadsheet(bytes, filename) };
  } catch (error) {
    return { ok: false, response: errorResponse(error) };
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof SheetRuleError) return replyJson(400, { ok: false, message: error.message });
  if (error instanceof AuthenticationRequiredError) return replyJson(401, { ok: false, message: "Sign in again to upload." });
  if (error instanceof AuthorizationDeniedError) return replyJson(403, { ok: false, message: "You can't add tables. Ask the couple for Plan edit access." });
  return replyJson(500, { ok: false, message: "Something went wrong. Nothing was saved; try again." });
}
