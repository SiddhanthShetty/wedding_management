import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { resolveFunctionSchedule } from "../src/lib/planning/schedule";
import { isTaskDueSoon, isTaskOverdue, wouldCreateDependencyCycle } from "../src/lib/planning/task-rules";
import { compareSuppliers, filterSuppliers } from "../src/lib/planning/supplier-rules";
import { allocationDifference, calculateFinanceTotals, formatMoney, fromMinorUnits, isOverpaid, outstandingBalance, refundOutstanding, scheduledPaymentRemaining, sumMoney, toMinorUnits } from "../src/lib/planning/money";
import { bookingInput, transactionInput } from "../src/lib/planning/finance-inputs";
import { createCsv, parseCsv, protectSpreadsheetCell } from "../src/lib/planning/guest-csv";
import { isoTimestampInput, rsvpInput } from "../src/lib/planning/guest-inputs";
import type { WeddingSupplier } from "../src/lib/data/suppliers";
import { calculateCateringCount, calculatePlateEstimate, countCateringGuests } from "../src/lib/planning/catering";
import { migrationPaths } from "./support/database";

const WEDDING_A = "a0000000-0000-4000-8000-000000000001";
const WEDDING_B = "b0000000-0000-4000-8000-000000000001";
const OWNER_A = "10000000-0000-4000-8000-000000000001";
const SCOPED = "10000000-0000-4000-8000-000000000003";
const READ_ONLY = "10000000-0000-4000-8000-000000000004";
const FUNCTION_A = "a2000000-0000-4000-8000-000000000001";
const FUNCTION_B = "b2000000-0000-4000-8000-000000000001";
const SUPPLIER_A = "a3000000-0000-4000-8000-000000000001";

let db: PGlite;

async function assumeUser(userId: string | null, databaseRole: "anon" | "authenticated" = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec("set role " + databaseRole);
}

async function expectDenied(operation: Promise<unknown>) {
  await expect(operation).rejects.toThrow();
}

async function createTask(title: string, options: { weddingId?: string; functionId?: string | null; dueDate?: string | null } = {}) {
  const sql = "insert into public.tasks (wedding_id, function_id, title, due_date, created_by_user_id, updated_by_user_id) "
    + "values ($1, $2, $3, $4, $5, $5) returning id, version";
  const result = await db.query<{ id: string; version: number }>(sql, [
    options.weddingId ?? WEDDING_A, options.functionId ?? null, title, options.dueDate ?? null, OWNER_A,
  ]);
  return result.rows[0]!;
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec([
    "create role anon nologin;",
    "create role authenticated nologin;",
    "create schema auth;",
    "create table auth.users (id uuid primary key, aud text not null default 'authenticated', role text not null default 'authenticated', email text unique not null, encrypted_password text not null default '', email_confirmed_at timestamptz, raw_app_meta_data jsonb not null default '{}'::jsonb, raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());",
    "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
  ].join("\n"));
  // Apply every migration so later migrations (which may replace functions) are covered too.
  for (const path of await migrationPaths()) {
    await db.exec(await readFile(path, "utf8"));
  }
  await db.exec(await readFile("supabase/seed.sql", "utf8"));
});

afterEach(async () => {
  await db.close();
});

describe("function schedule rules", () => {
  it("stores an overnight function as a next-day end instant in the planning timezone", () => {
    const schedule = resolveFunctionSchedule({
      date: "2027-06-18", startTime: "23:30", endTime: "01:15", timezone: "Europe/Dublin",
    });
    expect(schedule.spansMidnight).toBe(true);
    expect(new Date(schedule.endsAt!).getTime() - new Date(schedule.startsAt!).getTime()).toBe(105 * 60 * 1000);
    const localEnd = new Intl.DateTimeFormat("en", { timeZone: "Europe/Dublin", day: "2-digit" }).format(new Date(schedule.endsAt!));
    expect(localEnd).toBe("19");
  });

  it("rejects invalid dates, equal times, invalid timezones, and nonexistent daylight-saving times", () => {
    expect(() => resolveFunctionSchedule({ date: "2027-02-30", startTime: "", endTime: "", timezone: "Europe/Dublin" })).toThrow(/date/i);
    expect(() => resolveFunctionSchedule({ date: "2027-06-18", startTime: "20:00", endTime: "20:00", timezone: "Europe/Dublin" })).toThrow(/later/i);
    expect(() => resolveFunctionSchedule({ date: "2027-06-18", startTime: "20:00", endTime: "21:00", timezone: "Dublin" })).toThrow(/IANA/i);
    expect(() => resolveFunctionSchedule({ date: "2027-03-28", startTime: "01:30", endTime: "03:30", timezone: "Europe/Dublin" })).toThrow(/daylight-saving/i);
  });

  it("allows a date-only tentative function while requiring a start before an end", () => {
    expect(resolveFunctionSchedule({ date: "2027-06-18", startTime: "", endTime: "", timezone: "Europe/Dublin" }).functionDate).toBe("2027-06-18");
    expect(() => resolveFunctionSchedule({ date: "2027-06-18", startTime: "", endTime: "20:00", timezone: "Europe/Dublin" })).toThrow(/start time/i);
  });
});

describe("guest edit timestamps", () => {
  it("accepts PostgreSQL offset timestamps and UTC timestamps for optimistic concurrency", () => {
    expect(isoTimestampInput.safeParse("2026-11-04T00:00:00+00:00").success).toBe(true);
    expect(isoTimestampInput.safeParse("2026-11-04T00:00:00.000Z").success).toBe(true);
    expect(isoTimestampInput.safeParse("not-a-timestamp").success).toBe(false);
    expect(rsvpInput.safeParse({
      invitationId: "a4000000-0000-4000-8000-000000000001", response: "yes", source: "other", note: "",
      expectedUpdatedAt: "2026-11-04T00:00:00+00:00",
    }).success).toBe(true);
  });
});

describe("task due-date and dependency rules", () => {
  it("classifies overdue and due-soon tasks by wedding-local calendar date", () => {
    expect(isTaskOverdue({ due_date: "2027-06-17", status: "blocked" }, "2027-06-18")).toBe(true);
    expect(isTaskOverdue({ due_date: "2027-06-18", status: "not_started" }, "2027-06-18")).toBe(false);
    expect(isTaskOverdue({ due_date: "2027-06-17", status: "completed" }, "2027-06-18")).toBe(false);
    expect(isTaskDueSoon({ due_date: "2027-06-25", status: "in_progress" }, "2027-06-18")).toBe(true);
    expect(isTaskDueSoon({ due_date: "2027-06-26", status: "not_started" }, "2027-06-18")).toBe(false);
    expect(isTaskDueSoon({ due_date: "2027-06-20", status: "cancelled" }, "2027-06-18")).toBe(false);
  });

  it("detects dependency cycles before save", () => {
    const tasks = [
      { id: "a", depends_on_task_id: "b" },
      { id: "b", depends_on_task_id: "c" },
      { id: "c", depends_on_task_id: null },
    ];
    expect(wouldCreateDependencyCycle("c", "a", tasks)).toBe(true);
    expect(wouldCreateDependencyCycle("a", "c", tasks)).toBe(false);
    expect(wouldCreateDependencyCycle("a", null, tasks)).toBe(false);
  });
});

function supplierFixture(overrides: Partial<WeddingSupplier> = {}): WeddingSupplier {
  return {
    id: SUPPLIER_A, wedding_id: WEDDING_A, kind: "venue", name: "Garden Hall", category: "Venue",
    contact_person: "", contact_email: "", contact_phone: "", website_url: null, map_url: null,
    source: "", notes: "", responsible_user_id: null, responsible_name: null, status: "shortlisted",
    created_at: "2026-11-04T12:00:00Z", updated_at: "2026-11-04T12:00:00Z",
    venue: {
      room_availability_notes: "", catering_notes: "", outside_vendor_notes: "", parking_notes: "",
      accessibility_notes: "", pet_policy: "unknown", alcohol_policy: "unknown", music_policy: "unknown",
      weather_backup_space: "", weather_backup_capacity: null,
    }, spaces: [], requested_dates: [], quotes: [], preferences: [], visits: [], follow_ups: [],
    ...overrides,
  };
}

describe("supplier search, filters, and comparisons", () => {
  it("filters by search, category, status, and shortlist view", () => {
    const suppliers = [
      supplierFixture({ id: "one", name: "Rose Garden", category: "Venue", status: "shortlisted" }),
      supplierFixture({ id: "two", kind: "vendor", name: "Northside Photo", category: "Photography", status: "contacted", venue: null }),
      supplierFixture({ id: "three", name: "River House", category: "Venue", status: "selected" }),
    ];
    expect(filterSuppliers(suppliers, { query: "north", status: "all", category: "all" }).map((item) => item.id)).toEqual(["two"]);
    expect(filterSuppliers(suppliers, { status: "all", category: "Venue", shortlistOnly: true }).map((item) => item.id)).toEqual(["one", "three"]);
    expect(filterSuppliers(suppliers, { status: "contacted", category: "all" }).map((item) => item.id)).toEqual(["two"]);
  });

  it("keeps unknown capacity and quote totals distinct from explicit zero", () => {
    const unknown = supplierFixture({ spaces: [{ id: "s1", name: "Main room", capacity: null, notes: "", archived_at: null }] });
    const zero = supplierFixture({ id: "zero", name: "Small room", spaces: [{ id: "s2", name: "Main room", capacity: 0, notes: "", archived_at: null }], quotes: [{
      id: "q0", version_number: 1, quoted_on: "2026-11-01", currency: "EUR", total_amount: 0,
      includes: "", excludes: "", expires_on: null, created_at: "2026-11-01T00:00:00Z", items: [],
    }] });
    const unknownWithQuote = supplierFixture({ id: "quote-unknown", quotes: [{
      id: "q1", version_number: 1, quoted_on: "2026-11-01", currency: "EUR", total_amount: null,
      includes: "", excludes: "", expires_on: null, created_at: "2026-11-01T00:00:00Z", items: [],
    }] });
    const rows = compareSuppliers([unknown, zero]);
    expect(rows.find((row) => row.label === "Event spaces and capacity")?.values).toEqual(["Main room (Unknown)", "Main room (0)"]);
    const quoteRow = compareSuppliers([unknownWithQuote, zero]).find((row) => row.label === "Latest quote total");
    expect(quoteRow?.values).toEqual(["Not provided (EUR)", "EUR 0.00"]);
  });
});

