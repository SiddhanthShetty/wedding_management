import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const WEDDING_A = "a0000000-0000-4000-8000-000000000001";
const WEDDING_B = "b0000000-0000-4000-8000-000000000001";
const OWNER_A = "10000000-0000-4000-8000-000000000001";
const OWNER_A_PARTNER = "10000000-0000-4000-8000-000000000002";
const SCOPED = "10000000-0000-4000-8000-000000000003";
const READ_ONLY = "10000000-0000-4000-8000-000000000004";
const OWNER_B = "20000000-0000-4000-8000-000000000001";

let db: PGlite;

async function assumeUser(userId: string | null, databaseRole: "anon" | "authenticated" = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(`set role ${databaseRole}`);
}

async function expectDenied(operation: Promise<unknown>) {
  await expect(operation).rejects.toThrow();
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      aud text not null default 'authenticated',
      role text not null default 'authenticated',
      email text unique not null,
      encrypted_password text not null default '',
      email_confirmed_at timestamptz,
      raw_app_meta_data jsonb not null default '{}'::jsonb,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const migration = await readFile("supabase/migrations/20261104000000_auth_wedding_foundation.sql", "utf8");
  const planningMigration = await readFile("supabase/migrations/20261104120000_wedding_setup_and_functions.sql", "utf8");
  const tasksMigration = await readFile("supabase/migrations/20261104130000_tasks_and_decisions.sql", "utf8");
  const suppliersMigration = await readFile("supabase/migrations/20261104140000_supplier_directory.sql", "utf8");
  const financeMigration = await readFile("supabase/migrations/20261104150000_financial_tracking.sql", "utf8");
  const guestsMigration = await readFile("supabase/migrations/20261104160000_guest_management.sql", "utf8");
  const portalMigration = await readFile("supabase/migrations/20261104170000_private_guest_portal.sql", "utf8");
  const seed = await readFile("supabase/seed.sql", "utf8");
  await db.exec(migration);
  await db.exec(planningMigration);
  await db.exec(tasksMigration);
  await db.exec(suppliersMigration);
  await db.exec(financeMigration);
  await db.exec(guestsMigration);
  await db.exec(portalMigration);
  await db.exec(seed);
});

afterEach(async () => {
  await db.close();
});

