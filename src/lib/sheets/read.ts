import "server-only";

import { unzipSync } from "fflate";
import readExcelFile from "read-excel-file/node";
import { detectFileType } from "@/lib/documents/file-type";
import { csvRecords } from "@/lib/planning/guest-csv";
import { SHEET_LIMITS, SheetRuleError, type RawSheet } from "@/lib/sheets/rules";

const OLD_EXCEL = [0xd0, 0xcf, 0x11, 0xe0];

/**
 * Reads an uploaded .xlsx or .csv file into sheets of raw cells. The type is detected from the
 * file's content (not its name or the browser's word), and an .xlsx file's unzipped size is
 * checked before it is opened. The bytes are only ever passed as a Buffer: a string would be read
 * as a file path.
 */
export async function readSpreadsheet(bytes: Uint8Array, filename: string): Promise<RawSheet[]> {
  if (bytes.byteLength === 0) throw new SheetRuleError("The file is empty.");
  if (bytes.byteLength > SHEET_LIMITS.bytes) throw new SheetRuleError("Files can be up to 5 MB.");
  if (OLD_EXCEL.every((value, index) => bytes[index] === value)) throw new SheetRuleError("This is an older Excel file (.xls). Open it in Excel, choose Save As → Excel Workbook (.xlsx), and upload that.");
  const detected = detectFileType(bytes, filename);
  const title = filename.replace(/\.[^.]+$/, "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 120) || "Sheet 1";

  if (detected?.mime === "text/csv") {
    let records: string[][];
    try { records = csvRecords(new TextDecoder("utf-8").decode(bytes)); }
    catch { throw new SheetRuleError("This CSV has a quote that's never closed. Check the file and try again."); }
    return [{ name: title, rows: records }];
  }

  if (detected?.mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    let unzipped = 0;
    try {
      // Reads the sizes from the zip's directory without unpacking anything.
      unzipSync(bytes, { filter: (file) => { unzipped += file.originalSize; if (unzipped > SHEET_LIMITS.unzippedBytes) throw new SheetRuleError("too big"); return false; } });
    } catch (error) {
      if (error instanceof SheetRuleError) throw new SheetRuleError("This workbook is too large to open here. Save the sheet you need in a file of its own and upload that.");
      throw new SheetRuleError("This file couldn't be opened as an Excel workbook. Open it in Excel, save it again as .xlsx, and upload that.");
    }
    let sheets: Array<{ sheet: string; data: unknown[][] }>;
    try { sheets = await readExcelFile(Buffer.from(bytes)) as Array<{ sheet: string; data: unknown[][] }>; }
    catch { throw new SheetRuleError("This file couldn't be opened as an Excel workbook. Open it in Excel, save it again as .xlsx, and upload that."); }
    if (sheets.length > SHEET_LIMITS.sheets) throw new SheetRuleError(`This workbook has ${sheets.length} sheets; up to ${SHEET_LIMITS.sheets} can be opened. Save the sheet you need in a file of its own.`);
    return sheets.map((sheet, index) => ({ name: String(sheet.sheet ?? "").slice(0, 120) || `Sheet ${index + 1}`, rows: sheet.data as RawSheet["rows"] }));
  }

  throw new SheetRuleError("Upload an Excel workbook (.xlsx) or a CSV file.");
}
