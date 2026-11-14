/** Sheets: reading files, column names and types, the all-or-nothing import, search, sort and downloads. */
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync, zipSync } from "fflate";
import writeExcelFile from "write-excel-file/node";
import readExcelFile from "read-excel-file/node";
import { readSpreadsheet } from "../src/lib/sheets/read";
import { buildTable, cellText, columnNames, downloadName, guessType, importChoiceSchema, previewSheet, searchRows, SHEET_LIMITS, SheetRuleError, sortRows, tableCsv, tableSheetData, tidyGrid, toCell, type RawSheet, type SheetColumn, type SheetRow } from "../src/lib/sheets/rules";

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const vendors: RawSheet = { name: "Vendors", rows: [
  ["Vendor", "Booked on", "Amount", "Paid", "Website", null],
  ["Florist", date("2027-12-05"), 12500, true, "https://flowers.example", null],
  [null, null, null, null, null, null],
  ["Caterer", "06/12/2027", "₹ 1,20,000", "no", "", ""],
] };
const choice = (overrides: Partial<{ name: string; sheetIndex: number; headerRow: boolean; columns: Array<{ name: string; type: SheetColumn["type"] }> }> = {}) => importChoiceSchema.parse({
  name: "Vendors", sheetIndex: 0, headerRow: true,
  columns: [{ name: "Vendor", type: "text" }, { name: "Booked on", type: "date" }, { name: "Amount", type: "number" }, { name: "Paid", type: "boolean" }, { name: "Website", type: "link" }],
  ...overrides,
});
const bytes = (text: string) => new TextEncoder().encode(text);

describe("tidying and naming", () => {
  it("drops empty rows and empty trailing columns", () => {
    const { rows, width } = tidyGrid(vendors.rows);
    expect(width).toBe(5);
    expect(rows).toHaveLength(3);
    expect(tidyGrid([[null, " "], []])).toEqual({ rows: [], width: 0 });
  });

  it("fills blank names with the column letter and numbers repeats", () => {
    expect(columnNames(["Name", "", "name", "<b>Paid</b>", null], 6)).toEqual(["Name", "Column B", "name (2)", "bPaid/b", "Column E", "Column F"]);
    expect(columnNames(null, 28).slice(25)).toEqual(["Column Z", "Column AA", "Column AB"]);
  });
});

describe("column types", () => {
  it("guesses the narrowest type that fits every filled cell", () => {
    expect(guessType([date("2027-12-05"), "06/12/2027", null])).toBe("date");
    expect(guessType([12500, "₹ 1,20,000", ""])).toBe("number");
    expect(guessType([true, "no", "Yes"])).toBe("boolean");
    expect(guessType([1, 0])).toBe("number");
    expect(guessType(["https://a.example", "http://b.example/x"])).toBe("link");
    expect(guessType(["Florist", 3])).toBe("text");
    expect(guessType([null, ""])).toBe("text");
  });

  it("converts cells, reading dates day first, and refuses what doesn't fit", () => {
    expect(toCell("31/12/2027", "date")).toEqual({ ok: true, value: "2027-12-31" });
    expect(toCell("31/02/2027", "date")).toEqual({ ok: false });
    expect(toCell("12/31/2027", "date")).toEqual({ ok: false });
    expect(toCell("Rs. 2,500.50", "number")).toEqual({ ok: true, value: 2500.5 });
    expect(toCell("12 people", "number")).toEqual({ ok: false });
    expect(toCell("Y", "boolean")).toEqual({ ok: true, value: true });
    expect(toCell("javascript:alert(1)", "link")).toEqual({ ok: false });
    expect(toCell("  ", "number")).toEqual({ ok: true, value: null });
    expect(toCell("a\u0000b", "text")).toEqual({ ok: true, value: "ab" });
    expect(toCell("x".repeat(SHEET_LIMITS.cellChars + 1), "text")).toEqual({ ok: false });
  });
});

describe("preview", () => {
  it("lists sheets, names and types the columns, and counts rows below the header", () => {
    const preview = previewSheet([vendors, { name: "Empty", rows: [] }], { sheetIndex: 0, headerRow: true });
    expect(preview.sheets).toEqual(["Vendors", "Empty"]);
    expect(preview.columns.map((c) => [c.id, c.name, c.type])).toEqual([["c1", "Vendor", "text"], ["c2", "Booked on", "date"], ["c3", "Amount", "number"], ["c4", "Paid", "boolean"], ["c5", "Website", "link"]]);
    expect(preview.totalRows).toBe(2);
    expect(previewSheet([vendors], { sheetIndex: 0, headerRow: false }).columns[0]!.name).toBe("Column A");
    expect(previewSheet([vendors, { name: "Empty", rows: [] }], { sheetIndex: 1, headerRow: true }).columns).toEqual([]);
    expect(() => previewSheet([vendors], { sheetIndex: 3, headerRow: true })).toThrow(SheetRuleError);
  });
});

