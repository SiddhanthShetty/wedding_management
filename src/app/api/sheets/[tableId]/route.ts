import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import writeExcelFile from "write-excel-file/node";
import { AuthenticationRequiredError, requireCurrentWorkspace } from "@/lib/auth/access";
import { getSheet } from "@/lib/data/sheets";
import { downloadName, tableCsv, tableSheetData } from "@/lib/sheets/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

/** Downloads a table as .xlsx (default) or CSV, after the database confirms read access. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tableId: string }> }) {
  const id = z.uuid().safeParse((await params).tableId);
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  if (!id.success) return new NextResponse("Not found", { status: 404, headers });
  try {
    const workspace = await requireCurrentWorkspace();
    const sheet = await getSheet(workspace.wedding.id, id.data);
    // Same answer for missing and forbidden tables.
    if (!sheet) return new NextResponse("Not found", { status: 404, headers });
    const name = downloadName(sheet.table.name, format);
    const disposition = `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
    if (format === "csv") return new NextResponse(`﻿${tableCsv(sheet.table.columns, sheet.rows)}`, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disposition } });
    const file = await writeExcelFile(tableSheetData(sheet.table.columns, sheet.rows) as never, { sheet: sheet.table.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1" } as never).toBuffer();
    return new NextResponse(new Uint8Array(file), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": disposition } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return new NextResponse("Sign in required", { status: 401, headers });
    if (error && typeof error === "object" && "digest" in error) throw error;
    return new NextResponse("Not found", { status: 404, headers });
  }
}
