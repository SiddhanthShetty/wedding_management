-- Interactive invitation website: story, FAQs, livestream link, colour palettes and a
-- moderated blessings wall.
--
-- Data impact: additive. invitation_designs gets a `site` jsonb column (default empty);
-- a new guest_blessings table; a portal RPC to submit a blessing; get_guest_portal_data is
-- replaced to add the site content and approved blessings. No existing rows change.
--
-- Rules
-- * Only the link owner can post, through their own session; at most 5 blessings each, 500
--   characters, one row per submission key (retries are safe).
-- * Blessings stay private until a guest-list editor approves them. Guests see approved ones with
--   the author's first name only.

alter table public.invitation_designs add column site jsonb not null default '{}'::jsonb
  check (jsonb_typeof(site) = 'object' and pg_column_size(site) < 64000);
grant update (site) on table public.invitation_designs to authenticated;

create table public.guest_blessings (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  guest_id uuid not null,
  message text not null check (char_length(trim(message)) between 1 and 500),
  status text not null default 'pending' check (status in ('pending','approved','hidden')),
  submission_key uuid not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  moderated_by_user_id uuid,
  unique (wedding_id, submission_key),
  foreign key (wedding_id, guest_id) references public.guests(wedding_id, id) on delete cascade,
  foreign key (wedding_id, moderated_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  check ((status = 'approved') = (approved_at is not null))
);
create index guest_blessings_wedding_status_idx on public.guest_blessings(wedding_id, status, created_at desc);
alter table public.guest_blessings enable row level security;
revoke all on table public.guest_blessings from anon, authenticated;
grant select on table public.guest_blessings to authenticated;
grant update (status, approved_at) on table public.guest_blessings to authenticated;
create policy guest_blessings_read on public.guest_blessings for select to authenticated using ((select private.has_module_access(wedding_id, 'guests', 'read')));
create policy guest_blessings_moderate on public.guest_blessings for update to authenticated
  using ((select private.has_module_access(wedding_id, 'guests', 'edit'))) with check ((select private.has_module_access(wedding_id, 'guests', 'edit')));
create trigger guest_blessings_stamp_moderator before insert or update on public.guest_blessings
  for each row execute function private.stamp_actor('moderated_by_user_id', 'always');

create function public.submit_guest_portal_blessing(p_session_digest text, p_message text, p_submission_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_link public.guest_portal_links%rowtype; v_enabled boolean;
begin
  if p_session_digest !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','unavailable'); end if;
  select l.* into v_link from public.guest_portal_sessions s join public.guest_portal_links l on l.wedding_id=s.wedding_id and l.id=s.link_id
    where s.session_digest=p_session_digest and s.expires_at>now() and l.guest_id is not null and l.revoked_at is null and l.expires_at>now();
  if not found then return jsonb_build_object('status','unavailable'); end if;
  select coalesce((site->>'blessings_enabled')::boolean,false) into v_enabled from public.invitation_designs where wedding_id=v_link.wedding_id and is_default;
  if not coalesce(v_enabled,false) then return jsonb_build_object('status','unavailable'); end if;
  if p_submission_key is null or p_message is null or char_length(trim(p_message)) not between 1 and 500 then return jsonb_build_object('status','invalid'); end if;
  if exists (select 1 from public.guest_blessings where wedding_id=v_link.wedding_id and submission_key=p_submission_key) then return jsonb_build_object('status','duplicate'); end if;
  if (select count(*) from public.guest_blessings where wedding_id=v_link.wedding_id and guest_id=v_link.guest_id) >= 5 then return jsonb_build_object('status','limit'); end if;
  insert into public.guest_blessings(wedding_id,guest_id,message,submission_key) values(v_link.wedding_id,v_link.guest_id,trim(p_message),p_submission_key);
  return jsonb_build_object('status','saved');
end $$;
revoke all on function public.submit_guest_portal_blessing(text,text,uuid) from public, authenticated;
grant execute on function public.submit_guest_portal_blessing(text,text,uuid) to anon;

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
    -- Invitation website content (validated when saved) and approved blessings only.
    'site',case when v_design.id is null then null else coalesce(v_design.site,'{}'::jsonb) end,
    'blessings',case when coalesce((v_design.site->>'blessings_enabled')::boolean,false) then coalesce((select jsonb_agg(jsonb_build_object('name',split_part(g.full_name,' ',1),'message',b.message,'created_at',b.approved_at) order by b.approved_at desc)
      from (select * from public.guest_blessings b where b.wedding_id=v_link.wedding_id and b.status='approved' order by b.approved_at desc limit 60) b join public.guests g on g.wedding_id=b.wedding_id and g.id=b.guest_id),'[]'::jsonb) else '[]'::jsonb end,
    'my_pending_blessings',(select count(*) from public.guest_blessings b where b.wedding_id=v_link.wedding_id and b.guest_id=v_link.guest_id and b.status='pending'),
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

revoke all on function public.get_guest_portal_data(text) from public, authenticated;
grant execute on function public.get_guest_portal_data(text) to anon;
