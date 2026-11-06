import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, FUNCTION_B, OWNER_A, OWNER_B, READ_ONLY, SCOPED, WEDDING_A, WEDDING_B } from "./support/database";
import { downstreamItems, minutesLate, scheduleWarnings, sortIssues, unresolvedIssueCounts, type ScheduleItemForRules } from "../src/lib/planning/operations-rules";

const item = (id: string, start: string, end: string, extra: Partial<ScheduleItemForRules> = {}): ScheduleItemForRules => ({
  id, function_id: "f", activity: id, location: "", planned_start: `2027-06-18T${start}:00Z`, planned_end: `2027-06-18T${end}:00Z`,
  actual_start: null, actual_end: null, owner_user_id: null, owner_name: "", vendor_arrival_at: null, status: "planned", ...extra,
});

describe("schedule warnings (pure)", () => {
  it("warns about overlapping responsibilities and locations but not back-to-back items", () => {
    const warnings = scheduleWarnings({ items: [
      item("Photos", "14:00", "15:00", { owner_name: "Sam  Coordinator", location: "Garden" }),
      item("Drinks", "14:30", "15:30", { owner_name: "sam coordinator", location: "Garden" }),
      item("Speeches", "15:30", "16:00", { owner_name: "Sam Coordinator", location: "Garden" }),
      item("Cancelled", "14:00", "16:00", { owner_name: "Sam Coordinator", status: "cancelled" }),
    ], dependencies: [] });
    expect(warnings.filter((warning) => warning.kind === "owner_overlap").map((warning) => warning.itemId).sort()).toEqual(["Drinks", "Photos"]);
    expect(warnings.filter((warning) => warning.kind === "location_overlap")).toHaveLength(2);
    expect(warnings.some((warning) => warning.itemId === "Speeches")).toBe(false);
  });

  it("flags dependency order, late vendors and items outside the function window", () => {
    const warnings = scheduleWarnings({
      items: [item("Setup", "12:00", "13:30"), item("Ceremony", "13:00", "14:00", { vendor_arrival_at: "2027-06-18T13:15:00Z" })],
      dependencies: [{ item_id: "Ceremony", depends_on_item_id: "Setup" }],
      functionWindows: new Map([["f", { starts_at: "2027-06-18T12:30:00Z", ends_at: "2027-06-18T18:00:00Z" }]]),
    });
    expect(warnings.map((warning) => `${warning.itemId}:${warning.kind}`).sort()).toEqual(["Ceremony:dependency_order", "Ceremony:vendor_late", "Setup:outside_function"]);
  });

  it("reports knock-on effects of a delay without changing any planned time", () => {
    const items = [
      item("Arrival", "12:00", "12:30", { actual_start: "2027-06-18T12:25:00Z", status: "in_progress" }),
      item("Ceremony", "13:00", "14:00"), item("Photos", "14:00", "15:00"), item("Unrelated", "13:00", "13:30"),
    ];
    const before = JSON.stringify(items);
    const dependencies = [{ item_id: "Ceremony", depends_on_item_id: "Arrival" }, { item_id: "Photos", depends_on_item_id: "Ceremony" }];
    expect(minutesLate(items[0]!)).toBe(25);
    expect(minutesLate(items[1]!)).toBeNull();
    expect(downstreamItems("Arrival", dependencies)).toEqual(["Ceremony", "Photos"]);
    const impact = scheduleWarnings({ items, dependencies }).filter((warning) => warning.kind === "delay_impact");
    expect(impact.map((warning) => warning.itemId)).toEqual(["Ceremony", "Photos"]);
    expect(impact[0]!.message).toMatch(/25 min late.*not moved automatically/);
    expect(JSON.stringify(items)).toBe(before);
  });

  it("orders unresolved issues by severity and counts them", () => {
    const issues = [
      { id: "a", severity: "low" as const, status: "open" as const, created_at: "1" },
      { id: "b", severity: "critical" as const, status: "resolved" as const, created_at: "2" },
      { id: "c", severity: "high" as const, status: "in_progress" as const, created_at: "3" },
      { id: "d", severity: "critical" as const, status: "open" as const, created_at: "4" },
    ];
    expect(sortIssues(issues).map((issue) => issue.id)).toEqual(["d", "c", "a", "b"]);
    expect(unresolvedIssueCounts(issues)).toEqual({ total: 3, critical: 1, high: 1 });
  });
});

