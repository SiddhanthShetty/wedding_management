-- Private portal bearer links belong to one guest. Additional people are
-- accessible only when a planner has explicitly authorized proxy access.
-- Data impact: preserves existing household-link rows for audit but revokes
-- them and invalidates their sessions; new links require one invited guest.
-- RSVP/profile histories are retained if an individual link is deleted.
alter table public.guest_portal_links
  add column guest_id uuid,
  add constraint guest_portal_links_guest_fk
    foreign key (wedding_id,guest_id) references public.guests(wedding_id,id) on delete cascade;

-- Existing household links remain as audit records, but they no longer grant
-- access. Their sessions are invalidated immediately.
update public.guest_portal_links set revoked_at=coalesce(revoked_at,now()) where guest_id is null;
drop index public.guest_portal_one_active_link_per_household;
create unique index guest_portal_one_active_link_per_guest
  on public.guest_portal_links(wedding_id,guest_id)
  where guest_id is not null and revoked_at is null;
create index guest_portal_links_guest_idx
  on public.guest_portal_links(wedding_id,guest_id,created_at desc);

create table public.guest_portal_link_proxies (
  wedding_id uuid not null,
  link_id uuid not null,
  guest_id uuid not null,
  authorized_by_user_id uuid not null,
  authorized_at timestamptz not null default now(),
  primary key (wedding_id,link_id,guest_id),
  foreign key (wedding_id,link_id) references public.guest_portal_links(wedding_id,id) on delete cascade,
  foreign key (wedding_id,guest_id) references public.guests(wedding_id,id) on delete cascade,
  foreign key (wedding_id,authorized_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict
);
alter table public.guest_portal_link_proxies enable row level security;
revoke all on public.guest_portal_link_proxies from anon,authenticated;

alter table public.guest_rsvp_history
  add column portal_actor_guest_id uuid;
alter table public.guest_profile_edit_history
  add column portal_actor_guest_id uuid;
-- Actor IDs are audit values rather than foreign keys: deleting a guest must
-- not erase or block history for another guest they were authorized to help.

-- Keep history when a link owner is deleted. History still records the guest
-- actor ID, but must not prevent the guest/link from being removed.
create function private.detach_deleted_guest_portal_link_history() returns trigger
language plpgsql set search_path='' as $$
begin
  update public.guest_rsvp_history set portal_link_id=null
    where wedding_id=old.wedding_id and portal_link_id=old.id;
  update public.guest_profile_edit_history set portal_link_id=null
    where wedding_id=old.wedding_id and portal_link_id=old.id;
  return old;
end $$;
revoke all on function private.detach_deleted_guest_portal_link_history() from public,anon,authenticated;
create trigger detach_deleted_guest_portal_link_history
before delete on public.guest_portal_links
for each row execute function private.detach_deleted_guest_portal_link_history();

drop function public.create_guest_portal_link(uuid,uuid,text,timestamptz);
create function public.create_guest_portal_link(p_wedding_id uuid,p_guest_id uuid,p_proxy_guest_ids uuid[],p_token_digest text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_id uuid; v_household uuid; v_proxy uuid;
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then raise exception 'Guest edit permission required.' using errcode='42501'; end if;
  if p_token_digest !~ '^[a-f0-9]{64}$' or p_expires_at<=now() or p_expires_at>now()+interval '31 days' then raise exception 'Invalid private link expiry.'; end if;
  select household_id into v_household from public.guests where wedding_id=p_wedding_id and id=p_guest_id;
  if not found or v_household is null then raise exception 'Guest with a household is required.'; end if;
  if not exists(select 1 from public.guest_invitations i join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id where i.wedding_id=p_wedding_id and i.guest_id=p_guest_id and i.status='invited' and f.archived_at is null and f.status<>'cancelled') then
    raise exception 'Invite this guest to a function before creating a private link.';
  end if;
  if coalesce(cardinality(p_proxy_guest_ids),0)>20 or coalesce(cardinality(p_proxy_guest_ids),0)<>(select count(distinct x) from unnest(coalesce(p_proxy_guest_ids,'{}'::uuid[])) x) then raise exception 'Invalid proxy guest selection.'; end if;
  update public.guest_portal_links set revoked_at=now() where wedding_id=p_wedding_id and guest_id=p_guest_id and revoked_at is null;
  insert into public.guest_portal_links(wedding_id,household_id,guest_id,token_digest,expires_at,created_by_user_id)
  values(p_wedding_id,v_household,p_guest_id,p_token_digest,p_expires_at,v_user) returning id into v_id;
  foreach v_proxy in array coalesce(p_proxy_guest_ids,'{}'::uuid[]) loop
    if v_proxy=p_guest_id or not exists(select 1 from public.guests g where g.wedding_id=p_wedding_id and g.id=v_proxy and g.household_id=v_household)
      or not exists(select 1 from public.guest_invitations i join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id where i.wedding_id=p_wedding_id and i.guest_id=v_proxy and i.status='invited' and f.archived_at is null and f.status<>'cancelled') then
      raise exception 'A proxy must be another invited guest in the same household.';
    end if;
    insert into public.guest_portal_link_proxies(wedding_id,link_id,guest_id,authorized_by_user_id) values(p_wedding_id,v_id,v_proxy,v_user);
  end loop;
  return v_id;
end $$;

create function public.set_guest_portal_proxies(p_wedding_id uuid,p_link_id uuid,p_proxy_guest_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_link public.guest_portal_links%rowtype; v_proxy uuid; v_count integer:=0;
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then raise exception 'Guest edit permission required.' using errcode='42501'; end if;
  select * into v_link from public.guest_portal_links where wedding_id=p_wedding_id and id=p_link_id and guest_id is not null and revoked_at is null and expires_at>now() for update;
  if not found then raise exception 'Active individual link not found.'; end if;
  if coalesce(cardinality(p_proxy_guest_ids),0)>20 or coalesce(cardinality(p_proxy_guest_ids),0)<>(select count(distinct x) from unnest(coalesce(p_proxy_guest_ids,'{}'::uuid[])) x) then raise exception 'Invalid proxy guest selection.'; end if;
  foreach v_proxy in array coalesce(p_proxy_guest_ids,'{}'::uuid[]) loop
    if v_proxy=v_link.guest_id or not exists(select 1 from public.guests g where g.wedding_id=p_wedding_id and g.id=v_proxy and g.household_id=v_link.household_id)
      or not exists(select 1 from public.guest_invitations i join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id where i.wedding_id=p_wedding_id and i.guest_id=v_proxy and i.status='invited' and f.archived_at is null and f.status<>'cancelled') then
      raise exception 'A proxy must be another invited guest in the same household.';
    end if;
  end loop;
  delete from public.guest_portal_link_proxies where wedding_id=p_wedding_id and link_id=p_link_id;
  foreach v_proxy in array coalesce(p_proxy_guest_ids,'{}'::uuid[]) loop
    insert into public.guest_portal_link_proxies(wedding_id,link_id,guest_id,authorized_by_user_id) values(p_wedding_id,p_link_id,v_proxy,v_user);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

create or replace function public.list_guest_portal_links(p_wedding_id uuid,p_household_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not (select private.has_module_access(p_wedding_id,'guests','read')) then raise exception 'Guest read permission required.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',l.id,'household_id',l.household_id,'guest_id',l.guest_id,'proxy_guest_ids',coalesce((select jsonb_agg(p.guest_id order by p.authorized_at) from public.guest_portal_link_proxies p where p.wedding_id=l.wedding_id and p.link_id=l.id),'[]'::jsonb),
    'expires_at',l.expires_at,'revoked_at',l.revoked_at,'created_at',l.created_at,'active',l.guest_id is not null and l.revoked_at is null and l.expires_at>now()
  ) order by l.created_at desc) from public.guest_portal_links l where l.wedding_id=p_wedding_id and (p_household_id is null or l.household_id=p_household_id)),'[]'::jsonb);
