-- QA/security hardening for the stays & transport, schedules, documents & messages milestone.
--
-- Data impact: additive. New nullable submission_key columns with partial unique indexes,
-- new triggers, a replaced journey validation function, and narrowed column grants on
-- communication_records and message_templates. Existing rows are not changed.
--
-- Fixes
-- H1  Manual message records could be updated into "provider_confirmed" deliveries.
-- H2  Creator/actor/approver columns accepted client-supplied member ids.
-- M2  Repeated submissions created duplicate journeys, schedule items, issues, arrangements, properties.
-- M3  Un-cancelling a journey skipped the passenger overlap check.
-- L3  Passengers could be removed from completed journeys, erasing history.

-- H2: actor stamping --------------------------------------------------------------------
-- tg_argv[0] = column name. tg_argv[1] = 'creator' (stamp on insert, keep on update)
-- or 'always' (stamp on every write). Writes without a signed-in user (migrations, seeds,
-- maintenance) are left unchanged.
create function private.stamp_actor() returns trigger language plpgsql set search_path='' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then return new; end if;
  if tg_op = 'INSERT' or tg_argv[1] = 'always' then
    new := pg_catalog.jsonb_populate_record(new, pg_catalog.jsonb_build_object(tg_argv[0], v_user));
  else
    new := pg_catalog.jsonb_populate_record(new, pg_catalog.jsonb_build_object(tg_argv[0], pg_catalog.to_jsonb(old) -> tg_argv[0]));
  end if;
  return new;
end $$;

do $$ declare r record; begin
  for r in select * from (values
    ('accommodation_properties','created_by_user_id','creator'),
    ('accommodation_assignments','created_by_user_id','creator'),
    ('transport_vehicles','created_by_user_id','creator'),
    ('transport_travel_groups','created_by_user_id','creator'),
    ('transport_journeys','created_by_user_id','creator'),
    ('transport_passengers','added_by_user_id','creator'),
    ('schedule_items','created_by_user_id','creator'),
    ('wedding_day_issues','created_by_user_id','creator'),
    ('arrangement_items','created_by_user_id','creator'),
    ('message_templates','created_by_user_id','creator'),
    ('message_templates','updated_by_user_id','always')
  ) as t(tbl, col, mode) loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function private.stamp_actor(%L, %L)',
      r.tbl || '_stamp_' || r.col, r.tbl, r.col, r.mode);
  end loop;
end $$;

-- Manual travel details are attributed to whoever last changed them.
create function private.stamp_travel_details() returns trigger language plpgsql set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_has boolean; v_changed boolean;
begin
  if v_user is null then return new; end if;
  v_has := new.arrival_at is not null or new.departure_at is not null or new.arrival_details <> '' or new.departure_details <> '';
  v_changed := tg_op = 'INSERT' or new.arrival_at is distinct from old.arrival_at or new.departure_at is distinct from old.departure_at
    or new.arrival_details <> old.arrival_details or new.departure_details <> old.departure_details;
  if v_changed then
    new.details_entered_by_user_id := case when v_has then v_user end;
    new.details_entered_at := case when v_has then now() end;
  else
    new.details_entered_by_user_id := old.details_entered_by_user_id;
    new.details_entered_at := old.details_entered_at;
  end if;
  return new;
end $$;
create trigger guest_travel_profiles_stamp_details before insert or update on public.guest_travel_profiles
  for each row execute function private.stamp_travel_details();

-- A design approval belongs to the member who approved it, and to one specific reference.
create function private.stamp_design_approval() returns trigger language plpgsql set search_path='' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then return new; end if;
  if tg_op = 'UPDATE' and new.reference_url is distinct from old.reference_url and new.design_approved_at is not distinct from old.design_approved_at then
    new.design_approved_at := null;  -- changing the design clears the old approval
  end if;
  if new.design_approved_at is null or new.reference_url is null then
    new.design_approved_at := null; new.design_approved_by_user_id := null;
  elsif tg_op = 'INSERT' or new.design_approved_at is distinct from old.design_approved_at then
    new.design_approved_at := now(); new.design_approved_by_user_id := v_user;
  else
    new.design_approved_by_user_id := old.design_approved_by_user_id;
  end if;
  return new;
