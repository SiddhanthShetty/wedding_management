import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, FUNCTION_A_CEREMONY, OWNER_A, OWNER_A_PARTNER, OWNER_B, READ_ONLY, SCOPED, WEDDING_A, WEDDING_B } from "./support/database";
import { createCsv, parseCsv } from "../src/lib/planning/guest-csv";

/**
 * Release-readiness scenarios on synthetic weddings (DEMO Wedding Alder / Birch from seed.sql).
 * Each scenario runs against every committed migration in an in-memory Postgres.
 */
let db: PGlite;
beforeEach(async () => { db = await createTestDatabase({ storage: true }); });
afterEach(async () => { await db.close(); });
const rows = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async <T>(sql: string, params: unknown[] = []) => (await rows<T>(sql, params))[0]!;

describe("release scenarios", () => {
  it("lets both partners collaborate on one wedding and rejects a stale overwrite", async () => {
    await assumeUser(db, OWNER_A);
    const task = await one<{ id: string; version: number }>("insert into public.tasks(wedding_id,title,created_by_user_id,updated_by_user_id) values($1,'TEST book florist',$2,$2) returning id,version", [WEDDING_A, OWNER_A]);
    await assumeUser(db, OWNER_A_PARTNER);
    const partnerEdit = await rows<{ version: number }>("update public.tasks set title='TEST book florist (partner)' where id=$1 and version=$2 returning version", [task.id, task.version]);
    expect(partnerEdit).toHaveLength(1);
    await assumeUser(db, OWNER_A);
    // The first partner still holds version 1: their save matches nothing instead of erasing the partner's change.
    expect(await rows("update public.tasks set title='TEST stale' where id=$1 and version=$2 returning id", [task.id, task.version])).toHaveLength(0);
    expect((await one<{ title: string }>("select title from public.tasks where id=$1", [task.id])).title).toBe("TEST book florist (partner)");
    // Same optimistic-version protection on the new modules.
    const issue = await one<{ id: string; version: number }>("insert into public.wedding_day_issues(wedding_id,title,created_by_user_id) values($1,'TEST issue',$2) returning id,version", [WEDDING_A, OWNER_A]);
    await assumeUser(db, OWNER_A_PARTNER);
    await db.query("update public.wedding_day_issues set severity='high' where id=$1 and version=$2", [issue.id, issue.version]);
    await assumeUser(db, OWNER_A);
    expect(await rows("update public.wedding_day_issues set severity='low' where id=$1 and version=$2 returning id", [issue.id, issue.version])).toHaveLength(0);
  });

  it("keeps every module of another wedding inaccessible", async () => {
    await assumeUser(db, OWNER_A);
    await db.query("insert into public.accommodation_properties(wedding_id,name,created_by_user_id) values($1,'TEST Alder hotel',$2)", [WEDDING_A, OWNER_A]);
    await db.query("insert into public.schedule_items(wedding_id,function_id,activity,planned_start,planned_end,created_by_user_id) values($1,$2,'TEST Alder setup','2027-06-17T10:00Z','2027-06-17T11:00Z',$3)", [WEDDING_A, FUNCTION_A, OWNER_A]);
    await db.query("select public.begin_document_upload($1,null,'function',$2,'TEST Alder plan','','plan.pdf','application/pdf',10,$3)", [WEDDING_A, FUNCTION_A, "b".repeat(64)]);
    await db.query("insert into public.message_templates(wedding_id,kind,name,body,created_by_user_id,updated_by_user_id) values($1,'invitation','TEST Alder invite','Hi',$2,$2)", [WEDDING_A, OWNER_A]);
    await assumeUser(db, OWNER_B);
    for (const table of ["functions", "tasks", "guests", "bookings", "accommodation_properties", "schedule_items", "documents", "document_versions", "message_templates", "transport_journeys", "catering_meal_services"]) {
      expect(await rows(`select 1 from public.${table} where wedding_id=$1`, [WEDDING_A]), table).toHaveLength(0);
    }
    await expectDenied(db.query("select public.get_travel_guests($1)", [WEDDING_A]));
    await expectDenied(db.query("select public.get_operations_references($1)", [WEDDING_A]));
    await expectDenied(db.query("select * from public.get_guest_function_references($1)", [WEDDING_A]));
  });

  it("stops restricted collaborators exceeding their grants and revoked members losing access immediately", async () => {
    await assumeUser(db, READ_ONLY); // planning read only
    expect((await rows("select id from public.functions where wedding_id=$1", [WEDDING_A])).length).toBeGreaterThan(0);
    await expectDenied(db.query("insert into public.tasks(wedding_id,title,created_by_user_id,updated_by_user_id) values($1,'x',$2,$2)", [WEDDING_A, READ_ONLY]));
    await expectDenied(db.query("select public.set_member_module_access($1,$2,'planning','edit')", [WEDDING_A, READ_ONLY]));
    await assumeUser(db, SCOPED); // planning edit, logistics read
    await expectDenied(db.query("insert into public.transport_vehicles(wedding_id,label,passenger_capacity,created_by_user_id) values($1,'x',4,$2)", [WEDDING_A, SCOPED]));
    await expectDenied(db.query("select public.set_member_module_access($1,$2,'logistics','edit')", [WEDDING_A, SCOPED]));
    expect((await rows("select id from public.accommodation_properties where wedding_id=$1", [WEDDING_A]))).toHaveLength(0);
    await assumeUser(db, OWNER_A);
    await db.query("select public.revoke_wedding_member($1,$2)", [WEDDING_A, SCOPED]);
    await assumeUser(db, SCOPED);
    for (const table of ["functions", "tasks", "schedule_items", "documents", "accommodation_rooms"]) expect(await rows(`select 1 from public.${table} where wedding_id=$1`, [WEDDING_A]), table).toHaveLength(0);
    await expectDenied(db.query("select public.get_operations_references($1)", [WEDDING_A]));
  });

  it("turns venue research into a quote, a booking and a payment without inventing amounts", async () => {
    await assumeUser(db, OWNER_A);
    const supplier = await one<{ id: string }>("insert into public.suppliers(wedding_id,kind,name,category,status,created_by_user_id,updated_by_user_id) values($1,'venue','TEST Old Mill','Venue','researching',$2,$2) returning id", [WEDDING_A, OWNER_A]);
    const quote = await one<{ id: string }>("select public.create_supplier_quote($1,$2,'2027-01-10','EUR',4800.00,'Hall hire','Catering','2027-02-10',$3::jsonb) id", [WEDDING_A, supplier.id, JSON.stringify([{ kind: "service", label: "Hall hire", amount: "4800.00" }, { kind: "additional", label: "Late licence", amount: null }])]);
    const unknown = await one<{ n: number }>("select count(*)::int n from public.supplier_quote_items where wedding_id=$1 and amount is null", [WEDDING_A]);
    expect(unknown.n).toBe(1); // unknown stays unknown, never zero
    await db.query("update public.suppliers set status='booked',updated_by_user_id=$2 where id=$1", [supplier.id, OWNER_A]);
    expect((await one<{ n: number }>("select count(*)::int n from public.bookings where wedding_id=$1", [WEDDING_A])).n).toBe(0); // status alone is not a booking
    const booking = await one<{ id: string }>("select public.create_financial_booking($1::jsonb,$2::jsonb) id", [JSON.stringify({ wedding_id: WEDDING_A, supplier_id: supplier.id, source_estimate_id: null, category: "Venue", label: "TEST Old Mill hire", agreed_total: "4800.00", currency: "EUR", status: "confirmed" }), JSON.stringify([{ function_id: FUNCTION_A, amount: "1800.00" }, { function_id: FUNCTION_A_CEREMONY, amount: "3000.00" }])]);
    await db.query("select public.record_booking_transaction($1::jsonb,$2::jsonb)", [JSON.stringify({ wedding_id: WEDDING_A, booking_id: booking.id, kind: "payment", amount: "1000.00", currency: "EUR", happened_on: "2027-01-20", payer_label: "TEST", obligation_id: null, idempotency_key: "f3000000-0000-4000-8000-0000000000a1", note: "Deposit" }), JSON.stringify([])]);
    const totals = await one<{ committed: string; paid: string; allocations: string }>("select (select sum(agreed_total)::text from public.bookings where wedding_id=$1 and status='confirmed') committed,(select sum(amount)::text from public.booking_transactions where wedding_id=$1) paid,(select count(*)::text from public.booking_function_allocations where wedding_id=$1) allocations", [WEDDING_A]);
    expect(totals).toEqual({ committed: "4800.00", paid: "1000.00", allocations: "2" });
    expect(quote.id).toBeTruthy();
  });

  it("keeps planner-only tables closed to portal visitors and revokes portal links", async () => {
    await assumeUser(db, OWNER_A);
    const household = await one<{ id: string }>("select public.save_guest_household($1,null,$2::jsonb) id", [WEDDING_A, JSON.stringify({ name: "TEST Portal" })]);
    const guest = await one<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: household.id, full_name: "TEST Portal Guest", email: "", phone: "", family_side: "shared", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })]);
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)", [WEDDING_A, guest.id, FUNCTION_A]);
    const link = await one<{ id: string }>("select public.create_guest_portal_link($1,$2,$3,$4::timestamptz) id", [WEDDING_A, household.id, "c".repeat(64), new Date(Date.now() + 86_400_000).toISOString()]);
    await assumeUser(db, null, "anon");
    await db.query("select public.create_guest_portal_session($1,$2)", ["c".repeat(64), "d".repeat(64)]);
    expect((await one<{ data: unknown }>("select public.get_guest_portal_data($1) data", ["d".repeat(64)])).data).not.toBeNull();
    await expectDenied(db.query("select * from public.accommodation_assignments"));
    await expectDenied(db.query("select public.get_travel_guests($1)", [WEDDING_A]));
    await assumeUser(db, OWNER_A);
    await db.query("select public.revoke_guest_portal_link($1,$2)", [WEDDING_A, link.id]);
    await assumeUser(db, null, "anon");
    expect((await one<{ data: unknown }>("select public.get_guest_portal_data($1) data", ["d".repeat(64)])).data).toBeNull();
  });

  it("round-trips CSV exports through the importer without losing or corrupting values", () => {
    const people = [
      { full_name: "Asha, Rao", email: "asha@example.test", notes: "Says \"hi\"\nsecond line" },
      { full_name: "Zoë Ó Briain", email: "", notes: "" },
      { full_name: "=HYPERLINK(\"x\")", email: "+cmd@example.test", notes: "@SUM(1)" },
    ];
    const parsed = parseCsv(createCsv(["full_name", "email", "notes"], people));
    expect(parsed.rows.every((row) => row.errors.length === 0)).toBe(true);
    expect(parsed.rows[0]!.values).toEqual(people[0]);
    expect(parsed.rows[1]!.values).toEqual(people[1]);
    // Formula-like cells are neutralised with a leading apostrophe, never executed or dropped.
    expect(parsed.rows[2]!.values.full_name).toBe("'=HYPERLINK(\"x\")");
    expect(parsed.rows[2]!.values.notes).toBe("'@SUM(1)");
  });
});

