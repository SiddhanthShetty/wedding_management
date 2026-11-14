-- Catering meal services count from family replies (one reply per family, with how many are coming
-- and which events), instead of the per-person replies the app no longer collects.
--
-- Data impact: functions only. No table or row is changed or removed. Saved final counts
-- (catering_count_snapshots) keep the numbers they were saved with.
-- * get_catering_family_counts (new): families invited to the service's function, families that
--   replied, people coming, and each coming family's name, number and food choice.
-- * get_catering_dietary_summary, get_catering_allergy_details and capture_catering_count_snapshot
--   are replaced with the same signatures and permission checks, reading family replies. People
--   coming count as adult meals unless an adult or child count is entered by hand.
-- Families taken off the list (invite_removed_at) are left out.

create function public.get_catering_family_counts(p_wedding_id uuid,p_service_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_function uuid;
begin
  if not private.has_module_access(p_wedding_id,'logistics','read') then raise exception 'Logistics read permission required.'; end if;
  select function_id into v_function from public.catering_meal_services where wedding_id=p_wedding_id and id=p_service_id;
  if not found then raise exception 'Catering service not found.'; end if;
  return (
    with invited as (
      select h.id,h.name from public.family_function_invites i join public.guest_households h on h.wedding_id=i.wedding_id and h.id=i.household_id
      where i.wedding_id=p_wedding_id and i.function_id=v_function and h.invite_removed_at is null
    ), replies as (
      select v.id,v.name,r.attending and v_function=any(r.function_ids) as coming,r.guest_count,r.dietary
      from invited v join public.family_replies r on r.wedding_id=p_wedding_id and r.household_id=v.id
    )
    select jsonb_build_object(
      'invited_families',(select count(*) from invited)::integer,
      'replied_families',(select count(*) from replies)::integer,
      'coming_people',coalesce((select sum(guest_count) from replies where coming),0)::integer,
      'families',coalesce((select jsonb_agg(jsonb_build_object('name',name,'people',guest_count,'dietary',dietary) order by name) from replies where coming),'[]'::jsonb)
    )
  );
end $$;

create or replace function public.get_catering_dietary_summary(p_wedding_id uuid,p_service_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_service public.catering_meal_services; v_result jsonb;
begin
  if not private.has_module_access(p_wedding_id,'logistics','read') then raise exception 'Logistics read permission required.'; end if;
  select * into v_service from public.catering_meal_services where wedding_id=p_wedding_id and id=p_service_id;
  if not found then raise exception 'Catering service not found.'; end if;
  -- Aggregates only: each food choice with the number of people coming. No names or notes.
  select jsonb_build_object(
    'preferences',coalesce((select jsonb_agg(jsonb_build_object('preference',dietary,'count',n) order by dietary) from (
      select r.dietary,sum(r.guest_count)::integer n from public.family_replies r join public.guest_households h on h.wedding_id=r.wedding_id and h.id=r.household_id
      where r.wedding_id=p_wedding_id and r.attending and v_service.function_id=any(r.function_ids) and h.invite_removed_at is null and r.dietary<>'none'
      group by r.dietary) s),'[]'::jsonb),
    'assistance_count',(select count(*)::integer from public.family_replies r join public.guest_households h on h.wedding_id=r.wedding_id and h.id=r.household_id
      where r.wedding_id=p_wedding_id and r.attending and v_service.function_id=any(r.function_ids) and h.invite_removed_at is null and btrim(r.dietary_notes)<>'')
  ) into v_result;
  return v_result;
end $$;

create or replace function public.get_catering_allergy_details(p_wedding_id uuid,p_service_id uuid)
returns table(guest_name text,allergies text) language plpgsql security definer set search_path='' as $$
declare v_service public.catering_meal_services; v_role text;
begin
  if not private.has_module_access(p_wedding_id,'logistics','read') then raise exception 'Logistics read permission required.'; end if;
  select m.role into v_role from public.wedding_members m where m.wedding_id=p_wedding_id and m.user_id=auth.uid() and m.status='active';
  if v_role not in ('owner','co_owner') and not private.has_module_access(p_wedding_id,'guests','edit') then raise exception 'Guest edit permission required for individual allergy details.'; end if;
  select * into v_service from public.catering_meal_services where wedding_id=p_wedding_id and id=p_service_id;
  if not found then raise exception 'Catering service not found.'; end if;
  -- Each coming family's own food notes ("allergies or other food needs" on their reply).
  return query select h.name,r.dietary_notes from public.family_replies r join public.guest_households h on h.wedding_id=r.wedding_id and h.id=r.household_id
    where r.wedding_id=p_wedding_id and r.attending and v_service.function_id=any(r.function_ids) and h.invite_removed_at is null and btrim(r.dietary_notes)<>''
    order by h.name;
end $$;

create or replace function public.capture_catering_count_snapshot(p_wedding_id uuid,p_service_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_service public.catering_meal_services; v_id uuid;
  v_invited integer; v_confirmed integer; v_manual integer; v_expected integer; v_total integer; v_categories jsonb;
begin
  if v_user is null or not private.has_module_access(p_wedding_id,'logistics','edit') then raise exception 'Logistics edit permission required.'; end if;
  select * into v_service from public.catering_meal_services where wedding_id=p_wedding_id and id=p_service_id for update;
  if not found then raise exception 'Catering service not found.'; end if;
  -- Invited: families invited to this function. Confirmed: people coming, from family replies.
  select count(*)::integer into v_invited from public.family_function_invites i join public.guest_households h on h.wedding_id=i.wedding_id and h.id=i.household_id
    where i.wedding_id=p_wedding_id and i.function_id=v_service.function_id and h.invite_removed_at is null;
  select coalesce(sum(r.guest_count),0)::integer into v_confirmed from public.family_replies r join public.guest_households h on h.wedding_id=r.wedding_id and h.id=r.household_id
    where r.wedding_id=p_wedding_id and r.attending and v_service.function_id=any(r.function_ids) and h.invite_removed_at is null;
  select sum(manual_expected_count)::integer into v_manual from public.catering_service_counts where wedding_id=p_wedding_id and meal_service_id=p_service_id;
  -- People coming count as adult meals; enter adult and child counts by hand to split them.
  select jsonb_build_object(
    'adult',jsonb_build_object('assigned',v_confirmed,'confirmed',v_confirmed,'manual_expected',max(c.manual_expected_count) filter(where c.category='adult'),'actual',max(c.actual_attendance) filter(where c.category='adult'),'rate',max(c.per_plate_rate) filter(where c.category='adult')),
    'child',jsonb_build_object('assigned',0,'confirmed',0,'manual_expected',max(c.manual_expected_count) filter(where c.category='child'),'actual',max(c.actual_attendance) filter(where c.category='child'),'rate',max(c.per_plate_rate) filter(where c.category='child')),
    'vendor',jsonb_build_object('manual_expected',max(c.manual_expected_count) filter(where c.category='vendor'),'actual',max(c.actual_attendance) filter(where c.category='vendor'),'rate',max(c.per_plate_rate) filter(where c.category='vendor')),
    'staff',jsonb_build_object('manual_expected',max(c.manual_expected_count) filter(where c.category='staff'),'actual',max(c.actual_attendance) filter(where c.category='staff'),'rate',max(c.per_plate_rate) filter(where c.category='staff'))
  ) into v_categories
  from public.catering_service_counts c where c.wedding_id=p_wedding_id and c.meal_service_id=p_service_id group by c.wedding_id;
  if exists(select 1 from public.catering_service_counts where wedding_id=p_wedding_id and meal_service_id=p_service_id and category in ('vendor','staff') and manual_expected_count is null) then raise exception 'Enter vendor and staff expected counts before capturing a final count; unknown is not zero.'; end if;
  v_expected:=coalesce((v_categories->'adult'->>'manual_expected')::integer,v_confirmed,0)
    +coalesce((v_categories->'child'->>'manual_expected')::integer,0)
    +coalesce((v_categories->'vendor'->>'manual_expected')::integer,0)
    +coalesce((v_categories->'staff'->>'manual_expected')::integer,0);
  v_total:=greatest(v_expected,coalesce(v_service.approved_guarantee,v_expected))+v_service.agreed_buffer;
  insert into public.catering_count_snapshots(wedding_id,meal_service_id,captured_by_user_id,final_count_deadline,invited_count,confirmed_count,manual_expected_count,approved_guarantee,agreed_buffer,final_catering_count,currency,category_totals,booking_id)
  values(p_wedding_id,p_service_id,v_user,v_service.final_count_deadline,v_invited,v_confirmed,v_manual,v_service.approved_guarantee,v_service.agreed_buffer,v_total,v_service.currency,coalesce(v_categories,'{}'::jsonb),v_service.booking_id) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.get_catering_family_counts(uuid,uuid) from public,anon;
grant execute on function public.get_catering_family_counts(uuid,uuid) to authenticated;
