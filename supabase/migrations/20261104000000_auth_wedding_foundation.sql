-- Initial private wedding tenancy, membership, module permissions, and functions.
-- Existing Auth users receive a profile row. This migration does not alter or delete Auth accounts.

create schema if not exists private;
revoke all on schema private from public;

create type public.wedding_member_role as enum (
  'owner',
  'co_owner',
  'scoped_collaborator',
  'read_only_collaborator'
);

create type public.wedding_membership_status as enum ('active', 'revoked');
create type public.wedding_module as enum ('planning', 'suppliers_finance', 'guests', 'logistics');
create type public.module_access_level as enum ('none', 'read', 'edit');
create type public.wedding_function_status as enum ('tentative', 'confirmed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.weddings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  timezone text not null default 'Europe/Dublin' check (char_length(timezone) between 1 and 80),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, created_by_user_id)
);

create table public.wedding_members (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.wedding_member_role not null,
  status public.wedding_membership_status not null default 'active',
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, user_id),
  unique (wedding_id, id),
  foreign key (wedding_id, created_by_user_id)
    references public.wedding_members(wedding_id, user_id)
    deferrable initially deferred
);

-- The self-referencing creator key above enforces that a membership was created by a
-- member of the same wedding. The bootstrap RPC defers that key until both rows exist.
create table public.member_module_permissions (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  membership_id uuid not null,
  module public.wedding_module not null,
  access_level public.module_access_level not null check (access_level <> 'none'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, membership_id, module),
  foreign key (wedding_id, membership_id)
    references public.wedding_members(wedding_id, id)
    on delete cascade
);

create table public.functions (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  venue_name text,
  status public.wedding_function_status not null default 'tentative',
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, created_by_user_id)
    references public.wedding_members(wedding_id, user_id)
    on delete restrict,
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index wedding_members_user_status_idx
  on public.wedding_members (user_id, status, wedding_id);
create index module_permissions_membership_idx
  on public.member_module_permissions (wedding_id, membership_id, module);
create index functions_wedding_starts_at_idx
  on public.functions (wedding_id, starts_at);

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger weddings_touch_updated_at before update on public.weddings
  for each row execute function private.touch_updated_at();
create trigger members_touch_updated_at before update on public.wedding_members
  for each row execute function private.touch_updated_at();
create trigger permissions_touch_updated_at before update on public.member_module_permissions
  for each row execute function private.touch_updated_at();
create trigger functions_touch_updated_at before update on public.functions
  for each row execute function private.touch_updated_at();

create function private.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.create_profile_for_auth_user();

insert into public.profiles (id, display_name)
select id, left(coalesce(raw_user_meta_data ->> 'display_name', ''), 120)
from auth.users
on conflict (id) do nothing;

create function private.current_membership_role(p_wedding_id uuid)
returns public.wedding_member_role
language sql
stable
security definer
set search_path = ''
as $$
  select wm.role
  from public.wedding_members as wm
  where wm.wedding_id = p_wedding_id
    and wm.user_id = (select auth.uid())
    and wm.status = 'active'
  limit 1;
$$;

create function private.is_active_member(p_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.wedding_members as wm
    where wm.wedding_id = p_wedding_id
      and wm.user_id = (select auth.uid())
      and wm.status = 'active'
  );
$$;

create function private.shares_active_wedding(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.wedding_members as viewer
    join public.wedding_members as target
      on target.wedding_id = viewer.wedding_id
     and target.user_id = p_target_user_id
     and target.status = 'active'
    where viewer.user_id = (select auth.uid())
      and viewer.status = 'active'
  );
$$;

create function private.can_manage_members(p_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.current_membership_role(p_wedding_id) in ('owner', 'co_owner')),
    false
  );
$$;