describe("failed requests never report success", () => {
  it("returns an error and no success message when validation or the data layer fails", async () => {
    const { createStayAction } = await import("../src/app/actions/travel");
    const { createIssueAction } = await import("../src/app/actions/operations");
    const { saveTemplateAction } = await import("../src/app/actions/communications");
    const { archiveDocumentAction } = await import("../src/app/actions/documents");
    const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
    const results = [
      await createStayAction({}, form({ weddingId: "not-a-uuid" })),
      await createStayAction({}, form({ weddingId: WEDDING_A, guest_id: "bad" })),
      // Valid input, but the database is unreachable in this test process: must surface as an error.
      await createStayAction({}, form({ weddingId: WEDDING_A, guest_id: WEDDING_B, room_id: WEDDING_B, check_in_date: "2027-06-17", check_out_date: "2027-06-18", status: "proposed" })),
      await createIssueAction({}, form({ weddingId: WEDDING_A, title: "TEST", severity: "high" })),
      await saveTemplateAction({}, form({ weddingId: WEDDING_A, kind: "reminder", name: "TEST", body: "Hi {{unknown_field}}" })),
      await archiveDocumentAction({}, form({ weddingId: WEDDING_A, documentId: WEDDING_B })),
    ];
    for (const result of results) {
      expect(result.error, JSON.stringify(result)).toBeTruthy();
      expect(result.message).toBeUndefined();
    }
  });
});

describe("same-origin check for route handlers", () => {
  it("compares the Origin host with the addressed host, not the server's internal URL", async () => {
    const { isSameOriginRequest } = await import("../src/lib/http/same-origin");
    const headers = (values: Record<string, string>) => new Headers(values);
    expect(isSameOriginRequest(headers({ origin: "http://127.0.0.1:3100", host: "127.0.0.1:3100" }))).toBe(true);
    expect(isSameOriginRequest(headers({ origin: "https://wedding.example", host: "internal:3000", "x-forwarded-host": "wedding.example" }))).toBe(true);
    expect(isSameOriginRequest(headers({ origin: "https://attacker.example", host: "wedding.example" }))).toBe(false);
    expect(isSameOriginRequest(headers({ origin: "null", host: "wedding.example" }))).toBe(false);
    expect(isSameOriginRequest(headers({ host: "wedding.example" }))).toBe(false);
    expect(isSameOriginRequest(headers({ origin: "not a url", host: "wedding.example" }))).toBe(false);
  });
});
