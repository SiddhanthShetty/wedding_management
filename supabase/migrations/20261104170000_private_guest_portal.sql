-- Household-scoped bearer links. Only protected token digests are persisted;
-- all guest records continue to live in the master guest tables.
alter table public.functions
  add column guest_map_url text,
  add constraint functions_guest_map_url_https
    check (guest_map_url is null or guest_map_url ~* '^https://');
grant update (guest_map_url) on public.functions to authenticated;

create or replace function private.touch_guest_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at:=pg_catalog.clock_timestamp();
  return new;
end; $$;

create table public.guest_portal_links (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  household_id uuid not null,
  token_digest text not null check (token_digest ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (wedding_id,id),
  unique (token_digest),
  foreign key (wedding_id,household_id) references public.guest_households(wedding_id,id) on delete cascade,
  foreign key (wedding_id,created_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict,
  check (expires_at > created_at)
);
create unique index guest_portal_one_active_link_per_household
  on public.guest_portal_links(wedding_id,household_id)
  where revoked_at is null;
create index guest_portal_links_household_idx
  on public.guest_portal_links(wedding_id,household_id,created_at desc);

create table public.guest_portal_sessions (
  session_digest text primary key check (session_digest ~ '^[a-f0-9]{64}$'),
  wedding_id uuid not null,
  link_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  foreign key (wedding_id,link_id) references public.guest_portal_links(wedding_id,id) on delete cascade
);
create index guest_portal_sessions_link_idx on public.guest_portal_sessions(link_id,expires_at);

-- Address/token rate-limit identifiers are HMAC digests created by the server.
-- No raw address, token, or user agent is retained here.
create table public.guest_portal_rate_limits (
  scope text not null check (scope in ('exchange','submit','read')),
  key_digest text not null check (key_digest ~ '^[a-f0-9]{64}$'),
  window_number bigint not null,
  attempts integer not null check (attempts > 0),
  primary key (scope,key_digest,window_number)
);
create index guest_portal_rate_limits_cleanup_idx on public.guest_portal_rate_limits(scope,window_number);

create table public.guest_profile_edit_history (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  guest_id uuid not null,
  source text not null check (source in ('planner','guest_portal')),
  changed_by_user_id uuid,
  portal_link_id uuid,
  submission_key uuid,
  old_values jsonb not null,
  new_values jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (wedding_id,guest_id) references public.guests(wedding_id,id) on delete restrict,
  foreign key (wedding_id,changed_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict,
  foreign key (wedding_id,portal_link_id) references public.guest_portal_links(wedding_id,id) on delete restrict,
  check ((source='planner' and changed_by_user_id is not null and portal_link_id is null)
      or (source='guest_portal' and changed_by_user_id is null and portal_link_id is not null))
);
create unique index guest_profile_history_submission_key
  on public.guest_profile_edit_history(submission_key) where submission_key is not null;
create index guest_profile_history_guest_idx
  on public.guest_profile_edit_history(wedding_id,guest_id,created_at desc);

alter table public.guest_rsvp_history
  add column portal_link_id uuid,
  add column portal_submission_key uuid,
  add constraint guest_rsvp_history_portal_link_fk
    foreign key (wedding_id,portal_link_id) references public.guest_portal_links(wedding_id,id) on delete restrict;
create unique index guest_rsvp_history_portal_submission_key
  on public.guest_rsvp_history(portal_submission_key) where portal_submission_key is not null;

-- Existing workspace edits now use optimistic concurrency so a planner form
-- cannot silently overwrite a more recent guest-portal profile update.
drop function public.record_guest_rsvp(uuid,uuid,text,text,text);
create function public.record_guest_rsvp(p_wedding_id uuid,p_invitation_id uuid,p_response text,p_source text,p_note text,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid:=(select auth.uid()); v_time timestamptz; v_current public.guest_rsvps%rowtype;
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then raise exception 'Guest edit permission required.'; end if;
  if p_response not in ('yes','no','maybe') or p_source not in ('phone','email','in_person','other') then raise exception 'Invalid response or response source.'; end if;
  if not exists(select 1 from public.guest_invitations where wedding_id=p_wedding_id and id=p_invitation_id and status='invited') then raise exception 'Active invitation not found.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_invitation_id::text,0));
  v_time:=pg_catalog.clock_timestamp();
  select * into v_current from public.guest_rsvps where wedding_id=p_wedding_id and invitation_id=p_invitation_id for update;
  if found then
    if p_expected_updated_at is null or v_current.updated_at<>p_expected_updated_at then raise exception 'RSVP edit conflict. Refresh to review the latest response before saving.' using errcode='40001'; end if;
  elsif p_expected_updated_at is not null then raise exception 'RSVP edit conflict. Refresh to review the latest response before saving.' using errcode='40001'; end if;
  insert into public.guest_rsvps(wedding_id,invitation_id,response,response_source,response_note,recorded_by_user_id,responded_at)
  values(p_wedding_id,p_invitation_id,p_response,p_source,left(coalesce(p_note,''),2000),v_user,v_time)
  on conflict (wedding_id,invitation_id) do update set response=excluded.response,response_source=excluded.response_source,response_note=excluded.response_note,recorded_by_user_id=v_user,responded_at=v_time,updated_at=v_time returning id into v_id;
  insert into public.guest_rsvp_history(wedding_id,invitation_id,response,response_source,response_note,recorded_by_user_id,responded_at)
  values(p_wedding_id,p_invitation_id,p_response,p_source,left(coalesce(p_note,''),2000),v_user,v_time);
  return v_id;
end; $$;

drop function public.save_guest(uuid,uuid,jsonb);
create function public.save_guest(p_wedding_id uuid,p_guest_id uuid,p_values jsonb,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid:=(select auth.uid()); v_old public.guests%rowtype;
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then raise exception 'Guest edit permission required.'; end if;
  if p_guest_id is null then
    if p_expected_updated_at is not null then raise exception 'Guest edit conflict. Refresh and try again.' using errcode='40001'; end if;
    insert into public.guests(wedding_id,household_id,full_name,email,phone,family_side,follow_up_owner_user_id,meal_preference,allergies,assistance_needs,notes,created_by_user_id)
    values(p_wedding_id,nullif(p_values->>'household_id','')::uuid,p_values->>'full_name',coalesce(p_values->>'email',''),coalesce(p_values->>'phone',''),coalesce(p_values->>'family_side','unknown'),nullif(p_values->>'follow_up_owner_user_id','')::uuid,coalesce(p_values->>'meal_preference',''),coalesce(p_values->>'allergies',''),coalesce(p_values->>'assistance_needs',''),coalesce(p_values->>'notes',''),v_user)
    returning id into v_id;
  else
    select * into v_old from public.guests where wedding_id=p_wedding_id and id=p_guest_id for update;
    if not found then raise exception 'Guest not found in this wedding.'; end if;
    if p_expected_updated_at is null or v_old.updated_at <> p_expected_updated_at then raise exception 'Guest edit conflict. Refresh to review the latest guest details before saving.' using errcode='40001'; end if;
    update public.guests set household_id=nullif(p_values->>'household_id','')::uuid,full_name=p_values->>'full_name',email=coalesce(p_values->>'email',''),phone=coalesce(p_values->>'phone',''),family_side=coalesce(p_values->>'family_side','unknown'),follow_up_owner_user_id=nullif(p_values->>'follow_up_owner_user_id','')::uuid,meal_preference=coalesce(p_values->>'meal_preference',''),allergies=coalesce(p_values->>'allergies',''),assistance_needs=coalesce(p_values->>'assistance_needs',''),notes=coalesce(p_values->>'notes','')
    where wedding_id=p_wedding_id and id=p_guest_id returning id into v_id;
    if (v_old.meal_preference,v_old.allergies,v_old.assistance_needs) is distinct from (coalesce(p_values->>'meal_preference',''),coalesce(p_values->>'allergies',''),coalesce(p_values->>'assistance_needs','')) then
      insert into public.guest_profile_edit_history(wedding_id,guest_id,source,changed_by_user_id,old_values,new_values)
      values(p_wedding_id,p_guest_id,'planner',v_user,
        jsonb_build_object('meal_preference',v_old.meal_preference,'allergies',v_old.allergies,'assistance_needs',v_old.assistance_needs),
        jsonb_build_object('meal_preference',coalesce(p_values->>'meal_preference',''),'allergies',coalesce(p_values->>'allergies',''),'assistance_needs',coalesce(p_values->>'assistance_needs','')));
    end if;
  end if;
  return v_id;
end; $$;

create function public.create_guest_portal_link(p_wedding_id uuid,p_household_id uuid,p_token_digest text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=(select auth.uid()); v_id uuid;
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then raise exception 'Guest edit permission required.'; end if;
  if p_token_digest !~ '^[a-f0-9]{64}$' or p_expires_at <= now() or p_expires_at > now()+interval '31 days' then raise exception 'Invalid private link expiry.'; end if;
  if not exists(select 1 from public.guest_households where wedding_id=p_wedding_id and id=p_household_id) then raise exception 'Household not found in this wedding.'; end if;
  update public.guest_portal_links set revoked_at=now() where wedding_id=p_wedding_id and household_id=p_household_id and revoked_at is null;
  insert into public.guest_portal_links(wedding_id,household_id,token_digest,expires_at,created_by_user_id)
  values(p_wedding_id,p_household_id,p_token_digest,p_expires_at,v_user) returning id into v_id;
  return v_id;
end; $$;

create function public.revoke_guest_portal_link(p_wedding_id uuid,p_link_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=(select auth.uid());
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then raise exception 'Guest edit permission required.'; end if;
  update public.guest_portal_links set revoked_at=coalesce(revoked_at,now()) where wedding_id=p_wedding_id and id=p_link_id;
  return found;
end; $$;

create function public.list_guest_portal_links(p_wedding_id uuid,p_household_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.has_module_access(p_wedding_id,'guests','read')) then raise exception 'Guest read permission required.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'household_id',l.household_id,'expires_at',l.expires_at,'revoked_at',l.revoked_at,'created_at',l.created_at,'active',l.revoked_at is null and l.expires_at>now()) order by l.created_at desc)
    from public.guest_portal_links l where l.wedding_id=p_wedding_id and (p_household_id is null or l.household_id=p_household_id)),'[]'::jsonb);
end; $$;

create function public.consume_guest_portal_rate_limit(p_scope text,p_key_digest text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_window bigint; v_attempts integer; v_limit integer; v_window_seconds integer;
begin
  if p_scope='exchange' then v_limit:=30;v_window_seconds:=900;
  elsif p_scope='submit' then v_limit:=30;v_window_seconds:=900;
  elsif p_scope='read' then v_limit:=120;v_window_seconds:=60;
  else return false; end if;
  if p_key_digest !~ '^[a-f0-9]{64}$' then return false; end if;
  v_window:=floor(extract(epoch from now())/v_window_seconds)::bigint;
  delete from public.guest_portal_rate_limits where (scope='read' and window_number<v_window-10080) or (scope<>'read' and window_number<v_window-672);
  insert into public.guest_portal_rate_limits(scope,key_digest,window_number,attempts) values(p_scope,p_key_digest,v_window,1)
  on conflict(scope,key_digest,window_number) do update set attempts=public.guest_portal_rate_limits.attempts+1
  returning attempts into v_attempts;
  return v_attempts<=v_limit;
end; $$;

create function public.create_guest_portal_session(p_token_digest text,p_session_digest text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_link public.guest_portal_links%rowtype; v_expiry timestamptz;
begin
  if p_token_digest !~ '^[a-f0-9]{64}$' or p_session_digest !~ '^[a-f0-9]{64}$' then return null; end if;
  select * into v_link from public.guest_portal_links where token_digest=p_token_digest and revoked_at is null and expires_at>now();
  if not found then return null; end if;
  delete from public.guest_portal_sessions where expires_at<now()-interval '1 day';
  v_expiry:=least(v_link.expires_at,now()+interval '12 hours');
  insert into public.guest_portal_sessions(session_digest,wedding_id,link_id,expires_at) values(p_session_digest,v_link.wedding_id,v_link.id,v_expiry);
  return v_expiry;
end; $$;

create function public.get_guest_portal_data(p_session_digest text)
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
        where i.wedding_id=v_link.wedding_id and i.guest_id=g.id and i.status='invited' and f.archived_at is null and f.status<>'cancelled')
    ) order by g.full_name) from public.guests g where g.wedding_id=v_link.wedding_id and g.household_id=v_link.household_id
      and exists(select 1 from public.guest_invitations i join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id where i.wedding_id=g.wedding_id and i.guest_id=g.id and i.status='invited' and f.archived_at is null and f.status<>'cancelled')),'[]'::jsonb)
  ) into v_data;
  return v_data;
end; $$;

create function public.record_guest_portal_rsvp(p_session_digest text,p_invitation_id uuid,p_response text,p_note text,p_expected_updated_at timestamptz,p_submission_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_link public.guest_portal_links%rowtype; v_current public.guest_rsvps%rowtype; v_id uuid; v_now timestamptz;
begin
  select l.* into v_link from public.guest_portal_sessions s join public.guest_portal_links l on l.wedding_id=s.wedding_id and l.id=s.link_id
  where s.session_digest=p_session_digest and s.expires_at>now() and l.revoked_at is null and l.expires_at>now();
  if not found then return jsonb_build_object('status','unavailable'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_invitation_id::text,0));
  if exists(select 1 from public.guest_rsvp_history where portal_submission_key=p_submission_key and portal_link_id=v_link.id) then return jsonb_build_object('status','duplicate'); end if;
  if p_response not in ('yes','no','maybe') or char_length(coalesce(p_note,''))>2000 or p_submission_key is null then return jsonb_build_object('status','invalid'); end if;
  if not exists(select 1 from public.guest_invitations i join public.guests g on g.wedding_id=i.wedding_id and g.id=i.guest_id join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id
    where i.wedding_id=v_link.wedding_id and i.id=p_invitation_id and i.status='invited' and g.household_id=v_link.household_id and f.archived_at is null and f.status<>'cancelled') then return jsonb_build_object('status','unavailable'); end if;
  v_now:=pg_catalog.clock_timestamp();
  select * into v_current from public.guest_rsvps where wedding_id=v_link.wedding_id and invitation_id=p_invitation_id for update;
  if found then
    if p_expected_updated_at is null or v_current.updated_at<>p_expected_updated_at then return jsonb_build_object('status','conflict'); end if;
  elsif p_expected_updated_at is not null then return jsonb_build_object('status','conflict'); end if;
  insert into public.guest_rsvps(wedding_id,invitation_id,response,response_source,response_note,recorded_by_user_id,responded_at)
  values(v_link.wedding_id,p_invitation_id,p_response,'portal',coalesce(p_note,''),null,v_now)
  on conflict(wedding_id,invitation_id) do update set response=excluded.response,response_source='portal',response_note=excluded.response_note,recorded_by_user_id=null,responded_at=v_now,updated_at=v_now returning id into v_id;
  insert into public.guest_rsvp_history(wedding_id,invitation_id,response,response_source,response_note,recorded_by_user_id,responded_at,portal_link_id,portal_submission_key)
  values(v_link.wedding_id,p_invitation_id,p_response,'portal',coalesce(p_note,''),null,v_now,v_link.id,p_submission_key);
  return jsonb_build_object('status','saved','id',v_id);
end; $$;

create function public.record_guest_portal_profile(p_session_digest text,p_guest_id uuid,p_meal_preference text,p_allergies text,p_assistance_needs text,p_expected_updated_at timestamptz,p_submission_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_link public.guest_portal_links%rowtype; v_guest public.guests%rowtype; v_now timestamptz:=now();
begin
  select l.* into v_link from public.guest_portal_sessions s join public.guest_portal_links l on l.wedding_id=s.wedding_id and l.id=s.link_id
  where s.session_digest=p_session_digest and s.expires_at>now() and l.revoked_at is null and l.expires_at>now();
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if p_submission_key is null or char_length(coalesce(p_meal_preference,''))>500 or char_length(coalesce(p_allergies,''))>2000 or char_length(coalesce(p_assistance_needs,''))>2000 then return jsonb_build_object('status','invalid'); end if;
  select * into v_guest from public.guests where wedding_id=v_link.wedding_id and id=p_guest_id and household_id=v_link.household_id for update;
  if not found or not exists(select 1 from public.guest_invitations i join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id where i.wedding_id=v_link.wedding_id and i.guest_id=p_guest_id and i.status='invited' and f.archived_at is null and f.status<>'cancelled') then return jsonb_build_object('status','unavailable'); end if;
  if exists(select 1 from public.guest_profile_edit_history where submission_key=p_submission_key and portal_link_id=v_link.id) then return jsonb_build_object('status','duplicate'); end if;
  if p_expected_updated_at is null or v_guest.updated_at<>p_expected_updated_at then return jsonb_build_object('status','conflict'); end if;
  update public.guests set meal_preference=coalesce(p_meal_preference,''),allergies=coalesce(p_allergies,''),assistance_needs=coalesce(p_assistance_needs,'') where wedding_id=v_link.wedding_id and id=p_guest_id;
  insert into public.guest_profile_edit_history(wedding_id,guest_id,source,portal_link_id,submission_key,old_values,new_values)
  values(v_link.wedding_id,p_guest_id,'guest_portal',v_link.id,p_submission_key,
    jsonb_build_object('meal_preference',v_guest.meal_preference,'allergies',v_guest.allergies,'assistance_needs',v_guest.assistance_needs),
    jsonb_build_object('meal_preference',coalesce(p_meal_preference,''),'allergies',coalesce(p_allergies,''),'assistance_needs',coalesce(p_assistance_needs,'')));
  return jsonb_build_object('status','saved');
end; $$;

alter table public.guest_portal_links enable row level security;
alter table public.guest_portal_sessions enable row level security;
alter table public.guest_portal_rate_limits enable row level security;
alter table public.guest_profile_edit_history enable row level security;
revoke all on public.guest_portal_links,public.guest_portal_sessions,public.guest_portal_rate_limits,public.guest_profile_edit_history from anon,authenticated;

revoke all on function public.save_guest(uuid,uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.save_guest(uuid,uuid,jsonb,timestamptz) to authenticated;
revoke all on function public.record_guest_rsvp(uuid,uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.record_guest_rsvp(uuid,uuid,text,text,text,timestamptz) to authenticated;
revoke all on function public.create_guest_portal_link(uuid,uuid,text,timestamptz) from public,anon;
revoke all on function public.revoke_guest_portal_link(uuid,uuid) from public,anon;
revoke all on function public.list_guest_portal_links(uuid,uuid) from public,anon;
grant execute on function public.create_guest_portal_link(uuid,uuid,text,timestamptz) to authenticated;
grant execute on function public.revoke_guest_portal_link(uuid,uuid) to authenticated;
grant execute on function public.list_guest_portal_links(uuid,uuid) to authenticated;
revoke all on function public.consume_guest_portal_rate_limit(text,text) from public,authenticated;
revoke all on function public.create_guest_portal_session(text,text) from public,authenticated;
revoke all on function public.get_guest_portal_data(text) from public,authenticated;
revoke all on function public.record_guest_portal_rsvp(text,uuid,text,text,timestamptz,uuid) from public,authenticated;
revoke all on function public.record_guest_portal_profile(text,uuid,text,text,text,timestamptz,uuid) from public,authenticated;
grant execute on function public.consume_guest_portal_rate_limit(text,text) to anon;
grant execute on function public.create_guest_portal_session(text,text) to anon;
grant execute on function public.get_guest_portal_data(text) to anon;
grant execute on function public.record_guest_portal_rsvp(text,uuid,text,text,timestamptz,uuid) to anon;
grant execute on function public.record_guest_portal_profile(text,uuid,text,text,text,timestamptz,uuid) to anon;
