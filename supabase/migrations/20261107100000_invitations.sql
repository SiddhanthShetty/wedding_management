-- Personalised invitations (share-assisted, no messaging provider).
--
-- Data impact: additive. New invitation_designs table, a preferred_language column on
-- guest_households (default 'en', so existing households read English), one RPC to set it,
-- and get_guest_portal_data replaced to add the household language and the default design.
-- No raw portal link is stored anywhere; invitations are shared from the planner's own device.

alter table public.guest_households add column preferred_language text not null default 'en'
  check (preferred_language in ('en','hi','kn','tcy'));

create table public.invitation_designs (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  theme text not null check (theme in ('mallige','veena','kolam','thoranam','yakshagana','kanchi')),
  accent text check (accent is null or accent ~ '^#[0-9a-fA-F]{6}$'),
  -- Per-language overrides of the built-in wording: {"en": {"heading": "...", ...}, "kn": {...}}.
  texts jsonb not null default '{}'::jsonb check (jsonb_typeof(texts) = 'object' and pg_column_size(texts) < 32000),
  is_default boolean not null default false,
  version integer not null default 1,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  unique (wedding_id, name),
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, updated_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);
create unique index invitation_designs_one_default on public.invitation_designs(wedding_id) where is_default;
create trigger invitation_designs_version before update on public.invitation_designs for each row execute function private.comms_touch_version();
create trigger invitation_designs_stamp_created_by_user_id before insert or update on public.invitation_designs for each row execute function private.stamp_actor('created_by_user_id', 'creator');
create trigger invitation_designs_stamp_updated_by_user_id before insert or update on public.invitation_designs for each row execute function private.stamp_actor('updated_by_user_id', 'always');

alter table public.invitation_designs enable row level security;
revoke all on table public.invitation_designs from anon, authenticated;
grant select, insert on table public.invitation_designs to authenticated;
grant update (name, theme, accent, texts) on table public.invitation_designs to authenticated;
create policy invitation_designs_read on public.invitation_designs for select to authenticated using ((select private.has_module_access(wedding_id, 'guests', 'read')));
create policy invitation_designs_insert on public.invitation_designs for insert to authenticated with check ((select private.has_module_access(wedding_id, 'guests', 'edit')));
create policy invitation_designs_update on public.invitation_designs for update to authenticated
  using ((select private.has_module_access(wedding_id, 'guests', 'edit'))) with check ((select private.has_module_access(wedding_id, 'guests', 'edit')));

-- Choosing the design guests see is a separate, explicit step.
create function public.set_default_invitation_design(p_wedding_id uuid, p_design_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.has_module_access(p_wedding_id, 'guests', 'edit') then raise exception 'Guest edit permission required.' using errcode = '42501'; end if;
  if not exists (select 1 from public.invitation_designs where wedding_id = p_wedding_id and id = p_design_id) then raise exception 'Design not found.' using errcode = '23503'; end if;
  update public.invitation_designs set is_default = false where wedding_id = p_wedding_id and is_default and id <> p_design_id;
  update public.invitation_designs set is_default = true where wedding_id = p_wedding_id and id = p_design_id;
end $$;

create function public.set_household_language(p_wedding_id uuid, p_household_id uuid, p_language text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.has_module_access(p_wedding_id, 'guests', 'edit') then raise exception 'Guest edit permission required.' using errcode = '42501'; end if;
  update public.guest_households set preferred_language = p_language, updated_at = now() where wedding_id = p_wedding_id and id = p_household_id;
  if not found then raise exception 'Household not found in this wedding.' using errcode = '23503'; end if;
end $$;

revoke all on function public.set_default_invitation_design(uuid, uuid), public.set_household_language(uuid, uuid, text) from public, anon;
grant execute on function public.set_default_invitation_design(uuid, uuid), public.set_household_language(uuid, uuid, text) to authenticated;

-- Guest portal: add the household's language and the wedding's chosen design (theme, accent,
-- and that language's wording overrides only). Everything else is unchanged.
create or replace function public.get_guest_portal_data(p_session_digest text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_link public.guest_portal_links%rowtype; v_household public.guest_households%rowtype; v_wedding public.weddings%rowtype; v_design public.invitation_designs%rowtype; v_data jsonb;
begin
  if p_session_digest !~ '^[a-f0-9]{64}$' then return null; end if;
  select l.* into v_link from public.guest_portal_sessions s join public.guest_portal_links l on l.wedding_id=s.wedding_id and l.id=s.link_id
  where s.session_digest=p_session_digest and s.expires_at>now() and l.revoked_at is null and l.expires_at>now();
  if not found then return null; end if;
  update public.guest_portal_sessions set last_used_at=now() where session_digest=p_session_digest;
  select * into v_household from public.guest_households where wedding_id=v_link.wedding_id and id=v_link.household_id;
  select * into v_wedding from public.weddings where id=v_link.wedding_id;
  select * into v_design from public.invitation_designs where wedding_id=v_link.wedding_id and is_default;
  select jsonb_build_object(
    'household',jsonb_build_object('name',v_household.name,'language',v_household.preferred_language),
    'invitation',case when v_design.id is null then null else jsonb_build_object('theme',v_design.theme,'accent',v_design.accent,'texts',coalesce(v_design.texts->v_household.preferred_language,'{}'::jsonb)) end,
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
