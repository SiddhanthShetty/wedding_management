-- Accommodation and transport, built on existing guest records.
--
-- Data impact: additive only. New enums, tables, triggers, helper functions and RLS
-- policies; get_guest_portal_data is replaced to add confirmed stays and journeys that
-- were explicitly shared with guests. No existing rows are modified.
--
-- Rules:
-- * A guest's need for a room / arrival transport / departure transport is one of
--   unknown, required or not_required. "Not assigned" is derived (required + no allocation).
-- * Stays are half-open date ranges [check_in_date, check_out_date): the check-out day is not a night.
-- * Journeys are half-open instants [pickup_at, estimated_dropoff_at): back-to-back runs do not overlap.
-- * Manually entered travel details are recorded with their author and time. Nothing here is
--   live-verified against airlines, rail or hotel systems.
-- * No identity-document fields are collected.

create type public.logistics_need as enum ('unknown','required','not_required');
create type public.allocation_status as enum ('proposed','confirmed','cancelled');
create type public.payment_responsibility as enum ('unknown','couple','guest','family','shared');
create type public.journey_kind as enum ('arrival','departure','transfer');
create type public.journey_status as enum ('planned','assigned','collected','completed','cancelled');

create function private.travel_touch_version() returns trigger language plpgsql set search_path='' as $$
begin new.version := old.version + 1; new.updated_at := now(); return new; end $$;
create function private.travel_touch() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at := now(); return new; end $$;

-- Per-guest needs and manually entered travel details.
create table public.guest_travel_profiles (
  wedding_id uuid not null,
  guest_id uuid not null,
  accommodation_need public.logistics_need not null default 'unknown',
  arrival_transport_need public.logistics_need not null default 'unknown',
  departure_transport_need public.logistics_need not null default 'unknown',
  arrival_at timestamptz,
  arrival_details text not null default '' check (char_length(arrival_details) <= 500),
  departure_at timestamptz,
  departure_details text not null default '' check (char_length(departure_details) <= 500),
  travel_notes text not null default '' check (char_length(travel_notes) <= 2000),
  details_entered_by_user_id uuid,
  details_entered_at timestamptz,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (wedding_id, guest_id),
  foreign key (wedding_id, guest_id) references public.guests(wedding_id, id) on delete cascade,
  foreign key (wedding_id, details_entered_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  check (arrival_at is null or departure_at is null or departure_at > arrival_at)
);
create trigger guest_travel_profiles_version before update on public.guest_travel_profiles for each row execute function private.travel_touch_version();

-- Accommodation -------------------------------------------------------------------------
create table public.accommodation_properties (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 180),
  address text not null default '' check (char_length(address) <= 1200),
  contact_name text not null default '' check (char_length(contact_name) <= 160),
  contact_phone text not null default '' check (char_length(contact_phone) <= 80),
  contact_email text not null default '' check (char_length(contact_email) <= 320),
  supplier_id uuid,
  check_in_time time,
  check_out_time time,
  guest_facing_notes text not null default '' check (char_length(guest_facing_notes) <= 2000),
  internal_notes text not null default '' check (char_length(internal_notes) <= 4000),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, supplier_id) references public.suppliers(wedding_id, id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);
create trigger accommodation_properties_touch before update on public.accommodation_properties for each row execute function private.travel_touch();

create table public.accommodation_room_types (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  property_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  standard_occupancy integer not null check (standard_occupancy between 1 and 20),
  max_extra_beds integer not null default 0 check (max_extra_beds between 0 and 10),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique (wedding_id, id),
  unique (wedding_id, property_id, name),
  foreign key (wedding_id, property_id) references public.accommodation_properties(wedding_id, id) on delete cascade
);

-- Individual rooms. A label may be a placeholder ("Room 2") until the hotel confirms numbers.
create table public.accommodation_rooms (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  room_type_id uuid not null,
  label text not null check (char_length(trim(label)) between 1 and 60),
  number_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (wedding_id, id),
  unique (wedding_id, room_type_id, label),
  foreign key (wedding_id, room_type_id) references public.accommodation_room_types(wedding_id, id) on delete cascade
);

