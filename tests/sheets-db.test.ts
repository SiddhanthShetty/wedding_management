/** Sheets in the database: who can see and change tables, all-or-nothing creation and the limits. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { assumeUser, createTestDatabase, expectDenied, OWNER_A, OWNER_B, READ_ONLY, SCOPED, WEDDING_A, WEDDING_B } from "./support/database";

let db: PGlite;
beforeEach(async () => { db = await createTestDatabase(); await assumeUser(db, OWNER_A); });
afterEach(async () => { await db.close(); });

const columns = [{ id: "c1", name: "Vendor", type: "text" }, { id: "c2", name: "Amount", type: "number" }];
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ c1: `Vendor ${i + 1}`, c2: i }));
const create = async (name = "Vendors", rowList: unknown[] = rows(3), cols: unknown = columns, wedding = WEDDING_A) =>
  (await db.query<{ id: string }>("select public.create_data_table($1,$2,'vendors.xlsx','Sheet1',$3::jsonb,$4::jsonb) id", [wedding, name, JSON.stringify(cols), JSON.stringify(rowList)])).rows[0]!.id;
const peek = async <T>(sql: string, params: unknown[] = []) => { await db.exec("reset role"); return (await db.query<T>(sql, params)).rows; };
const count = async (table: string) => (await peek<{ n: number }>(`select count(*)::int n from public.${table}`))[0]!.n;

describe("creating tables", () => {
  it("saves the table and its rows in order, recording who added it", async () => {
    const id = await create();
    expect(await peek("select name,source_filename,source_sheet,created_by_user_id from public.data_tables where id=$1", [id])).toEqual([{ name: "Vendors", source_filename: "vendors.xlsx", source_sheet: "Sheet1", created_by_user_id: OWNER_A }]);
    expect(await peek("select position,cells from public.data_table_rows where table_id=$1 order by position", [id])).toEqual(rows(3).map((cells, position) => ({ position, cells })));
  });

  it("refuses a repeated name (any case or spacing) and saves nothing", async () => {
    await create("Vendors");
    await expectDenied(create(" VENDORS "), /data_tables_name_idx/);
    expect([await count("data_tables"), await count("data_table_rows")]).toEqual([1, 3]);
  });

  it("checks columns: 1 to 50, ids like c1, known types, names, no repeats", async () => {
    for (const bad of [[], [{ id: "x1", name: "A", type: "text" }], [{ id: "c1", name: "A", type: "formula" }], [{ id: "c1", name: " ", type: "text" }],
      [{ id: "c1", name: "A", type: "text" }, { id: "c1", name: "B", type: "text" }], Array.from({ length: 51 }, (_, i) => ({ id: `c${i + 1}`, name: `C${i}`, type: "text" }))]) {
      await assumeUser(db, OWNER_A);
      await expectDenied(create("Bad", [], bad), /check constraint/);
    }
    await assumeUser(db, OWNER_A);
    await expectDenied(create("<b>", []), /check constraint/);
    expect(await count("data_tables")).toBe(0);
  });

  it("holds at most 2,000 rows, on creation and when adding rows later", async () => {
    await expectDenied(create("Big", rows(2001)), /up to 2,000 rows/);
    expect(await count("data_tables")).toBe(0);
    await assumeUser(db, OWNER_A);
    const id = await create("Full", rows(2000));
    await expectDenied(db.query("insert into public.data_table_rows(wedding_id,table_id,position,cells,updated_by_user_id) values($1,$2,2000,'{}',$3)", [WEDDING_A, id, OWNER_A]), /up to 2,000 rows/);
    expect(await count("data_table_rows")).toBe(2000);
  });

  it("refuses rows that aren't objects, or larger than 64 KB", async () => {
    await expectDenied(create("Bad rows", [["Florist"]]), /check constraint/);
    await assumeUser(db, OWNER_A);
    await expectDenied(create("Huge row", [{ c1: "x".repeat(70_000) }]), /check constraint/);
    expect(await count("data_tables")).toBe(0);
  });
});

describe("who can see and change tables", () => {
  it("lets Plan editors add tables, Plan readers only read, and other weddings see nothing", async () => {
    const id = await create();
    await assumeUser(db, SCOPED);
    expect(await create("Scoped table")).toBeTruthy();
    await assumeUser(db, READ_ONLY);
    expect((await db.query("select id from public.data_tables")).rows).toHaveLength(2);
    expect((await db.query("select id from public.data_table_rows")).rows).toHaveLength(6);
    await expectDenied(create("Sneaky"), /row-level security/);
    await assumeUser(db, READ_ONLY);
    expect((await db.query("update public.data_tables set name='Changed', updated_by_user_id=$2 where id=$1 returning id", [id, READ_ONLY])).rows).toHaveLength(0);
    expect((await db.query("delete from public.data_table_rows where table_id=$1 returning id", [id])).rows).toHaveLength(0);
    expect((await db.query("delete from public.data_tables where id=$1 returning id", [id])).rows).toHaveLength(0);
    await assumeUser(db, OWNER_B);
    expect((await db.query("select id from public.data_tables")).rows).toHaveLength(0);
    await expectDenied(create("Cross wedding", rows(1), columns, WEDDING_A), /row-level security/);
    await assumeUser(db, OWNER_B);
    expect(await create("Their own", rows(1), columns, WEDDING_B)).toBeTruthy();
    await assumeUser(db, null, "anon");
    await expectDenied(db.query("select id from public.data_tables"), /permission denied/);
    await expectDenied(create("Anon"), /permission denied/);
    expect(await peek("select name from public.data_tables where id=$1", [id])).toEqual([{ name: "Vendors" }]);
  });

  it("lets editors rename, change rows and delete; deleting a table deletes its rows", async () => {
    const id = await create();
    await assumeUser(db, SCOPED);
    await expectDenied(db.query("update public.data_tables set name='Renamed', updated_by_user_id=$2 where id=$1", [id, OWNER_A]), /row-level security/);
    await assumeUser(db, SCOPED);
    expect((await db.query("update public.data_tables set name='Renamed', updated_by_user_id=$2 where id=$1 returning id", [id, SCOPED])).rows).toHaveLength(1);
    await expectDenied(db.query("update public.data_tables set created_by_user_id=$2 where id=$1", [id, SCOPED]), /permission denied/);
    await assumeUser(db, SCOPED);
    expect((await db.query("delete from public.data_tables where id=$1 returning id", [id])).rows).toHaveLength(1);
    expect([await count("data_tables"), await count("data_table_rows")]).toEqual([0, 0]);
  });

  it("keeps rows in their own wedding", async () => {
    const id = await create();
    await assumeUser(db, OWNER_B);
    await expectDenied(db.query("insert into public.data_table_rows(wedding_id,table_id,position,cells,updated_by_user_id) values($1,$2,9,'{}',$3)", [WEDDING_B, id, OWNER_B]), /foreign key|violates/);
  });
});