describe("exact financial calculations", () => {
  it("uses integer minor units for decimal amounts and hand-checkable sums", () => {
    expect(toMinorUnits("0.01")).toBe(1n);
    expect(sumMoney(["19.99", "0.02", "100.00"])).toBe("120.01");
    expect(formatMoney("1234567.89", "EUR")).toBe("EUR 1,234,567.89");
    expect(() => toMinorUnits("1.001")).toThrow(/two decimal places/i);
  });

  it("computes budget, forecast, committed cost, net paid and outstanding balances by currency", () => {
    const totals = calculateFinanceTotals({
      budget: "1000.00", budgetCurrency: "EUR",
      bookings: [
        { status: "confirmed", amount: "100.00", currency: "EUR", paid: "40.00" },
        { status: "tentative", amount: "50.00", currency: "EUR", paid: "60.00" },
        { status: "cancelled", amount: "700.00", currency: "EUR", paid: "0.00" },
        { status: "confirmed", amount: "20.00", currency: "USD", paid: "20.00" },
      ],
      estimates: [
        { status: "active", amount: "200.00", currency: "EUR" },
        { status: "converted", amount: "90.00", currency: "EUR" },
      ],
      adjustments: [{ amount: "-10.00", currency: "EUR" }],
      payments: [{ amount: "40.00", currency: "EUR" }, { amount: "60.00", currency: "EUR" }, { amount: "20.00", currency: "USD" }],
      refunds: [{ amount: "5.00", currency: "EUR" }],
    });
    expect(totals).toEqual([
      { currency: "EUR", budget: "1000.00", forecast: "340.00", committed: "100.00", netPaid: "95.00", outstanding: "60.00" },
      { currency: "USD", budget: null, forecast: "20.00", committed: "20.00", netPaid: "20.00", outstanding: "0.00" },
    ]);
  });

  it("calculates schedules, refunds, allocation reconciliation and flags overpayments", () => {
    expect(outstandingBalance("850.00", "300.25")).toBe("549.75");
    expect(outstandingBalance("850.00", "900.00")).toBe("0.00");
    expect(scheduledPaymentRemaining("400.00", ["150.00", "50.00"])).toBe("200.00");
    expect(refundOutstanding("400.00", ["125.50"])).toBe("274.50");
    expect(refundOutstanding("100.00", ["125.00"])).toBe("0.00");
    expect(allocationDifference("500.00", ["200.00", "300.00"])).toBe("0.00");
    expect(allocationDifference("500.00", ["200.00", "250.00"])).toBe("50.00");
    expect(isOverpaid("500.00", ["250.00", "260.01"])).toBe(true);
    expect(isOverpaid("500.00", ["500.00", "20.00"], ["20.00"])).toBe(false);
  });

  it("validates exact decimal booking allocations and contributor totals without numeric coercion", () => {
    const base={supplierId:"",sourceEstimateId:"",category:"Venue",label:"Shared space",amount:"100.00",currency:"EUR",status:"confirmed" as const};
    expect(bookingInput.safeParse({...base,allocations:[{functionId:FUNCTION_A,amount:"60.00"},{functionId:FUNCTION_B,amount:"40.00"}]}).success).toBe(true);
    expect(bookingInput.safeParse({...base,allocations:[{functionId:FUNCTION_A,amount:"60.00"},{functionId:FUNCTION_A,amount:"40.00"}]}).success).toBe(false);
    expect(bookingInput.safeParse({...base,allocations:[{functionId:"",amount:"60.00"},{functionId:FUNCTION_A,amount:"40.00"}]}).success).toBe(false);
    expect(bookingInput.safeParse({...base,amount:"0.1e2",allocations:[{functionId:"",amount:"100.00"}]}).success).toBe(false);
    const payment={bookingId:"a3000000-0000-4000-8000-000000000001",kind:"payment" as const,amount:"50.00",currency:"EUR",date:"2027-06-01",payer:"Partners",obligationId:"",idempotencyKey:"f3000000-0000-4000-8000-000000000001",note:"",contributions:[{memberUserId:"",label:"One",amount:"25.00"},{memberUserId:"",label:"Two",amount:"25.00"}]};
    expect(transactionInput.safeParse(payment).success).toBe(true);
    expect(transactionInput.safeParse({...payment,contributions:[{memberUserId:"",label:"One",amount:"49.99"}]}).success).toBe(false);
  });
});

describe("guest CSV safety and parsing",()=>{
  it("parses quoted commas, escaped quotes, multiline cells, and flags mismatched rows",()=>{
    const parsed=parseCsv('Name,Household,Notes\r\n"Doe, Jane",Doe,"Said ""hello""\nand left"\r\nSam,Family');
    expect(parsed.headers).toEqual(["Name","Household","Notes"]);
    expect(parsed.rows[0]?.values).toEqual({Name:"Doe, Jane",Household:"Doe",Notes:'Said "hello"\nand left'});
    expect(parsed.rows[1]?.errors).toEqual(["Expected 3 columns but found 2."]);
    expect(()=>parseCsv('Name,Email\n"Unclosed,x')).toThrow(/unclosed/i);
  });

  it("protects formula-like cells and quotes CSV fields",()=>{
    expect(protectSpreadsheetCell("=1+1")).toBe('"\'=1+1"');
    expect(protectSpreadsheetCell("  @SUM(A1:A2)")).toBe('"\'  @SUM(A1:A2)"');
    expect(protectSpreadsheetCell("+1-555-1234")).toBe('"\'+1-555-1234"');
    expect(createCsv(["Name","Notes"],[{Name:"Guest",Notes:"safe, \"quoted\""}])).toBe('"Name","Notes"\r\n"Guest","safe, ""quoted"""');
  });
});