-- Rooms held per room type per night. A held night is a proposed or confirmed block.
create table public.accommodation_inventory (
  wedding_id uuid not null,
  room_type_id uuid not null,
  night date not null,
  rooms_held integer not null check (rooms_held between 0 and 500),
  hold_status public.allocation_status not null default 'proposed' check (hold_status <> 'cancelled'),
  updated_at timestamptz not null default now(),
  primary key (wedding_id, room_type_id, night),
  foreign key (wedding_id, room_type_id) references public.accommodation_room_types(wedding_id, id) on delete cascade
);

create table public.accommodation_assignments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  guest_id uuid not null,
  room_id uuid not null,
  check_in_date date not null,
  check_out_date date not null,
  status public.allocation_status not null default 'proposed',
  uses_extra_bed boolean not null default false,
  payment_responsibility public.payment_responsibility not null default 'unknown',
  special_requirements text not null default '' check (char_length(special_requirements) <= 2000),
  notes text not null default '' check (char_length(notes) <= 2000),
  version integer not null default 1,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, guest_id) references public.guests(wedding_id, id) on delete restrict,
  foreign key (wedding_id, room_id) references public.accommodation_rooms(wedding_id, id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  check (check_out_date > check_in_date),
  check (check_out_date - check_in_date <= 60)
);
create index accommodation_assignments_room_idx on public.accommodation_assignments(wedding_id, room_id, check_in_date);
create index accommodation_assignments_guest_idx on public.accommodation_assignments(wedding_id, guest_id, check_in_date);
create trigger accommodation_assignments_version before update on public.accommodation_assignments for each row execute function private.travel_touch_version();

create function private.validate_accommodation_assignment() returns trigger language plpgsql set search_path='' as $$
declare
  v_type uuid; v_standard integer; v_extra integer; v_night date; v_held integer;
  v_beds integer; v_extra_used integer; v_rooms integer; i integer;
begin
  if new.status = 'cancelled' then return new; end if;
  -- Serialise allocation checks per wedding so concurrent saves cannot both pass.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('accommodation:' || new.wedding_id::text, 0));
  select r.room_type_id, t.standard_occupancy, t.max_extra_beds into v_type, v_standard, v_extra
    from public.accommodation_rooms r join public.accommodation_room_types t on t.wedding_id = r.wedding_id and t.id = r.room_type_id
    where r.wedding_id = new.wedding_id and r.id = new.room_id;
  if not found then raise exception 'Room not found in this wedding.' using errcode = '23503'; end if;
  if new.uses_extra_bed and v_extra = 0 then raise exception 'This room type does not allow extra beds.' using errcode = '23514'; end if;
  for i in 0 .. (new.check_out_date - new.check_in_date - 1) loop
    v_night := new.check_in_date + i;
    select rooms_held into v_held from public.accommodation_inventory
      where wedding_id = new.wedding_id and room_type_id = v_type and night = v_night;
    if not found or v_held = 0 then
      raise exception 'The night of % is outside the booked nights for this room type.', v_night using errcode = '23514';
    end if;
    if exists (select 1 from public.accommodation_assignments a
      where a.wedding_id = new.wedding_id and a.guest_id = new.guest_id and a.id <> new.id and a.status <> 'cancelled'
        and a.check_in_date <= v_night and a.check_out_date > v_night) then
      raise exception 'This guest already has a room for the night of %.', v_night using errcode = '23514';
    end if;
    select count(*) filter (where not a.uses_extra_bed), count(*) filter (where a.uses_extra_bed) into v_beds, v_extra_used
      from public.accommodation_assignments a
      where a.wedding_id = new.wedding_id and a.room_id = new.room_id and a.id <> new.id and a.status <> 'cancelled'
        and a.check_in_date <= v_night and a.check_out_date > v_night;
    if new.uses_extra_bed then v_extra_used := v_extra_used + 1; else v_beds := v_beds + 1; end if;
    if v_beds > v_standard then
      raise exception 'The room is already at its occupancy limit (%) on the night of %.', v_standard, v_night using errcode = '23514';
    end if;
    if v_extra_used > v_extra then
      raise exception 'No extra bed is left in this room on the night of %.', v_night using errcode = '23514';
    end if;
    select count(distinct room_id) into v_rooms from (
      select a.room_id from public.accommodation_assignments a join public.accommodation_rooms r on r.wedding_id = a.wedding_id and r.id = a.room_id
        where a.wedding_id = new.wedding_id and r.room_type_id = v_type and a.id <> new.id and a.status <> 'cancelled'
          and a.check_in_date <= v_night and a.check_out_date > v_night
      union select new.room_id) used;
    if v_rooms > v_held then
      raise exception 'Only % room(s) of this type are held for the night of %.', v_held, v_night using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
