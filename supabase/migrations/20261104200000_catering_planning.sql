-- Per-function catering services, menu versions, tastings and count snapshots.
-- No guest, booking or supplier records are copied into this module.

create type public.catering_menu_status as enum ('draft','approved','superseded');
create type public.catering_meal_category as enum ('adult','child','vendor','staff');

create table public.catering_meal_services (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null, function_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 160), service_time time, currency text not null check(currency ~ '^[A-Z]{3}$'),
  caterer_supplier_id uuid, booking_id uuid,
  final_count_deadline timestamptz, approved_guarantee integer check (approved_guarantee is null or approved_guarantee >= 0),
  agreed_buffer integer not null default 0 check (agreed_buffer >= 0), guarantee_approved_at timestamptz,
  guarantee_approved_by uuid, created_by_user_id uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(wedding_id,id),
  foreign key(wedding_id,function_id) references public.functions(wedding_id,id) on delete restrict,
  foreign key(wedding_id,caterer_supplier_id) references public.suppliers(wedding_id,id) on delete restrict,
  foreign key(wedding_id,booking_id) references public.bookings(wedding_id,id) on delete restrict,
  foreign key(wedding_id,created_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict,
  foreign key(wedding_id,guarantee_approved_by) references public.wedding_members(wedding_id,user_id) on delete restrict,
  check ((approved_guarantee is null and guarantee_approved_at is null and guarantee_approved_by is null) or (approved_guarantee is not null and guarantee_approved_at is not null and guarantee_approved_by is not null))
);
create index catering_services_function_idx on public.catering_meal_services(wedding_id,function_id,name);

create table public.catering_service_counts (
  wedding_id uuid not null, meal_service_id uuid not null, category public.catering_meal_category not null,
  manual_expected_count integer check (manual_expected_count is null or manual_expected_count >= 0),
  actual_attendance integer check (actual_attendance is null or actual_attendance >= 0),
  per_plate_rate numeric(14,2) check (per_plate_rate is null or per_plate_rate >= 0), updated_at timestamptz not null default now(),
  primary key(wedding_id,meal_service_id,category),
  foreign key(wedding_id,meal_service_id) references public.catering_meal_services(wedding_id,id) on delete cascade
);
create function private.guard_catering_currency_change() returns trigger language plpgsql set search_path='' as $$
begin
  if new.currency<>old.currency and exists(select 1 from public.catering_service_counts where wedding_id=old.wedding_id and meal_service_id=old.id and per_plate_rate is not null) then
    raise exception 'Clear existing per-plate rates before changing the meal service currency.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger catering_currency_change_guard before update of currency on public.catering_meal_services for each row execute function private.guard_catering_currency_change();

create table public.catering_guest_assignments (
  wedding_id uuid not null, meal_service_id uuid not null, guest_id uuid not null, category public.catering_meal_category not null check(category in ('adult','child')),
  created_at timestamptz not null default now(), primary key(wedding_id,meal_service_id,guest_id),
  foreign key(wedding_id,meal_service_id) references public.catering_meal_services(wedding_id,id) on delete cascade,
  foreign key(wedding_id,guest_id) references public.guests(wedding_id,id) on delete cascade
);
create function private.validate_catering_guest_assignment() returns trigger language plpgsql set search_path='' as $$
declare v_function uuid;
begin
  select function_id into v_function from public.catering_meal_services where wedding_id=new.wedding_id and id=new.meal_service_id;
  if not found or not exists(select 1 from public.guest_invitations where wedding_id=new.wedding_id and function_id=v_function and guest_id=new.guest_id and status='invited') then
    raise exception 'Guest must have an active invitation to the meal service function.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger catering_assignment_invitation_guard before insert or update on public.catering_guest_assignments for each row execute function private.validate_catering_guest_assignment();

