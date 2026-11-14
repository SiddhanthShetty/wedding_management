"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet, HardDrive, Pencil, Search, Trash2, Upload } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { deleteSheetAction, renameSheetAction, type SheetActionState } from "@/app/actions/sheets";
import { cellText, COLUMN_TYPE_LABELS, COLUMN_TYPES, searchRows, SHEET_LIMITS, sortRows, type ColumnType, type SheetColumn } from "@/lib/sheets/rules";
import type { SheetSummary, SheetView } from "@/lib/data/sheets";
import type { DriveConfig } from "@/lib/sheets/drive";
import { pickFromDrive } from "@/lib/sheets/google-picker";

type Preview = { filename: string; sheetIndex: number; headerRow: boolean; sheets: string[]; sheetName: string; columns: SheetColumn[]; rows: string[][]; totalRows: number };
type Reply = { ok?: boolean; message?: string; id?: string } & Partial<Preview>;

const tidyName = (text: string) => text.replace(/\.[^.]+$/, "").replace(/[<>]/g, "").trim().slice(0, 120);
const defaultName = (preview: Preview) => tidyName(preview.sheets.length > 1 ? `${preview.filename.replace(/\.[^.]+$/, "")} – ${preview.sheetName}` : preview.filename) || "My table";

async function post(url: string, form: FormData): Promise<Reply> {
  try {
    const response = await fetch(url, { method: "POST", body: form, credentials: "same-origin", cache: "no-store" });
    const body = await response.json().catch(() => null) as Reply | null;
    if (!response.ok || !body?.ok) return { ok: false, message: body?.message ?? "Something went wrong. Nothing was saved; try again." };
    return body;
  } catch {
    return { ok: false, message: "Couldn't reach the app. Check your connection; nothing was saved." };
  }
}