create trigger accommodation_assignments_validate before insert or update on public.accommodation_assignments
  for each row execute function private.validate_accommodation_assignment();

create function private.guard_accommodation_inventory() returns trigger language plpgsql set search_path='' as $$
declare v_used integer; v_row public.accommodation_inventory;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('accommodation:' || v_row.wedding_id::text, 0));
  select count(distinct a.room_id) into v_used from public.accommodation_assignments a
    join public.accommodation_rooms r on r.wedding_id = a.wedding_id and r.id = a.room_id
    where a.wedding_id = v_row.wedding_id and r.room_type_id = v_row.room_type_id and a.status <> 'cancelled'
      and a.check_in_date <= v_row.night and a.check_out_date > v_row.night;
  if tg_op = 'DELETE' and v_used > 0 then
    raise exception 'Rooms are allocated on the night of %; move or cancel those stays first.', old.night using errcode = '23514';
  elsif tg_op = 'UPDATE' and new.rooms_held < v_used then
    raise exception '% room(s) are already allocated on the night of %.', v_used, new.night using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger accommodation_inventory_guard before update or delete on public.accommodation_inventory
  for each row execute function private.guard_accommodation_inventory();

create function private.guard_accommodation_room_type() returns trigger language plpgsql set search_path='' as $$
begin
  if exists (
    select 1 from public.accommodation_assignments a
      join public.accommodation_rooms r on r.wedding_id = a.wedding_id and r.id = a.room_id
      cross join lateral pg_catalog.generate_series(0, a.check_out_date - a.check_in_date - 1) as n(i)
    where a.wedding_id = new.wedding_id and r.room_type_id = new.id and a.status <> 'cancelled'
    group by a.room_id, a.check_in_date + n.i
    having count(*) filter (where not a.uses_extra_bed) > new.standard_occupancy
        or count(*) filter (where a.uses_extra_bed) > new.max_extra_beds) then
    raise exception 'Existing stays exceed the new occupancy limit. Move guests first.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger accommodation_room_type_guard before update of standard_occupancy, max_extra_beds on public.accommodation_room_types
  for each row execute function private.guard_accommodation_room_type();

create function private.guard_accommodation_room() returns trigger language plpgsql set search_path='' as $$
begin
  if new.room_type_id <> old.room_type_id and exists (select 1 from public.accommodation_assignments
    where wedding_id = old.wedding_id and room_id = old.id and status <> 'cancelled') then
    raise exception 'Move or cancel stays before changing this room''s type.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger accommodation_room_guard before update of room_type_id on public.accommodation_rooms
  for each row execute function private.guard_accommodation_room();

-- Transport -----------------------------------------------------------------------------
create table public.transport_vehicles (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 120),
  vehicle_type text not null default '' check (char_length(vehicle_type) <= 80),
  passenger_capacity integer not null check (passenger_capacity between 1 and 100),
  driver_name text not null default '' check (char_length(driver_name) <= 160),
  driver_phone text not null default '' check (char_length(driver_phone) <= 80),
  supplier_id uuid,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  unique (wedding_id, label),
  foreign key (wedding_id, supplier_id) references public.suppliers(wedding_id, id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);
create trigger transport_vehicles_touch before update on public.transport_vehicles for each row execute function private.travel_touch();

create table public.transport_travel_groups (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (wedding_id, id),
  unique (wedding_id, name),
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);
create table public.transport_travel_group_members (
  wedding_id uuid not null,
  group_id uuid not null,
  guest_id uuid not null,
  primary key (wedding_id, group_id, guest_id),
  foreign key (wedding_id, group_id) references public.transport_travel_groups(wedding_id, id) on delete cascade,
  foreign key (wedding_id, guest_id) references public.guests(wedding_id, id) on delete cascade
);