describe("financial database boundaries", () => {
  it("enforces the finance module and wedding boundary on every write", async () => {
    await assumeUser(SCOPED);
    const values={wedding_id:WEDDING_A,supplier_id:null,source_estimate_id:null,category:"Venue",label:"Denied",agreed_total:"10.00",currency:"EUR",status:"confirmed"};
    await expectDenied(db.query("select public.create_financial_booking($1::jsonb,$2::jsonb)",[JSON.stringify(values),JSON.stringify([{function_id:null,amount:"10.00"}])]));
    await assumeUser(OWNER_A);
    await db.query("select public.set_member_module_access($1,$2,'suppliers_finance','edit')",[WEDDING_A,SCOPED]);
    await assumeUser(SCOPED);
    const scopedWrite=await db.query("select public.create_financial_booking($1::jsonb,$2::jsonb)",[JSON.stringify({...values,label:"Scoped edit"}),JSON.stringify([{function_id:null,amount:"10.00"}])]);
    expect(scopedWrite.rows).toHaveLength(1);
    await assumeUser(OWNER_A);
    await db.query("select public.set_member_module_access($1,$2,'suppliers_finance','read')",[WEDDING_A,READ_ONLY]);
    await assumeUser(READ_ONLY);
    expect((await db.query("select id from public.bookings where wedding_id=$1",[WEDDING_A])).rows).toHaveLength(1);
    await expectDenied(db.query("select public.create_financial_booking($1::jsonb,$2::jsonb)",[JSON.stringify(values),JSON.stringify([{function_id:null,amount:"10.00"}])]));
    await assumeUser(OWNER_A);
    const privateRows=await db.query("select id from public.bookings where wedding_id=$1",[WEDDING_B]);
    expect(privateRows.rows).toHaveLength(0);
    await expectDenied(db.query("select public.create_financial_booking($1::jsonb,$2::jsonb)",[JSON.stringify({...values,wedding_id:WEDDING_B}),JSON.stringify([{function_id:null,amount:"10.00"}])]));
  });

  it("stores shared function allocations that reconcile to one booking total", async () => {
    await assumeUser(OWNER_A);
    const result = await db.query<{ id: string }>(
      "select public.create_financial_booking($1::jsonb,$2::jsonb) as id",
      [JSON.stringify({ wedding_id:WEDDING_A, supplier_id:null, source_estimate_id:null, category:"Venue", label:"Shared venue", agreed_total:"500.00", currency:"EUR", status:"confirmed" }), JSON.stringify([{function_id:FUNCTION_A,amount:"200.00"},{function_id:"a2000000-0000-4000-8000-000000000002",amount:"300.00"}])],
    );
    const totals = await db.query<{ bookings: string; allocation: string }>(
      "select (select count(*)::text from public.bookings where wedding_id=$1) as bookings,(select sum(amount)::text from public.booking_function_allocations where booking_id=$2) as allocation",
      [WEDDING_A,result.rows[0]!.id],
    );
    expect(totals.rows[0]).toEqual({bookings:"1",allocation:"500.00"});
    await expectDenied(db.query("select public.create_financial_booking($1::jsonb,$2::jsonb)",[JSON.stringify({ wedding_id:WEDDING_A, supplier_id:null, source_estimate_id:null, category:"Venue", label:"Invalid", agreed_total:"500.00", currency:"EUR", status:"confirmed" }),JSON.stringify([{function_id:FUNCTION_A,amount:"499.99"}])]));
  });

  it("converts an estimate exactly once and keeps it out of active estimates", async () => {
    await assumeUser(OWNER_A);
    const estimate = await db.query<{id:string}>("insert into public.financial_estimates(wedding_id,category,label,amount,currency,created_by_user_id) values($1,'Food','Catering estimate','1200.00','EUR',$2) returning id",[WEDDING_A,OWNER_A]);
    const booking = await db.query<{id:string}>("select public.create_financial_booking($1::jsonb,$2::jsonb) as id",[
      JSON.stringify({wedding_id:WEDDING_A,supplier_id:null,source_estimate_id:estimate.rows[0]!.id,category:"Food",label:"Catering booking",agreed_total:"1250.00",currency:"EUR",status:"confirmed"}),JSON.stringify([{function_id:null,amount:"1250.00"}]),
    ]);
    const state = await db.query<{status:string; linked:string}>("select e.status::text as status,b.source_estimate_id::text as linked from public.financial_estimates e join public.bookings b on b.source_estimate_id=e.id where b.id=$1",[booking.rows[0]!.id]);
    expect(state.rows[0]).toEqual({status:"converted",linked:estimate.rows[0]!.id});
    await expectDenied(db.query("select public.create_financial_booking($1::jsonb,$2::jsonb)",[JSON.stringify({wedding_id:WEDDING_A,supplier_id:null,source_estimate_id:estimate.rows[0]!.id,category:"Food",label:"Duplicate",agreed_total:"1250.00",currency:"EUR",status:"confirmed"}),JSON.stringify([{function_id:null,amount:"1250.00"}])]));
  });

  it("makes payment submission idempotent and requires contribution lines to reconcile", async () => {
    await assumeUser(OWNER_A);
    const booking = await db.query<{id:string}>("select public.create_financial_booking($1::jsonb,$2::jsonb) as id",[
      JSON.stringify({wedding_id:WEDDING_A,supplier_id:null,source_estimate_id:null,category:"Venue",label:"Hall",agreed_total:"100.00",currency:"EUR",status:"confirmed"}),JSON.stringify([{function_id:null,amount:"100.00"}]),
    ]);
    const key="f3000000-0000-4000-8000-000000000001";
    const input={wedding_id:WEDDING_A,booking_id:booking.rows[0]!.id,kind:"payment",amount:"50.00",currency:"EUR",happened_on:"2027-06-01",payer_label:"Partners",obligation_id:null,idempotency_key:key,note:"Deposit"};
    const contributions=[{member_user_id:OWNER_A,contributor_label:"Partner One",amount:"25.00"},{member_user_id:"10000000-0000-4000-8000-000000000002",contributor_label:"Partner Two",amount:"25.00"}];
    const first=await db.query<{id:string}>("select public.record_booking_transaction($1::jsonb,$2::jsonb) as id",[JSON.stringify(input),JSON.stringify(contributions)]);
    const second=await db.query<{id:string}>("select public.record_booking_transaction($1::jsonb,$2::jsonb) as id",[JSON.stringify(input),JSON.stringify(contributions)]);
    expect(second.rows[0]!.id).toBe(first.rows[0]!.id);
    const count=await db.query<{count:string}>("select count(*)::text as count from public.booking_transactions where booking_id=$1",[booking.rows[0]!.id]);
    expect(count.rows[0]!.count).toBe("1");
    await expectDenied(db.query("select public.record_booking_transaction($1::jsonb,$2::jsonb)",[JSON.stringify({...input,idempotency_key:"f3000000-0000-4000-8000-000000000002"}),JSON.stringify([{member_user_id:OWNER_A,contributor_label:"Partner One",amount:"49.99"}])]));
    await db.query("select public.cancel_financial_booking($1,$2,$3,$4)",[WEDDING_A,booking.rows[0]!.id,"Test cancellation","75.00"]);
    const retained=await db.query<{status:string;refund_expected_amount:string;transactions:string}>("select b.status::text,b.refund_expected_amount::text,(select count(*)::text from public.booking_transactions t where t.booking_id=b.id) as transactions from public.bookings b where b.id=$1",[booking.rows[0]!.id]);
    expect(retained.rows[0]).toEqual({status:"cancelled",refund_expected_amount:"75.00",transactions:"1"});
  });
});

describe("guest household, invitation, RSVP and import rules",()=>{
  async function addGuest(householdId:string,name:string){
    const result=await db.query<{id:string}>("select public.save_guest($1,null,$2::jsonb,null) as id",[WEDDING_A,JSON.stringify({household_id:householdId,full_name:name,email:"",phone:"",family_side:"shared",meal_preference:"",allergies:"",assistance_needs:"",notes:""})]);
    return result.rows[0]!.id;
  }

  it("keeps four household members and their wedding/Sangeet responses individual",async()=>{
    await assumeUser(OWNER_A);
    const household=await db.query<{id:string}>("select public.save_guest_household($1,null,$2::jsonb) as id",[WEDDING_A,JSON.stringify({name:"Example Household",contact_name:"Contact Person"})]);
    const householdId=household.rows[0]!.id;const people=[] as string[];
    for(const name of ["Guest One","Guest Two","Guest Three","Guest Four"])people.push(await addGuest(householdId,name));
    for(const guestId of people)await db.query("select public.set_guest_invitation($1,$2,$3,true,false)",[WEDDING_A,guestId,FUNCTION_A]);
    for(const guestId of people.slice(0,2))await db.query("select public.set_guest_invitation($1,$2,$3,true,false)",[WEDDING_A,guestId,"a2000000-0000-4000-8000-000000000002"]);
    const weddingInvites=await db.query<{total:string;yes:string;no:string;pending:string}>("select count(*)::text total,count(*) filter(where r.response='yes')::text yes,count(*) filter(where r.response='no')::text no,count(*) filter(where r.id is null)::text pending from public.guest_invitations i left join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id where i.wedding_id=$1 and i.function_id=$2 and i.status='invited'",[WEDDING_A,FUNCTION_A]);
    const sangeetInvites=await db.query<{total:string}>("select count(*)::text total from public.guest_invitations where wedding_id=$1 and function_id=$2 and status='invited'",[WEDDING_A,"a2000000-0000-4000-8000-000000000002"]);
    const first=await db.query<{id:string}>("select id from public.guest_invitations where wedding_id=$1 and guest_id=$2 and function_id=$3",[WEDDING_A,people[0],FUNCTION_A]);
    await db.query("select public.record_guest_rsvp($1,$2,'no','phone','Called to decline',null)",[WEDDING_A,first.rows[0]!.id]);
    const second=await db.query<{id:string}>("select id from public.guest_invitations where wedding_id=$1 and guest_id=$2 and function_id=$3",[WEDDING_A,people[1],FUNCTION_A]);
    await db.query("select public.record_guest_rsvp($1,$2,'yes','phone','Called to accept',null)",[WEDDING_A,second.rows[0]!.id]);
    const counts=await db.query<{total:string;yes:string;no:string;pending:string;household_size:string}>("select count(*)::text total,count(*) filter(where r.response='yes')::text yes,count(*) filter(where r.response='no')::text no,count(*) filter(where r.id is null)::text pending,(select count(*)::text from public.guests where household_id=$3) household_size from public.guest_invitations i left join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id where i.wedding_id=$1 and i.function_id=$2 and i.status='invited'",[WEDDING_A,FUNCTION_A,householdId]);
    expect(weddingInvites.rows[0]?.total).toBe("4");
    expect(sangeetInvites.rows[0]?.total).toBe("2");
    expect(counts.rows[0]).toEqual({total:"4",yes:"1",no:"1",pending:"2",household_size:"4"});
    const current=await db.query<{response:string;response_source:string;recorded_by_user_id:string;updated_at:string}>("select response,response_source,recorded_by_user_id,updated_at from public.guest_rsvps where invitation_id=$1",[first.rows[0]!.id]);
    expect(current.rows[0]).toMatchObject({response:"no",response_source:"phone",recorded_by_user_id:OWNER_A});
    await db.query("select public.record_guest_rsvp($1,$2,'maybe','email','Updated after follow-up',$3::timestamptz)",[WEDDING_A,first.rows[0]!.id,current.rows[0]!.updated_at]);
    const history=await db.query<{count:string}>("select count(*)::text count from public.guest_rsvp_history where invitation_id=$1",[first.rows[0]!.id]);
    expect(history.rows[0]?.count).toBe("2");
  });

  it("saves invitation changes for multiple functions atomically",async()=>{
    await assumeUser(OWNER_A);
    const household=await db.query<{id:string}>("select public.save_guest_household($1,null,$2::jsonb) as id",[WEDDING_A,JSON.stringify({name:"Batch invitation household"})]);
    const first=await addGuest(household.rows[0]!.id,"Batch Guest One");
    const second=await addGuest(household.rows[0]!.id,"Batch Guest Two");
    const payload=[
      {guest_id:first,function_id:FUNCTION_A,invited:true,plus_one_allowed:false},
      {guest_id:second,function_id:"a2000000-0000-4000-8000-000000000002",invited:true,plus_one_allowed:true},
    ];
    const saved=await db.query<{count:number}>("select public.set_guest_invitations_bulk($1,$2::jsonb) as count",[WEDDING_A,JSON.stringify(payload)]);
    expect(saved.rows[0]?.count).toBe(2);
    const persisted=await db.query<{guest_id:string;function_id:string;status:string;plus_one_allowed:boolean}>("select guest_id,function_id,status,plus_one_allowed from public.guest_invitations where wedding_id=$1 and guest_id=any($2::uuid[]) order by guest_id",[WEDDING_A,[first,second]]);
    expect(persisted.rows).toHaveLength(2);
    expect(persisted.rows.map(row=>row.status)).toEqual(["invited","invited"]);

    await db.query("select public.set_guest_invitation($1,$2,$3,false,false)",[WEDDING_A,first,FUNCTION_A]);
    const invalidBatch=[
      {guest_id:first,function_id:FUNCTION_A,invited:true,plus_one_allowed:false},
      {guest_id:second,function_id:FUNCTION_B,invited:true,plus_one_allowed:false},
    ];
    await expectDenied(db.query("select public.set_guest_invitations_bulk($1,$2::jsonb)",[WEDDING_A,JSON.stringify(invalidBatch)]));
    const afterRollback=await db.query<{status:string}>("select status from public.guest_invitations where wedding_id=$1 and guest_id=$2 and function_id=$3",[WEDDING_A,first,FUNCTION_A]);
    expect(afterRollback.rows[0]?.status).toBe("withdrawn");
  });

  it("limits plus-ones to one named person per primary guest and approved function",async()=>{
    await assumeUser(OWNER_A);
    const household=await db.query<{id:string}>("select public.save_guest_household($1,null,$2::jsonb) as id",[WEDDING_A,JSON.stringify({name:"Plus-one family"})]);
    const primary=await addGuest(household.rows[0]!.id,"Primary Guest");
    await db.query("select public.set_guest_invitation($1,$2,$3,true,true)",[WEDDING_A,primary,FUNCTION_A]);
    const plusOne=await db.query<{id:string}>("select public.create_guest_plus_one($1,$2,'Named Plus One',$3::uuid[]) as id",[WEDDING_A,primary,[FUNCTION_A]]);
    await expectDenied(db.query("select public.create_guest_plus_one($1,$2,'Second Plus One',$3::uuid[])",[WEDDING_A,primary,[FUNCTION_A]]));
    await expectDenied(db.query("select public.set_guest_invitation($1,$2,$3,true,false)",[WEDDING_A,plusOne.rows[0]!.id,"a2000000-0000-4000-8000-000000000002"]));
    const invitation=await db.query<{invitation_kind:string;plus_one_for_guest_id:string}>("select invitation_kind,plus_one_for_guest_id from public.guest_invitations where wedding_id=$1 and guest_id=$2",[WEDDING_A,plusOne.rows[0]!.id]);
    expect(invitation.rows[0]).toEqual({invitation_kind:"plus_one",plus_one_for_guest_id:primary});
  });

  it("records import batches, duplicate review rows, and rejects an exact file re-import",async()=>{
    await assumeUser(OWNER_A);
    const hash="d".repeat(64);
    const rows=[{row_number:2,raw:{Name:"Import Guest",Household:"Import Family"},guest:{full_name:"Import Guest",household_name:"Import Family",email:"import@example.test",phone:"",family_side:"unknown",meal_preference:"Vegetarian",allergies:"",assistance_needs:""},errors:[],allow_duplicate:false}];
    const first=await db.query<{batch:unknown}>("select public.import_guest_rows($1,$2,$3,$4::jsonb) batch",[WEDDING_A,hash,"guests.csv",JSON.stringify(rows)]);
    expect((first.rows[0]!.batch as {imported_count:number}).imported_count).toBe(1);
    await expectDenied(db.query("select public.import_guest_rows($1,$2,$3,$4::jsonb)",[WEDDING_A,hash,"guests.csv",JSON.stringify(rows)]));
    const duplicate=await db.query<{batch:unknown}>("select public.import_guest_rows($1,$2,$3,$4::jsonb) batch",[WEDDING_A,"e".repeat(64),"guests-copy.csv",JSON.stringify(rows)]);
    expect(duplicate.rows[0]!.batch).toMatchObject({review_count:1,imported_count:0});
    const logged=await db.query<{status:string;duplicate_count:string}>("select status,array_length(duplicate_guest_ids,1)::text duplicate_count from public.guest_import_rows where batch_id=$1",[(duplicate.rows[0]!.batch as {batch_id:string}).batch_id]);
    expect(logged.rows[0]).toEqual({status:"duplicate_review",duplicate_count:"1"});
  });

  it("enforces guest module and wedding isolation for read and write access",async()=>{
    await assumeUser(OWNER_A);const household=await db.query<{id:string}>("select public.save_guest_household($1,null,$2::jsonb) as id",[WEDDING_A,JSON.stringify({name:"Private household"})]);
    await addGuest(household.rows[0]!.id,"Private person");
    await db.query("select public.set_member_module_access($1,$2,'guests','read')",[WEDDING_A,READ_ONLY]);
    await assumeUser(READ_ONLY);
    expect((await db.query("select id from public.guests where wedding_id=$1",[WEDDING_A])).rows).toHaveLength(1);
    expect((await db.query("select id from public.guests where wedding_id=$1",[WEDDING_B])).rows).toHaveLength(0);
    await expectDenied(db.query("select public.save_guest_household($1,null,$2::jsonb)",[WEDDING_A,JSON.stringify({name:"Read-only write"})]));
  });
});

