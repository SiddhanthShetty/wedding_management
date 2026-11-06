-- Function schedules (run sheets), wedding-day issues and flexible arrangement checklists.
--
-- Data impact: additive only. New enums, tables, triggers, one read helper and RLS policies.
-- Existing functions, suppliers and members are referenced through same-wedding foreign keys.
--
-- Rules:
-- * Schedule items belong to one function. Planned and actual times are separate; recording a
--   delay never moves any other item. Warnings about knock-on effects are computed in the app.
-- * Schedule dependencies cannot form a cycle.
-- * All rows are governed by the logistics module (wedding-day operations).

create type public.schedule_item_status as enum ('planned','confirmed','in_progress','delayed','done','cancelled');
create type public.issue_severity as enum ('low','medium','high','critical');
create type public.issue_status as enum ('open','in_progress','resolved');
create type public.arrangement_category as enum ('decor','outfit','ceremony_materials','gifts_hampers','photography','music_performance','other');
create type public.arrangement_status as enum ('not_started','in_progress','ready','done','cancelled');

create function private.ops_touch_version() returns trigger language plpgsql set search_path='' as $$
begin new.version := old.version + 1; new.updated_at := now(); return new; end $$;

create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  function_id uuid not null,
  activity text not null check (char_length(trim(activity)) between 1 and 200),
  location text not null default '' check (char_length(location) <= 300),
  planned_start timestamptz not null,
  planned_end timestamptz not null,
  actual_start timestamptz,
  actual_end timestamptz,
  owner_user_id uuid,
  owner_name text not null default '' check (char_length(owner_name) <= 160),
  backup_contact text not null default '' check (char_length(backup_contact) <= 300),
  supplier_id uuid,
  vendor_arrival_at timestamptz,
  setup_requirements text not null default '' check (char_length(setup_requirements) <= 2000),
  packup_requirements text not null default '' check (char_length(packup_requirements) <= 2000),
  status public.schedule_item_status not null default 'planned',
  delay_note text not null default '' check (char_length(delay_note) <= 1000),
  notes text not null default '' check (char_length(notes) <= 2000),
  version integer not null default 1,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, function_id) references public.functions(wedding_id, id) on delete restrict,
  foreign key (wedding_id, owner_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, supplier_id) references public.suppliers(wedding_id, id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  check (planned_end > planned_start),
  check (planned_end - planned_start <= interval '24 hours'),
  check (actual_end is null or actual_start is null or actual_end >= actual_start),
  check (status <> 'delayed' or char_length(trim(delay_note)) > 0)
);
create index schedule_items_function_idx on public.schedule_items(wedding_id, function_id, planned_start);
create trigger schedule_items_version before update on public.schedule_items for each row execute function private.ops_touch_version();

create table public.schedule_dependencies (
  wedding_id uuid not null,
  item_id uuid not null,
  depends_on_item_id uuid not null,
  primary key (wedding_id, item_id, depends_on_item_id),
  foreign key (wedding_id, item_id) references public.schedule_items(wedding_id, id) on delete cascade,
  foreign key (wedding_id, depends_on_item_id) references public.schedule_items(wedding_id, id) on delete cascade,
  check (item_id <> depends_on_item_id)
);

create function private.guard_schedule_dependency_cycle() returns trigger language plpgsql set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('schedule:' || new.wedding_id::text, 0));
  if exists (
    with recursive chain(id) as (
      select new.depends_on_item_id
      union
      select d.depends_on_item_id from public.schedule_dependencies d join chain c on d.item_id = c.id where d.wedding_id = new.wedding_id
    ) select 1 from chain where id = new.item_id) then
    raise exception 'That dependency would create a circular chain.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger schedule_dependencies_cycle_guard before insert on public.schedule_dependencies
  for each row execute function private.guard_schedule_dependency_cycle();