create table public.transport_journeys (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  kind public.journey_kind not null,
  function_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 180),
  pickup_location text not null check (char_length(trim(pickup_location)) between 1 and 300),
  dropoff_location text not null check (char_length(trim(dropoff_location)) between 1 and 300),
  pickup_at timestamptz not null,
  estimated_dropoff_at timestamptz not null,
  vehicle_id uuid,
  coordinator_user_id uuid,
  status public.journey_status not null default 'planned',
  status_note text not null default '' check (char_length(status_note) <= 1000),
  shared_with_guests boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 2000),
  version integer not null default 1,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, function_id) references public.functions(wedding_id, id) on delete restrict,
  foreign key (wedding_id, vehicle_id) references public.transport_vehicles(wedding_id, id) on delete restrict,
  foreign key (wedding_id, coordinator_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  check (estimated_dropoff_at > pickup_at),
  check (estimated_dropoff_at - pickup_at <= interval '24 hours'),
  check (status in ('planned', 'cancelled') or vehicle_id is not null),
  check (not shared_with_guests or (vehicle_id is not null and status <> 'cancelled'))
);
create index transport_journeys_vehicle_idx on public.transport_journeys(wedding_id, vehicle_id, pickup_at);
create index transport_journeys_time_idx on public.transport_journeys(wedding_id, pickup_at);
create trigger transport_journeys_version before update on public.transport_journeys for each row execute function private.travel_touch_version();

create table public.transport_passengers (
  wedding_id uuid not null,
  journey_id uuid not null,
  guest_id uuid not null,
  added_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (wedding_id, journey_id, guest_id),
  foreign key (wedding_id, journey_id) references public.transport_journeys(wedding_id, id) on delete cascade,
  foreign key (wedding_id, guest_id) references public.guests(wedding_id, id) on delete restrict,
  foreign key (wedding_id, added_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);
create index transport_passengers_guest_idx on public.transport_passengers(wedding_id, guest_id);

create function private.validate_transport_journey() returns trigger language plpgsql set search_path='' as $$
declare v_capacity integer; v_passengers integer;
begin
  if new.status = 'cancelled' then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('transport:' || new.wedding_id::text, 0));
  if new.vehicle_id is not null then
    if exists (select 1 from public.transport_journeys j
      where j.wedding_id = new.wedding_id and j.vehicle_id = new.vehicle_id and j.id <> new.id and j.status <> 'cancelled'
        and j.pickup_at < new.estimated_dropoff_at and new.pickup_at < j.estimated_dropoff_at) then
      raise exception 'This vehicle is already assigned to an overlapping journey.' using errcode = '23514';
    end if;
    select passenger_capacity into v_capacity from public.transport_vehicles where wedding_id = new.wedding_id and id = new.vehicle_id;
    select count(*) into v_passengers from public.transport_passengers where wedding_id = new.wedding_id and journey_id = new.id;
    if v_passengers > v_capacity then
      raise exception 'This vehicle seats % passengers but % are assigned.', v_capacity, v_passengers using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.pickup_at <> old.pickup_at or new.estimated_dropoff_at <> old.estimated_dropoff_at) and exists (
    select 1 from public.transport_passengers p join public.transport_passengers other on other.wedding_id = p.wedding_id and other.guest_id = p.guest_id and other.journey_id <> p.journey_id
      join public.transport_journeys j on j.wedding_id = other.wedding_id and j.id = other.journey_id
    where p.wedding_id = new.wedding_id and p.journey_id = new.id and j.status <> 'cancelled'
      and j.pickup_at < new.estimated_dropoff_at and new.pickup_at < j.estimated_dropoff_at) then
    raise exception 'A passenger on this journey is booked on another journey at the same time.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger transport_journeys_validate before insert or update on public.transport_journeys
  for each row execute function private.validate_transport_journey();

