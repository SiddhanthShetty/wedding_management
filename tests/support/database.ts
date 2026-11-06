import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect } from "vitest";

export const WEDDING_A = "a0000000-0000-4000-8000-000000000001";
export const WEDDING_B = "b0000000-0000-4000-8000-000000000001";
export const OWNER_A = "10000000-0000-4000-8000-000000000001";
export const OWNER_A_PARTNER = "10000000-0000-4000-8000-000000000002";
export const SCOPED = "10000000-0000-4000-8000-000000000003";
export const READ_ONLY = "10000000-0000-4000-8000-000000000004";
export const OWNER_B = "20000000-0000-4000-8000-000000000001";
export const FUNCTION_A = "a2000000-0000-4000-8000-000000000001";
export const FUNCTION_A_CEREMONY = "a2000000-0000-4000-8000-000000000002";
export const FUNCTION_B = "b2000000-0000-4000-8000-000000000001";

/** Every committed migration, in filename (timestamp) order, so new migrations are always exercised. */
export async function migrationPaths() {
  const files = (await readdir("supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
  return files.map((name) => `supabase/migrations/${name}`);
}

/**
 * Fresh in-memory Postgres with Supabase-like roles, every migration and the synthetic seed.
 * `storage: true` adds a minimal stand-in for Supabase's storage schema (buckets/objects with RLS)
 * so storage policies created by migrations can be exercised.
 */
export async function createTestDatabase(options: { storage?: boolean } = {}) {
  const db = new PGlite();
  await db.exec([
    "create role anon nologin;",
    "create role authenticated nologin;",
    "create schema auth;",
    "create table auth.users (id uuid primary key, aud text not null default 'authenticated', role text not null default 'authenticated', email text unique not null, encrypted_password text not null default '', email_confirmed_at timestamptz, raw_app_meta_data jsonb not null default '{}'::jsonb, raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());",
    "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
    // Supabase grants API roles usage on the auth schema so auth.uid() works in policies and triggers.
    "grant usage on schema auth to anon, authenticated;",
  ].join("\n"));
  if (options.storage) await db.exec([
    "create schema storage;",
    "create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);",
    "create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null, owner uuid default auth.uid(), unique (bucket_id, name));",
    "alter table storage.objects enable row level security;",
    "grant usage on schema storage to authenticated, anon;",
    "grant select, insert, update, delete on storage.objects to authenticated;",
  ].join("\n"));
  for (const path of await migrationPaths()) await db.exec(await readFile(path, "utf8"));
  await db.exec(await readFile("supabase/seed.sql", "utf8"));
  return db;
}

export async function assumeUser(db: PGlite, userId: string | null, databaseRole: "anon" | "authenticated" = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(`set role ${databaseRole}`);
}

export async function expectDenied(operation: Promise<unknown>, message?: RegExp) {
  if (message) await expect(operation).rejects.toThrow(message);
  else await expect(operation).rejects.toThrow();
}