describe("per-function catering counts, guarantees and snapshots",()=>{
  async function createCateringFixture(){
    await assumeUser(OWNER_A);
    const household=await db.query<{id:string}>("select public.save_guest_household($1,null,$2::jsonb) id",[WEDDING_A,JSON.stringify({name:"Catering count family"})]);
    const people:string[]=[];
    for(const name of ["Adult One","Child One","Adult Two","Child Two"]) {
      const row=await db.query<{id:string}>("select public.save_guest($1,null,$2::jsonb,null) id",[WEDDING_A,JSON.stringify({household_id:household.rows[0]!.id,full_name:name,email:"",phone:"",family_side:"shared",meal_preference:name==="Adult One"?"Vegetarian":"",allergies:name==="Adult One"?"Peanuts":"",assistance_needs:"",notes:""})]);
      people.push(row.rows[0]!.id);
      await db.query("select public.set_guest_invitation($1,$2,$3,true,false)",[WEDDING_A,row.rows[0]!.id,FUNCTION_A]);
    }
    const invitations=await db.query<{id:string;guest_id:string}>("select id,guest_id from public.guest_invitations where wedding_id=$1 and function_id=$2 and guest_id=any($3::uuid[])",[WEDDING_A,FUNCTION_A,people]);
    for(let i=0;i<invitations.rows.length;i++){
      const response=i===0?"yes":i===1?"yes":i===2?"no":"maybe";
      await db.query("select public.record_guest_rsvp($1,$2,$3,'phone','Recorded response',null)",[WEDDING_A,invitations.rows[i]!.id,response]);
    }
    const service=await db.query<{id:string}>("insert into public.catering_meal_services(wedding_id,function_id,name,final_count_deadline,currency,created_by_user_id) values($1,$2,'Dinner',now()-interval '1 day','EUR',$3) returning id",[WEDDING_A,FUNCTION_A,OWNER_A]);
    for(const category of ["adult","child","vendor","staff"])await db.query("insert into public.catering_service_counts(wedding_id,meal_service_id,category) values($1,$2,$3)",[WEDDING_A,service.rows[0]!.id,category]);
    await db.query("insert into public.catering_guest_assignments(wedding_id,meal_service_id,guest_id,category) values($1,$2,$3,'adult'),($1,$2,$4,'child'),($1,$2,$5,'adult'),($1,$2,$6,'child')",[WEDDING_A,service.rows[0]!.id,...people]);
    await db.query("update public.catering_service_counts set manual_expected_count=1,per_plate_rate=\n      case category when 'vendor' then 18.50 when 'staff' then 12.25 else null end where wedding_id=$1 and meal_service_id=$2 and category in ('vendor','staff')",[WEDDING_A,service.rows[0]!.id]);
    await expectDenied(db.query("update public.catering_meal_services set currency='GBP' where wedding_id=$1 and id=$2",[WEDDING_A,service.rows[0]!.id]));
    await db.query("select public.approve_catering_guarantee($1,$2,7,2)",[WEDDING_A,service.rows[0]!.id]);
    return {people,serviceId:service.rows[0]!.id,invitations:invitations.rows};
  }

  it("counts mixed household responses by distinct person and includes manual staff/vendor meals once",async()=>{
    const {people,serviceId}=await createCateringFixture();
    const invites=await db.query<{invited:string;confirmed:string}>("select count(distinct guest_id)::text invited,count(distinct guest_id) filter(where r.response='yes')::text confirmed from public.guest_invitations i left join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id where i.wedding_id=$1 and i.function_id=$2 and i.status='invited' and guest_id=any($3::uuid[])",[WEDDING_A,FUNCTION_A,people]);
    expect(invites.rows[0]).toEqual({invited:"4",confirmed:"2"});
    await expectDenied(db.query("insert into public.catering_guest_assignments(wedding_id,meal_service_id,guest_id,category) values($1,$2,$3,'child')",[WEDDING_A,serviceId,people[0]]));
    const snapId=await db.query<{id:string}>("select public.capture_catering_count_snapshot($1,$2) id",[WEDDING_A,serviceId]);
    const snap=await db.query<{id:string;invited_count:number;confirmed_count:number;final_catering_count:number;approved_guarantee:number;category_totals:any}>("select id,invited_count,confirmed_count,final_catering_count,approved_guarantee,category_totals from public.catering_count_snapshots where id=$1",[snapId.rows[0]!.id]);
    expect(snap.rows[0]).toMatchObject({invited_count:4,confirmed_count:2,approved_guarantee:7,final_catering_count:9});
    expect(snap.rows[0]?.category_totals.vendor.manual_expected).toBe(1);
    expect(snap.rows[0]?.category_totals.staff.manual_expected).toBe(1);
  });

  it("does not mutate an approved guarantee or prior snapshot when an RSVP changes after deadline",async()=>{
    const {people,serviceId,invitations}=await createCateringFixture();
    const first=await db.query<{id:string}> ("select public.capture_catering_count_snapshot($1,$2) id",[WEDDING_A,serviceId]);
    const original=await db.query<{final_catering_count:number;confirmed_count:number}> ("select final_catering_count,confirmed_count from public.catering_count_snapshots where id=$1",[first.rows[0]!.id]);
    const noResponse=await db.query<{id:string}> ("select i.id from public.guest_invitations i join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id where i.wedding_id=$1 and i.function_id=$2 and r.response='no' limit 1",[WEDDING_A,FUNCTION_A]);
    const responseVersion=await db.query<{updated_at:string}>("select updated_at from public.guest_rsvps where invitation_id=$1",[noResponse.rows[0]!.id]);
    await db.query("select public.record_guest_rsvp($1,$2,'yes','phone','Changed after deadline',$3::timestamptz)",[WEDDING_A,noResponse.rows[0]!.id,responseVersion.rows[0]!.updated_at]);
    const service=await db.query<{approved_guarantee:number;agreed_buffer:number}> ("select approved_guarantee,agreed_buffer from public.catering_meal_services where id=$1",[serviceId]);
    const prior=await db.query<{final_catering_count:number;confirmed_count:number}> ("select final_catering_count,confirmed_count from public.catering_count_snapshots where id=$1",[first.rows[0]!.id]);
    expect(service.rows[0]).toEqual({approved_guarantee:7,agreed_buffer:2});
    expect(prior.rows[0]).toEqual(original.rows[0]);
    const newerId=await db.query<{id:string}> ("select public.capture_catering_count_snapshot($1,$2) id",[WEDDING_A,serviceId]);
    const newer=await db.query<{confirmed_count:number}>("select confirmed_count from public.catering_count_snapshots where id=$1",[newerId.rows[0]!.id]);
    expect(newer.rows[0]?.confirmed_count).toBe(3);
  });

  it("keeps individual allergy details restricted to owners or guest editors",async()=>{
    const fixture=await createCateringFixture();
    await db.exec("reset role");
    await db.query("update public.guests set allergies='' where wedding_id=$1",[WEDDING_A]);
    await db.query("update public.guests set allergies='Peanuts' where wedding_id=$1 and id=(select i.guest_id from public.guest_invitations i join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id where i.wedding_id=$1 and i.function_id=$2 and r.response='yes' order by i.guest_id limit 1)",[WEDDING_A,FUNCTION_A]);
    await assumeUser("10000000-0000-4000-8000-000000000003");
    await expectDenied(db.query("select * from public.get_catering_allergy_details($1,$2)",[WEDDING_A,fixture.serviceId]));
    await expectDenied(db.query("select public.approve_catering_guarantee($1,$2,9,2)",[WEDDING_A,fixture.serviceId]));
    await expectDenied(db.query("select public.save_catering_category_count($1,$2,'vendor',$3::jsonb)",[WEDDING_A,fixture.serviceId,JSON.stringify({manual_expected_count:3})]));
    await assumeUser(OWNER_A);
    const detail=await db.query<{guest_name:string;allergies:string}>("select * from public.get_catering_allergy_details($1,$2)",[WEDDING_A,fixture.serviceId]);
    expect(detail.rows).toHaveLength(1);
    expect(detail.rows[0]?.allergies).toBe("Peanuts");
  });
});

