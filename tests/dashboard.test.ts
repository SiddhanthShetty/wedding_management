import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { assumeUser, createTestDatabase, FUNCTION_A, FUNCTION_A_CEREMONY, OWNER_A, WEDDING_A } from "./support/database";
import { addDaysIso, expiringSupplierItems, paymentsDueSoon, taskCounts, upcomingFunctions } from "../src/lib/planning/dashboard";
import { isTaskOverdue } from "../src/lib/planning/task-rules";
import { calculateFinanceTotals, fromMinorUnits, toMinorUnits } from "../src/lib/planning/money";
import { guestTravelStates, travelGapCounts, type JourneyKind, type JourneyStatus } from "../src/lib/planning/travel-rules";
import { unresolvedIssueCounts } from "../src/lib/planning/operations-rules";
import { cateringReviewReasons } from "../src/lib/planning/catering";

const TODAY = "2027-06-01";

describe("dashboard selections (pure)", () => {
  it("counts tasks with the same overdue rule the task page filters by", () => {
    const tasks = [
      { owner_user_id: "me", due_date: "2027-05-31", status: "not_started" },
      { owner_user_id: "me", due_date: "2027-06-01", status: "in_progress" },
      { owner_user_id: "me", due_date: "2027-05-01", status: "completed" },
      { owner_user_id: "other", due_date: "2027-05-20", status: "blocked" },
      { owner_user_id: null, due_date: "2027-06-08", status: "not_started" },
      { owner_user_id: null, due_date: "2027-06-09", status: "not_started" },
    ];
    expect(taskCounts(tasks, "me", TODAY)).toEqual({ mineOpen: 2, mineOverdue: 1, overdue: 2, dueSoon: 2 });
    expect(taskCounts(tasks, "me", TODAY).overdue).toBe(tasks.filter((task) => isTaskOverdue(task, TODAY)).length);
  });

  it("uses inclusive windows for expiring holds, quotes and payments, and ignores expired or rejected items", () => {
    const supplier = (id: string, status: string, holds: Array<string | null>, quotes: Array<string | null>) => ({
      id, name: id, status,
      requested_dates: holds.map((hold) => ({ requested_date: "2027-09-01", hold_expires_on: hold, availability_status: "on_hold" })),
      quotes: quotes.map((expires, index) => ({ version_number: index + 1, expires_on: expires })),
    });
    const items = expiringSupplierItems([
      supplier("venue", "shortlisted", [TODAY, addDaysIso(TODAY, 14), addDaysIso(TODAY, 15), "2027-05-31", null], [addDaysIso(TODAY, 3)]),
      supplier("rejected", "rejected", [TODAY], [TODAY]),
    ], TODAY);
    expect(items.map((item) => `${item.supplierId}:${item.kind}:${item.date}`)).toEqual(["venue:hold:2027-06-01", "venue:quote:2027-06-04", "venue:hold:2027-06-15"]);
    const due = paymentsDueSoon([
      { due_date: TODAY, remaining: "10.00" }, { due_date: addDaysIso(TODAY, 30), remaining: "5.00" },
      { due_date: addDaysIso(TODAY, 31), remaining: "5.00" }, { due_date: addDaysIso(TODAY, 2), remaining: "0.00" }, { due_date: "2027-05-30", remaining: "9.00" },
    ], TODAY);
    expect(due.map((row) => row.due_date)).toEqual(["2027-06-01", "2027-07-01"]);
    expect(upcomingFunctions([
      { function_date: "2027-06-01", status: "tentative" }, { function_date: "2027-05-30", status: "confirmed" },
      { function_date: "2027-07-01", status: "cancelled" }, { function_date: "2027-08-01", status: "confirmed", archived_at: "x" }, { function_date: null, status: "confirmed" },
    ], TODAY)).toEqual([{ function_date: "2027-06-01", status: "tentative" }]);
  });

  it("flags catering services with the shared review rule", () => {
    const guests = [{ guest_id: "a", response: "yes" }, { guest_id: "b", response: "yes" }, { guest_id: "c", response: "no" }];
    expect(cateringReviewReasons({ guests, assignedGuestIds: new Set(["a", "b"]), latestSnapshotConfirmed: 2, finalCountDeadline: null, hasSnapshot: true })).toEqual([]);
    expect(cateringReviewReasons({ guests, assignedGuestIds: new Set(["a"]), latestSnapshotConfirmed: 1, finalCountDeadline: "2020-01-01T00:00:00Z", hasSnapshot: true }))
      .toEqual(["Confirmed guests changed since the last snapshot (1 → 2).", "1 confirmed guest(s) have no adult or child meal category."]);
    expect(cateringReviewReasons({ guests: [], assignedGuestIds: new Set(), latestSnapshotConfirmed: null, finalCountDeadline: "2020-01-01T00:00:00Z", hasSnapshot: false }))
      .toEqual(["The final-count deadline has passed without a captured count."]);
  });
});

