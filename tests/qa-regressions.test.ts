import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { assumeUser, createTestDatabase, testHousehold, expectDenied, FUNCTION_A, OWNER_A, OWNER_A_PARTNER, WEDDING_A } from "./support/database";

/**
 * Regression tests for defects found in the QA/security review of the stays & transport,
 * schedules, documents & messages and dashboard milestone.
 */
let db: PGlite;
beforeEach(async () => { db = await createTestDatabase(); await assumeUser(db, OWNER_A); });
afterEach(async () => { await db.close(); });
const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;

async function guest(name: string) {
  return (await one<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: await testHousehold(db, WEDDING_A, `${name} household`), full_name: name, email: "", phone: "", family_side: "shared", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })])).id;
}

describe("QA-H1: manual message records cannot be turned into provider-confirmed deliveries", () => {
  it("rejects changing manual/provider/identity fields through direct updates", async () => {
    const guestId = await guest("TEST QA recipient");
    const record = await one<{ id: string }>("insert into public.communication_records(wedding_id,guest_id,function_id,channel,body_snapshot,state,sent_at,dedupe_key,recorded_by_user_id) values($1,$2,$3,'email','Hi','sent',now(),'msg:qa:1',$4) returning id", [WEDDING_A, guestId, FUNCTION_A, OWNER_A]);
    await expectDenied(db.query("update public.communication_records set manual=false,provider_name='forged',provider_message_id='x',provider_status_at=now(),state='provider_confirmed' where id=$1", [record.id]));
    await expectDenied(db.query("update public.communication_records set manual=false,provider_name='forged' where id=$1", [record.id]));
    await expectDenied(db.query("update public.communication_records set recorded_by_user_id=$2 where id=$1", [record.id, OWNER_A_PARTNER]));
    await expectDenied(db.query("update public.communication_records set guest_id=$2 where id=$1", [record.id, await guest("TEST QA other")]));
    const state = await one<{ state: string; manual: boolean }>("select state::text,manual from public.communication_records where id=$1", [record.id]);
    expect(state).toEqual({ state: "sent", manual: true });
  });
});

describe("QA-H2: who created or approved something is always the signed-in member", () => {
  it("overrides creator/actor columns supplied by the client and keeps them on update", async () => {
    const issue = await one<{ id: string; created_by_user_id: string }>("insert into public.wedding_day_issues(wedding_id,title,created_by_user_id) values($1,'TEST QA',$2) returning id,created_by_user_id", [WEDDING_A, OWNER_A_PARTNER]);
    expect(issue.created_by_user_id).toBe(OWNER_A);
    const changed = await one<{ created_by_user_id: string }>("update public.wedding_day_issues set created_by_user_id=$2 where id=$1 returning created_by_user_id", [issue.id, OWNER_A_PARTNER]);
    expect(changed.created_by_user_id).toBe(OWNER_A);
    const row = await one<{ id: string }>("insert into public.arrangement_items(wedding_id,category,title,reference_url,created_by_user_id) values($1,'decor','TEST arch','https://example.test/a',$2) returning id", [WEDDING_A, OWNER_A]);
    const approved = await one<{ design_approved_by_user_id: string }>("update public.arrangement_items set design_approved_at=now(),design_approved_by_user_id=$2 where id=$1 returning design_approved_by_user_id", [row.id, OWNER_A_PARTNER]);
    expect(approved.design_approved_by_user_id).toBe(OWNER_A);
    const guestId = await guest("TEST QA traveller");
    const profile = await one<{ details_entered_by_user_id: string }>("insert into public.guest_travel_profiles(wedding_id,guest_id,arrival_details,details_entered_by_user_id,details_entered_at) values($1,$2,'EI 123',$3,now()) returning details_entered_by_user_id", [WEDDING_A, guestId, OWNER_A_PARTNER]);
    expect(profile.details_entered_by_user_id).toBe(OWNER_A);
    const template = await one<{ updated_by_user_id: string }>("insert into public.message_templates(wedding_id,kind,name,body,created_by_user_id,updated_by_user_id) values($1,'update','TEST QA','Hi',$2,$2) returning updated_by_user_id", [WEDDING_A, OWNER_A_PARTNER]);
    expect(template.updated_by_user_id).toBe(OWNER_A);
  });
});