end $$;
create trigger arrangement_items_stamp_approval before insert or update on public.arrangement_items
  for each row execute function private.stamp_design_approval();

-- H1: communication records and templates -----------------------------------------------
-- Members may only change what a manual workflow needs. Identity, provider and dedupe
-- fields are fixed; provider states remain reserved for a server-side integration.
revoke update on table public.communication_records from authenticated;
grant update (state, sent_at, failure_reason, notes, subject, body_snapshot, channel) on table public.communication_records to authenticated;
revoke update on table public.message_templates from authenticated;
grant update (kind, name, function_id, subject, body, archived_at) on table public.message_templates to authenticated;

create function private.freeze_communication_identity() returns trigger language plpgsql set search_path='' as $$
begin
  if (select auth.uid()) is not null and (
       new.manual is distinct from old.manual or new.provider_name is distinct from old.provider_name
    or new.provider_message_id is distinct from old.provider_message_id or new.provider_status_at is distinct from old.provider_status_at
    or new.guest_id is distinct from old.guest_id or new.function_id is distinct from old.function_id or new.template_id is distinct from old.template_id
    or new.dedupe_key is distinct from old.dedupe_key or new.recorded_by_user_id is distinct from old.recorded_by_user_id or new.wedding_id is distinct from old.wedding_id) then
    raise exception 'Message identity and provider fields cannot be changed.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger communication_records_freeze before update on public.communication_records
  for each row execute function private.freeze_communication_identity();

-- M2: idempotent creation ----------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['transport_journeys','schedule_items','wedding_day_issues','arrangement_items','accommodation_properties'] loop
    execute format('alter table public.%I add column submission_key uuid', t);
    execute format('create unique index %I on public.%I (wedding_id, submission_key) where submission_key is not null', t || '_submission_key_idx', t);
  end loop;
end $$;

-- M3: re-check passenger clashes when a journey is reactivated --------------------------
create or replace function private.validate_transport_journey() returns trigger language plpgsql set search_path='' as $$
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
  if tg_op = 'UPDATE' and (new.pickup_at <> old.pickup_at or new.estimated_dropoff_at <> old.estimated_dropoff_at or old.status = 'cancelled') and exists (
    select 1 from public.transport_passengers p join public.transport_passengers other on other.wedding_id = p.wedding_id and other.guest_id = p.guest_id and other.journey_id <> p.journey_id
      join public.transport_journeys j on j.wedding_id = other.wedding_id and j.id = other.journey_id
    where p.wedding_id = new.wedding_id and p.journey_id = new.id and j.status <> 'cancelled'
      and j.pickup_at < new.estimated_dropoff_at and new.pickup_at < j.estimated_dropoff_at) then
    raise exception 'A passenger on this journey is booked on another journey at the same time.' using errcode = '23514';
  end if;
  return new;
end $$;

-- L3: completed journeys keep their passenger list ---------------------------------------
create function private.guard_passenger_removal() returns trigger language plpgsql set search_path='' as $$
begin
  if exists (select 1 from public.transport_journeys where wedding_id = old.wedding_id and id = old.journey_id and status = 'completed') then
    raise exception 'Passengers of a completed journey are kept as history.' using errcode = '23514';
  end if;
  return old;
end $$;
create trigger transport_passengers_guard_delete before delete on public.transport_passengers
  for each row execute function private.guard_passenger_removal();

revoke all on function private.stamp_actor(), private.stamp_travel_details(), private.stamp_design_approval(),
  private.freeze_communication_identity(), private.guard_passenger_removal(), private.validate_transport_journey()
  from public, anon, authenticated;