/** Upload a file, check the preview, then add it as a table. Nothing is saved until "Add table". */
export function SheetImporter({ weddingId, drive = null }: { weddingId: string; drive?: DriveConfig | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [columns, setColumns] = useState<Array<{ name: string; type: ColumnType }>>([]);
  const [pending, setPending] = useState<"" | "drive" | "reading" | "saving">("");
  const [error, setError] = useState("");

  async function read(next: File, sheetIndex = 0, headerRow = true) {
    if (next.size > SHEET_LIMITS.bytes) { setError("Files can be up to 5 MB."); return; }
    const form = new FormData();
    form.set("weddingId", weddingId); form.set("file", next); form.set("sheetIndex", String(sheetIndex)); form.set("headerRow", String(headerRow));
    setPending("reading"); setError("");
    const reply = await post("/api/sheets/preview", form);
    setPending("");
    if (!reply.ok) { setError(reply.message ?? ""); return; }
    const fresh = reply as Preview;
    setFile(next); setPreview(fresh);
    setColumns(fresh.columns.map((column) => ({ name: column.name, type: column.type })));
    setName((current) => (preview && current && current !== defaultName(preview) ? current : defaultName(fresh)));
  }

  async function fromDrive() {
    if (!drive) return;
    setPending("drive"); setError("");
    const result = await pickFromDrive(drive, SHEET_LIMITS.bytes);
    setPending("");
    if (!result) return;
    if ("problem" in result) { setError(result.problem); return; }
    await read(result.file);
  }

  function reset() {
    setFile(null); setPreview(null); setColumns([]); setName(""); setError("");
    if (input.current) input.current.value = "";
  }

  async function add() {
    if (!file || !preview) return;
    const form = new FormData();
    form.set("weddingId", weddingId); form.set("file", file);
    form.set("choice", JSON.stringify({ name, sheetIndex: preview.sheetIndex, headerRow: preview.headerRow, columns }));
    setPending("saving"); setError("");
    const reply = await post("/api/sheets", form);
    setPending("");
    if (!reply.ok || !reply.id) { setError(reply.message ?? ""); return; }
    router.push(`/sheets/${reply.id}?added=${encodeURIComponent(reply.message ?? "")}`);
  }

  const empty = preview && preview.columns.length === 0;
  return <Card title="Add a table from a file" subtitle="Excel (.xlsx) or CSV, up to 5 MB, 2,000 rows and 50 columns. You'll check it before anything is saved.">
    <input ref={input} id="sheet-file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" onChange={(event) => { const next = event.target.files?.[0]; if (next) void read(next); }} />
    {!preview && <div className="sheet-upload">
      <div className="sheet-sources">
        <Button type="button" onClick={() => input.current?.click()} disabled={pending !== ""}><Upload size={15} aria-hidden="true" /> {pending === "reading" ? "Reading the file…" : "Choose a file"}</Button>
        {drive && <Button type="button" variant="secondary" onClick={() => void fromDrive()} disabled={pending !== ""}><HardDrive size={15} aria-hidden="true" /> {pending === "drive" ? "Opening Google Drive…" : "From Google Drive"}</Button>}
      </div>
      <span className="field-help">{drive ? "From this device, or a Google Sheet, Excel or CSV file in your Google Drive (the app can open only the file you pick)." : "From this device."} Older .xls files: open in Excel and save as .xlsx first.</span>
    </div>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {preview && <div className="sheet-preview" aria-busy={pending !== ""}>
      <p className="sheet-file"><FileSpreadsheet size={16} aria-hidden="true" /> <strong>{preview.filename}</strong> <button type="button" className="text-button" onClick={reset} disabled={pending !== ""}>Choose another file</button></p>
      <div className="sheet-options">
        {preview.sheets.length > 1 && <div className="field"><label className="field-label" htmlFor="sheet-index">Sheet</label>
          <select id="sheet-index" className="field-control" value={preview.sheetIndex} disabled={pending !== ""} onChange={(event) => file && void read(file, Number(event.target.value), preview.headerRow)}>
            {preview.sheets.map((sheet, index) => <option key={index} value={index}>{sheet}</option>)}
          </select></div>}
        <label className="check-row"><input type="checkbox" checked={preview.headerRow} disabled={pending !== ""} onChange={(event) => file && void read(file, preview.sheetIndex, event.target.checked)} /> The first row has the column names</label>
      </div>
      {empty ? <EmptyState title="This sheet is empty" description="Choose another sheet, or another file." /> : <>
        <div className="field"><label className="field-label" htmlFor="sheet-name">Table name <span aria-hidden="true">*</span></label>
          <input id="sheet-name" className="field-control" value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} /></div>
        <fieldset className="sheet-columns">
          <legend className="field-label">Columns ({columns.length})</legend>
          <p className="field-help">Rename a column or change its type. A type fits every value in the column, or the table isn&apos;t added and you&apos;ll see which row to fix.</p>
          <ol>{columns.map((column, index) => <li key={index}>
            <label className="sr-only" htmlFor={`col-name-${index}`}>Column {index + 1} name</label>
            <input id={`col-name-${index}`} className="field-control" value={column.name} maxLength={80} onChange={(event) => setColumns((all) => all.map((c, i) => i === index ? { ...c, name: event.target.value } : c))} />
            <label className="sr-only" htmlFor={`col-type-${index}`}>Column {index + 1} type</label>
            <select id={`col-type-${index}`} className="field-control" value={column.type} onChange={(event) => setColumns((all) => all.map((c, i) => i === index ? { ...c, type: event.target.value as ColumnType } : c))}>
              {COLUMN_TYPES.map((type) => <option key={type} value={type}>{COLUMN_TYPE_LABELS[type]}</option>)}
            </select>
          </li>)}</ol>
        </fieldset>
        <p className="field-label">First {Math.min(preview.rows.length, preview.totalRows)} of {preview.totalRows.toLocaleString("en-IN")} rows</p>
        <div className="table-scroll"><table className="data-table sheet-grid"><caption className="sr-only">Preview of {preview.sheetName}</caption>
          <thead><tr>{columns.map((column, index) => <th key={index} scope="col">{column.name || `Column ${index + 1}`}</th>)}</tr></thead>
          <tbody>{preview.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody>
        </table></div>
        {preview.totalRows > SHEET_LIMITS.rows && <p className="field-error" role="alert">This sheet has {preview.totalRows.toLocaleString("en-IN")} rows; a table can hold up to {SHEET_LIMITS.rows.toLocaleString("en-IN")}. Split it into smaller sheets.</p>}
      </>}
      <div className="dialog-actions">
        <Button variant="secondary" type="button" onClick={reset} disabled={pending !== ""}>Cancel</Button>
        {!empty && <Button type="button" onClick={() => void add()} disabled={pending !== "" || !name.trim() || preview.totalRows > SHEET_LIMITS.rows}>{pending === "saving" ? "Adding…" : pending === "reading" ? "Reading…" : "Add table"}</Button>}
      </div>
    </div>}
  </Card>;
}

export function SheetList({ tables }: { tables: SheetSummary[] }) {
  if (!tables.length) return <EmptyState title="No tables yet" description="Add a spreadsheet and it becomes a table you can search, sort and download here." />;
  return <ul className="sheet-list">{tables.map((table) => <li key={table.id}>
    <Link href={`/sheets/${table.id}`} className="sheet-list-item">
      <FileSpreadsheet size={18} aria-hidden="true" />
      <span><strong>{table.name}</strong><span className="muted">{table.rows.toLocaleString("en-IN")} row{table.rows === 1 ? "" : "s"} · {table.columns} column{table.columns === 1 ? "" : "s"}{table.sourceFilename ? ` · from ${table.sourceFilename}` : ""}</span></span>
    </Link>
  </li>)}</ul>;
}

const PAGE = 50;

export function SheetTable({ view, notice }: { view: SheetView; notice?: string }) {
  const { table, rows, canEdit, weddingId } = view;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ id: string; direction: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const sortColumn = sort ? table.columns.find((column) => column.id === sort.id) ?? null : null;
  const shown = useMemo(() => sortRows(searchRows(rows, table.columns, query), sortColumn, sort?.direction ?? "asc"), [rows, table.columns, query, sortColumn, sort?.direction]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const current = Math.min(page, pages - 1);
  const slice = shown.slice(current * PAGE, current * PAGE + PAGE);
  const toggle = (id: string) => { setPage(0); setSort((now) => now?.id !== id ? { id, direction: "asc" } : now.direction === "asc" ? { id, direction: "desc" } : null); };

  return <>
    {notice && <p className="field-success sheet-notice" role="status">{notice}</p>}
    <div className="sheet-toolbar">
      <div className="input-wrap sheet-search"><Search size={15} aria-hidden="true" /><label className="sr-only" htmlFor="sheet-search">Search this table</label>
        <input id="sheet-search" type="search" placeholder="Search this table" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></div>
      <div className="sheet-actions">
        <a className="button button-secondary" href={`/api/sheets/${table.id}`} download><Download size={15} aria-hidden="true" /> Excel</a>
        <a className="button button-secondary" href={`/api/sheets/${table.id}?format=csv`} download><Download size={15} aria-hidden="true" /> CSV</a>
        {canEdit && <Button variant="secondary" type="button" onClick={() => setRenaming(true)}><Pencil size={15} aria-hidden="true" /> Rename</Button>}
        {canEdit && <Button variant="secondary" type="button" onClick={() => setDeleting(true)}><Trash2 size={15} aria-hidden="true" /> Delete</Button>}
      </div>
    </div>
    <p className="muted sheet-count" aria-live="polite">{query.trim() ? `${shown.length.toLocaleString("en-IN")} of ${rows.length.toLocaleString("en-IN")} rows match` : `${rows.length.toLocaleString("en-IN")} row${rows.length === 1 ? "" : "s"}`}{table.sourceFilename ? ` · from ${table.sourceFilename}${table.sourceSheet && !table.sourceFilename.startsWith(table.sourceSheet) ? ` (${table.sourceSheet})` : ""}` : ""}</p>
    {!rows.length ? <EmptyState title="This table has no rows" description="The sheet had column names but no rows below them." />
      : !shown.length ? <EmptyState title="No rows match" description="Try another word, or clear the search." />
      : <div className="table-scroll"><table className="data-table sheet-grid sheet-cards"><caption className="sr-only">{table.name}</caption>
        <thead><tr>{table.columns.map((column) => {
          const active = sort?.id === column.id;
          const Icon = !active ? ArrowUpDown : sort!.direction === "asc" ? ArrowUp : ArrowDown;
          return <th key={column.id} scope="col" aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none"} className={column.type === "number" ? "num" : undefined}>
            <button type="button" className="sort-button" onClick={() => toggle(column.id)}>{column.name}<Icon size={13} aria-hidden="true" /></button>
          </th>;
        })}</tr></thead>
        <tbody>{slice.map((row) => <tr key={row.id}>{table.columns.map((column) => {
          const value = row.cells[column.id];
          const text = cellText(value, column.type);
          return <td key={column.id} data-label={column.name} className={column.type === "number" ? "num" : undefined}>
            {column.type === "link" && typeof value === "string" && /^https?:\/\//i.test(value) ? <a href={value} target="_blank" rel="noopener noreferrer">{text}</a> : text || <span className="sr-only">empty</span>}
          </td>;
        })}</tr>)}</tbody>
      </table></div>}
    {pages > 1 && <nav className="sheet-pages" aria-label="Pages">
      <Button variant="secondary" type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button>
      <span>Page {current + 1} of {pages}</span>
      <Button variant="secondary" type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</Button>
    </nav>}
    {renaming && <RenameDialog weddingId={weddingId} tableId={table.id} name={table.name} onClose={() => setRenaming(false)} />}
    <DeleteTable open={deleting} weddingId={weddingId} tableId={table.id} name={table.name} rows={rows.length} onClose={() => setDeleting(false)} />
  </>;
}

function RenameDialog({ weddingId, tableId, name, onClose }: { weddingId: string; tableId: string; name: string; onClose: () => void }) {
  const [state, action, pending] = useActionState<SheetActionState, FormData>(renameSheetAction, {});
  useEffect(() => { if (state.message && !state.error) onClose(); }, [state, onClose]);
  return <Dialog open role="dialog" titleId="rename-title" onClose={onClose}>
    <h2 className="dialog-title" id="rename-title">Rename table</h2>
    <form action={action}>
      <input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="tableId" value={tableId} />
      <div className="field"><label className="field-label" htmlFor="rename-name">Name</label><input id="rename-name" name="name" className="field-control" defaultValue={name} maxLength={120} required autoFocus /></div>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      <div className="dialog-actions"><Button variant="secondary" type="button" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></div>
    </form>
  </Dialog>;
}

function DeleteTable({ open, weddingId, tableId, name, rows, onClose }: { open: boolean; weddingId: string; tableId: string; name: string; rows: number; onClose: () => void }) {
  const [state, action, pending] = useActionState<SheetActionState, FormData>(deleteSheetAction, {});
  const form = useRef<HTMLFormElement>(null);
  return <>
    <form ref={form} action={action} hidden><input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="tableId" value={tableId} /></form>
    {state.error && <p className="field-error" role="alert">{state.error}</p>}
    <ConfirmationDialog open={open} title={`Delete "${name}"?`} description={`This permanently deletes the table and its ${rows.toLocaleString("en-IN")} row${rows === 1 ? "" : "s"}. It can't be undone. The original file stays in All files.`}
      confirmLabel={pending ? "Deleting…" : "Delete table"} confirmDisabled={pending} onCancel={onClose} onConfirm={() => form.current?.requestSubmit()} />
  </>;
}
