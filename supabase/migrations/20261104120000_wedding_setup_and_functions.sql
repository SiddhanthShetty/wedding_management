-- Wedding setup fields and editable, wedding-local function schedules.
-- Existing wedding and function rows are retained; existing function timestamps
-- are projected into the wedding timezone before the new schedule fields are used.

create type public.wedding_date_status as enum ('tentative', 'confirmed');

alter table public.weddings
  add column partner_one_display_name text not null default '',
  add column partner_two_display_name text not null default '',
  add column wedding_date date,
  add column wedding_date_status public.wedding_date_status not null default 'tentative',
  add column main_locations text[] not null default array[]::text[],
  add column overall_budget numeric(14, 2),
  add column planning_notes text not null default '';

alter table public.weddings
  add constraint weddings_partner_one_name_length check (char_length(partner_one_display_name) <= 120),
  add constraint weddings_partner_two_name_length check (char_length(partner_two_display_name) <= 120),
  add constraint weddings_planning_notes_length check (char_length(planning_notes) <= 10000),
  add constraint weddings_budget_nonnegative check (overall_budget is null or overall_budget >= 0),
  add constraint weddings_confirmed_date_required check (wedding_date_status <> 'confirmed' or wedding_date is not null);

alter table public.functions
  add column function_type text not null default 'custom',
  add column function_date date,
  add column start_time time without time zone,
  add column end_time time without time zone,
  add column expected_attendance integer,
  add column budget_allocation numeric(14, 2),
  add column coordinator_name text,
  add column dress_code text,
  add column notes text not null default '',
  add column archived_at timestamptz;

update public.functions as wedding_function
set function_date = (wedding_function.starts_at at time zone wedding.timezone)::date,
    start_time = (wedding_function.starts_at at time zone wedding.timezone)::time,
    end_time = (wedding_function.ends_at at time zone wedding.timezone)::time
from public.weddings as wedding
where wedding.id = wedding_function.wedding_id
  and wedding_function.starts_at is not null;

alter table public.functions
  add constraint functions_type_length check (char_length(trim(function_type)) between 1 and 80),
  add constraint functions_date_required_for_times check (function_date is not null or (start_time is null and end_time is null)),
  add constraint functions_attendance_nonnegative check (expected_attendance is null or expected_attendance >= 0),
  add constraint functions_budget_nonnegative check (budget_allocation is null or budget_allocation >= 0),
  add constraint functions_coordinator_name_length check (coordinator_name is null or char_length(coordinator_name) <= 160),
  add constraint functions_dress_code_length check (dress_code is null or char_length(dress_code) <= 240),
  add constraint functions_notes_length check (char_length(notes) <= 10000);

create function private.sync_function_local_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_timezone text;
  v_start_local timestamp without time zone;
  v_end_local timestamp without time zone;
  v_start_instant timestamptz;
  v_end_instant timestamptz;
begin
  select wedding.timezone into v_timezone
  from public.weddings as wedding
  where wedding.id = new.wedding_id;

  if v_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names as zone where zone.name = v_timezone
  ) then
    raise exception 'wedding timezone is invalid' using errcode = '22023';
  end if;

  -- Preserve legacy inserts that supply only UTC timestamps (including local seed data).
  if new.function_date is null and new.start_time is null and new.end_time is null
     and new.starts_at is not null then
    v_start_local := new.starts_at at time zone v_timezone;
    new.function_date := v_start_local::date;
    new.start_time := v_start_local::time;
    if new.ends_at is not null then
      v_end_local := new.ends_at at time zone v_timezone;
      new.end_time := v_end_local::time;
    end if;
    return new;
  end if;

  if new.function_date is null then
    if new.start_time is not null or new.end_time is not null then
      raise exception 'a function date is required when times are set' using errcode = '23514';
    end if;
    new.starts_at := null;
    new.ends_at := null;
    return new;
  end if;

  if new.start_time is null and new.end_time is not null then
    raise exception 'a start time is required when an end time is set' using errcode = '23514';
  end if;

  if new.start_time is null then
    new.starts_at := null;
    new.ends_at := null;
    return new;
  end if;

  v_start_local := new.function_date + new.start_time;
  v_start_instant := v_start_local at time zone v_timezone;

  if (v_start_instant at time zone v_timezone) <> v_start_local then
    raise exception 'the selected local time does not exist because of a daylight-saving change' using errcode = '22007';
  end if;

  if new.end_time is null then
    new.starts_at := v_start_instant;
    new.ends_at := null;
    return new;
  end if;
  if new.start_time = new.end_time then
    raise exception 'function end time must be after its start time' using errcode = '23514';
  end if;

  v_end_local := new.function_date + new.end_time
    + case when new.end_time < new.start_time then interval '1 day' else interval '0 day' end;
  v_end_instant := v_end_local at time zone v_timezone;
  if (v_end_instant at time zone v_timezone) <> v_end_local then
    raise exception 'the selected local time does not exist because of a daylight-saving change' using errcode = '22007';
  end if;
  if v_end_instant <= v_start_instant then
    raise exception 'function end time must be after its start time' using errcode = '23514';
  end if;

  new.starts_at := v_start_instant;
  new.ends_at := v_end_instant;
  return new;