create table public.catering_menus (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null, meal_service_id uuid not null,
  version_number integer not null check(version_number>0), title text not null check(char_length(trim(title)) between 1 and 180),
  notes text not null default '', status public.catering_menu_status not null default 'draft',
  created_by_user_id uuid not null, created_at timestamptz not null default now(), approved_by_user_id uuid, approved_at timestamptz,
  unique(wedding_id,meal_service_id,version_number), unique(wedding_id,id),
  foreign key(wedding_id,meal_service_id) references public.catering_meal_services(wedding_id,id) on delete cascade,
  foreign key(wedding_id,created_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict,
  foreign key(wedding_id,approved_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict,
  check((status='approved' and approved_by_user_id is not null and approved_at is not null) or (status<>'approved' and approved_by_user_id is null and approved_at is null))
);
create unique index catering_one_approved_menu on public.catering_menus(wedding_id,meal_service_id) where status='approved';
create table public.catering_menu_items (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null, menu_id uuid not null,
  name text not null check(char_length(trim(name)) between 1 and 180), details text not null default '', dietary_labels text[] not null default '{}',
  allergen_summary text not null default '', position integer not null default 0 check(position>=0),
  foreign key(wedding_id,menu_id) references public.catering_menus(wedding_id,id) on delete cascade
);

create function public.save_catering_draft_menu(p_wedding_id uuid,p_service_id uuid,p_title text,p_notes text,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_version integer; v_menu uuid; v_item jsonb;
begin
  if v_user is null or not private.has_module_access(p_wedding_id,'logistics','edit') then raise exception 'Logistics edit permission required.'; end if;
  if not exists(select 1 from public.catering_meal_services where wedding_id=p_wedding_id and id=p_service_id) then raise exception 'Catering service not found.'; end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 180 or char_length(coalesce(p_notes,''))>4000 or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 then raise exception 'Invalid draft menu.'; end if;
  select coalesce(max(version_number),0)+1 into v_version from public.catering_menus where wedding_id=p_wedding_id and meal_service_id=p_service_id;
  insert into public.catering_menus(wedding_id,meal_service_id,version_number,title,notes,created_by_user_id) values(p_wedding_id,p_service_id,v_version,trim(p_title),coalesce(p_notes,''),v_user) returning id into v_menu;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.catering_menu_items(wedding_id,menu_id,name,details,dietary_labels,allergen_summary,position)
    values(p_wedding_id,v_menu,v_item->>'name',coalesce(v_item->>'details',''),array(select jsonb_array_elements_text(coalesce(v_item->'dietary_labels','[]'::jsonb))),coalesce(v_item->>'allergen_summary',''),coalesce((v_item->>'position')::integer,0));
  end loop;
  return v_menu;
end $$;

create table public.catering_tastings (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null, meal_service_id uuid not null,
  appointment_at timestamptz, status text not null default 'planned' check(status in ('planned','completed','cancelled')),
  feedback text not null default '', created_by_user_id uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(wedding_id,meal_service_id) references public.catering_meal_services(wedding_id,id) on delete cascade,
  foreign key(wedding_id,created_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict
);

create table public.catering_count_snapshots (
  id uuid primary key default gen_random_uuid(), wedding_id uuid not null, meal_service_id uuid not null,
  captured_at timestamptz not null default now(), captured_by_user_id uuid not null, final_count_deadline timestamptz,
  invited_count integer not null, confirmed_count integer not null, manual_expected_count integer,
  approved_guarantee integer, agreed_buffer integer not null, final_catering_count integer not null, currency text not null check(currency ~ '^[A-Z]{3}$'),
  category_totals jsonb not null, booking_id uuid,
  foreign key(wedding_id,meal_service_id) references public.catering_meal_services(wedding_id,id) on delete restrict,
  foreign key(wedding_id,captured_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict,
  foreign key(wedding_id,booking_id) references public.bookings(wedding_id,id) on delete restrict
);
create index catering_snapshots_service_idx on public.catering_count_snapshots(wedding_id,meal_service_id,captured_at desc);

create function private.catering_touch() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create trigger catering_services_touch before update on public.catering_meal_services for each row execute function private.catering_touch();
create trigger catering_counts_touch before update on public.catering_service_counts for each row execute function private.catering_touch();
create trigger catering_tastings_touch before update on public.catering_tastings for each row execute function private.catering_touch();

create function public.approve_catering_guarantee(p_wedding_id uuid,p_service_id uuid,p_count integer,p_buffer integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid());
begin
  if v_user is null or not private.has_module_access(p_wedding_id,'logistics','edit') then raise exception 'Logistics edit permission required.'; end if;
  if p_count<0 or p_buffer<0 then raise exception 'Guarantee and buffer must be zero or greater.'; end if;
  update public.catering_meal_services set approved_guarantee=coalesce(p_count,approved_guarantee),agreed_buffer=p_buffer,
    guarantee_approved_at=case when p_count is null then guarantee_approved_at else now() end,
    guarantee_approved_by=case when p_count is null then guarantee_approved_by else v_user end
    where wedding_id=p_wedding_id and id=p_service_id;
  if not found then raise exception 'Catering service not found.'; end if;
end $$;

create function public.approve_catering_menu(p_wedding_id uuid,p_menu_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_service uuid;
begin
  if v_user is null or not private.has_module_access(p_wedding_id,'logistics','edit') then raise exception 'Logistics edit permission required.'; end if;
  select meal_service_id into v_service from public.catering_menus where wedding_id=p_wedding_id and id=p_menu_id and status='draft' for update;
  if not found then raise exception 'Draft menu not found.'; end if;
  update public.catering_menus set status='superseded',approved_by_user_id=null,approved_at=null where wedding_id=p_wedding_id and meal_service_id=v_service and status='approved';
  update public.catering_menus set status='approved',approved_by_user_id=v_user,approved_at=now() where wedding_id=p_wedding_id and id=p_menu_id and status='draft';
end $$;

create function public.save_catering_category_count(p_wedding_id uuid,p_service_id uuid,p_category text,p_values jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_guarantee integer; v_buffer integer;
begin
  if v_user is null or not private.has_module_access(p_wedding_id,'logistics','edit') then raise exception 'Logistics edit permission required.'; end if;
  if p_category not in ('adult','child','vendor','staff') or jsonb_typeof(p_values)<>'object' then raise exception 'Invalid category count.'; end if;
  if not exists(select 1 from public.catering_meal_services where wedding_id=p_wedding_id and id=p_service_id) then raise exception 'Catering service not found.'; end if;
  insert into public.catering_service_counts(wedding_id,meal_service_id,category,manual_expected_count,actual_attendance,per_plate_rate)
  values(p_wedding_id,p_service_id,p_category,nullif(p_values->>'manual_expected_count','')::integer,nullif(p_values->>'actual_attendance','')::integer,nullif(p_values->>'per_plate_rate','')::numeric)
  on conflict(wedding_id,meal_service_id,category) do update set manual_expected_count=excluded.manual_expected_count,actual_attendance=excluded.actual_attendance,per_plate_rate=excluded.per_plate_rate,updated_at=now();
  if p_category='adult' then
    v_guarantee:=nullif(p_values->>'approved_guarantee','')::integer; v_buffer:=coalesce(nullif(p_values->>'agreed_buffer','')::integer,0);
    if v_buffer<0 or v_guarantee<0 then raise exception 'Guarantee and buffer must be zero or greater.'; end if;
    update public.catering_meal_services set approved_guarantee=coalesce(v_guarantee,approved_guarantee),agreed_buffer=v_buffer,
      guarantee_approved_at=case when v_guarantee is null then guarantee_approved_at else now() end,
      guarantee_approved_by=case when v_guarantee is null then guarantee_approved_by else v_user end
    where wedding_id=p_wedding_id and id=p_service_id;
  end if;
end $$;

create function public.capture_catering_count_snapshot(p_wedding_id uuid,p_service_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_service public.catering_meal_services; v_id uuid;
  v_invited integer; v_confirmed integer; v_manual integer; v_expected integer; v_total integer; v_categories jsonb;
begin
  if v_user is null or not private.has_module_access(p_wedding_id,'logistics','edit') then raise exception 'Logistics edit permission required.'; end if;
  select * into v_service from public.catering_meal_services where wedding_id=p_wedding_id and id=p_service_id for update;
  if not found then raise exception 'Catering service not found.'; end if;
  select count(distinct i.guest_id)::integer,
         count(distinct i.guest_id) filter(where r.response='yes')::integer
    into v_invited,v_confirmed
    from public.guest_invitations i join public.guests g on g.wedding_id=i.wedding_id and g.id=i.guest_id
    left join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id
    where i.wedding_id=p_wedding_id and i.function_id=v_service.function_id and i.status='invited';
  select sum(manual_expected_count)::integer into v_manual from public.catering_service_counts where wedding_id=p_wedding_id and meal_service_id=p_service_id;
  select jsonb_build_object(
    'adult',jsonb_build_object('assigned',count(distinct a.guest_id) filter(where a.category='adult'),'confirmed',count(distinct a.guest_id) filter(where a.category='adult' and r.response='yes'),'manual_expected',max(c.manual_expected_count) filter(where c.category='adult'),'actual',max(c.actual_attendance) filter(where c.category='adult'),'rate',max(c.per_plate_rate) filter(where c.category='adult')),
    'child',jsonb_build_object('assigned',count(distinct a.guest_id) filter(where a.category='child'),'confirmed',count(distinct a.guest_id) filter(where a.category='child' and r.response='yes'),'manual_expected',max(c.manual_expected_count) filter(where c.category='child'),'actual',max(c.actual_attendance) filter(where c.category='child'),'rate',max(c.per_plate_rate) filter(where c.category='child')),
    'vendor',jsonb_build_object('manual_expected',max(c.manual_expected_count) filter(where c.category='vendor'),'actual',max(c.actual_attendance) filter(where c.category='vendor'),'rate',max(c.per_plate_rate) filter(where c.category='vendor')),
    'staff',jsonb_build_object('manual_expected',max(c.manual_expected_count) filter(where c.category='staff'),'actual',max(c.actual_attendance) filter(where c.category='staff'),'rate',max(c.per_plate_rate) filter(where c.category='staff'))
  ) into v_categories
  from public.catering_service_counts c
  left join public.catering_guest_assignments a on a.wedding_id=c.wedding_id and a.meal_service_id=c.meal_service_id and a.category=c.category
  left join public.guest_invitations i on i.wedding_id=a.wedding_id and i.guest_id=a.guest_id and i.function_id=v_service.function_id and i.status='invited'
  left join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id
  where c.wedding_id=p_wedding_id and c.meal_service_id=p_service_id group by c.wedding_id;
  if exists(select 1 from public.catering_service_counts where wedding_id=p_wedding_id and meal_service_id=p_service_id and category in ('vendor','staff') and manual_expected_count is null) then raise exception 'Enter vendor and staff expected counts before capturing a final count; unknown is not zero.'; end if;
  if exists(select 1 from public.guest_invitations i join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id left join public.catering_guest_assignments a on a.wedding_id=i.wedding_id and a.meal_service_id=p_service_id and a.guest_id=i.guest_id where i.wedding_id=p_wedding_id and i.function_id=v_service.function_id and i.status='invited' and r.response='yes' and a.guest_id is null) then raise exception 'Assign every confirmed guest to an adult or child meal category before capturing a final count.'; end if;
  v_expected:=coalesce((v_categories->'adult'->>'manual_expected')::integer,(v_categories->'adult'->>'confirmed')::integer,0)
    +coalesce((v_categories->'child'->>'manual_expected')::integer,(v_categories->'child'->>'confirmed')::integer,0)
    +coalesce((v_categories->'vendor'->>'manual_expected')::integer,0)
    +coalesce((v_categories->'staff'->>'manual_expected')::integer,0);
  v_total:=greatest(v_expected,coalesce(v_service.approved_guarantee,v_expected))+v_service.agreed_buffer;
  insert into public.catering_count_snapshots(wedding_id,meal_service_id,captured_by_user_id,final_count_deadline,invited_count,confirmed_count,manual_expected_count,approved_guarantee,agreed_buffer,final_catering_count,currency,category_totals,booking_id)
  values(p_wedding_id,p_service_id,v_user,v_service.final_count_deadline,v_invited,v_confirmed,v_manual,v_service.approved_guarantee,v_service.agreed_buffer,v_total,v_service.currency,coalesce(v_categories,'{}'::jsonb),v_service.booking_id) returning id into v_id;
  return v_id;
end $$;

create function public.get_catering_dietary_summary(p_wedding_id uuid,p_service_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_service public.catering_meal_services; v_result jsonb;
begin
  if not private.has_module_access(p_wedding_id,'logistics','read') then raise exception 'Logistics read permission required.'; end if;
  select * into v_service from public.catering_meal_services where wedding_id=p_wedding_id and id=p_service_id;
  if not found then raise exception 'Catering service not found.'; end if;
  -- Keep only aggregate meal preferences; do not return guest identities or allergies.
  select jsonb_build_object('preferences',coalesce((select jsonb_agg(jsonb_build_object('preference',meal_preference,'count',n) order by meal_preference) from (select trim(g.meal_preference) meal_preference,count(distinct g.id)::integer n from public.guest_invitations i join public.guests g on g.wedding_id=i.wedding_id and g.id=i.guest_id join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id where i.wedding_id=p_wedding_id and i.function_id=v_service.function_id and i.status='invited' and r.response='yes' and trim(g.meal_preference)<>'' group by trim(g.meal_preference)) s),'[]'::jsonb),'assistance_count',(select count(distinct g.id)::integer from public.guest_invitations i join public.guests g on g.wedding_id=i.wedding_id and g.id=i.guest_id join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id where i.wedding_id=p_wedding_id and i.function_id=v_service.function_id and i.status='invited' and r.response='yes' and trim(g.assistance_needs)<>'')) into v_result;
  return v_result;
end $$;

create function public.get_catering_allergy_details(p_wedding_id uuid,p_service_id uuid)
returns table(guest_name text,allergies text) language plpgsql security definer set search_path='' as $$
declare v_service public.catering_meal_services; v_role text;
begin
  if not private.has_module_access(p_wedding_id,'logistics','read') then raise exception 'Logistics read permission required.'; end if;
  select m.role into v_role from public.wedding_members m where m.wedding_id=p_wedding_id and m.user_id=auth.uid() and m.status='active';
  if v_role not in ('owner','co_owner') and not private.has_module_access(p_wedding_id,'guests','edit') then raise exception 'Guest edit permission required for individual allergy details.'; end if;
  select * into v_service from public.catering_meal_services where wedding_id=p_wedding_id and id=p_service_id;
  if not found then raise exception 'Catering service not found.'; end if;
  return query select g.full_name,g.allergies from public.guest_invitations i join public.guests g on g.wedding_id=i.wedding_id and g.id=i.guest_id join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id where i.wedding_id=p_wedding_id and i.function_id=v_service.function_id and i.status='invited' and r.response='yes' and trim(g.allergies)<>'';
end $$;

create function public.get_catering_invited_guests(p_wedding_id uuid,p_service_id uuid)
returns table(guest_id uuid,full_name text,household_id uuid,meal_preference text,response text) language plpgsql security definer set search_path='' as $$
declare v_function uuid;
begin
  if not private.has_module_access(p_wedding_id,'logistics','read') then raise exception 'Logistics read permission required.'; end if;
  select function_id into v_function from public.catering_meal_services where wedding_id=p_wedding_id and id=p_service_id;
  if not found then raise exception 'Catering service not found.'; end if;
  return query select g.id,g.full_name,g.household_id,g.meal_preference,r.response
    from public.guest_invitations i join public.guests g on g.wedding_id=i.wedding_id and g.id=i.guest_id
    left join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id
    where i.wedding_id=p_wedding_id and i.function_id=v_function and i.status='invited';
end $$;

create function public.get_catering_references(p_wedding_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not private.has_module_access(p_wedding_id,'logistics','read') then raise exception 'Logistics read permission required.'; end if;
  select jsonb_build_object(
    'functions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'function_date',function_date,'start_time',start_time,'end_time',end_time,'status',status) order by function_date) from public.functions where wedding_id=p_wedding_id and archived_at is null),'[]'::jsonb),
    'caterers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'category',category) order by name) from public.suppliers where wedding_id=p_wedding_id and status in ('selected','booked') and category ilike '%cater%'),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

do $$ declare t text; begin
  foreach t in array array['catering_meal_services','catering_service_counts','catering_guest_assignments','catering_menus','catering_menu_items','catering_tastings','catering_count_snapshots'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to authenticated using (private.has_module_access(wedding_id,''logistics'',''read''))',t||'_read',t);
    if t <> 'catering_count_snapshots' then
      execute format('create policy %I on public.%I for insert to authenticated with check (private.has_module_access(wedding_id,''logistics'',''edit''))',t||'_insert',t);
    end if;
    if t not in ('catering_count_snapshots','catering_menus','catering_menu_items') then
      execute format('create policy %I on public.%I for update to authenticated using (private.has_module_access(wedding_id,''logistics'',''edit'')) with check (private.has_module_access(wedding_id,''logistics'',''edit''))',t||'_update',t);
    end if;
    if t not in ('catering_count_snapshots','catering_menus') then
      execute format('create policy %I on public.%I for delete to authenticated using (private.has_module_access(wedding_id,''logistics'',''edit''))',t||'_delete',t);
    end if;
  end loop;
end $$;
drop policy catering_menus_insert on public.catering_menus;
create policy catering_menus_insert on public.catering_menus for insert to authenticated
  with check (private.has_module_access(wedding_id,'logistics','edit') and status='draft' and created_by_user_id=auth.uid());
drop policy catering_menu_items_insert on public.catering_menu_items;
create policy catering_menu_items_insert on public.catering_menu_items for insert to authenticated
  with check (private.has_module_access(wedding_id,'logistics','edit') and exists(select 1 from public.catering_menus m where m.wedding_id=catering_menu_items.wedding_id and m.id=catering_menu_items.menu_id and m.status='draft'));
drop policy catering_meal_services_insert on public.catering_meal_services;
create policy catering_meal_services_insert on public.catering_meal_services for insert to authenticated
  with check (private.has_module_access(wedding_id,'logistics','edit') and created_by_user_id=auth.uid());
grant select,insert,update,delete on public.catering_meal_services,public.catering_service_counts,public.catering_guest_assignments,public.catering_tastings to authenticated;
grant select,insert,update on public.catering_menus,public.catering_menu_items to authenticated;
grant select on public.catering_count_snapshots to authenticated;
revoke all on function public.approve_catering_guarantee(uuid,uuid,integer,integer),public.approve_catering_menu(uuid,uuid),public.save_catering_category_count(uuid,uuid,text,jsonb),public.save_catering_draft_menu(uuid,uuid,text,text,jsonb),public.capture_catering_count_snapshot(uuid,uuid),public.get_catering_dietary_summary(uuid,uuid),public.get_catering_allergy_details(uuid,uuid),public.get_catering_invited_guests(uuid,uuid),public.get_catering_references(uuid) from public,anon;
grant execute on function public.approve_catering_guarantee(uuid,uuid,integer,integer),public.approve_catering_menu(uuid,uuid),public.save_catering_category_count(uuid,uuid,text,jsonb),public.save_catering_draft_menu(uuid,uuid,text,text,jsonb),public.capture_catering_count_snapshot(uuid,uuid),public.get_catering_dietary_summary(uuid,uuid),public.get_catering_allergy_details(uuid,uuid),public.get_catering_invited_guests(uuid,uuid),public.get_catering_references(uuid) to authenticated;
