import { z } from "zod";
import { protectSpreadsheetCell } from "@/lib/planning/guest-csv";

/**
 * Sheets: rules for turning an uploaded spreadsheet into a table. Pure functions, used by the
 * server (reading files, saving tables) and the browser (showing and filtering rows).
 */

export const SHEET_LIMITS = {
  /** Uploaded file size. */
  bytes: 5 * 1024 * 1024,
  /** Size of an .xlsx file once unzipped (guards against "zip bombs"). */
  unzippedBytes: 60 * 1024 * 1024,
  sheets: 30,
  rows: 2000,
  columns: 50,
  cellChars: 2000,
  /** All the table's text together, so a table always loads quickly. */
  totalChars: 3_000_000,
  previewRows: 20,
} as const;

export const COLUMN_TYPES = ["text", "number", "date", "boolean", "link"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];
export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = { text: "Text", number: "Number", date: "Date", boolean: "Yes / no", link: "Link" };

export type SheetColumn = { id: string; name: string; type: ColumnType };
export type Cell = string | number | boolean | null;
/** A cell as it comes out of a file. */
export type RawCell = string | number | boolean | Date | null | undefined;
export type RawSheet = { name: string; rows: RawCell[][] };

/** A problem the planner can fix (shown as written). */
export class SheetRuleError extends Error { constructor(message: string) { super(message); this.name = "SheetRuleError"; } }

const columnLetter = (index: number) => { let n = index + 1; let out = ""; while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); } return out; };
const isBlank = (value: RawCell) => value === null || value === undefined || (typeof value === "string" && value.trim() === "");
const clean = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();

/** Drops empty rows and empty trailing columns. Returns the rows and the width. */
export function tidyGrid(rows: RawCell[][]): { rows: RawCell[][]; width: number } {
  const kept = rows.filter((row) => Array.isArray(row) && row.some((cell) => !isBlank(cell)));
  let width = 0;
  for (const row of kept) for (let i = row.length - 1; i >= width; i -= 1) if (!isBlank(row[i])) { width = i + 1; break; }
  return { rows: kept.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? null)), width };
}