create table public.wedding_day_issues (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid,
  schedule_item_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 200),
  details text not null default '' check (char_length(details) <= 4000),
  severity public.issue_severity not null default 'medium',
  owner_user_id uuid,
  owner_name text not null default '' check (char_length(owner_name) <= 160),
  status public.issue_status not null default 'open',
  resolution_note text not null default '' check (char_length(resolution_note) <= 2000),
  resolved_at timestamptz,
  version integer not null default 1,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, function_id) references public.functions(wedding_id, id) on delete restrict,
  foreign key (wedding_id, schedule_item_id) references public.schedule_items(wedding_id, id) on delete restrict,
  foreign key (wedding_id, owner_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  check ((status = 'resolved') = (resolved_at is not null))
);
create index wedding_day_issues_open_idx on public.wedding_day_issues(wedding_id, status, severity);
create trigger wedding_day_issues_version before update on public.wedding_day_issues for each row execute function private.ops_touch_version();

create table public.arrangement_items (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid,
  category public.arrangement_category not null,
  title text not null check (char_length(trim(title)) between 1 and 200),
  details text not null default '' check (char_length(details) <= 4000),
  owner_user_id uuid,
  owner_name text not null default '' check (char_length(owner_name) <= 160),
  supplier_id uuid,
  due_date date,
  event_at timestamptz,
  quantity integer check (quantity is null or quantity between 0 and 100000),
  reference_url text check (reference_url is null or reference_url ~* '^https://'),
  design_approved_at timestamptz,
  design_approved_by_user_id uuid,
  status public.arrangement_status not null default 'not_started',
  version integer not null default 1,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, function_id) references public.functions(wedding_id, id) on delete restrict,
  foreign key (wedding_id, owner_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, supplier_id) references public.suppliers(wedding_id, id) on delete restrict,
  foreign key (wedding_id, design_approved_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  check ((design_approved_at is null) = (design_approved_by_user_id is null))
);
create index arrangement_items_category_idx on public.arrangement_items(wedding_id, category, due_date);
create trigger arrangement_items_version before update on public.arrangement_items for each row execute function private.ops_touch_version();

create table public.arrangement_checklist_items (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  arrangement_id uuid not null,
  label text not null check (char_length(trim(label)) between 1 and 300),
  is_done boolean not null default false,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  foreign key (wedding_id, arrangement_id) references public.arrangement_items(wedding_id, id) on delete cascade
);
create index arrangement_checklist_idx on public.arrangement_checklist_items(wedding_id, arrangement_id, position);

-- Function and supplier names for logistics members who may not hold planning or supplier access.
create function public.get_operations_references(p_wedding_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.has_module_access(p_wedding_id, 'logistics', 'read') then raise exception 'Logistics read permission required.'; end if;
  return jsonb_build_object(
    'functions', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'function_date', f.function_date, 'starts_at', f.starts_at, 'ends_at', f.ends_at, 'venue_name', f.venue_name, 'status', f.status) order by f.starts_at nulls last, f.name)
      from public.functions f where f.wedding_id = p_wedding_id and f.archived_at is null), '[]'::jsonb),
    'suppliers', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'category', s.category, 'contact_person', s.contact_person, 'contact_phone', s.contact_phone) order by s.name)
      from public.suppliers s where s.wedding_id = p_wedding_id and s.status::text not in ('rejected', 'archived')), '[]'::jsonb)
  );
end $$;
revoke all on function public.get_operations_references(uuid) from public, anon;
grant execute on function public.get_operations_references(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['schedule_items','schedule_dependencies','wedding_day_issues','arrangement_items','arrangement_checklist_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.has_module_access(wedding_id, ''logistics'', ''read'')))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.has_module_access(wedding_id, ''logistics'', ''edit'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.has_module_access(wedding_id, ''logistics'', ''edit''))) with check ((select private.has_module_access(wedding_id, ''logistics'', ''edit'')))', t || '_update', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
  end loop;
  -- Deletion rules: schedule items, issues and arrangements are cancelled or resolved, not deleted.
  -- Dependencies and checklist lines are lightweight and may be removed by editors.
  foreach t in array array['schedule_dependencies','arrangement_checklist_items'] loop
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.has_module_access(wedding_id, ''logistics'', ''edit'')))', t || '_delete', t);
    execute format('grant delete on table public.%I to authenticated', t);
  end loop;
end $$;

-- Hardening: trigger functions are not callable directly; they still run as triggers.
revoke all on function private.ops_touch_version(), private.guard_schedule_dependency_cycle() from public, anon, authenticated;
