-- Couple photo and monogram on the invitation card.
--
-- Data impact: additive. invitation_designs gets photo_data (a small, already-compressed JPEG or
-- WebP stored as a data URL, at most ~330 KB of image) and show_monogram (default true). A portal
-- RPC returns the photo to a valid guest session only; get_guest_portal_data is replaced to add
-- has_photo and show_monogram. No existing rows change.
--
-- Why in the database rather than Storage: guests use the anonymous portal, and Storage access is
-- limited to signed-in members. Keeping one small image on the design avoids any admin key.

alter table public.invitation_designs
  add column photo_data text check (photo_data is null or (photo_data ~ '^data:image/(jpeg|webp);base64,[A-Za-z0-9+/]+=*$' and char_length(photo_data) <= 450000)),
  add column show_monogram boolean not null default true;
grant update (photo_data, show_monogram) on table public.invitation_designs to authenticated;

create function public.get_guest_portal_photo(p_session_digest text)
returns text language plpgsql stable security definer set search_path='' as $$
declare v_wedding uuid;
begin
  if p_session_digest !~ '^[a-f0-9]{64}$' then return null; end if;
  select l.wedding_id into v_wedding from public.guest_portal_sessions s join public.guest_portal_links l on l.wedding_id=s.wedding_id and l.id=s.link_id
    where s.session_digest=p_session_digest and s.expires_at>now() and l.guest_id is not null and l.revoked_at is null and l.expires_at>now();
  if not found then return null; end if;
  return (select photo_data from public.invitation_designs where wedding_id=v_wedding and is_default);
end $$;
revoke all on function public.get_guest_portal_photo(text) from public, authenticated;
grant execute on function public.get_guest_portal_photo(text) to anon;

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
    'invitation',case when v_design.id is null then null else jsonb_build_object('theme',v_design.theme,'accent',v_design.accent,'texts',coalesce(v_design.texts->v_household.preferred_language,'{}'::jsonb),'has_photo',v_design.photo_data is not null,'show_monogram',v_design.show_monogram) end,
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