end $$;

create or replace function public.get_guest_portal_data(p_session_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_link public.guest_portal_links%rowtype; v_household public.guest_households%rowtype; v_wedding public.weddings%rowtype; v_design public.invitation_designs%rowtype; v_data jsonb;
begin
  if p_session_digest !~ '^[a-f0-9]{64}$' then return null; end if;
  select l.* into v_link from public.guest_portal_sessions s join public.guest_portal_links l on l.wedding_id=s.wedding_id and l.id=s.link_id
  where s.session_digest=p_session_digest and s.expires_at>now() and l.guest_id is not null and l.revoked_at is null and l.expires_at>now();
  if not found then return null; end if;
  update public.guest_portal_sessions set last_used_at=now() where session_digest=p_session_digest;
  select * into v_household from public.guest_households where wedding_id=v_link.wedding_id and id=v_link.household_id;
  select * into v_wedding from public.weddings where id=v_link.wedding_id;
  select * into v_design from public.invitation_designs where wedding_id=v_link.wedding_id and is_default;
  select jsonb_build_object(
    'household',jsonb_build_object('name',v_household.name,'language',v_household.preferred_language),
    'portal_guest_id',v_link.guest_id,
    'invitation',case when v_design.id is null then null else jsonb_build_object('theme',v_design.theme,'accent',v_design.accent,'texts',coalesce(v_design.texts->v_household.preferred_language,'{}'::jsonb)) end,
    'couple_names',array_remove(array[v_wedding.partner_one_display_name,v_wedding.partner_two_display_name],''),
    'people',coalesce((select jsonb_agg(jsonb_build_object(
      'id',g.id,'full_name',g.full_name,'is_proxy',g.id<>v_link.guest_id,'meal_preference',g.meal_preference,'allergies',g.allergies,'assistance_needs',g.assistance_needs,'updated_at',g.updated_at,
      'invitations',(select coalesce(jsonb_agg(jsonb_build_object(
        'id',i.id,'response',r.response,'response_note',r.response_note,'updated_at',r.updated_at,
        'function',jsonb_build_object('id',f.id,'name',f.name,'type',f.function_type,'date',f.function_date,'start_time',f.start_time,'end_time',f.end_time,'timezone',v_wedding.timezone,'location',f.venue_name,'map_url',f.guest_map_url,'dress_code',f.dress_code,'status',f.status::text)
      ) order by f.function_date,f.start_time),'[]'::jsonb) from public.guest_invitations i join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id left join public.guest_rsvps r on r.wedding_id=i.wedding_id and r.invitation_id=i.id
        where i.wedding_id=v_link.wedding_id and i.guest_id=g.id and i.status='invited' and f.archived_at is null and f.status<>'cancelled'),
      'stays',(select coalesce(jsonb_agg(jsonb_build_object('property',p.name,'address',p.address,'notes',p.guest_facing_notes,'room_type',t.name,'check_in_date',a.check_in_date,'check_out_date',a.check_out_date,'check_in_time',p.check_in_time,'check_out_time',p.check_out_time) order by a.check_in_date),'[]'::jsonb)
        from public.accommodation_assignments a join public.accommodation_rooms rm on rm.wedding_id=a.wedding_id and rm.id=a.room_id join public.accommodation_room_types t on t.wedding_id=rm.wedding_id and t.id=rm.room_type_id join public.accommodation_properties p on p.wedding_id=t.wedding_id and p.id=t.property_id where a.wedding_id=v_link.wedding_id and a.guest_id=g.id and a.status='confirmed'),
      'journeys',(select coalesce(jsonb_agg(jsonb_build_object('kind',j.kind::text,'title',j.title,'pickup_at',j.pickup_at,'pickup_location',j.pickup_location,'dropoff_location',j.dropoff_location,'timezone',v_wedding.timezone) order by j.pickup_at),'[]'::jsonb)
        from public.transport_passengers tp join public.transport_journeys j on j.wedding_id=tp.wedding_id and j.id=tp.journey_id where tp.wedding_id=v_link.wedding_id and tp.guest_id=g.id and j.shared_with_guests and j.status<>'cancelled')
    ) order by (g.id<>v_link.guest_id),g.full_name) from public.guests g where g.wedding_id=v_link.wedding_id and (g.id=v_link.guest_id or exists(select 1 from public.guest_portal_link_proxies p where p.wedding_id=v_link.wedding_id and p.link_id=v_link.id and p.guest_id=g.id))
      and exists(select 1 from public.guest_invitations i join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id where i.wedding_id=g.wedding_id and i.guest_id=g.id and i.status='invited' and f.archived_at is null and f.status<>'cancelled')),'[]'::jsonb)
  ) into v_data;
  return v_data;
end $$;

create or replace function public.record_guest_portal_rsvp(p_session_digest text,p_invitation_id uuid,p_response text,p_note text,p_expected_updated_at timestamptz,p_submission_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_link public.guest_portal_links%rowtype; v_current public.guest_rsvps%rowtype; v_id uuid; v_now timestamptz;
begin
  select l.* into v_link from public.guest_portal_sessions s join public.guest_portal_links l on l.wedding_id=s.wedding_id and l.id=s.link_id where s.session_digest=p_session_digest and s.expires_at>now() and l.guest_id is not null and l.revoked_at is null and l.expires_at>now();
  if not found then return jsonb_build_object('status','unavailable'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_invitation_id::text,0));
  if exists(select 1 from public.guest_rsvp_history where portal_submission_key=p_submission_key and portal_link_id=v_link.id) then return jsonb_build_object('status','duplicate'); end if;
  if p_response not in ('yes','no','maybe') or char_length(coalesce(p_note,''))>2000 or p_submission_key is null then return jsonb_build_object('status','invalid'); end if;
  if not exists(select 1 from public.guest_invitations i join public.guests g on g.wedding_id=i.wedding_id and g.id=i.guest_id join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id where i.wedding_id=v_link.wedding_id and i.id=p_invitation_id and i.status='invited' and f.archived_at is null and f.status<>'cancelled' and (g.id=v_link.guest_id or exists(select 1 from public.guest_portal_link_proxies p where p.wedding_id=v_link.wedding_id and p.link_id=v_link.id and p.guest_id=g.id))) then return jsonb_build_object('status','unavailable'); end if;
  v_now:=pg_catalog.clock_timestamp();
  select * into v_current from public.guest_rsvps where wedding_id=v_link.wedding_id and invitation_id=p_invitation_id for update;
  if found then if p_expected_updated_at is null or v_current.updated_at<>p_expected_updated_at then return jsonb_build_object('status','conflict'); end if;
  elsif p_expected_updated_at is not null then return jsonb_build_object('status','conflict'); end if;
  insert into public.guest_rsvps(wedding_id,invitation_id,response,response_source,response_note,recorded_by_user_id,responded_at) values(v_link.wedding_id,p_invitation_id,p_response,'portal',coalesce(p_note,''),null,v_now)
  on conflict(wedding_id,invitation_id) do update set response=excluded.response,response_source='portal',response_note=excluded.response_note,recorded_by_user_id=null,responded_at=v_now,updated_at=v_now returning id into v_id;
  insert into public.guest_rsvp_history(wedding_id,invitation_id,response,response_source,response_note,recorded_by_user_id,responded_at,portal_link_id,portal_submission_key,portal_actor_guest_id)
  values(v_link.wedding_id,p_invitation_id,p_response,'portal',coalesce(p_note,''),null,v_now,v_link.id,p_submission_key,v_link.guest_id);
  return jsonb_build_object('status','saved','id',v_id);
end $$;

create or replace function public.record_guest_portal_rsvps(p_session_digest text,p_guest_id uuid,p_responses jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_link public.guest_portal_links%rowtype; v_entry jsonb; v_response jsonb; v_expected_at timestamptz; v_status text; v_error_message text; v_saved_count integer:=0; v_duplicate_count integer:=0;
begin
  if p_session_digest !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','unavailable'); end if;
  select l.* into v_link from public.guest_portal_sessions s join public.guest_portal_links l on l.wedding_id=s.wedding_id and l.id=s.link_id where s.session_digest=p_session_digest and s.expires_at>now() and l.guest_id is not null and l.revoked_at is null and l.expires_at>now();
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if p_guest_id is null or p_responses is null or jsonb_typeof(p_responses) is distinct from 'array' or jsonb_array_length(p_responses)<1 or jsonb_array_length(p_responses)>50 then return jsonb_build_object('status','invalid'); end if;
  for v_entry in select value from jsonb_array_elements(p_responses) loop
    if jsonb_typeof(v_entry) is distinct from 'object' or jsonb_typeof(v_entry->'invitation_id') is distinct from 'string' or jsonb_typeof(v_entry->'response') is distinct from 'string' or jsonb_typeof(v_entry->'note') is distinct from 'string' or jsonb_typeof(v_entry->'submission_key') is distinct from 'string' or (v_entry ? 'expected_updated_at' and jsonb_typeof(v_entry->'expected_updated_at') not in ('string','null')) then return jsonb_build_object('status','invalid'); end if;
    if v_entry->>'response' not in ('yes','no','maybe') or char_length(v_entry->>'note')>2000 then return jsonb_build_object('status','invalid'); end if;
    begin perform (v_entry->>'invitation_id')::uuid; perform (v_entry->>'submission_key')::uuid; v_expected_at:=nullif(v_entry->>'expected_updated_at','')::timestamptz;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('status','invalid'); end;
  end loop;
  if exists(select 1 from (select (value->>'invitation_id')::uuid id from jsonb_array_elements(p_responses)) x group by id having count(*)>1) or exists(select 1 from (select (value->>'submission_key')::uuid id from jsonb_array_elements(p_responses)) x group by id having count(*)>1) then return jsonb_build_object('status','invalid'); end if;
  if exists(select 1 from jsonb_array_elements(p_responses) e(value) where not exists(select 1 from public.guest_invitations i join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id where i.wedding_id=v_link.wedding_id and i.id=(e.value->>'invitation_id')::uuid and i.guest_id=p_guest_id and i.status='invited' and f.archived_at is null and f.status<>'cancelled' and (p_guest_id=v_link.guest_id or exists(select 1 from public.guest_portal_link_proxies p where p.wedding_id=v_link.wedding_id and p.link_id=v_link.id and p.guest_id=p_guest_id)))) then return jsonb_build_object('status','unavailable'); end if;
  begin
    for v_entry in select value from jsonb_array_elements(p_responses) order by value->>'invitation_id' loop
      v_expected_at:=nullif(v_entry->>'expected_updated_at','')::timestamptz;
      v_response:=public.record_guest_portal_rsvp(p_session_digest,(v_entry->>'invitation_id')::uuid,v_entry->>'response',v_entry->>'note',v_expected_at,(v_entry->>'submission_key')::uuid);
      v_status:=v_response->>'status'; if v_status='saved' then v_saved_count:=v_saved_count+1; elsif v_status='duplicate' then v_duplicate_count:=v_duplicate_count+1; else raise exception using errcode='P0001',message='portal_rsvp_batch:'||coalesce(v_status,'unavailable'); end if;
    end loop;
  exception when others then get stacked diagnostics v_error_message=message_text; if v_error_message like 'portal_rsvp_batch:%' then return jsonb_build_object('status',substring(v_error_message from length('portal_rsvp_batch:')+1)); end if; return jsonb_build_object('status','unavailable'); end;
  if v_saved_count=0 and v_duplicate_count>0 then return jsonb_build_object('status','duplicate','saved_count',0); end if;
  return jsonb_build_object('status','saved','saved_count',v_saved_count);
end $$;

create or replace function public.record_guest_portal_profile(p_session_digest text,p_guest_id uuid,p_meal_preference text,p_allergies text,p_assistance_needs text,p_expected_updated_at timestamptz,p_submission_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_link public.guest_portal_links%rowtype; v_guest public.guests%rowtype;
begin
  select l.* into v_link from public.guest_portal_sessions s join public.guest_portal_links l on l.wedding_id=s.wedding_id and l.id=s.link_id where s.session_digest=p_session_digest and s.expires_at>now() and l.guest_id is not null and l.revoked_at is null and l.expires_at>now();
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if p_submission_key is null or char_length(coalesce(p_meal_preference,''))>500 or char_length(coalesce(p_allergies,''))>2000 or char_length(coalesce(p_assistance_needs,''))>2000 then return jsonb_build_object('status','invalid'); end if;
  select * into v_guest from public.guests g where g.wedding_id=v_link.wedding_id and g.id=p_guest_id and exists(select 1 from public.guest_invitations i join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id where i.wedding_id=g.wedding_id and i.guest_id=g.id and i.status='invited' and f.archived_at is null and f.status<>'cancelled') and (g.id=v_link.guest_id or exists(select 1 from public.guest_portal_link_proxies p where p.wedding_id=v_link.wedding_id and p.link_id=v_link.id and p.guest_id=g.id)) for update;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if exists(select 1 from public.guest_profile_edit_history where submission_key=p_submission_key and portal_link_id=v_link.id) then return jsonb_build_object('status','duplicate'); end if;
  if p_expected_updated_at is null or v_guest.updated_at<>p_expected_updated_at then return jsonb_build_object('status','conflict'); end if;
  update public.guests set meal_preference=coalesce(p_meal_preference,''),allergies=coalesce(p_allergies,''),assistance_needs=coalesce(p_assistance_needs,'') where wedding_id=v_link.wedding_id and id=p_guest_id;
  insert into public.guest_profile_edit_history(wedding_id,guest_id,source,portal_link_id,submission_key,old_values,new_values,portal_actor_guest_id) values(v_link.wedding_id,p_guest_id,'guest_portal',v_link.id,p_submission_key,jsonb_build_object('meal_preference',v_guest.meal_preference,'allergies',v_guest.allergies,'assistance_needs',v_guest.assistance_needs),jsonb_build_object('meal_preference',coalesce(p_meal_preference,''),'allergies',coalesce(p_allergies,''),'assistance_needs',coalesce(p_assistance_needs,'')),v_link.guest_id);
  return jsonb_build_object('status','saved');
end $$;

revoke all on function public.create_guest_portal_link(uuid,uuid,uuid[],text,timestamptz),public.set_guest_portal_proxies(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.create_guest_portal_link(uuid,uuid,uuid[],text,timestamptz),public.set_guest_portal_proxies(uuid,uuid,uuid[]) to authenticated;
revoke all on function public.list_guest_portal_links(uuid,uuid) from public,anon;
grant execute on function public.list_guest_portal_links(uuid,uuid) to authenticated;
revoke all on function public.get_guest_portal_data(text),public.record_guest_portal_rsvp(text,uuid,text,text,timestamptz,uuid),public.record_guest_portal_rsvps(text,uuid,jsonb),public.record_guest_portal_profile(text,uuid,text,text,text,timestamptz,uuid) from public,authenticated;
grant execute on function public.get_guest_portal_data(text),public.record_guest_portal_rsvp(text,uuid,text,text,timestamptz,uuid),public.record_guest_portal_rsvps(text,uuid,jsonb),public.record_guest_portal_profile(text,uuid,text,text,text,timestamptz,uuid) to anon;
