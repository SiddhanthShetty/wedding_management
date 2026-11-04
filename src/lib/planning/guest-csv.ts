export type ParsedCsv = { headers: string[]; rows: Array<{ rowNumber: number; values: Record<string,string>; errors: string[] }> };

export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); records.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("This CSV has an unclosed quoted cell.");
  if (cell.length || row.length || (text.length > 0 && !/[\r\n]$/.test(text))) { row.push(cell); records.push(row); }
  const nonempty = records.filter((record) => record.some((value) => value.trim() !== ""));
  const headers = (nonempty.shift() ?? []).map((value) => value.trim());
  if (!headers.length || headers.some((value) => value === "")) throw new Error("CSV needs a header row with a name for every column.");
  if (new Set(headers.map((value) => value.toLocaleLowerCase())).size !== headers.length) throw new Error("CSV column names must be unique.");
  return { headers, rows: nonempty.map((values,index) => ({ rowNumber:index+2, values:Object.fromEntries(headers.map((header,position)=>[header,(values[position]??"").trim()])), errors:values.length!==headers.length?[`Expected ${headers.length} columns but found ${values.length}.`]:[] })) };
}

export function protectSpreadsheetCell(value: unknown): string {
  let text = String(value ?? "").replace(/\0/g, "");
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g,'""')}"`;
}

export function createCsv(headers: string[], rows: Array<Record<string,unknown>>): string {
  return [headers.map(protectSpreadsheetCell).join(","),...rows.map((row)=>headers.map((header)=>protectSpreadsheetCell(row[header])).join(","))].join("\r\n");
}
