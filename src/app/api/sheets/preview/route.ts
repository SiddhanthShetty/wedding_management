import { NextRequest } from "next/server";
import { requireSheetEditor } from "@/lib/data/sheets";
import { errorResponse, readUploadedSheets, replyJson } from "@/lib/sheets/upload";
import { previewSheet, toCell, type RawCell } from "@/lib/sheets/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reads the file and returns its sheets, the chosen sheet's columns and its first rows. Saves nothing. */
export async function POST(request: NextRequest) {
  const upload = await readUploadedSheets(request, requireSheetEditor);
  if (!upload.ok) return upload.response;
  try {
    const sheetIndex = Math.max(0, Math.min(Number(upload.form.get("sheetIndex") ?? 0) || 0, upload.sheets.length - 1));
    const headerRow = upload.form.get("headerRow") !== "false";
    const preview = previewSheet(upload.sheets, { sheetIndex, headerRow });
    // Shown as text: dates as 2027-12-05, everything else as written.
    const show = (cell: RawCell) => { const value = toCell(cell, "text"); return value.ok ? String(value.value ?? "") : String(cell ?? "").slice(0, 200); };
    return replyJson(200, {
      ok: true, filename: upload.filename, sheetIndex, headerRow, sheets: preview.sheets, sheetName: preview.sheetName,
      columns: preview.columns, rows: preview.rows.map((row) => row.map(show)), totalRows: preview.totalRows,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