/** Column names from the header row (or letters): blanks get "Column C", repeats get "Name (2)". */
export function columnNames(header: RawCell[] | null, width: number): string[] {
  const seen = new Map<string, number>();
  return Array.from({ length: width }, (_, index) => {
    const raw = header ? header[index] : null;
    const text = raw instanceof Date ? isoDate(raw) : clean(String(raw ?? "")).replace(/[<>]/g, "").replace(/\s+/g, " ");
    const base = (text || `Column ${columnLetter(index)}`).slice(0, 72);
    const key = base.toLocaleLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

const isoDate = (date: Date) => `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
const URL_PATTERN = /^https?:\/\/[^\s<>"]+$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 2200 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? isoDate(date) : null;
}

/** "12,500", "₹ 1,200.50", "-3" → number. Anything else → null. */
function parseNumber(text: string): number | null {
  const stripped = text.replace(/^[₹$€£]\s*/, "").replace(/,/g, "").replace(/^Rs\.?\s*/i, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) return null;
  const value = Number(stripped);
  return Number.isFinite(value) ? value : null;
}

/** 2027-12-05 or 05/12/2027 (day first, as in India) → "2027-12-05". */
function parseDate(text: string): string | null {
  const iso = ISO_DATE.exec(text);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = DMY_DATE.exec(text);
  if (dmy) return validDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  return null;
}

const YES = new Set(["yes", "y", "true", "1"]);
const NO = new Set(["no", "n", "false", "0"]);

/** Converts one value to the column's type. `ok: false` when it doesn't fit. Empty is always fine. */
export function toCell(raw: RawCell, type: ColumnType): { ok: true; value: Cell } | { ok: false } {
  if (isBlank(raw)) return { ok: true, value: null };
  const text = raw instanceof Date ? isoDate(raw) : clean(String(raw));
  if (text.length > SHEET_LIMITS.cellChars) return { ok: false };
  switch (type) {
    case "text": return { ok: true, value: text };
    case "number": {
      if (typeof raw === "number") return Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false };
      const value = parseNumber(text);
      return value === null ? { ok: false } : { ok: true, value };
    }
    case "date": {
      if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? { ok: false } : { ok: true, value: isoDate(raw) };
      const value = parseDate(text);
      return value === null ? { ok: false } : { ok: true, value };
    }
    case "boolean": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      const key = text.toLocaleLowerCase();
      return YES.has(key) ? { ok: true, value: true } : NO.has(key) ? { ok: true, value: false } : { ok: false };
    }
    case "link": return URL_PATTERN.test(text) ? { ok: true, value: text } : { ok: false };
  }
}

/** The narrowest type every filled cell fits, else text. */
export function guessType(values: RawCell[]): ColumnType {
  const filled = values.filter((value) => !isBlank(value));
  if (!filled.length) return "text";
  for (const type of ["date", "number", "boolean", "link"] as const) {
    // Text such as "1" and "0" fits numbers better than yes/no; only real true/false or words count as yes/no.
    if (type === "boolean" && !filled.every((value) => typeof value === "boolean" || /^(yes|no|y|n|true|false)$/i.test(String(value).trim()))) continue;
    if (type === "date" && !filled.every((value) => value instanceof Date || (typeof value === "string" && parseDate(value.trim()) !== null))) continue;
    if (filled.every((value) => toCell(value, type).ok)) return type;
  }
  return "text";
}

export type SheetChoice = { sheetIndex: number; headerRow: boolean };

/** What the preview shows: every sheet's name, and for the chosen sheet its columns and first rows. */
export function previewSheet(sheets: RawSheet[], choice: SheetChoice) {
  const sheet = sheets[choice.sheetIndex];
  if (!sheet) throw new SheetRuleError("That sheet isn't in the file. Choose another.");
  const { rows, width } = tidyGrid(sheet.rows);
  if (!width) return { sheets: sheets.map((s) => s.name), sheetName: sheet.name, columns: [] as SheetColumn[], rows: [] as RawCell[][], totalRows: 0 };
  const header = choice.headerRow ? rows[0]! : null;
  const body = choice.headerRow ? rows.slice(1) : rows;
  const names = columnNames(header, width);
  const columns = names.map((name, index): SheetColumn => ({ id: `c${index + 1}`, name, type: guessType(body.map((row) => row[index])) }));
  return { sheets: sheets.map((s) => s.name), sheetName: sheet.name, columns, rows: body.slice(0, SHEET_LIMITS.previewRows), totalRows: body.length };
}

const columnInput = z.object({ name: z.string().trim().min(1, "Give every column a name.").max(80, "Column names can be up to 80 characters.").refine((value) => !/[<>]/.test(value), "Column names can't contain < or >."), type: z.enum(COLUMN_TYPES) });
export const tableNameSchema = z.string().trim().min(1, "Give the table a name.").max(120, "Table names can be up to 120 characters.").refine((value) => !/[<>]/.test(value), "Table names can't contain < or >.");
/** What the planner chose in the preview. */
export const importChoiceSchema = z.object({
  name: tableNameSchema,
  sheetIndex: z.number().int().min(0).max(SHEET_LIMITS.sheets - 1),
  headerRow: z.boolean(),
  columns: z.array(columnInput).min(1).max(SHEET_LIMITS.columns),
});
export type ImportChoice = z.infer<typeof importChoiceSchema>;

/**
 * Builds the table to save from the file and the planner's choices. All or nothing: any cell that
 * doesn't fit its column's type stops the import with a message naming the row and column.
 */
export function buildTable(sheets: RawSheet[], choice: ImportChoice): { columns: SheetColumn[]; rows: Array<Record<string, Cell>> } {
  const sheet = sheets[choice.sheetIndex];
  if (!sheet) throw new SheetRuleError("That sheet isn't in the file. Choose another.");
  const { rows, width } = tidyGrid(sheet.rows);
  if (!width) throw new SheetRuleError("This sheet is empty.");
  if (width > SHEET_LIMITS.columns) throw new SheetRuleError(`This sheet has ${width} columns; a table can have up to ${SHEET_LIMITS.columns}.`);
  if (choice.columns.length !== width) throw new SheetRuleError("The file's columns changed. Choose the file again.");
  const lower = choice.columns.map((column) => column.name.toLocaleLowerCase());
  const repeat = lower.findIndex((name, index) => lower.indexOf(name) !== index);
  if (repeat >= 0) throw new SheetRuleError(`Two columns are called "${choice.columns[repeat]!.name}". Give each column its own name.`);
  const body = choice.headerRow ? rows.slice(1) : rows;
  if (body.length > SHEET_LIMITS.rows) throw new SheetRuleError(`This sheet has ${body.length.toLocaleString("en-IN")} rows; a table can hold up to ${SHEET_LIMITS.rows.toLocaleString("en-IN")}. Split it into smaller sheets.`);
  const columns = choice.columns.map((column, index): SheetColumn => ({ id: `c${index + 1}`, name: column.name, type: column.type }));
  const firstRow = choice.headerRow ? 2 : 1;
  let chars = 0;
  const out = body.map((row, rowIndex) => {
    const cells: Record<string, Cell> = {};
    columns.forEach((column, index) => {
      const raw = row[index];
      if (!isBlank(raw) && String(raw instanceof Date ? "" : raw).trim().length > SHEET_LIMITS.cellChars) throw new SheetRuleError(`Row ${rowIndex + firstRow}, "${column.name}" is longer than ${SHEET_LIMITS.cellChars.toLocaleString("en-IN")} characters.`);
      const cell = toCell(raw, column.type);
      if (!cell.ok) throw new SheetRuleError(`Row ${rowIndex + firstRow}, "${column.name}": "${clean(String(raw)).slice(0, 40)}" isn't ${typeWithArticle(column.type)}. Change the column to Text, or fix the file.`);
      if (cell.value !== null) { cells[column.id] = cell.value; chars += String(cell.value).length; }
    });
    return cells;
  });
  if (chars > SHEET_LIMITS.totalChars) throw new SheetRuleError("This sheet holds too much text for one table. Split it into smaller sheets.");
  return { columns, rows: out };
}