describe("catering count calculations",()=>{
  it("uses the accepted count, enforces the minimum guarantee, then adds buffer",()=>{
    expect(calculateCateringCount({invited:10,confirmed:6,manuallyExpected:null,guarantee:8,buffer:2})).toEqual({expected:6,guaranteeFloor:8,finalCount:10});
    expect(calculateCateringCount({invited:10,confirmed:6,manuallyExpected:9,guarantee:8,buffer:2}).finalCount).toBe(11);
  });
  it("counts repeated rows for one person once and keeps invited separate from confirmed",()=>{
    expect(countCateringGuests([{guestId:"a",invited:true,response:"yes"},{guestId:"a",invited:true,response:"yes"},{guestId:"b",invited:true,response:"no"},{guestId:"c",invited:false,response:"yes"}])).toEqual({invited:2,confirmed:1});
  });
  it("does not treat an unknown manual count or guarantee as an explicit zero",()=>{
    expect(calculateCateringCount({invited:4,confirmed:2,manuallyExpected:null,guarantee:null,buffer:0})).toMatchObject({expected:2,finalCount:2});
  });
  it("multiplies per-plate rates using exact minor units",()=>{
    expect(calculatePlateEstimate(3,"18.50")).toBe("55.50");
    expect(calculatePlateEstimate(4,"12.25")).toBe("49.00");
  });
});