describe("QA-M2: repeated submissions do not create duplicates", () => {
  it("accepts one row per submission key for journeys, schedule items, issues, arrangements and properties", async () => {
    const key = "c1000000-0000-4000-8000-000000000001";
    const statements = [
      ["insert into public.transport_journeys(wedding_id,kind,title,pickup_location,dropoff_location,pickup_at,estimated_dropoff_at,created_by_user_id,submission_key) values($1,'arrival','TEST','A','B','2027-06-17T10:00Z','2027-06-17T11:00Z',$2,$3)"],
      ["insert into public.schedule_items(wedding_id,function_id,activity,planned_start,planned_end,created_by_user_id,submission_key) values($1,'" + FUNCTION_A + "','TEST','2027-06-17T10:00Z','2027-06-17T11:00Z',$2,$3)"],
      ["insert into public.wedding_day_issues(wedding_id,title,created_by_user_id,submission_key) values($1,'TEST',$2,$3)"],
      ["insert into public.arrangement_items(wedding_id,category,title,created_by_user_id,submission_key) values($1,'gifts_hampers','TEST',$2,$3)"],
      ["insert into public.accommodation_properties(wedding_id,name,created_by_user_id,submission_key) values($1,'TEST',$2,$3)"],
    ];
    for (const [sql] of statements) {
      await db.query(sql!, [WEDDING_A, OWNER_A, key]);
      await expectDenied(db.query(sql!, [WEDDING_A, OWNER_A, key]), /duplicate key/);
    }
  });
});

describe("QA-M3: reactivating a cancelled journey re-checks passenger clashes", () => {
  it("rejects un-cancelling a journey whose passenger is now on an overlapping one", async () => {
    const person = await guest("TEST QA rider");
    const journey = (status: string) => one<{ id: string }>("insert into public.transport_journeys(wedding_id,kind,title,pickup_location,dropoff_location,pickup_at,estimated_dropoff_at,status,created_by_user_id) values($1,'arrival','TEST','A','B','2027-06-17T10:00Z','2027-06-17T11:00Z',$2,$3) returning id", [WEDDING_A, status, OWNER_A]);
    const first = await journey("planned");
    await db.query("insert into public.transport_passengers(wedding_id,journey_id,guest_id,added_by_user_id) values($1,$2,$3,$4)", [WEDDING_A, first.id, person, OWNER_A]);
    await db.query("update public.transport_journeys set status='cancelled' where id=$1", [first.id]);
    const second = await journey("planned");
    await db.query("insert into public.transport_passengers(wedding_id,journey_id,guest_id,added_by_user_id) values($1,$2,$3,$4)", [WEDDING_A, second.id, person, OWNER_A]);
    await expectDenied(db.query("update public.transport_journeys set status='planned' where id=$1", [first.id]), /same time/);
  });
});

describe("QA-L3: completed journeys keep their passenger history", () => {
  it("does not allow removing passengers from a completed journey", async () => {
    const person = await guest("TEST QA history");
    const vehicle = await one<{ id: string }>("insert into public.transport_vehicles(wedding_id,label,passenger_capacity,created_by_user_id) values($1,'TEST car',4,$2) returning id", [WEDDING_A, OWNER_A]);
    const run = await one<{ id: string }>("insert into public.transport_journeys(wedding_id,kind,title,pickup_location,dropoff_location,pickup_at,estimated_dropoff_at,vehicle_id,status,created_by_user_id) values($1,'arrival','TEST','A','B','2027-06-17T10:00Z','2027-06-17T11:00Z',$2,'assigned',$3) returning id", [WEDDING_A, vehicle.id, OWNER_A]);
    await db.query("insert into public.transport_passengers(wedding_id,journey_id,guest_id,added_by_user_id) values($1,$2,$3,$4)", [WEDDING_A, run.id, person, OWNER_A]);
    await db.query("update public.transport_journeys set status='completed' where id=$1", [run.id]);
    await expectDenied(db.query("delete from public.transport_passengers where journey_id=$1", [run.id]), /completed/);
  });
});

