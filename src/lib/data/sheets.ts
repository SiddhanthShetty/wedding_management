import "server-only";

import { AuthorizationDeniedError, authorizeWeddingOperation } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SHEET_LIMITS, SheetRuleError, type Cell, type SheetColumn, type SheetRow } from "@/lib/sheets/rules";

/** Who can change Sheets: the couple, or members with Plan edit access. Checked again by RLS. */
const canEditSheets = (context: Awaited<ReturnType<typeof authorizeWeddingOperation>>) =>
  context.membership.role === "owner" || context.membership.role === "co_owner" || context.moduleAccess.planning === "edit";

function check(error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return;
  if (error.code === "42501") throw new AuthorizationDeniedError();
  if (error.code === "23505") throw new SheetRuleError("There's already a table with this name. Choose another name.");
  if (error.code === "23514" && error.message?.startsWith("A table can hold")) throw new SheetRuleError(error.message);
  throw new Error(fallback);
}

export type SheetSummary = { id: string; name: string; sourceFilename: string; sourceSheet: string; columns: number; rows: number; updatedAt: string };

export async function listSheets(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "planning", "read");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("data_tables").select("id,name,source_filename,source_sheet,columns,updated_at,data_table_rows(count)").eq("wedding_id", weddingId).order("updated_at", { ascending: false });
  check(error, "Could not load your tables.");
  const tables: SheetSummary[] = (data ?? []).map((row) => ({
    id: String(row.id), name: String(row.name), sourceFilename: String(row.source_filename), sourceSheet: String(row.source_sheet),
    columns: Array.isArray(row.columns) ? row.columns.length : 0,
    rows: Number((row.data_table_rows as Array<{ count: number }> | null)?.[0]?.count ?? 0), updatedAt: String(row.updated_at),
  }));
  return { weddingId, canEdit: canEditSheets(context), tables };
}

/** One table and all its rows (read in pages, as the API returns at most 1,000 rows at a time). */
export async function getSheet(weddingId: string, tableId: string) {
  const context = await authorizeWeddingOperation(weddingId, "planning", "read");
  const supabase = await createSupabaseServerClient();
  const { data: table, error } = await supabase.from("data_tables").select("id,name,source_filename,source_sheet,columns,created_at,updated_at").eq("wedding_id", weddingId).eq("id", tableId).maybeSingle();
  check(error, "Could not load this table.");
  if (!table) return null;
  const rows: SheetRow[] = [];
  for (let from = 0; from < SHEET_LIMITS.rows; from += 1000) {
    const page = await supabase.from("data_table_rows").select("id,position,cells").eq("wedding_id", weddingId).eq("table_id", tableId).order("position").order("id").range(from, from + 999);
    check(page.error, "Could not load this table.");
    rows.push(...(page.data ?? []).map((row) => ({ id: String(row.id), position: Number(row.position), cells: (row.cells ?? {}) as Record<string, Cell> })));
    if ((page.data ?? []).length < 1000) break;
  }
  return {
    weddingId, canEdit: canEditSheets(context),
    table: { id: String(table.id), name: String(table.name), sourceFilename: String(table.source_filename), sourceSheet: String(table.source_sheet), columns: table.columns as SheetColumn[], createdAt: String(table.created_at), updatedAt: String(table.updated_at) },
    rows,
  };
}
export type SheetView = NonNullable<Awaited<ReturnType<typeof getSheet>>>;

async function editor(weddingId: string) {
  const context = await authorizeWeddingOperation(weddingId, "planning", "edit");
  if (!canEditSheets(context)) throw new AuthorizationDeniedError();
  return { context, supabase: await createSupabaseServerClient() };
}

/** Checks the person may add tables before a file is opened. */
export async function requireSheetEditor(weddingId: string) { await editor(weddingId); }

/** Saves the table and all its rows in one transaction. */
export async function createSheet(weddingId: string, input: { name: string; sourceFilename: string; sourceSheet: string; columns: SheetColumn[]; rows: Array<Record<string, Cell>> }) {
  const { supabase } = await editor(weddingId);
  const { data, error } = await supabase.rpc("create_data_table", {
    p_wedding_id: weddingId, p_name: input.name, p_source_filename: input.sourceFilename.slice(0, 255), p_source_sheet: input.sourceSheet.slice(0, 120),
    p_columns: input.columns, p_rows: input.rows,
  });
  check(error, "Couldn't save this table. Nothing was saved; try again.");
  return String(data);
}

export async function renameSheet(weddingId: string, tableId: string, name: string) {
  const { context, supabase } = await editor(weddingId);
  const { data, error } = await supabase.from("data_tables").update({ name, updated_by_user_id: context.user.id }).eq("wedding_id", weddingId).eq("id", tableId).select("id");
  check(error, "Couldn't rename this table. Nothing was changed; refresh and try again.");
  if (!data?.length) throw new SheetRuleError("This table no longer exists. Refresh the page.");
}

/** Permanently deletes the table and its rows. The original file stays in All files. */
export async function deleteSheet(weddingId: string, tableId: string) {
  const { supabase } = await editor(weddingId);
  const { data, error } = await supabase.from("data_tables").delete().eq("wedding_id", weddingId).eq("id", tableId).select("id");
  check(error, "Couldn't delete this table. Nothing was deleted; refresh and try again.");
  if (!data?.length) throw new SheetRuleError("This table no longer exists. Refresh the page.");
}
