import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { assumeUser, createTestDatabase, expectDenied, FUNCTION_A, OWNER_A, OWNER_B, SCOPED, WEDDING_A } from "./support/database";

let db: PGlite;
beforeEach(async () => { db = await createTestDatabase(); await assumeUser(db, OWNER_A); });
afterEach(async () => { await db.close(); });
const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;
const household = async (name: string) => (await one<{ id: string }>("select public.save_guest_household($1,null,$2::jsonb) id", [WEDDING_A, JSON.stringify({ name })])).id;
const guest = async (name: string, householdId: string | null) => (await one<{ id: string }>("select public.save_guest($1,null,$2::jsonb,null) id", [WEDDING_A, JSON.stringify({ household_id: householdId, full_name: name, email: "", phone: "", family_side: "shared", meal_preference: "", allergies: "", assistance_needs: "", notes: "" })])).id;
const count = async (table: string) => (await one<{ n: number }>(`select count(*)::int n from public.${table} where wedding_id=$1`, [WEDDING_A])).n;

describe("deleting guests and households", () => {
  it("deletes a guest with their invitations, replies and messages, and respects permissions", async () => {
    const h = await household("TEST Delete family");
    const g = await guest("TEST Delete me", h);
    await db.query("select public.set_guest_invitation($1,$2,$3,true,false)", [WEDDING_A, g, FUNCTION_A]);
    const inv = await one<{ id: string }>("select id from public.guest_invitations where guest_id=$1", [g]);
    await db.query("select public.record_guest_rsvp($1,$2,'yes','phone','',null)", [WEDDING_A, inv.id]);
    await db.query("insert into public.communication_records(wedding_id,guest_id,channel,body_snapshot,dedupe_key,recorded_by_user_id) values($1,$2,'email','Hi','msg:del:1',$3)", [WEDDING_A, g, OWNER_A]);
    await assumeUser(db, SCOPED); // no guest edit
    await expectDenied(db.query("select public.delete_guest($1,$2,null)", [WEDDING_A, g]), /permission/);
    await assumeUser(db, OWNER_B);
    await expectDenied(db.query("select public.delete_guest($1,$2,null)", [WEDDING_A, g]), /permission/);
    await assumeUser(db, OWNER_A);
    await expectDenied(db.query("select public.delete_guest($1,$2,'2000-01-01'::timestamptz)", [WEDDING_A, g]), /changed after/);
    await db.query("select public.delete_guest($1,$2,null)", [WEDDING_A, g]);
    expect([await count("guests"), await count("guest_invitations"), await count("guest_rsvps"), await count("guest_rsvp_history"), await count("communication_records")]).toEqual([0, 0, 0, 0, 0]);
  });

  it("refuses while a stay or upcoming ride is active, or a plus-one depends on the guest", async () => {
    const g = await guest("TEST Traveller", null);
    const run = await one<{ id: string }>("insert into public.transport_journeys(wedding_id,kind,title,pickup_location,dropoff_location,pickup_at,estimated_dropoff_at,created_by_user_id) values($1,'arrival','TEST','A','B','2027-06-17T10:00Z','2027-06-17T11:00Z',$2) returning id", [WEDDING_A, OWNER_A]);
    await db.query("insert into public.transport_passengers(wedding_id,journey_id,guest_id,added_by_user_id) values($1,$2,$3,$4)", [WEDDING_A, run.id, g, OWNER_A]);
    await expectDenied(db.query("select public.delete_guest($1,$2,null)", [WEDDING_A, g]), /upcoming ride/);
    await db.query("update public.transport_journeys set status='cancelled' where id=$1", [run.id]);
    await db.query("select public.delete_guest($1,$2,null)", [WEDDING_A, g]);
    const primary = await guest("TEST Primary", null);
    await db.query("select public.set_guest_invitation($1,$2,$3,true,true)", [WEDDING_A, primary, FUNCTION_A]);
    await db.query("select public.create_guest_plus_one($1,$2,'TEST Plus',$3::uuid[])", [WEDDING_A, primary, [FUNCTION_A]]);
    await expectDenied(db.query("select public.delete_guest($1,$2,null)", [WEDDING_A, primary]), /plus-one/);
  });

  it("deletes an empty household directly, and a full one only when asked, atomically", async () => {
    const empty = await household("TEST Empty");
    await db.query("select public.delete_guest_household($1,$2,false)", [WEDDING_A, empty]);
    const h = await household("TEST Full");
    const primary = await guest("TEST Head", h);
    await db.query("select public.set_guest_invitation($1,$2,$3,true,true)", [WEDDING_A, primary, FUNCTION_A]);
    await db.query("select public.create_guest_plus_one($1,$2,'TEST Partner',$3::uuid[])", [WEDDING_A, primary, [FUNCTION_A]]);
    await expectDenied(db.query("select public.delete_guest_household($1,$2,false)", [WEDDING_A, h]), /still has 2 people/);
    const deleted = await one<{ n: number }>("select public.delete_guest_household($1,$2,true) n", [WEDDING_A, h]);
    expect(deleted.n).toBe(2);
    expect([await count("guests"), await count("guest_households")]).toEqual([0, 0]);
  });
});