describe("private guest household portal",()=>{
  async function portalFixture(){
    await assumeUser(OWNER_A);
    const household=await db.query<{id:string}>("select public.save_guest_household($1,null,$2::jsonb) id",[WEDDING_A,JSON.stringify({name:"Portal Family"})]);
    const householdId=household.rows[0]!.id;
    const guest=await db.query<{id:string}>("select public.save_guest($1,null,$2::jsonb,null) id",[WEDDING_A,JSON.stringify({household_id:householdId,full_name:"Invited Person",meal_preference:"",allergies:"",assistance_needs:"",family_side:"shared",email:"",phone:"",notes:""})]);
    const guestId=guest.rows[0]!.id;
    const secondGuest=await db.query<{id:string}>("select public.save_guest($1,null,$2::jsonb,null) id",[WEDDING_A,JSON.stringify({household_id:householdId,full_name:"Not Invited Person",meal_preference:"",allergies:"",assistance_needs:"",family_side:"shared",email:"",phone:"",notes:""})]);
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)",[WEDDING_A,guestId,FUNCTION_A]);
    const invitation=await db.query<{id:string}>("select id from public.guest_invitations where wedding_id=$1 and guest_id=$2 and function_id=$3",[WEDDING_A,guestId,FUNCTION_A]);
    const link=await db.query<{id:string}>("select public.create_guest_portal_link($1,$2,'{}'::uuid[],$3,$4::timestamptz) id",[WEDDING_A,guestId,"a".repeat(64),new Date(Date.now()+86_400_000).toISOString()]);
    await assumeUser(null,"anon");
    await db.query("select public.create_guest_portal_session($1,$2)",["a".repeat(64),"b".repeat(64)]);
    return {householdId,guestId,proxyGuestId:secondGuest.rows[0]!.id,invitationId:invitation.rows[0]!.id,linkId:link.rows[0]!.id};
  }

  it("limits an individual link to its owner and that person's invited functions",async()=>{
    const a=await portalFixture();
    await assumeUser("20000000-0000-4000-8000-000000000001");
    const householdB=await db.query<{id:string}>("select public.save_guest_household($1,null,$2::jsonb) id",[WEDDING_B,JSON.stringify({name:"Other Household"})]);
    const guestB=await db.query<{id:string}>("select public.save_guest($1,null,$2::jsonb,null) id",[WEDDING_B,JSON.stringify({household_id:householdB.rows[0]!.id,full_name:"Other Guest",meal_preference:"",allergies:"",assistance_needs:"",family_side:"unknown",email:"",phone:"",notes:""})]);
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)",[WEDDING_B,guestB.rows[0]!.id,FUNCTION_B]);
    const invitationB=await db.query<{id:string}>("select id from public.guest_invitations where wedding_id=$1 and guest_id=$2",[WEDDING_B,guestB.rows[0]!.id]);
    await assumeUser(null,"anon");
    const data=await db.query<{data:Record<string,unknown>}>("select public.get_guest_portal_data($1) data",["b".repeat(64)]);
    const visiblePeople=data.rows[0]?.data.people as Array<{full_name:string;invitations:Array<{function:{id:string}}>}>;
    expect(visiblePeople).toHaveLength(1);
    expect(visiblePeople[0]?.full_name).toBe("Invited Person");
    expect(visiblePeople[0]?.invitations.map((row)=>row.function.id)).toEqual([FUNCTION_A]);
    const forbidden=await db.query<{result:{status:string}}>("select public.record_guest_portal_rsvp($1,$2,'yes','',null,$3) result",["b".repeat(64),invitationB.rows[0]!.id,"c0000000-0000-4000-8000-000000000001"]);
    expect(forbidden.rows[0]?.result.status).toBe("unavailable");
    await expectDenied(db.query("select public.set_guest_invitation($1,$2,$3,true,true)",[WEDDING_A,a.guestId,FUNCTION_B]));
    expect(a.householdId).not.toBe(householdB.rows[0]!.id);
  });

  it("revocation and expiry invalidate exchanged sessions",async()=>{
    const {linkId}=await portalFixture();
    await assumeUser(OWNER_A);
    await db.query("select public.revoke_guest_portal_link($1,$2)",[WEDDING_A,linkId]);
    await assumeUser(null,"anon");
    const revoked=await db.query<{data:unknown}>("select public.get_guest_portal_data($1) data",["b".repeat(64)]);
    expect(revoked.rows[0]?.data).toBeNull();
    const exchange=await db.query<{expires_at:unknown}>("select public.create_guest_portal_session($1,$2) expires_at",["a".repeat(64),"d".repeat(64)]);
    expect(exchange.rows[0]?.expires_at).toBeNull();
  });

  it("replacing an individual link revokes its prior token and read-only members cannot manage links",async()=>{
    const {guestId,householdId,linkId}=await portalFixture();
    await assumeUser(OWNER_A);
    await db.query("select public.create_guest_portal_link($1,$2,'{}'::uuid[],$3,$4::timestamptz)",[WEDDING_A,guestId,"e".repeat(64),new Date(Date.now()+86_400_000).toISOString()]);
    const rows=await db.query<{links:Array<{active:boolean}>}>("select public.list_guest_portal_links($1,$2) links",[WEDDING_A,householdId]);
    expect(rows.rows[0]?.links.filter((link)=>link.active)).toHaveLength(1);
    await db.query("select public.set_member_module_access($1,$2,'guests','read')",[WEDDING_A,READ_ONLY]);
    await assumeUser(READ_ONLY);
    await expectDenied(db.query("select public.create_guest_portal_link($1,$2,'{}'::uuid[],$3,$4::timestamptz)",[WEDDING_A,guestId,"f".repeat(64),new Date(Date.now()+86_400_000).toISOString()]));
    await assumeUser(null,"anon");
    expect((await db.query<{expires:unknown}>("select public.create_guest_portal_session($1,$2) expires",["a".repeat(64),"c".repeat(64)])).rows[0]?.expires).toBeNull();
    expect(linkId).toBeTruthy();
  });

  it("shows and accepts responses for another person only after explicit same-household proxy authorization",async()=>{
    const {guestId,proxyGuestId}=await portalFixture();
    await assumeUser(OWNER_A);
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)",[WEDDING_A,proxyGuestId,FUNCTION_A]);
    const proxyInvitation=await db.query<{id:string}>("select id from public.guest_invitations where wedding_id=$1 and guest_id=$2 and function_id=$3",[WEDDING_A,proxyGuestId,FUNCTION_A]);
    const replacement=await db.query<{id:string}>("select public.create_guest_portal_link($1,$2,$3::uuid[],$4,$5::timestamptz) id",[WEDDING_A,guestId,[proxyGuestId],"e".repeat(64),new Date(Date.now()+86_400_000).toISOString()]);
    await assumeUser(null,"anon");
    await db.query("select public.create_guest_portal_session($1,$2)",["e".repeat(64),"f".repeat(64)]);
    const data=await db.query<{data:{people:Array<{id:string}>}}>("select public.get_guest_portal_data($1) data",["f".repeat(64)]);
    expect(data.rows[0]?.data.people.map((person)=>person.id)).toEqual([guestId,proxyGuestId]);
    const response=await db.query<{result:{status:string}}>("select public.record_guest_portal_rsvp($1,$2,'yes','',null,$3) result",["f".repeat(64),proxyInvitation.rows[0]!.id,"c0000000-0000-4000-8000-000000000002"]);
    expect(response.rows[0]?.result.status).toBe("saved");
    await assumeUser(OWNER_A);
    await db.query("select public.set_guest_portal_proxies($1,$2,'{}'::uuid[])",[WEDDING_A,replacement.rows[0]!.id]);
    await assumeUser(null,"anon");
    const revokedProxy=await db.query<{result:{status:string}}>("select public.record_guest_portal_rsvp($1,$2,'no','',null,$3) result",["f".repeat(64),proxyInvitation.rows[0]!.id,"c0000000-0000-4000-8000-000000000003"]);
    expect(revokedProxy.rows[0]?.result.status).toBe("unavailable");
  });

  it("makes RSVP submissions idempotent and keeps workspace headcounts current",async()=>{
    const {invitationId}=await portalFixture();
    const submission="c1000000-0000-4000-8000-000000000001";
    const first=await db.query<{result:{status:string}}>("select public.record_guest_portal_rsvp($1,$2,'yes','Portal answer',null,$3) result",["b".repeat(64),invitationId,submission]);
    expect(first.rows[0]?.result.status).toBe("saved");
    const retry=await db.query<{result:{status:string}}>("select public.record_guest_portal_rsvp($1,$2,'yes','Portal answer',null,$3) result",["b".repeat(64),invitationId,submission]);
    expect(retry.rows[0]?.result.status).toBe("duplicate");
    await db.exec("reset role");
    const counts=await db.query<{yes:string;rows:string;history:string}>("select count(*) filter(where r.response='yes')::text yes,count(r.id)::text rows,(select count(*)::text from public.guest_rsvp_history h where h.invitation_id=$1) history from public.guest_invitations i left join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id where i.id=$1 group by i.id",[invitationId]);
    expect(counts.rows[0]).toEqual({yes:"1",rows:"1",history:"1"});
    await assumeUser(OWNER_A);
    await expectDenied(db.query("select public.record_guest_rsvp($1,$2,'no','phone','Stale planner form',null)",[WEDDING_A,invitationId]));
  });

  it("saves one person's function responses in a single idempotent batch",async()=>{
    const {guestId,invitationId}=await portalFixture();
    await assumeUser(OWNER_A);
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)",[WEDDING_A,guestId,"a2000000-0000-4000-8000-000000000002"]);
    const second=await db.query<{id:string}>("select id from public.guest_invitations where wedding_id=$1 and guest_id=$2 and function_id=$3",[WEDDING_A,guestId,"a2000000-0000-4000-8000-000000000002"]);
    await assumeUser(null,"anon");
    const payload=[
      {invitation_id:invitationId,response:"yes",note:"Wedding response",expected_updated_at:null,submission_key:"c3000000-0000-4000-8000-000000000001"},
      {invitation_id:second.rows[0]!.id,response:"no",note:"Mehendi response",expected_updated_at:null,submission_key:"c3000000-0000-4000-8000-000000000002"},
    ];
    const saved=await db.query<{result:{status:string;saved_count:number}}>("select public.record_guest_portal_rsvps($1,$2,$3::jsonb) result",["b".repeat(64),guestId,JSON.stringify(payload)]);
    expect(saved.rows[0]?.result).toEqual({status:"saved",saved_count:2});
    const retry=await db.query<{result:{status:string;saved_count:number}}>("select public.record_guest_portal_rsvps($1,$2,$3::jsonb) result",["b".repeat(64),guestId,JSON.stringify(payload)]);
    expect(retry.rows[0]?.result).toEqual({status:"duplicate",saved_count:0});
    await db.exec("reset role");
    const rows=await db.query<{response:string;count:string;history:string}>("select r.response,count(*)::text count,(select count(*)::text from public.guest_rsvp_history h where h.invitation_id=r.invitation_id) history from public.guest_rsvps r where r.invitation_id=any($1::uuid[]) group by r.invitation_id,r.response order by r.response",[[invitationId,second.rows[0]!.id]]);
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.map((row)=>row.response)).toEqual(["no","yes"]);
    expect(rows.rows.every((row)=>row.count==="1"&&row.history==="1")).toBe(true);
  });

  it("rolls back every RSVP in a batch when one response has a stale version",async()=>{
    const {guestId,invitationId}=await portalFixture();
    await assumeUser(OWNER_A);
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)",[WEDDING_A,guestId,"a2000000-0000-4000-8000-000000000002"]);
    const second=await db.query<{id:string}>("select id from public.guest_invitations where wedding_id=$1 and guest_id=$2 and function_id=$3",[WEDDING_A,guestId,"a2000000-0000-4000-8000-000000000002"]);
    await assumeUser(null,"anon");
    const payload=[
      {invitation_id:invitationId,response:"yes",note:"Should roll back",expected_updated_at:null,submission_key:"c4000000-0000-4000-8000-000000000001"},
      {invitation_id:second.rows[0]!.id,response:"no",note:"Stale entry",expected_updated_at:"2026-11-04T00:00:00+00:00",submission_key:"c4000000-0000-4000-8000-000000000002"},
    ];
    const result=await db.query<{result:{status:string}}>("select public.record_guest_portal_rsvps($1,$2,$3::jsonb) result",["b".repeat(64),guestId,JSON.stringify(payload)]);
    expect(result.rows[0]?.result.status).toBe("conflict");
    await db.exec("reset role");
    const count=await db.query<{rows:string;history:string}>("select (select count(*)::text from public.guest_rsvps where invitation_id=any($1::uuid[])) rows,(select count(*)::text from public.guest_rsvp_history where invitation_id=any($1::uuid[])) history",[[invitationId,second.rows[0]!.id]]);
    expect(count.rows[0]).toEqual({rows:"0",history:"0"});
  });

  it("does not allow a household session to batch another household member's invitation",async()=>{
    const {guestId}=await portalFixture();
    await assumeUser(OWNER_A);
    const household=await db.query<{id:string}>("select public.save_guest_household($1,null,$2::jsonb) id",[WEDDING_A,JSON.stringify({name:"Separate Portal Family"})]);
    const otherGuest=await db.query<{id:string}>("select public.save_guest($1,null,$2::jsonb,null) id",[WEDDING_A,JSON.stringify({household_id:household.rows[0]!.id,full_name:"Separate Invited Person",meal_preference:"",allergies:"",assistance_needs:"",family_side:"shared",email:"",phone:"",notes:""})]);
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)",[WEDDING_A,otherGuest.rows[0]!.id,FUNCTION_A]);
    const otherInvitation=await db.query<{id:string}>("select id from public.guest_invitations where wedding_id=$1 and guest_id=$2 and function_id=$3",[WEDDING_A,otherGuest.rows[0]!.id,FUNCTION_A]);
    await assumeUser(null,"anon");
    const payload=[{invitation_id:otherInvitation.rows[0]!.id,response:"yes",note:"",expected_updated_at:null,submission_key:"c5000000-0000-4000-8000-000000000001"}];
    const result=await db.query<{result:{status:string}}>("select public.record_guest_portal_rsvps($1,$2,$3::jsonb) result",["b".repeat(64),guestId,JSON.stringify(payload)]);
    expect(result.rows[0]?.result.status).toBe("unavailable");
    await db.exec("reset role");
    const stored=await db.query<{count:string}>("select count(*)::text count from public.guest_rsvps where invitation_id=$1",[otherInvitation.rows[0]!.id]);
    expect(stored.rows[0]?.count).toBe("0");
  });

  it("rejects stale planner and guest profile edits instead of overwriting",async()=>{
    const {guestId,householdId}=await portalFixture();
    await db.exec("reset role");
    const initial=await db.query<{updated_at:string}>("select updated_at from public.guests where id=$1",[guestId]);
    await assumeUser(null,"anon");
    await db.query("select public.record_guest_portal_profile($1,$2,'Vegetarian','Peanuts','', $3::timestamptz,$4)",["b".repeat(64),guestId,initial.rows[0]!.updated_at,"c2000000-0000-4000-8000-000000000001"]);
    await assumeUser(OWNER_A);
    await expectDenied(db.query("select public.save_guest($1,$2,$3::jsonb,$4::timestamptz)",[WEDDING_A,guestId,JSON.stringify({household_id:householdId,full_name:"Invited Person",email:"",phone:"",family_side:"shared",follow_up_owner_user_id:null,meal_preference:"Vegan",allergies:"Peanuts",assistance_needs:"",notes:""}),initial.rows[0]!.updated_at]));
    await assumeUser(null,"anon");
    await db.exec("reset role");
    const latest=await db.query<{updated_at:string}>("select updated_at from public.guests where id=$1",[guestId]);
    await assumeUser(OWNER_A);
    await db.query("select public.save_guest($1,$2,$3::jsonb,$4::timestamptz)",[WEDDING_A,guestId,JSON.stringify({household_id:householdId,full_name:"Invited Person",email:"",phone:"",family_side:"shared",follow_up_owner_user_id:null,meal_preference:"Vegan",allergies:"Peanuts",assistance_needs:"Wheelchair access",notes:""}),latest.rows[0]!.updated_at]);
    await assumeUser(null,"anon");
    const staleGuest=await db.query<{result:{status:string}}>("select public.record_guest_portal_profile($1,$2,'Vegetarian','Peanuts','',$3::timestamptz,$4) result",["b".repeat(64),guestId,latest.rows[0]!.updated_at,"c2000000-0000-4000-8000-000000000002"]);
    expect(staleGuest.rows[0]?.result.status).toBe("conflict");
  });

  it("rate-limits repeated access attempts in a shared hashed bucket",async()=>{
    await assumeUser(null,"anon");
    const key="f".repeat(64);
    for(let attempt=1;attempt<=30;attempt++)expect((await db.query<{ok:boolean}>("select public.consume_guest_portal_rate_limit('exchange',$1) ok",[key])).rows[0]?.ok).toBe(true);
    expect((await db.query<{ok:boolean}>("select public.consume_guest_portal_rate_limit('exchange',$1) ok",[key])).rows[0]?.ok).toBe(false);
  });
});

