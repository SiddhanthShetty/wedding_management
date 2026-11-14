-- Family invitations, as on the couple's invitation site: one link per family that never changes,
-- one reply per family (coming or not, how many, which functions, food, a message).
--
-- Data impact: additive.
-- * guest_households gains invite_code (the family's link code, readable by members who can see
--   the guest list), invite_max_guests and invite_removed_at. Existing families have no code until
--   one is made from the Guest desk.
-- * New tables family_function_invites, family_replies and family_reply_history.
-- * Backfill: each existing family is invited to the active functions any of its people are
--   currently invited to (read from guest_invitations). Nothing existing is changed or removed.
-- * Per-person invitations, replies, links and their history stay in place, unused by the new
--   pages, until a later migration removes them with approval.

alter table public.guest_households
  add column invite_code text check (invite_code ~ '^[A-Za-z0-9]{12,32}$'),
  add column invite_max_guests integer check (invite_max_guests between 1 and 20),
  add column invite_removed_at timestamptz;
create unique index guest_households_invite_code_key on public.guest_households(invite_code) where invite_code is not null;

create table public.family_function_invites (
  wedding_id uuid not null,
  household_id uuid not null,
  function_id uuid not null,
  invited_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (wedding_id,household_id,function_id),
  foreign key (wedding_id,household_id) references public.guest_households(wedding_id,id) on delete cascade,
  foreign key (wedding_id,function_id) references public.functions(wedding_id,id) on delete cascade,
  foreign key (wedding_id,invited_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict
);
create index family_function_invites_function_idx on public.family_function_invites(wedding_id,function_id);

create table public.family_replies (
  wedding_id uuid not null,
  household_id uuid not null,
  attending boolean not null,
  guest_count integer not null check (guest_count between 0 and 20),
  function_ids uuid[] not null default '{}',
  dietary text not null default 'none' check (dietary in ('none','vegetarian','non-vegetarian','jain','vegan','other')),
  dietary_notes text not null default '' check (char_length(dietary_notes) <= 300),
  message text not null default '' check (char_length(message) <= 1000),
  reply_name text not null default '' check (char_length(reply_name) <= 120),
  reply_phone text not null default '' check (char_length(reply_phone) <= 20),
  source text not null check (source in ('invite_link','planner')),
  recorded_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (wedding_id,household_id),
  foreign key (wedding_id,household_id) references public.guest_households(wedding_id,id) on delete cascade,
  foreign key (wedding_id,recorded_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict,
  check ((attending and guest_count >= 1 and cardinality(function_ids) >= 1) or (not attending and guest_count = 0 and cardinality(function_ids) = 0))
);

create table public.family_reply_history (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  household_id uuid not null,
  attending boolean not null,
  guest_count integer not null,
  function_ids uuid[] not null,
  dietary text not null,
  dietary_notes text not null,
  message text not null,
  reply_name text not null,
  reply_phone text not null,
  source text not null,
  recorded_by_user_id uuid,
  created_at timestamptz not null default now(),
  foreign key (wedding_id,household_id) references public.guest_households(wedding_id,id) on delete cascade
);
create index family_reply_history_household_idx on public.family_reply_history(wedding_id,household_id,created_at desc);

do $$ declare t text; begin
  foreach t in array array['family_function_invites','family_replies','family_reply_history'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon,authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.has_module_access(wedding_id,''guests'',''read'')))',t||'_select',t);
  end loop;
end $$;

-- Backfill: families are invited to the active functions their people are invited to today.
insert into public.family_function_invites(wedding_id,household_id,function_id,invited_by_user_id)
select distinct on (g.wedding_id,g.household_id,i.function_id) g.wedding_id,g.household_id,i.function_id,i.invited_by_user_id
from public.guest_invitations i
join public.guests g on g.wedding_id=i.wedding_id and g.id=i.guest_id
join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id
where i.status='invited' and g.household_id is not null and f.archived_at is null and f.status<>'cancelled'
order by g.wedding_id,g.household_id,i.function_id,i.created_at
on conflict do nothing;

create function private.require_guest_edit(p_wedding_id uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid());
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then
    raise exception 'Guest edit permission required.' using errcode='42501';
  end if;
  return v_user;
end $$;
revoke all on function private.require_guest_edit(uuid) from public,anon,authenticated;

-- The functions a family may be invited to: active ones in this wedding.
create function private.check_family_functions(p_wedding_id uuid,p_function_ids uuid[]) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if coalesce(cardinality(p_function_ids),0) not between 1 and 50 or cardinality(p_function_ids)<>(select count(distinct x) from unnest(p_function_ids) x) then
    raise exception 'Choose at least one function.' using errcode='22023';
  end if;
  if exists(select 1 from unnest(p_function_ids) x where not exists(select 1 from public.functions f where f.wedding_id=p_wedding_id and f.id=x and f.archived_at is null and f.status<>'cancelled')) then
    raise exception 'Choose functions that are still on.' using errcode='22023';
  end if;
end $$;
revoke all on function private.check_family_functions(uuid,uuid[]) from public,anon,authenticated;

/*
 * Adds pasted families in one transaction: the family (with its link code and guest limit), one
 * contact person named after the family, and the functions it is invited to.
 * p_families: [{ "name": text, "phone": text, "max_guests": 1..20 | null, "code": text }]
 * Returns { status: "invalid", errors: [{ index, code: "exists"|"repeat" }] } without writing
 * anything when a name is already used, else { status: "saved", families: [...] }.
 */
create function public.create_family_invites_bulk(p_wedding_id uuid,p_families jsonb,p_function_ids uuid[],p_family_side text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=private.require_guest_edit(p_wedding_id); v_item jsonb; v_index integer:=0; v_errors jsonb:='[]'::jsonb; v_seen text[]:='{}';
  v_key text; v_name text; v_phone text; v_max integer; v_household uuid; v_guest uuid; v_out jsonb:='[]'::jsonb;
begin
  if p_families is null or jsonb_typeof(p_families)<>'array' or jsonb_array_length(p_families) not between 1 and 100 then raise exception 'Add between 1 and 100 families at a time.' using errcode='22023'; end if;
  perform private.check_family_functions(p_wedding_id,p_function_ids);
  if p_family_side not in ('couple_one','couple_two','shared','unknown') then raise exception 'Invalid household family side.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('guest-families:'||p_wedding_id::text,0));
  for v_item in select value from jsonb_array_elements(p_families) loop
    if jsonb_typeof(v_item)<>'object' or jsonb_typeof(v_item->'name')<>'string' or jsonb_typeof(v_item->'phone')<>'string' or jsonb_typeof(v_item->'code')<>'string'
      or jsonb_typeof(v_item->'max_guests') not in ('number','null') then raise exception 'Invalid family row.' using errcode='22023'; end if;
    v_name:=pg_catalog.regexp_replace(pg_catalog.btrim(v_item->>'name'),'\s+',' ','g');
    if char_length(v_name) not between 1 and 120 or char_length(v_item->>'phone')>20 or (v_item->>'code') !~ '^[A-Za-z0-9]{12,32}$' then raise exception 'Invalid family row.' using errcode='22023'; end if;
    if jsonb_typeof(v_item->'max_guests')='number' and ((v_item->>'max_guests')::numeric not between 1 and 20 or (v_item->>'max_guests')::numeric<>trunc((v_item->>'max_guests')::numeric)) then raise exception 'Invalid family row.' using errcode='22023'; end if;
    v_key:=private.family_name_key(v_name);
    if v_key=any(v_seen) then v_errors:=v_errors||jsonb_build_object('index',v_index,'code','repeat');
    elsif exists(select 1 from public.guest_households h where h.wedding_id=p_wedding_id and private.family_name_key(h.name)=v_key) then v_errors:=v_errors||jsonb_build_object('index',v_index,'code','exists');
    end if;
    v_seen:=v_seen||v_key; v_index:=v_index+1;
  end loop;
  if (select count(distinct value->>'code') from jsonb_array_elements(p_families))<>jsonb_array_length(p_families) then raise exception 'Invalid family row.' using errcode='22023'; end if;
  if jsonb_array_length(v_errors)>0 then return jsonb_build_object('status','invalid','errors',v_errors); end if;

  v_index:=0;
  for v_item in select value from jsonb_array_elements(p_families) loop
    v_name:=pg_catalog.regexp_replace(pg_catalog.btrim(v_item->>'name'),'\s+',' ','g');
    v_phone:=pg_catalog.btrim(v_item->>'phone');
    v_max:=case when jsonb_typeof(v_item->'max_guests')='number' then (v_item->>'max_guests')::integer end;
    insert into public.guest_households(wedding_id,name,contact_name,contact_phone,family_side,invite_code,invite_max_guests,created_by_user_id)
    values(p_wedding_id,v_name,v_name,v_phone,p_family_side,v_item->>'code',v_max,v_user) returning id into v_household;
    insert into public.guests(wedding_id,household_id,full_name,phone,family_side,created_by_user_id)
    values(p_wedding_id,v_household,v_name,v_phone,p_family_side,v_user) returning id into v_guest;
    insert into public.family_function_invites(wedding_id,household_id,function_id,invited_by_user_id)
    select p_wedding_id,v_household,x,v_user from unnest(p_function_ids) x;
    v_out:=v_out||jsonb_build_object('index',v_index,'household_id',v_household,'contact_guest_id',v_guest);
    v_index:=v_index+1;
  end loop;
  return jsonb_build_object('status','saved','families',v_out);
end $$;

/* Which functions a family is invited to, and how many guests it may bring (null: no limit). */
create function public.update_family_invite(p_wedding_id uuid,p_household_id uuid,p_max_guests integer,p_function_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=private.require_guest_edit(p_wedding_id);
begin
  perform 1 from public.guest_households where wedding_id=p_wedding_id and id=p_household_id for update;
  if not found then raise exception 'Household not found in this wedding.' using errcode='23503'; end if;
  if p_max_guests is not null and p_max_guests not between 1 and 20 then raise exception 'Guests should be 1 to 20.' using errcode='22023'; end if;
  perform private.check_family_functions(p_wedding_id,p_function_ids);
  update public.guest_households set invite_max_guests=p_max_guests where wedding_id=p_wedding_id and id=p_household_id;
  delete from public.family_function_invites where wedding_id=p_wedding_id and household_id=p_household_id and not (function_id=any(p_function_ids));
  insert into public.family_function_invites(wedding_id,household_id,function_id,invited_by_user_id)
  select p_wedding_id,p_household_id,x,v_user from unnest(p_function_ids) x on conflict do nothing;
end $$;

/* Gives a family its link code. With p_replace, a new code replaces the old one (the old link stops working). */
create function public.set_family_invite_code(p_wedding_id uuid,p_household_id uuid,p_code text,p_replace boolean)
returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid:=private.require_guest_edit(p_wedding_id); v_code text;
begin
  if p_code !~ '^[A-Za-z0-9]{12,32}$' then raise exception 'Invalid link code.' using errcode='22023'; end if;
  select invite_code into v_code from public.guest_households where wedding_id=p_wedding_id and id=p_household_id for update;
  if not found then raise exception 'Household not found in this wedding.' using errcode='23503'; end if;
  if v_code is not null and not coalesce(p_replace,false) then return v_code; end if;
  update public.guest_households set invite_code=p_code where wedding_id=p_wedding_id and id=p_household_id;
  return p_code;
end $$;

/* "Remove from list" (true) and "Put back" (false). The family's link stops working while removed; its reply is kept. */
create function public.set_family_removed(p_wedding_id uuid,p_household_id uuid,p_removed boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=private.require_guest_edit(p_wedding_id);
begin
  update public.guest_households set invite_removed_at=case when p_removed then coalesce(invite_removed_at,now()) end
  where wedding_id=p_wedding_id and id=p_household_id;
  if not found then raise exception 'Household not found in this wedding.' using errcode='23503'; end if;
end $$;

/* Shared checks and saving for a family reply, from the family's link or a planner. */
create function private.save_family_reply(p_wedding_id uuid,p_household_id uuid,p_max integer,p_attending boolean,p_guest_count integer,p_function_ids uuid[],p_dietary text,p_dietary_notes text,p_message text,p_name text,p_phone text,p_source text,p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_functions uuid[]:=coalesce(p_function_ids,'{}'); v_count integer:=coalesce(p_guest_count,0); v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  if p_attending is null then return jsonb_build_object('status','invalid','field','attending'); end if;
  if not p_attending then v_functions:='{}'; v_count:=0; end if;
  if p_attending and (v_count<1 or v_count>coalesce(p_max,20)) then return jsonb_build_object('status','invalid','field','guestCount'); end if;
  if p_attending and (cardinality(v_functions)<1 or cardinality(v_functions)<>(select count(distinct x) from unnest(v_functions) x)
    or exists(select 1 from unnest(v_functions) x where not exists(select 1 from public.family_function_invites i join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id
      where i.wedding_id=p_wedding_id and i.household_id=p_household_id and i.function_id=x and f.archived_at is null and f.status<>'cancelled'))) then
    return jsonb_build_object('status','invalid','field','events');
  end if;
  if coalesce(p_dietary,'none') not in ('none','vegetarian','non-vegetarian','jain','vegan','other') or char_length(coalesce(p_dietary_notes,''))>300 or char_length(coalesce(p_message,''))>1000
    or char_length(coalesce(p_name,''))>120 or char_length(coalesce(p_phone,''))>20 then return jsonb_build_object('status','invalid'); end if;
  insert into public.family_replies(wedding_id,household_id,attending,guest_count,function_ids,dietary,dietary_notes,message,reply_name,reply_phone,source,recorded_by_user_id,updated_at)
  values(p_wedding_id,p_household_id,p_attending,v_count,v_functions,case when p_attending then coalesce(p_dietary,'none') else 'none' end,case when p_attending then coalesce(p_dietary_notes,'') else '' end,coalesce(p_message,''),pg_catalog.btrim(coalesce(p_name,'')),pg_catalog.btrim(coalesce(p_phone,'')),p_source,p_user,v_now)
  on conflict (wedding_id,household_id) do update set attending=excluded.attending,guest_count=excluded.guest_count,function_ids=excluded.function_ids,dietary=excluded.dietary,dietary_notes=excluded.dietary_notes,
    message=excluded.message,reply_name=excluded.reply_name,reply_phone=excluded.reply_phone,source=excluded.source,recorded_by_user_id=excluded.recorded_by_user_id,updated_at=v_now;
  insert into public.family_reply_history(wedding_id,household_id,attending,guest_count,function_ids,dietary,dietary_notes,message,reply_name,reply_phone,source,recorded_by_user_id)
  select wedding_id,household_id,attending,guest_count,function_ids,dietary,dietary_notes,message,reply_name,reply_phone,source,recorded_by_user_id from public.family_replies where wedding_id=p_wedding_id and household_id=p_household_id;
  return jsonb_build_object('status','saved');
end $$;
revoke all on function private.save_family_reply(uuid,uuid,integer,boolean,integer,uuid[],text,text,text,text,text,text,uuid) from public,anon,authenticated;

/* A planner records a reply they got by phone or in person. */
create function public.record_family_reply(p_wedding_id uuid,p_household_id uuid,p_attending boolean,p_guest_count integer,p_function_ids uuid[],p_dietary text,p_message text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=private.require_guest_edit(p_wedding_id); v_household public.guest_households%rowtype;
begin
  select * into v_household from public.guest_households where wedding_id=p_wedding_id and id=p_household_id for update;
  if not found then raise exception 'Household not found in this wedding.' using errcode='23503'; end if;
  return private.save_family_reply(p_wedding_id,p_household_id,null,p_attending,p_guest_count,p_function_ids,p_dietary,'',p_message,'','','planner',v_user);
end $$;

/* What a family's link shows. Null when the code is unknown or the family was removed from the list. */
create function public.get_family_invitation(p_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_household public.guest_households%rowtype; v_wedding public.weddings%rowtype;
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9]{12,32}$' then return null; end if;
  select * into v_household from public.guest_households where invite_code=p_code and invite_removed_at is null;
  if not found then return null; end if;
  select * into v_wedding from public.weddings where id=v_household.wedding_id;
  return jsonb_build_object(
    'family',v_household.name,
    'max_guests',v_household.invite_max_guests,
    'wedding',jsonb_build_object('date',v_wedding.wedding_date,'timezone',v_wedding.timezone),
    'functions',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'type',f.function_type,'description',f.description,'date',f.function_date,'start_time',f.start_time,'end_time',f.end_time,'venue',f.venue_name,'map_url',f.guest_map_url,'dress_code',f.dress_code) order by f.function_date nulls last,f.start_time nulls last,f.name)
      from public.family_function_invites i join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id
      where i.wedding_id=v_household.wedding_id and i.household_id=v_household.id and f.archived_at is null and f.status<>'cancelled'),'[]'::jsonb),
    'reply',(select jsonb_build_object('attending',r.attending,'guest_count',r.guest_count,'function_ids',r.function_ids,'dietary',r.dietary,'dietary_notes',r.dietary_notes,'message',r.message,'name',r.reply_name,'phone',r.reply_phone,'updated_at',r.updated_at)
      from public.family_replies r where r.wedding_id=v_household.wedding_id and r.household_id=v_household.id)
  );
end $$;

/* The family's reply from their link. Replying again updates it; every version is kept in the history. */
create function public.submit_family_reply(p_code text,p_attending boolean,p_guest_count integer,p_function_ids uuid[],p_dietary text,p_dietary_notes text,p_message text,p_name text,p_phone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_household public.guest_households%rowtype;
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9]{12,32}$' then return jsonb_build_object('status','unavailable'); end if;
  select * into v_household from public.guest_households where invite_code=p_code and invite_removed_at is null for update;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if char_length(pg_catalog.btrim(coalesce(p_name,''))) not between 2 and 120 then return jsonb_build_object('status','invalid','field','fullName'); end if;
  if coalesce(p_phone,'') !~ '^\+?[0-9][0-9 ()-]{6,19}$' then return jsonb_build_object('status','invalid','field','phone'); end if;
  return private.save_family_reply(v_household.wedding_id,v_household.id,v_household.invite_max_guests,p_attending,p_guest_count,p_function_ids,p_dietary,p_dietary_notes,p_message,p_name,p_phone,'invite_link',null);
end $$;

revoke all on function public.create_family_invites_bulk(uuid,jsonb,uuid[],text),public.update_family_invite(uuid,uuid,integer,uuid[]),public.set_family_invite_code(uuid,uuid,text,boolean),public.set_family_removed(uuid,uuid,boolean),public.record_family_reply(uuid,uuid,boolean,integer,uuid[],text,text) from public,anon;
grant execute on function public.create_family_invites_bulk(uuid,jsonb,uuid[],text),public.update_family_invite(uuid,uuid,integer,uuid[]),public.set_family_invite_code(uuid,uuid,text,boolean),public.set_family_removed(uuid,uuid,boolean),public.record_family_reply(uuid,uuid,boolean,integer,uuid[],text,text) to authenticated;
revoke all on function public.get_family_invitation(text),public.submit_family_reply(text,boolean,integer,uuid[],text,text,text,text,text) from public,authenticated;
grant execute on function public.get_family_invitation(text),public.submit_family_reply(text,boolean,integer,uuid[],text,text,text,text,text) to anon;