create function private.validate_transport_passenger() returns trigger language plpgsql set search_path='' as $$
declare v_journey public.transport_journeys; v_capacity integer; v_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('transport:' || new.wedding_id::text, 0));
  select * into v_journey from public.transport_journeys where wedding_id = new.wedding_id and id = new.journey_id;
  if not found then raise exception 'Journey not found.' using errcode = '23503'; end if;
  if v_journey.status in ('cancelled', 'completed') then raise exception 'Passengers cannot be added to a cancelled or completed journey.' using errcode = '23514'; end if;
  if exists (select 1 from public.transport_passengers p join public.transport_journeys j on j.wedding_id = p.wedding_id and j.id = p.journey_id
    where p.wedding_id = new.wedding_id and p.guest_id = new.guest_id and p.journey_id <> new.journey_id and j.status <> 'cancelled'
      and j.pickup_at < v_journey.estimated_dropoff_at and v_journey.pickup_at < j.estimated_dropoff_at) then
    raise exception 'This guest is already on another journey at the same time.' using errcode = '23514';
  end if;
  if v_journey.vehicle_id is not null then
    select passenger_capacity into v_capacity from public.transport_vehicles where wedding_id = new.wedding_id and id = v_journey.vehicle_id;
    select count(*) + 1 into v_count from public.transport_passengers where wedding_id = new.wedding_id and journey_id = new.journey_id;
    if v_count > v_capacity then
      raise exception 'This vehicle seats % passengers; the journey is full.', v_capacity using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger transport_passengers_validate before insert on public.transport_passengers
  for each row execute function private.validate_transport_passenger();

create function private.guard_transport_vehicle() returns trigger language plpgsql set search_path='' as $$
begin
  if exists (select 1 from public.transport_journeys j where j.wedding_id = new.wedding_id and j.vehicle_id = new.id and j.status <> 'cancelled'
    and (select count(*) from public.transport_passengers p where p.wedding_id = j.wedding_id and p.journey_id = j.id) > new.passenger_capacity) then
    raise exception 'An active journey already has more passengers than the new capacity.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger transport_vehicle_guard before update of passenger_capacity on public.transport_vehicles
  for each row execute function private.guard_transport_vehicle();

-- Guest lookup for logistics members. Contact and assistance fields follow guest-module access.
create function public.get_travel_guests(p_wedding_id uuid)
returns table (guest_id uuid, full_name text, household_name text, phone text, assistance_needs text)
language plpgsql stable security definer set search_path='' as $$
declare v_contacts boolean; v_sensitive boolean;
begin
  if not private.has_module_access(p_wedding_id, 'logistics', 'read') then raise exception 'Logistics read permission required.'; end if;
  v_contacts := private.has_module_access(p_wedding_id, 'guests', 'read');
  v_sensitive := coalesce(private.current_membership_role(p_wedding_id) in ('owner', 'co_owner'), false)
    or private.has_module_access(p_wedding_id, 'guests', 'edit');
  return query select g.id, g.full_name, coalesce(h.name, ''),
      case when v_contacts then g.phone else null end,
      case when v_sensitive then g.assistance_needs else null end
    from public.guests g left join public.guest_households h on h.wedding_id = g.wedding_id and h.id = g.household_id
    where g.wedding_id = p_wedding_id order by g.full_name;
end $$;

-- RLS: every table is wedding-scoped and governed by the logistics module.
do $$ declare t text; begin
  foreach t in array array['guest_travel_profiles','accommodation_properties','accommodation_room_types','accommodation_rooms','accommodation_inventory','accommodation_assignments','transport_vehicles','transport_travel_groups','transport_travel_group_members','transport_journeys','transport_passengers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.has_module_access(wedding_id, ''logistics'', ''read'')))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.has_module_access(wedding_id, ''logistics'', ''edit'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.has_module_access(wedding_id, ''logistics'', ''edit''))) with check ((select private.has_module_access(wedding_id, ''logistics'', ''edit'')))', t || '_update', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
  end loop;
  -- Deletion rules: stays and journeys are cancelled, never deleted. Structural rows can be removed
  -- by editors; foreign keys and guard triggers stop removal while allocations depend on them.
  foreach t in array array['accommodation_properties','accommodation_room_types','accommodation_rooms','accommodation_inventory','transport_vehicles','transport_travel_groups','transport_travel_group_members','transport_passengers'] loop
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.has_module_access(wedding_id, ''logistics'', ''edit'')))', t || '_delete', t);
    execute format('grant delete on table public.%I to authenticated', t);
  end loop;
end $$;

revoke all on function public.get_travel_guests(uuid) from public, anon;
grant execute on function public.get_travel_guests(uuid) to authenticated;