describe("dashboard numbers reconcile with source records", () => {
  let db: PGlite;
  beforeEach(async () => { db = await createTestDatabase(); await assumeUser(db, OWNER_A); });
  afterEach(async () => { await db.close(); });
  const rows = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

  it("counts a shared booking once and matches SQL totals per currency", async () => {
    const booking = (label: string, total: string, status: string, currency = "EUR", split = [{ function_id: null as string | null, amount: total }]) =>
      db.query<{ id: string }>("select public.create_financial_booking($1::jsonb,$2::jsonb) as id", [JSON.stringify({ wedding_id: WEDDING_A, supplier_id: null, source_estimate_id: null, category: "Test", label, agreed_total: total, currency, status }), JSON.stringify(split)]);
    const shared = (await booking("TEST shared venue", "900.00", "confirmed", "EUR", [{ function_id: FUNCTION_A, amount: "400.00" }, { function_id: FUNCTION_A_CEREMONY, amount: "500.00" }])).rows[0]!.id;
    await booking("TEST band", "300.50", "tentative");
    await booking("TEST London cars", "120.00", "confirmed", "GBP");
    await db.query("insert into public.financial_estimates(wedding_id,category,label,amount,currency,created_by_user_id) values($1,'Flowers','TEST flowers','250.25','EUR',$2)", [WEDDING_A, OWNER_A]);
    await db.query("select public.record_booking_transaction($1::jsonb,$2::jsonb)", [JSON.stringify({ wedding_id: WEDDING_A, booking_id: shared, kind: "payment", amount: "300.00", currency: "EUR", happened_on: "2027-05-01", payer_label: "TEST", obligation_id: null, idempotency_key: "f3000000-0000-4000-8000-000000000009", note: "" }), JSON.stringify([])]);
    // Same row shapes the finance loader reads, passed through the same calculation the Budget page and dashboard use.
    const bookings = await rows<{ id: string; status: "tentative" | "confirmed" | "cancelled"; total: string; currency: string }>("select id,status::text as status,agreed_total::text total,currency from public.bookings where wedding_id=$1", [WEDDING_A]);
    const tx = await rows<{ booking_id: string; kind: string; amount: string; currency: string }>("select booking_id,kind,amount::text,currency from public.booking_transactions where wedding_id=$1", [WEDDING_A]);
    const estimates = await rows<{ status: "active" | "converted" | "void"; amount: string; currency: string }>("select status::text as status,amount::text,currency from public.financial_estimates where wedding_id=$1", [WEDDING_A]);
    const totals = calculateFinanceTotals({
      budget: null, budgetCurrency: "EUR",
      bookings: bookings.map((row) => ({ status: row.status, amount: row.total, currency: row.currency, paid: fromMinorUnits(tx.filter((t) => t.booking_id === row.id).reduce((sum, t) => sum + (t.kind === "payment" ? 1n : -1n) * toMinorUnits(t.amount), 0n)) })),
      estimates, adjustments: [],
      payments: tx.filter((row) => row.kind === "payment"), refunds: tx.filter((row) => row.kind === "refund"),
    });
    const sql = await rows<{ currency: string; committed: string; forecast: string; paid: string }>(`
      select c.currency,
        coalesce((select sum(agreed_total) from public.bookings where wedding_id=$1 and currency=c.currency and status='confirmed'),0)::numeric(14,2)::text committed,
        (coalesce((select sum(agreed_total) from public.bookings where wedding_id=$1 and currency=c.currency and status in ('tentative','confirmed')),0)
          + coalesce((select sum(amount) from public.financial_estimates where wedding_id=$1 and currency=c.currency and status='active'),0))::numeric(14,2)::text forecast,
        coalesce((select sum(amount) from public.booking_transactions where wedding_id=$1 and currency=c.currency and kind='payment'),0)::numeric(14,2)::text paid
      from (select distinct currency from public.bookings where wedding_id=$1) c order by c.currency`, [WEDDING_A]);
    const byCurrency = Object.fromEntries(totals.map((total) => [total.currency, total]));
    for (const row of sql) {
      expect(byCurrency[row.currency]).toMatchObject({ committed: row.committed, forecast: row.forecast, netPaid: row.paid });
    }
    expect(byCurrency.EUR).toMatchObject({ committed: "900.00", forecast: "1450.75", netPaid: "300.00" });
    expect(byCurrency.GBP).toMatchObject({ committed: "120.00", forecast: "120.00" });
  });

  it("matches travel gaps, open issues and overdue tasks to direct SQL counts", async () => {
    const guestIds: string[] = [];
    for (const name of ["TEST A", "TEST B", "TEST C", "TEST D"]) guestIds.push((await rows<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: null, full_name: name, email: "", phone: "", family_side: "shared", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })]))[0]!.id);
    const [a, b, c] = guestIds;
    await db.query("insert into public.guest_travel_profiles(wedding_id,guest_id,accommodation_need,arrival_transport_need) values($1,$2,'required','required'),($1,$3,'required','not_required'),($1,$4,'not_required','unknown')", [WEDDING_A, a, b, c]);
    const property = (await rows<{ id: string }>("insert into public.accommodation_properties(wedding_id,name,created_by_user_id) values($1,'TEST Inn',$2) returning id", [WEDDING_A, OWNER_A]))[0]!.id;
    const type = (await rows<{ id: string }>("insert into public.accommodation_room_types(wedding_id,property_id,name,standard_occupancy) values($1,$2,'Double',2) returning id", [WEDDING_A, property]))[0]!.id;
    const room = (await rows<{ id: string }>("insert into public.accommodation_rooms(wedding_id,room_type_id,label) values($1,$2,'1') returning id", [WEDDING_A, type]))[0]!.id;
    await db.query("insert into public.accommodation_inventory(wedding_id,room_type_id,night,rooms_held) values($1,$2,'2027-06-17',1)", [WEDDING_A, type]);
    await db.query("insert into public.accommodation_assignments(wedding_id,guest_id,room_id,check_in_date,check_out_date,created_by_user_id) values($1,$2,$3,'2027-06-17','2027-06-18',$4)", [WEDDING_A, b, room, OWNER_A]);
    const states = guestTravelStates({
      guestIds: (await rows<{ id: string }>("select id from public.guests where wedding_id=$1", [WEDDING_A])).map((row) => row.id),
      profiles: await rows("select guest_id,accommodation_need::text accommodation_need,arrival_transport_need::text arrival_transport_need,departure_transport_need::text departure_transport_need from public.guest_travel_profiles where wedding_id=$1", [WEDDING_A]),
      stays: await rows("select guest_id,status::text status from public.accommodation_assignments where wedding_id=$1", [WEDDING_A]),
      passengers: (await rows<{ guest_id: string; kind: JourneyKind; status: JourneyStatus }>("select p.guest_id,j.kind::text kind,j.status::text status from public.transport_passengers p join public.transport_journeys j on j.id=p.journey_id where p.wedding_id=$1", [WEDDING_A])),
    });
    const sqlRooms = await rows<{ n: number }>("select count(*)::int n from public.guest_travel_profiles p where p.wedding_id=$1 and p.accommodation_need='required' and not exists(select 1 from public.accommodation_assignments s where s.wedding_id=p.wedding_id and s.guest_id=p.guest_id and s.status<>'cancelled')", [WEDDING_A]);
    const sqlArrivals = await rows<{ n: number }>("select count(*)::int n from public.guest_travel_profiles p where p.wedding_id=$1 and p.arrival_transport_need='required' and not exists(select 1 from public.transport_passengers tp join public.transport_journeys j on j.id=tp.journey_id where tp.guest_id=p.guest_id and j.kind='arrival' and j.status<>'cancelled')", [WEDDING_A]);
    const counts = travelGapCounts(states);
    expect(counts.roomsNotAssigned).toBe(sqlRooms[0]!.n);
    expect(counts.arrivalsNotAssigned).toBe(sqlArrivals[0]!.n);
    expect(counts).toMatchObject({ roomsNotAssigned: 1, arrivalsNotAssigned: 1, roomNeedUnknown: guestIds.length - 3 + (await rows<{ n: number }>("select count(*)::int n from public.guests where wedding_id=$1 and full_name not like 'TEST%'", [WEDDING_A]))[0]!.n });

    await db.query("insert into public.wedding_day_issues(wedding_id,title,severity,status,resolved_at,resolution_note,created_by_user_id) values($1,'TEST open','critical','open',null,'',$2),($1,'TEST working','high','in_progress',null,'',$2),($1,'TEST done','critical','resolved',now(),'Fixed',$2)", [WEDDING_A, OWNER_A]);
    const issues = await rows<{ severity: "low" | "medium" | "high" | "critical"; status: "open" | "in_progress" | "resolved" }>("select severity::text severity,status::text status from public.wedding_day_issues where wedding_id=$1", [WEDDING_A]);
    const sqlIssues = await rows<{ n: number }>("select count(*)::int n from public.wedding_day_issues where wedding_id=$1 and status<>'resolved'", [WEDDING_A]);
    expect(unresolvedIssueCounts(issues)).toEqual({ total: sqlIssues[0]!.n, critical: 1, high: 1 });

    await db.query("insert into public.tasks(wedding_id,title,due_date,status,owner_user_id,created_by_user_id,updated_by_user_id) values($1,'TEST late','2027-05-01','not_started',$2,$2,$2),($1,'TEST done late','2027-05-01','completed',$2,$2,$2),($1,'TEST later','2027-07-01','not_started',null,$2,$2)", [WEDDING_A, OWNER_A]);
    const tasks = await rows<{ owner_user_id: string | null; due_date: string | null; status: string }>("select owner_user_id,to_char(due_date,'YYYY-MM-DD') due_date,status::text status from public.tasks where wedding_id=$1", [WEDDING_A]);
    const sqlOverdue = await rows<{ n: number }>("select count(*)::int n from public.tasks where wedding_id=$1 and due_date < $2::date and status not in ('completed','cancelled')", [WEDDING_A, TODAY]);
    expect(taskCounts(tasks, OWNER_A, TODAY).overdue).toBe(sqlOverdue[0]!.n);
  });
});