create function private.has_module_access(
  p_wedding_id uuid,
  p_module public.wedding_module,
  p_required public.module_access_level
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when wm.role in ('owner', 'co_owner') then true
      when p_required = 'none' then true
      when wm.role = 'read_only_collaborator' then
        p_required = 'read' and permission.access_level = 'read'
      when wm.role = 'scoped_collaborator' then
        (p_required = 'read' and permission.access_level in ('read', 'edit'))
        or (p_required = 'edit' and permission.access_level = 'edit')
      else false
    end
    from public.wedding_members as wm
    left join public.member_module_permissions as permission
      on permission.wedding_id = wm.wedding_id
      and permission.membership_id = wm.id
      and permission.module = p_module
    where wm.wedding_id = p_wedding_id
      and wm.user_id = (select auth.uid())
      and wm.status = 'active'
    limit 1
  ), false);
$$;

create function private.is_wedding_owner(p_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_membership_role(p_wedding_id) = 'owner'), false);
$$;

-- The caller is always the owner of a newly-created wedding. There is no caller-supplied
-- owner ID or role, so this cannot be used to claim an existing wedding.
create function public.create_wedding(
  p_name text,
  p_timezone text default 'Europe/Dublin',
  p_currency text default 'EUR'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_wedding_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'profile required' using errcode = '23503';
  end if;

  insert into public.weddings (name, timezone, currency, created_by_user_id)
  values (trim(p_name), coalesce(nullif(trim(p_timezone), ''), 'Europe/Dublin'), upper(trim(p_currency)), v_user_id)
  returning id into v_wedding_id;

  set constraints all deferred;
  insert into public.wedding_members (wedding_id, user_id, role, status, created_by_user_id)
  values (v_wedding_id, v_user_id, 'owner', 'active', v_user_id);

  return v_wedding_id;
end;
$$;

-- Only an existing owner/co-owner may add another account. The caller may not target
-- themselves. Owner-level promotions are reserved to an existing owner.
create function public.add_wedding_member(
  p_wedding_id uuid,
  p_target_user_id uuid,
  p_role public.wedding_member_role,
  p_module_access jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_member_id uuid;
  v_module text;
  v_access text;
  v_role public.wedding_member_role;
begin
  if v_caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_target_user_id = v_caller_id then
    raise exception 'cannot grant membership or ownership to yourself' using errcode = '42501';
  end if;
  if not private.can_manage_members(p_wedding_id) then
    raise exception 'membership management not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    join auth.users as auth_user on auth_user.id = profile.id
    where profile.id = p_target_user_id
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception 'verified target account not found' using errcode = '23503';
  end if;
  if jsonb_typeof(coalesce(p_module_access, '{}'::jsonb)) <> 'object' then
    raise exception 'module access must be a JSON object' using errcode = '22023';
  end if;
  if p_role in ('owner', 'co_owner') and not private.is_wedding_owner(p_wedding_id) then
    raise exception 'only an owner may assign owner roles' using errcode = '42501';
  end if;
  if private.current_membership_role(p_wedding_id) = 'co_owner' and exists (
    select 1 from public.wedding_members as existing_member
    where existing_member.wedding_id = p_wedding_id
      and existing_member.user_id = p_target_user_id
      and existing_member.role in ('owner', 'co_owner')
  ) then
    raise exception 'co-owners cannot change owner memberships' using errcode = '42501';
  end if;
  if p_role in ('owner', 'co_owner') and p_module_access <> '{}'::jsonb then
    raise exception 'owners inherit all modules; explicit module grants are not accepted' using errcode = '22023';
  end if;

  insert into public.wedding_members (wedding_id, user_id, role, status, created_by_user_id)
  values (p_wedding_id, p_target_user_id, p_role, 'active', v_caller_id)
  on conflict (wedding_id, user_id) do update
    set role = excluded.role,
        status = 'active',
        created_by_user_id = excluded.created_by_user_id
  returning id, role into v_member_id, v_role;

  delete from public.member_module_permissions
  where wedding_id = p_wedding_id and membership_id = v_member_id;

  for v_module, v_access in
    select key, value from jsonb_each_text(coalesce(p_module_access, '{}'::jsonb))
  loop
    if v_role in ('owner', 'co_owner') then
      raise exception 'owners inherit all modules' using errcode = '22023';
    end if;
    if v_role = 'read_only_collaborator' and v_access <> 'read' then
      raise exception 'read-only collaborators can only receive read access' using errcode = '22023';
    end if;
    if v_access not in ('read', 'edit') then
      raise exception 'module access must be read or edit' using errcode = '22023';
    end if;
    insert into public.member_module_permissions (wedding_id, membership_id, module, access_level)
    values (p_wedding_id, v_member_id, v_module::public.wedding_module, v_access::public.module_access_level);
  end loop;

  return v_member_id;
end;
$$;

-- A partner/collaborator must already have a verified account. This avoids admin
-- service credentials and does not send an invitation email from this application.
create function public.add_wedding_member_by_email(
  p_wedding_id uuid,
  p_email text,
  p_role public.wedding_member_role,
  p_module_access jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_user_id uuid;
begin
  if auth.uid() is null or not private.can_manage_members(p_wedding_id) then
    raise exception 'membership management not allowed' using errcode = '42501';
  end if;
  select id into v_target_user_id
  from auth.users
  where lower(email) = lower(trim(p_email))
    and email_confirmed_at is not null
  limit 1;
  if v_target_user_id is null then
    raise exception 'verified account not found for that email' using errcode = 'P0002';
  end if;
  return public.add_wedding_member(p_wedding_id, v_target_user_id, p_role, p_module_access);
end;
$$;

create function public.set_member_module_access(
  p_wedding_id uuid,
  p_target_user_id uuid,
  p_module public.wedding_module,
  p_access_level public.module_access_level
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.wedding_members%rowtype;
begin
  if auth.uid() is null or not private.can_manage_members(p_wedding_id) then
    raise exception 'membership management not allowed' using errcode = '42501';
  end if;
  if p_target_user_id = auth.uid() then
    raise exception 'cannot change your own module grants' using errcode = '42501';
  end if;

  select * into v_target
  from public.wedding_members
  where wedding_id = p_wedding_id and user_id = p_target_user_id and status = 'active';
  if not found then
    raise exception 'active target membership not found' using errcode = 'P0002';
  end if;
  if v_target.role in ('owner', 'co_owner') then
    raise exception 'owner roles inherit all modules' using errcode = '22023';
  end if;
  if v_target.role = 'read_only_collaborator' and p_access_level = 'edit' then
    raise exception 'read-only collaborators cannot receive edit access' using errcode = '22023';
  end if;

  if p_access_level = 'none' then
    delete from public.member_module_permissions
    where wedding_id = p_wedding_id and membership_id = v_target.id and module = p_module;
  else
    insert into public.member_module_permissions (wedding_id, membership_id, module, access_level)
    values (p_wedding_id, v_target.id, p_module, p_access_level)
    on conflict (wedding_id, membership_id, module) do update
      set access_level = excluded.access_level;
  end if;
end;
$$;

create function public.revoke_wedding_member(p_wedding_id uuid, p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role public.wedding_member_role;
  v_target_role public.wedding_member_role;
begin
  v_caller_role := private.current_membership_role(p_wedding_id);
  if auth.uid() is null or v_caller_role is null or v_caller_role not in ('owner', 'co_owner') then
    raise exception 'membership management not allowed' using errcode = '42501';
  end if;
  if p_target_user_id = auth.uid() then
    raise exception 'cannot revoke your own active membership' using errcode = '42501';
  end if;

  select role into v_target_role
  from public.wedding_members
  where wedding_id = p_wedding_id and user_id = p_target_user_id and status = 'active';
  if not found then
    raise exception 'active target membership not found' using errcode = 'P0002';
  end if;
  if v_target_role in ('owner', 'co_owner') then
    if v_caller_role <> 'owner' then
      raise exception 'co-owners cannot revoke owner memberships' using errcode = '42501';
    end if;
    if v_target_role = 'owner' and (
      select count(*) from public.wedding_members
      where wedding_id = p_wedding_id and role = 'owner' and status = 'active'
    ) <= 1 then
      raise exception 'a wedding must retain at least one active owner' using errcode = '23514';
    end if;
  end if;

  update public.wedding_members
  set status = 'revoked'
  where wedding_id = p_wedding_id and user_id = p_target_user_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.weddings enable row level security;
alter table public.wedding_members enable row level security;
alter table public.member_module_permissions enable row level security;
alter table public.functions enable row level security;

revoke all on table public.profiles, public.weddings, public.wedding_members,
  public.member_module_permissions, public.functions from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.weddings to authenticated;
grant update (name, timezone, currency) on table public.weddings to authenticated;
grant select on table public.wedding_members, public.member_module_permissions to authenticated;
grant select, insert, update, delete on table public.functions to authenticated;

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_active_wedding(id)));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy weddings_select_member on public.weddings
  for select to authenticated
  using ((select private.is_active_member(id)));
create policy weddings_update_owner on public.weddings
  for update to authenticated
  using ((select private.current_membership_role(id)) in ('owner', 'co_owner'))
  with check ((select private.current_membership_role(id)) in ('owner', 'co_owner'));

create policy members_select_self_or_manager on public.wedding_members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.can_manage_members(wedding_id)));

create policy module_permissions_select_self_or_manager on public.member_module_permissions
  for select to authenticated
  using (
    exists (
      select 1 from public.wedding_members as wm
      where wm.wedding_id = member_module_permissions.wedding_id
        and wm.id = member_module_permissions.membership_id
        and wm.user_id = (select auth.uid())
        and wm.status = 'active'
    )
    or (select private.can_manage_members(wedding_id))
  );

create policy functions_select_module on public.functions
  for select to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'read')));