describe("task and decision database permissions", () => {
  it("creates a wedding with validated setup fields and assigns ownership to the caller", async () => {
    await assumeUser(SCOPED);
    const created = await db.query<{ id: string }>(
      "select public.create_wedding($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as id",
      ["Synthetic planning test", "Europe/Dublin", "EUR", "Partner One", "Partner Two", "2027-06-18", "tentative", ["Dublin", "Galway"], 25000, "Synthetic fixture notes"],
    );
    const weddingId = created.rows[0]!.id;
    const setup = await db.query<{ name: string; partner_one_display_name: string; partner_two_display_name: string; overall_budget: string; locations: string[] }>(
      "select name, partner_one_display_name, partner_two_display_name, overall_budget::text, main_locations as locations from public.weddings where id = $1",
      [weddingId],
    );
    expect(setup.rows[0]).toEqual({
      name: "Synthetic planning test", partner_one_display_name: "Partner One",
      partner_two_display_name: "Partner Two", overall_budget: "25000.00", locations: ["Dublin", "Galway"],
    });
    const owner = await db.query<{ role: string }>("select role::text from public.wedding_members where wedding_id = $1 and user_id = $2", [weddingId, SCOPED]);
    expect(owner.rows[0]?.role).toBe("owner");
    await expectDenied(db.query(
      "select public.create_wedding($1, $2, $3, $4, $5, null, 'confirmed', array[]::text[], null, '')",
      ["Missing confirmed date", "Europe/Dublin", "EUR", "Partner One", "Partner Two"],
    ));
  });

  it("denies anonymous access and read-only writes", async () => {
    await assumeUser(null, "anon");
    await expectDenied(db.query("select * from public.tasks"));
    await expectDenied(db.query("select * from public.decisions"));
    await assumeUser(OWNER_A);
    await createTask("Permission fixture");
    await assumeUser(READ_ONLY);
    const visible = await db.query("select id from public.tasks where wedding_id = $1", [WEDDING_A]);
    expect(visible.rows).toHaveLength(1);
    await expectDenied(db.query(
      "insert into public.tasks (wedding_id, title, created_by_user_id, updated_by_user_id) values ($1, 'No write', $2, $2)",
      [WEDDING_A, READ_ONLY],
    ));
    const changed = await db.query("update public.tasks set title = 'No edit' where wedding_id = $1 returning id", [WEDDING_A]);
    expect(changed.rows).toHaveLength(0);
  });

  it("limits decision creation to planning edit grants", async () => {
    await assumeUser(SCOPED);
    const decision = await db.query<{ id: string }>(
      "select public.create_wedding_decision($1, 'Choose a sample', array['Option A', 'Option B']) as id",
      [WEDDING_A],
    );
    expect(decision.rows[0]?.id).toBeTruthy();
    const options = await db.query<{ label: string }>(
      "select label from public.decision_options where decision_id = $1 order by position",
      [decision.rows[0]?.id],
    );
    expect(options.rows.map((option) => option.label)).toEqual(["Option A", "Option B"]);
    await assumeUser(READ_ONLY);
    await expectDenied(db.query(
      "select public.create_wedding_decision($1, 'No write', array['One', 'Two'])",
      [WEDDING_A],
    ));
  });

  it("stores preferences separately per partner and rejects a stale decision version", async () => {
    await assumeUser(SCOPED);
    const created = await db.query<{ id: string }>(
      "select public.create_wedding_decision($1, 'Choose a sample', array['Option A', 'Option B']) as id",
      [WEDDING_A],
    );
    const decisionId = created.rows[0]!.id;
    const options = await db.query<{ id: string; label: string }>(
      "select id, label from public.decision_options where wedding_id = $1 and decision_id = $2 order by position",
      [WEDDING_A, decisionId],
    );
    await db.query(
      "insert into public.decision_preferences (wedding_id, decision_id, member_user_id, option_id, preference_note) values ($1, $2, $3, $4, 'My choice')",
      [WEDDING_A, decisionId, SCOPED, options.rows[0]!.id],
    );
    await expectDenied(db.query(
      "insert into public.decision_preferences (wedding_id, decision_id, member_user_id, option_id) values ($1, $2, $3, $4)",
      [WEDDING_A, decisionId, OWNER_A, options.rows[1]!.id],
    ));

    await assumeUser(OWNER_A);
    await db.query(
      "insert into public.decision_preferences (wedding_id, decision_id, member_user_id, option_id, preference_note) values ($1, $2, $3, $4, 'Partner choice')",
      [WEDDING_A, decisionId, OWNER_A, options.rows[1]!.id],
    );
    const preferences = await db.query<{ count: string }>(
      "select count(*)::text as count from public.decision_preferences where wedding_id = $1 and decision_id = $2",
      [WEDDING_A, decisionId],
    );
    expect(preferences.rows[0]?.count).toBe("2");

    await assumeUser(SCOPED);
    const updated = await db.query<{ version: number }>(
      "update public.decisions set status = 'deferred' where id = $1 and version = 1 returning version",
      [decisionId],
    );
    expect(updated.rows[0]?.version).toBe(2);
    const stale = await db.query(
      "update public.decisions set question = 'Stale question' where id = $1 and version = 1 returning id",
      [decisionId],
    );
    expect(stale.rows).toHaveLength(0);
  });

  it("rejects a circular dependency in PostgreSQL", async () => {
    await assumeUser(OWNER_A);
    const first = await createTask("First task");
    const second = await createTask("Second task");
    await db.query("update public.tasks set depends_on_task_id = $1 where id = $2", [second.id, first.id]);
    await expectDenied(db.query("update public.tasks set depends_on_task_id = $1 where id = $2", [first.id, second.id]));
  });

  it("rejects stale task versions and records authorship and activity", async () => {
    await assumeUser(OWNER_A);
    const task = await createTask("Versioned task");
    const firstEdit = await db.query<{ version: number }>(
      "update public.tasks set title = 'First edit' where id = $1 and version = $2 returning version",
      [task.id, task.version],
    );
    expect(firstEdit.rows[0]?.version).toBe(2);
    const staleEdit = await db.query(
      "update public.tasks set title = 'Stale overwrite' where id = $1 and version = $2 returning id",
      [task.id, task.version],
    );
    expect(staleEdit.rows).toHaveLength(0);
    const activity = await db.query<{ count: string; actors_match: boolean }>(
      "select count(*)::text as count, bool_and(actor_user_id = $2) as actors_match from public.task_activity where task_id = $1",
      [task.id, OWNER_A],
    );
    expect(activity.rows[0]).toEqual({ count: "2", actors_match: true });
    const stored = await db.query<{ created_by_user_id: string; updated_by_user_id: string }>(
      "select created_by_user_id, updated_by_user_id from public.tasks where id = $1",
      [task.id],
    );
    expect(stored.rows[0]).toEqual({ created_by_user_id: OWNER_A, updated_by_user_id: OWNER_A });

    await db.query(
      "insert into public.task_comments (wedding_id, task_id, body) values ($1, $2, 'Review the latest quote')",
      [WEDDING_A, task.id],
    );
    await db.query(
      "insert into public.task_checklist_items (wedding_id, task_id, title) values ($1, $2, 'Confirm availability')",
      [WEDDING_A, task.id],
    );
    const authorshipSql = "select (select author_user_id::text from public.task_comments where task_id = $1 limit 1) as comments_by, "
      + "(select created_by_user_id::text from public.task_checklist_items where task_id = $1 limit 1) as checklist_by, "
      + "(select created_at is not null from public.task_comments where task_id = $1 limit 1) as created_at";
    const childAuthorship = await db.query<{ comments_by: string; checklist_by: string; created_at: boolean }>(authorshipSql, [task.id]);
    expect(childAuthorship.rows[0]).toEqual({ comments_by: OWNER_A, checklist_by: OWNER_A, created_at: true });
  });

  it("keeps a linked task and its due date when a function moves or is archived", async () => {
    await assumeUser(OWNER_A);
    const task = await createTask("Keep this date unchanged", { functionId: FUNCTION_A, dueDate: "2027-05-01" });
    await db.query(
      "update public.functions set function_date = '2027-06-19', start_time = '23:30', end_time = '01:15' where wedding_id = $1 and id = $2",
      [WEDDING_A, FUNCTION_A],
    );
    await db.query("update public.functions set archived_at = now() where wedding_id = $1 and id = $2", [WEDDING_A, FUNCTION_A]);
    const retained = await db.query<{ due_date: string; function_id: string }>(
      "select due_date::text, function_id from public.tasks where id = $1",
      [task.id],
    );
    expect(retained.rows[0]).toEqual({ due_date: "2027-05-01", function_id: FUNCTION_A });
    await expectDenied(db.query("delete from public.functions where wedding_id = $1 and id = $2", [WEDDING_A, FUNCTION_A]));
    const archived = await db.query("select id from public.functions where wedding_id = $1 and id = $2 and archived_at is not null", [WEDDING_A, FUNCTION_A]);
    expect(archived.rows).toHaveLength(1);
  });

  it("does not allow a task to link across wedding boundaries", async () => {
    await assumeUser(OWNER_A);
    await expectDenied(db.query(
      "insert into public.tasks (wedding_id, function_id, title, created_by_user_id, updated_by_user_id) values ($1, $2, 'Cross wedding', $3, $3)",
      [WEDDING_A, FUNCTION_B, OWNER_A],
    ));
  });
});

