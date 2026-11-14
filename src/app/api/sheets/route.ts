import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createSheet, requireSheetEditor } from "@/lib/data/sheets";
import { uploadDocument } from "@/lib/data/documents";
import { errorResponse, readUploadedSheets, replyJson } from "@/lib/sheets/upload";
import { buildTable, importChoiceSchema } from "@/lib/sheets/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creates a table from the uploaded file and the choices made in the preview. The rows are read
 * from the file again here (never taken from the browser), then saved all or nothing. The original
 * file is kept in All files.
 */
export async function POST(request: NextRequest) {
  const upload = await readUploadedSheets(request, requireSheetEditor);
  if (!upload.ok) return upload.response;
  let raw: unknown;
  try { raw = JSON.parse(String(upload.form.get("choice") ?? "")); } catch { raw = null; }
  const choice = importChoiceSchema.safeParse(raw);
  if (!choice.success) return replyJson(400, { ok: false, message: choice.error.issues[0]?.message ?? "Check the table's name and columns." });
  try {
    const table = buildTable(upload.sheets, choice.data);
    const id = await createSheet(upload.weddingId, { name: choice.data.name, sourceFilename: upload.filename, sourceSheet: upload.sheets[choice.data.sheetIndex]?.name ?? "", columns: table.columns, rows: table.rows });
    let kept = true;
    try { await uploadDocument({ weddingId: upload.weddingId, documentId: null, entityType: "wedding", entityId: null, title: choice.data.name, category: "Sheets", file: upload.file }); }
    catch { kept = false; }
    revalidatePath("/sheets");
    const count = table.rows.length.toLocaleString("en-IN");
    return replyJson(201, { ok: true, id, message: `Added "${choice.data.name}" with ${count} row${table.rows.length === 1 ? "" : "s"}.${kept ? " The original file is in All files." : " The original file couldn't be kept in All files."}` });
  } catch (error) {
    return errorResponse(error);
  }
}