const typeWithArticle = (type: ColumnType) => ({ text: "text", number: "a number", date: "a date (like 2027-12-05 or 05/12/2027)", boolean: "yes or no", link: "a web link starting with http:// or https://" })[type];

/** How a cell reads on screen and in CSV. */
export function cellText(value: Cell | undefined, type: ColumnType): string {
  if (value === null || value === undefined) return "";
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "number" && typeof value === "number") return value.toLocaleString("en-IN", { maximumFractionDigits: 6 });
  if (type === "date" && typeof value === "string") {
    const match = ISO_DATE.exec(value);
    if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }
  return String(value);
}

export type SheetRow = { id: string; position: number; cells: Record<string, Cell> };

/** Rows whose text in any column contains the search (any case). */
export function searchRows(rows: SheetRow[], columns: SheetColumn[], query: string): SheetRow[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => columns.some((column) => cellText(row.cells[column.id], column.type).toLocaleLowerCase().includes(needle) || String(row.cells[column.id] ?? "").toLocaleLowerCase().includes(needle)));
}

/** Sorted by one column; empty cells always last. Stable, so equal values keep the file's order. */
export function sortRows(rows: SheetRow[], column: SheetColumn | null, direction: "asc" | "desc"): SheetRow[] {
  if (!column) return [...rows].sort((a, b) => a.position - b.position);
  const sign = direction === "asc" ? 1 : -1;
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const x = a.row.cells[column.id] ?? null;
    const y = b.row.cells[column.id] ?? null;
    if (x === null || y === null) return x === y ? a.index - b.index : x === null ? 1 : -1;
    const order = typeof x === "number" && typeof y === "number" ? x - y
      : typeof x === "boolean" && typeof y === "boolean" ? Number(x) - Number(y)
      : String(x).localeCompare(String(y), "en-IN", { numeric: true, sensitivity: "base" });
    return order === 0 ? a.index - b.index : order * sign;
  }).map(({ row }) => row);
}

/** CSV of the table; cells starting with = + - @ are defused for spreadsheets. */
export function tableCsv(columns: SheetColumn[], rows: SheetRow[]): string {
  const cell = (value: Cell | undefined) => typeof value === "number" ? String(value) : protectSpreadsheetCell(typeof value === "boolean" ? (value ? "Yes" : "No") : value ?? "");
  return [columns.map((column) => protectSpreadsheetCell(column.name)).join(","), ...rows.map((row) => columns.map((column) => cell(row.cells[column.id])).join(","))].join("\r\n");
}

/** Rows for the .xlsx download: dates as real dates, numbers as numbers, everything else as text (never formulas). */
export function tableSheetData(columns: SheetColumn[], rows: SheetRow[]) {
  return [columns.map((column) => ({ value: column.name, fontWeight: "bold" as const })),
    ...rows.map((row) => columns.map((column) => {
      const value = row.cells[column.id] ?? null;
      if (value === null) return null;
      if (column.type === "number" && typeof value === "number") return { value, type: Number };
      if (column.type === "boolean" && typeof value === "boolean") return { value, type: Boolean };
      if (column.type === "date" && typeof value === "string" && ISO_DATE.test(value)) return { value: new Date(`${value}T00:00:00Z`), type: Date, format: "dd mmm yyyy" };
      return { value: String(value), type: String };
    }))];
}

/** A safe download name: letters, numbers, spaces, dashes. */
export function downloadName(name: string, extension: "csv" | "xlsx") {
  return `${name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-").slice(0, 80) || "table"}.${extension}`;
}