describe("building the table (all or nothing)", () => {
  it("saves typed cells keyed by column id and leaves empty cells out", () => {
    const table = buildTable([vendors], choice());
    expect(table.columns.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect(table.rows).toEqual([
      { c1: "Florist", c2: "2027-12-05", c3: 12500, c4: true, c5: "https://flowers.example" },
      { c1: "Caterer", c2: "2027-12-06", c3: 120000, c4: false },
    ]);
  });

  it("names the row and column of a cell that doesn't fit", () => {
    const columns = choice().columns.map((c) => c.name === "Vendor" ? { ...c, type: "number" as const } : c);
    expect(() => buildTable([vendors], choice({ columns }))).toThrow(/Row 2, "Vendor": "Florist" isn't a number/);
    expect(() => buildTable([vendors], choice({ headerRow: false }))).toThrow(/Row 1, "Booked on": "Booked on" isn't a date/);
  });

  it("refuses repeated names, changed columns, too many rows or too much text", () => {
    const repeated = choice().columns.map((c, i) => i === 1 ? { ...c, name: "VENDOR" } : c);
    expect(() => buildTable([vendors], choice({ columns: repeated }))).toThrow(/Two columns are called/);
    expect(() => buildTable([vendors], choice({ columns: choice().columns.slice(0, 4) }))).toThrow(/columns changed/);
    const many: RawSheet = { name: "Big", rows: [["A"], ...Array.from({ length: SHEET_LIMITS.rows + 1 }, (_, i) => [`r${i}`])] };
    expect(() => buildTable([many], choice({ columns: [{ name: "A", type: "text" }] }))).toThrow(/2,001 rows; a table can hold up to 2,000/);
    const heavy: RawSheet = { name: "Heavy", rows: [["A"], ...Array.from({ length: 1600 }, () => ["x".repeat(1900)])] };
    expect(() => buildTable([heavy], choice({ columns: [{ name: "A", type: "text" }] }))).toThrow(/too much text/);
    const wide: RawSheet = { name: "Wide", rows: [Array.from({ length: 51 }, (_, i) => `c${i}`)] };
    expect(() => buildTable([wide], choice())).toThrow(/51 columns/);
  });

  it("checks names in the choice", () => {
    expect(importChoiceSchema.safeParse({ ...choice(), name: "<script>" }).success).toBe(false);
    expect(importChoiceSchema.safeParse({ ...choice(), columns: [{ name: " ", type: "text" }] }).success).toBe(false);
    expect(importChoiceSchema.safeParse({ ...choice(), columns: [{ name: "A", type: "formula" }] }).success).toBe(false);
  });
});

describe("reading files", () => {
  it("reads every sheet of an .xlsx workbook, with dates as dates", async () => {
    const file = await writeExcelFile([
      { sheet: "Vendors", data: [["Vendor", "Booked on", "Amount"], ["Florist", { value: date("2027-12-05"), type: Date, format: "dd mmm yyyy" }, 12500]] },
      { sheet: "Notes", data: [["Note"], ["=1+1"]] },
    ]).toBuffer();
    const sheets = await readSpreadsheet(new Uint8Array(file), "plan.xlsx");
    expect(sheets.map((s) => s.name)).toEqual(["Vendors", "Notes"]);
    expect(buildTable(sheets, choice({ columns: [{ name: "Vendor", type: "text" }, { name: "Booked on", type: "date" }, { name: "Amount", type: "number" }] })).rows).toEqual([{ c1: "Florist", c2: "2027-12-05", c3: 12500 }]);
    expect(sheets[1]!.rows[1]).toEqual(["=1+1"]);
  });

  it("reads CSV with quotes and commas, named after the file", async () => {
    const sheets = await readSpreadsheet(bytes('﻿Name,Note\r\n"Rao, Ravi","said ""hi"""\r\n'), "families.csv");
    expect(sheets).toEqual([{ name: "families", rows: [["Name", "Note"], ["Rao, Ravi", 'said "hi"']] }]);
  });

  it("refuses old .xls files, other types, empty and oversized files, and zip bombs", async () => {
    await expect(readSpreadsheet(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2]), "old.xls")).rejects.toThrow(/older Excel file/);
    await expect(readSpreadsheet(bytes("%PDF-1.4"), "x.xlsx")).rejects.toThrow(/Excel workbook \(.xlsx\) or a CSV/);
    await expect(readSpreadsheet(bytes("<html>"), "page.csv")).rejects.toThrow(/Excel workbook \(.xlsx\) or a CSV/);
    await expect(readSpreadsheet(new Uint8Array(), "x.csv")).rejects.toThrow(/empty/);
    await expect(readSpreadsheet(new Uint8Array(SHEET_LIMITS.bytes + 1), "x.csv")).rejects.toThrow(/5 MB/);
    await expect(readSpreadsheet(bytes('a,"b\n'), "x.csv")).rejects.toThrow(/never closed/);
    const bomb = zipSync({ "[Content_Types].xml": bytes("<Types/>"), "xl/big.xml": new Uint8Array(SHEET_LIMITS.unzippedBytes + 1) }, { level: 9 });
    expect(bomb.byteLength).toBeLessThan(SHEET_LIMITS.bytes);
    await expect(readSpreadsheet(bomb, "bomb.xlsx")).rejects.toThrow(/too large to open/);
    const broken = zipSync({ "[Content_Types].xml": bytes("<Types/>"), "xl/workbook.xml": bytes("not xml") });
    await expect(readSpreadsheet(broken, "broken.xlsx")).rejects.toThrow(/couldn't be opened/);
  });
});

describe("showing and downloading", () => {
  const columns: SheetColumn[] = [{ id: "c1", name: "Vendor", type: "text" }, { id: "c2", name: "Amount", type: "number" }, { id: "c3", name: "Paid", type: "boolean" }, { id: "c4", name: "On", type: "date" }];
  const rows: SheetRow[] = [
    { id: "1", position: 0, cells: { c1: "Florist", c2: 12500, c3: true, c4: "2027-12-05" } },
    { id: "2", position: 1, cells: { c1: "=HYPERLINK(\"x\")", c2: -3 } },
    { id: "3", position: 2, cells: { c1: "caterer 10", c2: 120000, c3: false } },
    { id: "4", position: 3, cells: { c1: "Caterer 9" } },
  ];

  it("shows cells for people", () => {
    expect(cellText(120000, "number")).toBe("1,20,000");
    expect(cellText(true, "boolean")).toBe("Yes");
    expect(cellText("2027-12-05", "date")).toBe("5 Dec 2027");
    expect(cellText(null, "text")).toBe("");
  });

  it("searches any column, by what's shown or what's stored", () => {
    expect(searchRows(rows, columns, "caterer").map((r) => r.id)).toEqual(["3", "4"]);
    expect(searchRows(rows, columns, "1,20,000").map((r) => r.id)).toEqual(["3"]);
    expect(searchRows(rows, columns, "dec 2027").map((r) => r.id)).toEqual(["1"]);
    expect(searchRows(rows, columns, "  ")).toHaveLength(4);
  });

  it("sorts numbers as numbers and text naturally, empty cells last", () => {
    expect(sortRows(rows, columns[1]!, "asc").map((r) => r.id)).toEqual(["2", "1", "3", "4"]);
    expect(sortRows(rows, columns[1]!, "desc").map((r) => r.id)).toEqual(["3", "1", "2", "4"]);
    expect(sortRows(rows, columns[0]!, "asc").map((r) => r.id)).toEqual(["2", "4", "3", "1"]);
    expect(sortRows([...rows].reverse(), null, "asc").map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("defuses formulas in CSV and never writes formulas to .xlsx", async () => {
    const csv = tableCsv(columns, rows.slice(0, 2));
    expect(csv.split("\r\n")).toEqual(['"Vendor","Amount","Paid","On"', '"Florist",12500,"Yes","2027-12-05"', `"'=HYPERLINK(""x"")",-3,"",""`]);
    const file = await writeExcelFile(tableSheetData(columns, rows) as never).toBuffer();
    const [sheet] = await readExcelFile(file) as Array<{ data: unknown[][] }>;
    expect(sheet!.data[1]).toEqual(["Florist", 12500, true, date("2027-12-05")]);
    expect(sheet!.data[2]![0]).toBe("=HYPERLINK(\"x\")");
    const xml = Object.entries(unzipSync(new Uint8Array(file))).filter(([name]) => name.startsWith("xl/worksheets/")).map(([, part]) => strFromU8(part)).join("");
    expect(xml).not.toMatch(/<f[ >]/);
  });

  it("makes safe download names", () => {
    expect(downloadName("Vendor list / 2027", "csv")).toBe("Vendor-list-2027.csv");
    expect(downloadName("../..", "xlsx")).toBe("table.xlsx");
  });
});