describe("schedule database rules", () => {
  let db: PGlite;
  beforeEach(async () => { db = await createTestDatabase(); });
  afterEach(async () => { await db.close(); });
  const insertItem = (activity: string, start: string, end: string, weddingId = WEDDING_A, functionId = FUNCTION_A, createdBy = OWNER_A) =>
    db.query<{ id: string; version: number }>("insert into public.schedule_items(wedding_id,function_id,activity,planned_start,planned_end,created_by_user_id) values($1,$2,$3,$4,$5,$6) returning id,version", [weddingId, functionId, activity, start, end, createdBy]);

  it("rejects circular dependencies and invalid times, and needs a note to mark an item delayed", async () => {
    await assumeUser(db, OWNER_A);
    const a = (await insertItem("A", "2027-06-18T12:00:00Z", "2027-06-18T13:00:00Z")).rows[0]!.id;
    const b = (await insertItem("B", "2027-06-18T13:00:00Z", "2027-06-18T14:00:00Z")).rows[0]!.id;
    const c = (await insertItem("C", "2027-06-18T14:00:00Z", "2027-06-18T15:00:00Z")).rows[0]!.id;
    await db.query("insert into public.schedule_dependencies(wedding_id,item_id,depends_on_item_id) values($1,$2,$3),($1,$4,$2)", [WEDDING_A, b, a, c]);
    await expectDenied(db.query("insert into public.schedule_dependencies(wedding_id,item_id,depends_on_item_id) values($1,$2,$3)", [WEDDING_A, a, c]), /circular/);
    await expectDenied(db.query("insert into public.schedule_dependencies(wedding_id,item_id,depends_on_item_id) values($1,$2,$2)", [WEDDING_A, a]));
    await expectDenied(insertItem("Backwards", "2027-06-18T13:00:00Z", "2027-06-18T12:00:00Z"));
    await expectDenied(db.query("update public.schedule_items set status='delayed' where id=$1", [a]));
    const delayed = await db.query<{ version: number }>("update public.schedule_items set status='delayed',delay_note='Florist stuck in traffic',actual_start='2027-06-18T12:20:00Z' where id=$1 returning version", [a]);
    expect(delayed.rows[0]!.version).toBe(2);
    const others = await db.query<{ planned_start: Date }>("select planned_start from public.schedule_items where id = any($1::uuid[]) order by planned_start", [[b, c]]);
    expect(others.rows.map((row) => new Date(row.planned_start).toISOString())).toEqual(["2027-06-18T13:00:00.000Z", "2027-06-18T14:00:00.000Z"]);
  });

  it("enforces logistics permissions, wedding boundaries and no deletion of history", async () => {
    await assumeUser(db, OWNER_A);
    const a = (await insertItem("Owner item", "2027-06-18T12:00:00Z", "2027-06-18T13:00:00Z")).rows[0]!.id;
    await db.query("insert into public.wedding_day_issues(wedding_id,title,severity,created_by_user_id) values($1,'Cake late','high',$2)", [WEDDING_A, OWNER_A]);
    await expectDenied(db.query("insert into public.wedding_day_issues(wedding_id,title,status,created_by_user_id) values($1,'Bad','resolved',$2)", [WEDDING_A, OWNER_A]));
    await expectDenied(db.query("delete from public.schedule_items where id=$1", [a]), /permission denied/);
    await expectDenied(db.query("insert into public.arrangement_items(wedding_id,category,title,reference_url,created_by_user_id) values($1,'decor','Arch','http://insecure.example',$2)", [WEDDING_A, OWNER_A]));
    // Cross-wedding function link is rejected by the composite foreign key.
    await expectDenied(insertItem("Cross", "2027-06-18T12:00:00Z", "2027-06-18T13:00:00Z", WEDDING_A, FUNCTION_B));
    await assumeUser(db, SCOPED); // logistics read only
    expect((await db.query("select id from public.schedule_items")).rows).toHaveLength(1);
    await expectDenied(insertItem("Scoped", "2027-06-18T12:00:00Z", "2027-06-18T13:00:00Z", WEDDING_A, FUNCTION_A, SCOPED));
    const references = await db.query<{ data: { functions: unknown[] } }>("select public.get_operations_references($1) data", [WEDDING_A]);
    expect(references.rows[0]!.data.functions.length).toBeGreaterThan(0);
    await assumeUser(db, READ_ONLY); // planning read only, no logistics
    expect((await db.query("select id from public.wedding_day_issues")).rows).toHaveLength(0);
    await expectDenied(db.query("select public.get_operations_references($1)", [WEDDING_A]));
    await assumeUser(db, OWNER_B);
    expect((await db.query("select id from public.schedule_items")).rows).toHaveLength(0);
    await expectDenied(insertItem("Intrusion", "2027-06-18T12:00:00Z", "2027-06-18T13:00:00Z", WEDDING_A, FUNCTION_A, OWNER_B));
    await expectDenied(insertItem("Other wedding", "2027-06-18T12:00:00Z", "2027-06-18T13:00:00Z", WEDDING_B, FUNCTION_A, OWNER_B));
  });

  it("keeps arrangement design approval paired with its approver and checklist lines in the same wedding", async () => {
    await assumeUser(db, OWNER_A);
    const row = await db.query<{ id: string }>("insert into public.arrangement_items(wedding_id,category,title,reference_url,created_by_user_id) values($1,'decor','Mandap','https://example.com/design',$2) returning id", [WEDDING_A, OWNER_A]);
    // The approver is always the signed-in member (stamped by the database), so approval and approver stay paired.
    const approved = await db.query<{ design_approved_by_user_id: string }>("update public.arrangement_items set design_approved_at=now() where id=$1 returning design_approved_by_user_id", [row.rows[0]!.id]);
    expect(approved.rows[0]!.design_approved_by_user_id).toBe(OWNER_A);
    const changed = await db.query<{ design_approved_at: string | null }>("update public.arrangement_items set reference_url='https://example.com/other' where id=$1 returning design_approved_at", [row.rows[0]!.id]);
    expect(changed.rows[0]!.design_approved_at).toBeNull();
    await db.query("insert into public.arrangement_checklist_items(wedding_id,arrangement_id,label) values($1,$2,'Marigold garlands')", [WEDDING_A, row.rows[0]!.id]);
    await expectDenied(db.query("insert into public.arrangement_checklist_items(wedding_id,arrangement_id,label) values($1,$2,'Wrong wedding')", [WEDDING_B, row.rows[0]!.id]));
  });
});