end;
$$;

create trigger functions_sync_local_schedule
  before insert or update of wedding_id, function_date, start_time, end_time
  on public.functions
  for each row execute function private.sync_function_local_schedule();

create index functions_wedding_date_idx on public.functions (wedding_id, function_date);

-- Wedding setup remains owner/co-owner controlled, matching the existing settings policy.
grant update (
  partner_one_display_name, partner_two_display_name, wedding_date,
  wedding_date_status, main_locations, overall_budget, planning_notes
) on public.weddings to authenticated;

-- Revoke hard deletion from normal application sessions. Functions are archived instead.
revoke update, delete on table public.functions from authenticated;
grant update (
  name, description, venue_name, status, function_type,
  function_date, start_time, end_time, expected_attendance, budget_allocation,
  coordinator_name, dress_code, notes, archived_at
) on public.functions to authenticated;
grant select, insert on table public.functions to authenticated;
drop policy if exists functions_delete_module on public.functions;

-- Create the initial wedding and both partner display names atomically under the
-- authenticated caller. The original three-argument RPC remains compatible.
create function public.create_wedding(
  p_name text,
  p_timezone text,
  p_currency text,
  p_partner_one_display_name text,
  p_partner_two_display_name text,
  p_wedding_date date,
  p_wedding_date_status public.wedding_date_status,
  p_main_locations text[],
  p_overall_budget numeric,
  p_planning_notes text
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
  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names as zone where zone.name = p_timezone
  ) then
    raise exception 'timezone must be a valid IANA timezone' using errcode = '22023';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'currency must be a three-letter uppercase code' using errcode = '22023';
  end if;
  if p_wedding_date_status = 'confirmed' and p_wedding_date is null then
    raise exception 'a confirmed wedding date is required' using errcode = '23514';
  end if;
  if p_overall_budget is not null and p_overall_budget < 0 then
    raise exception 'overall budget cannot be negative' using errcode = '23514';
  end if;

  insert into public.weddings (
    name, timezone, currency, created_by_user_id,
    partner_one_display_name, partner_two_display_name,
    wedding_date, wedding_date_status, main_locations, overall_budget, planning_notes
  ) values (
    trim(p_name), p_timezone, p_currency, v_user_id,
    left(trim(coalesce(p_partner_one_display_name, '')), 120),
    left(trim(coalesce(p_partner_two_display_name, '')), 120),
    p_wedding_date, p_wedding_date_status,
    coalesce(p_main_locations, array[]::text[]), p_overall_budget,
    left(coalesce(p_planning_notes, ''), 10000)
  ) returning id into v_wedding_id;

  set constraints all deferred;
  insert into public.wedding_members (wedding_id, user_id, role, status, created_by_user_id)
  values (v_wedding_id, v_user_id, 'owner', 'active', v_user_id);

  return v_wedding_id;
end;
$$;

revoke all on function public.create_wedding(
  text, text, text, text, text, date, public.wedding_date_status, text[], numeric, text
) from public, anon;
grant execute on function public.create_wedding(
  text, text, text, text, text, date, public.wedding_date_status, text[], numeric, text
) to authenticated;
revoke all on function private.sync_function_local_schedule() from public, anon, authenticated;