describe("supplier directory database rules", () => {
  async function createSupplier(name: string, weddingId = WEDDING_A) {
    const result = await db.query<{ id: string }>(
      `insert into public.suppliers (wedding_id, kind, name, category, created_by_user_id, updated_by_user_id)
       values ($1, 'venue', $2, 'Venue', $3, $3) returning id`,
      [weddingId, name, weddingId === WEDDING_A ? OWNER_A : "20000000-0000-4000-8000-000000000001"],
    );
    return result.rows[0]!.id;
  }

  it("enforces supplier module read/edit permissions and wedding isolation", async () => {
    await assumeUser(OWNER_A);
    const supplierId = await createSupplier("Private Alder Venue");
    await assumeUser(READ_ONLY);
    expect((await db.query("select id from public.suppliers where wedding_id = $1", [WEDDING_A])).rows).toHaveLength(0);
    await expectDenied(db.query(
      "insert into public.suppliers (wedding_id, kind, name, category, created_by_user_id, updated_by_user_id) values ($1, 'vendor', 'Denied', 'Photo', $2, $2)",
      [WEDDING_A, READ_ONLY],
    ));
    await assumeUser(OWNER_A);
    await db.query("select public.set_member_module_access($1, $2, 'suppliers_finance', 'read')", [WEDDING_A, READ_ONLY]);
    await assumeUser(READ_ONLY);
    expect((await db.query("select id from public.suppliers where wedding_id = $1", [WEDDING_A])).rows).toHaveLength(1);
    const changed = await db.query("update public.suppliers set status = 'selected' where id = $1 returning id", [supplierId]);
    expect(changed.rows).toHaveLength(0);
    await expectDenied(db.query(
      "insert into public.supplier_visits (wedding_id, supplier_id, notes, created_by_user_id) values ($1, $2, 'Cannot write', $3)",
      [WEDDING_A, supplierId, READ_ONLY],
    ));
    expect((await db.query("select id from public.suppliers where wedding_id = $1 and id = $2", [WEDDING_B, supplierId])).rows).toHaveLength(0);
  });

  it("saves supplier and venue details atomically and leaves unknown policies explicit", async () => {
    await assumeUser(OWNER_A);
    const values = {
      kind: "venue", name: "Atomic Venue", category: "Venue", contactPerson: "", contactEmail: "", contactPhone: "",
      websiteUrl: null, mapUrl: null, source: "", notes: "", responsibleUserId: null, status: "researching",
      roomAvailabilityNotes: "", cateringNotes: "", outsideVendorNotes: "", parkingNotes: "", accessibilityNotes: "",
      petPolicy: "unknown", alcoholPolicy: "unknown", musicPolicy: "unknown", weatherBackupSpace: "", weatherBackupCapacity: null,
    };
    const saved = await db.query<{ id: string }>(
      "select public.save_wedding_supplier($1, null, $2::jsonb) as id", [WEDDING_A, JSON.stringify(values)],
    );
    const details = await db.query<{ pet_policy: string; alcohol_policy: string; music_policy: string; weather_backup_capacity: number | null }>(
      "select pet_policy::text, alcohol_policy::text, music_policy::text, weather_backup_capacity from public.supplier_venue_details where supplier_id = $1",
      [saved.rows[0]!.id],
    );
    expect(details.rows[0]).toEqual({ pet_policy: "unknown", alcohol_policy: "unknown", music_policy: "unknown", weather_backup_capacity: null });
    await assumeUser(READ_ONLY);
    await expectDenied(db.query("select public.save_wedding_supplier($1, null, $2::jsonb)", [WEDDING_A, JSON.stringify(values)]));
  });

  it("rejects responsible partners and follow-up tasks from another wedding", async () => {
    await assumeUser(OWNER_A);
    const supplierId = await createSupplier("Wedding A venue");
    await expectDenied(db.query(
      `insert into public.suppliers (wedding_id, kind, name, category, responsible_user_id, created_by_user_id, updated_by_user_id)
       values ($1, 'vendor', 'Invalid responsible member', 'Catering', $2, $3, $3)`,
      [WEDDING_A, "20000000-0000-4000-8000-000000000001", OWNER_A],
    ));
    await assumeUser("20000000-0000-4000-8000-000000000001");
    await expectDenied(db.query(
      `insert into public.tasks (wedding_id, supplier_id, title, created_by_user_id, updated_by_user_id)
       values ($1, $2, 'Cross wedding supplier follow-up', $3, $3)`,
      [WEDDING_B, supplierId, "20000000-0000-4000-8000-000000000001"],
    ));
  });

  it("preserves append-only quote versions with unknown amounts", async () => {
    await assumeUser(OWNER_A);
    const supplierId = await createSupplier("Quote history venue");
    const first = await db.query<{ id: string }>(
      "select public.create_supplier_quote($1, $2, '2026-10-01', 'EUR', null, 'Tables', '', null, $3::jsonb) as id",
      [WEDDING_A, supplierId, JSON.stringify([{ kind: "service", label: "Room hire", amount: null }, { kind: "tax", label: "Tax", amount: "0.00" }])],
    );
    const second = await db.query<{ id: string }>(
      "select public.create_supplier_quote($1, $2, '2026-11-01', 'EUR', 1200, 'Room and chairs', 'Decor', '2026-12-01', $3::jsonb) as id",
      [WEDDING_A, supplierId, JSON.stringify([{ kind: "service", label: "Room hire", amount: "1000.00" }, { kind: "additional", label: "Cleaning", amount: "200.00" }])],
    );
    const versions = await db.query<{ version_number: number; total_amount: string | null }>(
      "select version_number, total_amount::text from public.supplier_quotes where supplier_id = $1 order by version_number",
      [supplierId],
    );
    expect(versions.rows).toEqual([{ version_number: 1, total_amount: null }, { version_number: 2, total_amount: "1200.00" }]);
    const firstItems = await db.query<{ label: string; amount: string | null }>(
      "select label, amount::text from public.supplier_quote_items where quote_id = $1 order by position",
      [first.rows[0]!.id],
    );
    expect(firstItems.rows).toEqual([{ label: "Room hire", amount: null }, { label: "Tax", amount: "0.00" }]);
    await expectDenied(db.query("update public.supplier_quotes set total_amount = 0 where id = $1", [first.rows[0]!.id]));
    await expectDenied(db.query("delete from public.supplier_quotes where id = $1", [second.rows[0]!.id]));
  });

  it("validates availability check dates and keeps prior observations", async () => {
    await assumeUser(OWNER_A);
    const supplierId = await createSupplier("Availability test");
    await expectDenied(db.query(
      "insert into public.supplier_requested_dates (wedding_id, supplier_id, requested_date, availability_status, created_by_user_id) values ($1, $2, '2027-06-18', 'available', $3)",
      [WEDDING_A, supplierId, OWNER_A],
    ));
    await db.query(
      "insert into public.supplier_requested_dates (wedding_id, supplier_id, requested_date, availability_status, created_by_user_id) values ($1, $2, '2027-06-18', 'unknown', $3)",
      [WEDDING_A, supplierId, OWNER_A],
    );
    await db.query(
      "insert into public.supplier_requested_dates (wedding_id, supplier_id, requested_date, availability_status, checked_at, hold_expires_on, created_by_user_id) values ($1, $2, '2027-06-18', 'on_hold', '2026-11-04', '2026-11-10', $3)",
      [WEDDING_A, supplierId, OWNER_A],
    );
    const observations = await db.query<{ availability_status: string; checked_at: string | null; hold_expires_on: string | null }>(
      "select availability_status::text, checked_at::text, hold_expires_on::text from public.supplier_requested_dates where supplier_id = $1 order by created_at, id",
      [supplierId],
    );
    expect(observations.rows).toHaveLength(2);
    expect(observations.rows).toContainEqual({ availability_status: "unknown", checked_at: null, hold_expires_on: null });
    expect(observations.rows).toContainEqual({ availability_status: "on_hold", checked_at: "2026-11-04", hold_expires_on: "2026-11-10" });
  });
});