describe("wedding foundation database security", () => {
  it("denies unauthenticated visitors access to private workspace rows", async () => {
    await assumeUser(null, "anon");
    await expectDenied(db.query("select * from public.functions"));
    await expectDenied(db.query("select * from public.weddings"));
  });

  it("keeps Wedding A members isolated from Wedding B", async () => {
    await assumeUser(OWNER_A);
    const visible = await db.query<{ wedding_id: string; name: string }>(
      "select wedding_id, name from public.functions order by name",
    );
    expect(visible.rows).toHaveLength(2);
    expect(visible.rows.every((row) => row.wedding_id === WEDDING_A)).toBe(true);

    const otherWedding = await db.query("select * from public.weddings where id = $1", [WEDDING_B]);
    expect(otherWedding.rows).toHaveLength(0);

    await expectDenied(db.query(
      `insert into public.functions (wedding_id, name, created_by_user_id)
       values ($1, 'Cross-wedding attempt', $2)`,
      [WEDDING_B, OWNER_A],
    ));
  });

  it("supports two separate owner accounts on the same wedding", async () => {
    const owners = await db.query<{ count: string }>(
      `select count(*)::text as count from public.wedding_members
       where wedding_id = $1 and role = 'owner' and status = 'active'`,
      [WEDDING_A],
    );
    expect(owners.rows[0]?.count).toBe("2");

    await assumeUser(OWNER_A_PARTNER);
    const rows = await db.query("select id from public.weddings where id = $1", [WEDDING_A]);
    expect(rows.rows).toHaveLength(1);
  });

  it("creates a profile for a newly registered Auth account", async () => {
    await db.query(
      `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
       values ('30000000-0000-4000-8000-000000000001', 'new-account@wedding.test', now(), '{"display_name":"New Demo Account"}')`,
    );
    const profile = await db.query<{ display_name: string }>(
      "select display_name from public.profiles where id = '30000000-0000-4000-8000-000000000001'",
    );
    expect(profile.rows[0]?.display_name).toBe("New Demo Account");
  });

  it("limits profile visibility to self and active members of a shared wedding", async () => {
    await assumeUser(OWNER_A);
    const profiles = await db.query<{ id: string }>(
      "select id from public.profiles where id in ($1, $2, $3) order by id",
      [OWNER_A_PARTNER, OWNER_B, OWNER_A],
    );
    expect(profiles.rows.map((row) => row.id)).toEqual([OWNER_A, OWNER_A_PARTNER].sort());
  });

  it("allows an owner to make another verified account an owner, but not themselves", async () => {
    await assumeUser(OWNER_A);
    await db.query(
      "select public.add_wedding_member_by_email($1, $2, 'owner', '{}'::jsonb)",
      [WEDDING_A, "planner@wedding.test"],
    );
    const promoted = await db.query<{ role: string }>(
      "select role::text from public.wedding_members where wedding_id = $1 and user_id = $2",
      [WEDDING_A, SCOPED],
    );
    expect(promoted.rows[0]?.role).toBe("owner");

    await expectDenied(db.query(
      "select public.add_wedding_member_by_email($1, $2, 'owner', '{}'::jsonb)",
      [WEDDING_A, "partner-one@wedding.test"],
    ));
  });

  it("prevents a co-owner from demoting an owner", async () => {
    await db.query(
      "update public.wedding_members set role = 'co_owner' where wedding_id = $1 and user_id = $2",
      [WEDDING_A, OWNER_A_PARTNER],
    );
    await assumeUser(OWNER_A_PARTNER);
    await expectDenied(db.query(
      "select public.add_wedding_member_by_email($1, $2, 'scoped_collaborator', '{\"planning\":\"edit\"}'::jsonb)",
      [WEDDING_A, "partner-one@wedding.test"],
    ));
  });

  it("creates a new wedding only for the authenticated caller", async () => {
    await assumeUser(SCOPED);
    const created = await db.query<{ wedding_id: string }>(
      "select public.create_wedding('DEMO Newly Created', 'Europe/Dublin', 'EUR') as wedding_id",
    );
    const membership = await db.query<{ role: string }>(
      "select role::text from public.wedding_members where wedding_id = $1 and user_id = $2",
      [created.rows[0]?.wedding_id, SCOPED],
    );
    expect(membership.rows[0]?.role).toBe("owner");
  });

  it("prevents read-only collaborators from inserting, updating, or deleting functions", async () => {
    await assumeUser(READ_ONLY);
    const readable = await db.query("select id from public.functions where wedding_id = $1", [WEDDING_A]);
    expect(readable.rows).toHaveLength(2);

    await expectDenied(db.query(
      `insert into public.functions (wedding_id, name, created_by_user_id)
       values ($1, 'Read-only write attempt', $2)`,
      [WEDDING_A, READ_ONLY],
    ));
    const updated = await db.query(
      "update public.functions set name = 'Unauthorized edit' where wedding_id = $1 returning id",
      [WEDDING_A],
    );
    expect(updated.rows).toHaveLength(0);
    await expectDenied(db.query(
      "delete from public.functions where wedding_id = $1 returning id",
      [WEDDING_A],
    ));
  });

  it("limits a scoped collaborator to granted modules and denies self-escalation", async () => {
    await assumeUser(SCOPED);
    const access = await db.query<{ planning_edit: boolean; finance_edit: boolean; logistics_read: boolean }>(
      `select
        private.has_module_access($1, 'planning', 'edit') as planning_edit,
        private.has_module_access($1, 'suppliers_finance', 'edit') as finance_edit,
        private.has_module_access($1, 'logistics', 'read') as logistics_read`,
      [WEDDING_A],
    );
    expect(access.rows[0]).toEqual({ planning_edit: true, finance_edit: false, logistics_read: true });

    const createdFunction = await db.query(
      `insert into public.functions (wedding_id, name, created_by_user_id)
       values ($1, 'Scoped planning edit', $2) returning id`,
      [WEDDING_A, SCOPED],
    );
    expect(createdFunction.rows).toHaveLength(1);

    await expectDenied(db.query(
      "select public.add_wedding_member($1, $2, 'owner', '{}'::jsonb)",
      [WEDDING_A, SCOPED],
    ));
    await expectDenied(db.query(
      `insert into public.wedding_members (wedding_id, user_id, role, created_by_user_id)
       values ($1, $2, 'owner', $2)`,
      [WEDDING_A, SCOPED],
    ));
  });

  it("uses same-wedding foreign keys for creator relationships", async () => {
    await db.exec("reset role");
    await expectDenied(db.query(
      `insert into public.functions (wedding_id, name, created_by_user_id)
       values ($1, 'Invalid creator link', $2)`,
      [WEDDING_A, OWNER_B],
    ));
    await expectDenied(db.query(
      `insert into public.member_module_permissions (wedding_id, membership_id, module, access_level)
       values ($1, 'b1000000-0000-4000-8000-000000000001', 'planning', 'read')`,
      [WEDDING_A],
    ));
  });

  it("removes access on the next query after membership revocation", async () => {
    await assumeUser(OWNER_A);
    await db.query("select public.revoke_wedding_member($1, $2)", [WEDDING_A, SCOPED]);

    await assumeUser(SCOPED);
    const functions = await db.query("select id from public.functions where wedding_id = $1", [WEDDING_A]);
    expect(functions.rows).toHaveLength(0);
    const access = await db.query<{ can_edit: boolean }>(
      "select private.has_module_access($1, 'planning', 'edit') as can_edit",
      [WEDDING_A],
    );
    expect(access.rows[0]?.can_edit).toBe(false);
  });
});