create policy functions_insert_module on public.functions
  for insert to authenticated
  with check (
    created_by_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'planning', 'edit'))
  );
create policy functions_update_module on public.functions
  for update to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'edit')))
  with check ((select private.has_module_access(wedding_id, 'planning', 'edit')));
create policy functions_delete_module on public.functions
  for delete to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'edit')));

revoke all on function private.current_membership_role(uuid) from public;
revoke all on function private.is_active_member(uuid) from public;
revoke all on function private.shares_active_wedding(uuid) from public;
revoke all on function private.can_manage_members(uuid) from public;
revoke all on function private.has_module_access(uuid, public.wedding_module, public.module_access_level) from public;
revoke all on function private.is_wedding_owner(uuid) from public;
revoke all on function public.create_wedding(text, text, text) from public, anon;
revoke all on function public.add_wedding_member(uuid, uuid, public.wedding_member_role, jsonb) from public, anon;
revoke all on function public.add_wedding_member_by_email(uuid, text, public.wedding_member_role, jsonb) from public, anon;
revoke all on function public.set_member_module_access(uuid, uuid, public.wedding_module, public.module_access_level) from public, anon;
revoke all on function public.revoke_wedding_member(uuid, uuid) from public, anon;

grant usage on schema private to authenticated;
grant execute on function private.current_membership_role(uuid) to authenticated;
grant execute on function private.is_active_member(uuid) to authenticated;
grant execute on function private.shares_active_wedding(uuid) to authenticated;
grant execute on function private.can_manage_members(uuid) to authenticated;
grant execute on function private.has_module_access(uuid, public.wedding_module, public.module_access_level) to authenticated;
grant execute on function private.is_wedding_owner(uuid) to authenticated;
grant execute on function public.create_wedding(text, text, text) to authenticated;
grant execute on function public.add_wedding_member(uuid, uuid, public.wedding_member_role, jsonb) to authenticated;
grant execute on function public.add_wedding_member_by_email(uuid, text, public.wedding_member_role, jsonb) to authenticated;
grant execute on function public.set_member_module_access(uuid, uuid, public.wedding_module, public.module_access_level) to authenticated;
grant execute on function public.revoke_wedding_member(uuid, uuid) to authenticated;