-- Guest portal: add confirmed stays and journeys explicitly shared with guests.
-- Room-mates, room numbers, payment responsibility, drivers' phone numbers and internal notes are not exposed.
create or replace function public.get_guest_portal_data(p_session_digest text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_link public.guest_portal_links%rowtype; v_household public.guest_households%rowtype; v_wedding public.weddings%rowtype; v_data jsonb;
begin
  if p_session_digest !~ '^[a-f0-9]{64}$' then return null; end if;
  select l.* into v_link from public.guest_portal_sessions s join public.guest_portal_links l on l.wedding_id=s.wedding_id and l.id=s.link_id
  where s.session_digest=p_session_digest and s.expires_at>now() and l.revoked_at is null and l.expires_at>now();
  if not found then return null; end if;
  update public.guest_portal_sessions set last_used_at=now() where session_digest=p_session_digest;
  select * into v_household from public.guest_households where wedding_id=v_link.wedding_id and id=v_link.household_id;
  select * into v_wedding from public.weddings where id=v_link.wedding_id;
  select jsonb_build_object(
    'household',jsonb_build_object('name',v_household.name),
    'couple_names',array_remove(array[v_wedding.partner_one_display_name,v_wedding.partner_two_display_name],''),
    'people',coalesce((select jsonb_agg(jsonb_build_object(
      'id',g.id,'full_name',g.full_name,'meal_preference',g.meal_preference,'allergies',g.allergies,'assistance_needs',g.assistance_needs,'updated_at',g.updated_at,
      'invitations',(select coalesce(jsonb_agg(jsonb_build_object(
        'id',i.id,'response',r.response,'response_note',r.response_note,'updated_at',r.updated_at,
        'function',jsonb_build_object('id',f.id,'name',f.name,'type',f.function_type,'date',f.function_date,'start_time',f.start_time,'end_time',f.end_time,'timezone',v_wedding.timezone,'location',f.venue_name,'map_url',f.guest_map_url,'dress_code',f.dress_code,'status',f.status::text)
      ) order by f.function_date,f.start_time),'[]'::jsonb) from public.guest_invitations i join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id
        left join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id
        where i.wedding_id=v_link.wedding_id and i.guest_id=g.id and i.status='invited' and f.archived_at is null and f.status<>'cancelled'),
      'stays',(select coalesce(jsonb_agg(jsonb_build_object(
        'property',p.name,'address',p.address,'notes',p.guest_facing_notes,'room_type',t.name,
        'check_in_date',a.check_in_date,'check_out_date',a.check_out_date,'check_in_time',p.check_in_time,'check_out_time',p.check_out_time
      ) order by a.check_in_date),'[]'::jsonb)
        from public.accommodation_assignments a
        join public.accommodation_rooms rm on rm.wedding_id=a.wedding_id and rm.id=a.room_id
        join public.accommodation_room_types t on t.wedding_id=rm.wedding_id and t.id=rm.room_type_id
        join public.accommodation_properties p on p.wedding_id=t.wedding_id and p.id=t.property_id
        where a.wedding_id=v_link.wedding_id and a.guest_id=g.id and a.status='confirmed'),
      'journeys',(select coalesce(jsonb_agg(jsonb_build_object(
        'kind',j.kind::text,'title',j.title,'pickup_at',j.pickup_at,'pickup_location',j.pickup_location,'dropoff_location',j.dropoff_location,'timezone',v_wedding.timezone
      ) order by j.pickup_at),'[]'::jsonb)
        from public.transport_passengers tp join public.transport_journeys j on j.wedding_id=tp.wedding_id and j.id=tp.journey_id
        where tp.wedding_id=v_link.wedding_id and tp.guest_id=g.id and j.shared_with_guests and j.status<>'cancelled')
    ) order by g.full_name) from public.guests g where g.wedding_id=v_link.wedding_id and g.household_id=v_link.household_id
      and exists(select 1 from public.guest_invitations i join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id where i.wedding_id=g.wedding_id and i.guest_id=g.id and i.status='invited' and f.archived_at is null and f.status<>'cancelled')),'[]'::jsonb)
  ) into v_data;
  return v_data;
end; $$;
revoke all on function public.get_guest_portal_data(text) from public, authenticated;
grant execute on function public.get_guest_portal_data(text) to anon;

-- Hardening: trigger functions are not callable directly; they still run as triggers.
revoke all on function private.travel_touch_version(), private.travel_touch(), private.validate_accommodation_assignment(),
  private.guard_accommodation_inventory(), private.guard_accommodation_room_type(), private.guard_accommodation_room(),
  private.validate_transport_journey(), private.validate_transport_passenger(), private.guard_transport_vehicle()
  from public, anon, authenticated;