describe("QA-M4: dashboard task counts equal the task list they link to", () => {
  it("counts each view with the same rule the Tasks page filters by", async () => {
    const { TASK_VIEWS, matchesTaskView } = await import("../src/lib/planning/task-rules");
    const { taskCounts } = await import("../src/lib/planning/dashboard");
    const today = "2027-06-01";
    const tasks = [
      { owner_user_id: "me", due_date: "2027-05-01", status: "not_started" },
      { owner_user_id: "me", due_date: "2027-05-01", status: "completed" },
      { owner_user_id: "me", due_date: "2027-06-03", status: "in_progress" },
      { owner_user_id: "me", due_date: null, status: "blocked" },
      { owner_user_id: "other", due_date: "2027-05-15", status: "in_progress" },
    ];
    const listed = Object.fromEntries(TASK_VIEWS.map((view) => [view, tasks.filter((task) => matchesTaskView(task, view, "me", today)).length]));
    const counts = taskCounts(tasks, "me", today);
    expect(counts).toEqual({ mineOpen: listed["mine-open"], mineOverdue: listed["mine-overdue"], overdue: listed.overdue, dueSoon: listed["due-soon"] });
    expect(listed.mine).toBe(4); // "My tasks" includes completed ones; the dashboard therefore links to mine-open.
    expect(counts).toEqual({ mineOpen: 3, mineOverdue: 1, overdue: 2, dueSoon: 1 });
  });
});

describe("QA-M1: the server drops recipients who no longer need a message", () => {
  it("keeps only currently included guests and reports why others were dropped", async () => {
    const { partitionRequestedRecipients, selectRecipients } = await import("../src/lib/planning/communications");
    const guests = ["g1", "g2", "g3"].map((id) => ({ id, full_name: id, email: `${id}@example.test`, phone: "", household_id: null }));
    const invitations = guests.map((guest, index) => ({ id: `i${index + 1}`, guest_id: guest.id, function_id: "f", status: "invited" as const }));
    // g2 responded after the planner opened the preview; g3 was already marked sent; "intruder" was never invited.
    const recipients = selectRecipients({ kind: "reminder", functionId: "f", functionCancelled: false, templateId: "t", guests, invitations, respondedInvitationIds: new Set(["i2"]), records: [{ guest_id: "g3", function_id: "f", template_id: "t", state: "sent" }] });
    expect(partitionRequestedRecipients(["g1", "g2", "g3", "intruder", "g1"], recipients)).toEqual({
      allowed: ["g1"],
      excluded: [{ guestId: "g2", reason: "Already responded" }, { guestId: "g3", reason: "Already marked sent for this template" }, { guestId: "intruder", reason: "Not invited to this function" }],
    });
  });
});

describe("QA-M2/L1: duplicate detection and validation messages", () => {
  it("recognises a repeated submission and explains a departure before arrival", async () => {
    const { isDuplicateSubmission } = await import("../src/lib/data/travel");
    expect(isDuplicateSubmission({ code: "23505", message: 'duplicate key value violates unique constraint "wedding_day_issues_submission_key_idx"' })).toBe(true);
    expect(isDuplicateSubmission({ code: "23505", message: 'duplicate key value violates unique constraint "transport_vehicles_wedding_id_label_key"' })).toBe(false);
    expect(isDuplicateSubmission(null)).toBe(false);
    const { saveTravelProfileAction } = await import("../src/app/actions/travel");
    const form = new FormData();
    for (const [key, value] of Object.entries({ weddingId: WEDDING_A, guestId: WEDDING_A, version: "", accommodation_need: "required", arrival_transport_need: "unknown", departure_transport_need: "unknown", arrival_at: "2027-06-18T10:00", departure_at: "2027-06-17T10:00", arrival_details: "", departure_details: "", travel_notes: "" })) form.set(key, value);
    expect(await saveTravelProfileAction({}, form)).toEqual({ error: "Departure must be after arrival." });
  });
});
