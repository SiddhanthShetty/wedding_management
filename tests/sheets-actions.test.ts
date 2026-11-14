/** Sheets upload routes and actions: checks before reading, rows from the file only, clear refusals. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import writeExcelFile from "write-excel-file/node";

const state = vi.hoisted(() => ({ calls: [] as Array<{ name: string; args: Record<string, unknown> }>, role: "owner" as string, planning: undefined as undefined | "read" | "edit", signedOut: false, rpcError: null as null | { code?: string; message: string }, uploads: 0, updated: [{ id: "t" }] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${to}` }); }) }));
vi.mock("@/lib/data/documents", () => ({ uploadDocument: vi.fn(async () => { state.uploads += 1; return { filename: "x", label: "Excel" }; }) }));
const query = () => {
  const chain: Record<string, unknown> = {};
  for (const method of ["update", "delete", "eq"]) chain[method] = (...args: unknown[]) => { state.calls.push({ name: method, args: { args } }); return chain; };
  chain.select = async () => ({ data: state.updated, error: null });
  return chain;
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({
  rpc: async (name: string, args: Record<string, unknown>) => { state.calls.push({ name, args }); return { data: "new-table", error: state.rpcError }; },
  from: () => query(),
}) }));
vi.mock("@/lib/auth/access", async (original) => {
  const actual = await original<typeof import("@/lib/auth/access")>();
  return { ...actual, authorizeWeddingOperation: vi.fn(async (_wedding: string, _module: string, level: string) => {
    if (state.signedOut) throw new actual.AuthenticationRequiredError();
    const allowed = state.role === "owner" || (level === "edit" ? state.planning === "edit" : Boolean(state.planning));
    if (!allowed) throw new actual.AuthorizationDeniedError();
    return { wedding: { id: "w" }, user: { id: "u" }, membership: { role: state.role }, moduleAccess: { planning: state.planning } };
  }) };
});

import { POST as preview } from "../src/app/api/sheets/preview/route";
import { POST as create } from "../src/app/api/sheets/route";
import { deleteSheetAction, renameSheetAction } from "../src/app/actions/sheets";

const weddingId = "a0000000-0000-4000-8000-000000000001";
const tableId = "c0000000-0000-4000-8000-000000000001";
const csv = "Vendor,Amount\nFlorist,12500\nCaterer,\"1,20,000\"\n";
const request = (fields: Record<string, string | Blob>, headers: Record<string, string> = { origin: "https://app.example", host: "app.example" }) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request("https://app.example/api/sheets", { method: "POST", body: form, headers }) as never;
};
const file = (text = csv, name = "vendors.csv") => new File([text], name, { type: "text/csv" });
const choice = (overrides: Record<string, unknown> = {}) => JSON.stringify({ name: "Vendors", sheetIndex: 0, headerRow: true, columns: [{ name: "Vendor", type: "text" }, { name: "Amount", type: "number" }], ...overrides });
const body = async (response: Response): Promise<Record<string, unknown>> => ({ status: response.status, ...(await response.json()) as Record<string, unknown> });

beforeEach(() => { state.calls = []; state.role = "owner"; state.planning = undefined; state.signedOut = false; state.rpcError = null; state.uploads = 0; state.updated = [{ id: "t" }]; });

describe("preview", () => {
  it("shows sheets, guessed columns and rows, and saves nothing", async () => {
    const result = await body(await preview(request({ weddingId, file: file() })));
    expect(result).toMatchObject({ status: 200, ok: true, filename: "vendors.csv", sheets: ["vendors"], totalRows: 2, rows: [["Florist", "12500"], ["Caterer", "1,20,000"]] });
    expect((result.columns as Array<{ type: string }>).map((c) => c.type)).toEqual(["text", "number"]);
    expect(state.calls.filter((call) => call.name === "create_data_table")).toHaveLength(0);
  });

  it("reads every sheet of a workbook and switches sheet and header row", async () => {
    const workbook = await writeExcelFile([{ sheet: "Vendors", data: [["Vendor"], ["Florist"]] }, { sheet: "Stays", data: [["Room"], ["101"], ["102"]] }]).toBuffer();
    const result = await body(await preview(request({ weddingId, file: new File([new Uint8Array(workbook)], "plan.xlsx"), sheetIndex: "1", headerRow: "false" })));
    expect(result).toMatchObject({ sheets: ["Vendors", "Stays"], sheetName: "Stays", sheetIndex: 1, headerRow: false, totalRows: 3 });
  });

  it("refuses other sites, missing files, people without Plan edit access and signed-out people", async () => {
    expect(await body(await preview(request({ weddingId, file: file() }, { origin: "https://evil.example", host: "app.example" })))).toMatchObject({ status: 403 });
    expect(await body(await preview(request({ weddingId })))).toMatchObject({ status: 400, message: "Choose a file to upload." });
    expect(await body(await preview(request({ weddingId: "x", file: file() })))).toMatchObject({ status: 400 });
    state.role = "scoped_collaborator"; state.planning = "read";
    expect(await body(await preview(request({ weddingId, file: file() })))).toMatchObject({ status: 403, message: expect.stringMatching(/Plan edit access/) });
    state.signedOut = true;
    expect(await body(await preview(request({ weddingId, file: file() })))).toMatchObject({ status: 401 });
  });

  it("explains files it can't open", async () => {
    expect(await body(await preview(request({ weddingId, file: new File(["%PDF-1.7"], "plan.pdf") })))).toMatchObject({ status: 400, message: "Upload an Excel workbook (.xlsx) or a CSV file." });
    expect(await body(await preview(request({ weddingId, file: new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0])], "old.xls") })))).toMatchObject({ status: 400, message: expect.stringMatching(/older Excel file/) });
  });
});

describe("adding the table", () => {
  it("reads the rows from the file, saves them in one call and keeps the original file", async () => {
    const result = await body(await create(request({ weddingId, file: file(), choice: choice(), rows: JSON.stringify([{ c1: "Injected" }]) })));
    expect(result).toMatchObject({ status: 201, ok: true, id: "new-table", message: 'Added "Vendors" with 2 rows. The original file is in All files.' });
    const call = state.calls.find((c) => c.name === "create_data_table")!;
    expect(call.args).toMatchObject({ p_wedding_id: weddingId, p_name: "Vendors", p_source_filename: "vendors.csv", p_source_sheet: "vendors", p_rows: [{ c1: "Florist", c2: 12500 }, { c1: "Caterer", c2: 120000 }] });
    expect(state.uploads).toBe(1);
  });

  it("names the cell that doesn't fit and saves nothing", async () => {
    const result = await body(await create(request({ weddingId, file: file(), choice: choice({ columns: [{ name: "Vendor", type: "number" }, { name: "Amount", type: "number" }] }) })));
    expect(result).toMatchObject({ status: 400, message: expect.stringMatching(/^Row 2, "Vendor": "Florist" isn't a number/) });
    expect(state.calls).toHaveLength(0);
    expect(state.uploads).toBe(0);
  });

  it("refuses a bad choice, and explains a name that's taken", async () => {
    expect(await body(await create(request({ weddingId, file: file(), choice: "{" })))).toMatchObject({ status: 400 });
    expect(await body(await create(request({ weddingId, file: file(), choice: choice({ name: "" }) })))).toMatchObject({ status: 400, message: "Give the table a name." });
    state.rpcError = { code: "23505", message: "duplicate key value violates unique constraint" };
    expect(await body(await create(request({ weddingId, file: file(), choice: choice() })))).toMatchObject({ status: 400, message: "There's already a table with this name. Choose another name." });
    expect(state.uploads).toBe(0);
  });
});

describe("rename and delete", () => {
  const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(fields)) data.set(k, v); return data; };

  it("renames with a checked name, and refuses people without Plan edit access", async () => {
    expect(await renameSheetAction({}, form({ weddingId, tableId, name: "  Florists  " }))).toMatchObject({ message: "Renamed." });
    expect(state.calls.find((c) => c.name === "update")!.args).toEqual({ args: [{ name: "Florists", updated_by_user_id: "u" }] });
    expect(await renameSheetAction({}, form({ weddingId, tableId, name: "<x>" }))).toEqual({ error: "Table names can't contain < or >." });
    state.role = "read_only_collaborator"; state.planning = "read";
    expect(await renameSheetAction({}, form({ weddingId, tableId, name: "New" }))).toEqual({ error: "You can't change tables. Ask the couple for Plan edit access." });
  });

  it("deletes and returns to the list, or says the table is already gone", async () => {
    await expect(deleteSheetAction({}, form({ weddingId, tableId }))).rejects.toMatchObject({ digest: "NEXT_REDIRECT;/sheets?deleted=1" });
    state.updated = [];
    expect(await deleteSheetAction({}, form({ weddingId, tableId }))).toEqual({ error: "This table no longer exists. Refresh the page." });
    expect(await deleteSheetAction({}, form({ weddingId, tableId: "nope" }))).toEqual({ error: "Refresh the page and try again." });
  });
});
