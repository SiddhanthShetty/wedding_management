-- Simple guest desk (Phase 1): add many families at once, one link per family, placeholder names.
--
-- Data impact: additive only.
-- * guests.is_placeholder (boolean, default false). Every existing person stays false, so nothing
--   about existing guests changes. It becomes false again as soon as the name is changed by anyone.
-- * New functions: create_guest_families_bulk, set_guest_household_invited,
--   get_guest_portal_placeholders, rename_guest_portal_placeholder.
-- No existing function, link, reply, history row or message record is changed or removed.
-- Existing links keep working exactly as before.

alter table public.guests add column is_placeholder boolean not null default false;

-- Any change of name (by a planner on the Guests page, or by the family on their page) means the
-- person now has a real name.
create function private.clear_guest_placeholder_on_rename() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.full_name is distinct from old.full_name then new.is_placeholder:=false; end if;
  return new;
end $$;
revoke all on function private.clear_guest_placeholder_on_rename() from public,anon,authenticated;
create trigger guests_clear_placeholder_on_rename
before update of full_name on public.guests
for each row execute function private.clear_guest_placeholder_on_rename();

-- How two family names are compared: ignoring case, surrounding spaces and repeated spaces.
create function private.family_name_key(p_name text) returns text
language sql immutable set search_path='' as $$
  select pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_name,'')),'\s+',' ','g'))
$$;
revoke all on function private.family_name_key(text) from public,anon,authenticated;

/*
 * Adds families in one transaction: households, people (the lead is named after the family, the
 * rest are "<family> guest N" placeholders), invitations to the chosen functions, and the lead's
 * private link with proxy access to everyone else in the family.
 *
 * p_families: [{ "name": text, "phone": text, "size": 1..20, "token_digest": 64 hex }]
 * Returns { status: "invalid", errors: [{ index, code: "exists"|"repeat" }] } and writes nothing
 * when a family name is already used; { status: "saved", families: [...] } otherwise.
 * Any other problem raises, so nothing is saved.
 */
create function public.create_guest_families_bulk(p_wedding_id uuid,p_families jsonb,p_function_ids uuid[],p_family_side text,p_language text,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=(select auth.uid()); v_item jsonb; v_index integer:=0; v_errors jsonb:='[]'::jsonb; v_seen text[]:='{}';
  v_key text; v_name text; v_phone text; v_size integer; v_household uuid; v_lead uuid; v_guest uuid; v_link uuid;
  v_function uuid; v_people uuid[]; v_n integer; v_out jsonb:='[]'::jsonb;
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then
    raise exception 'Guest edit permission required.' using errcode='42501';
  end if;
  if p_families is null or jsonb_typeof(p_families)<>'array' or jsonb_array_length(p_families) not between 1 and 100 then raise exception 'Add between 1 and 100 families at a time.'; end if;
  if coalesce(cardinality(p_function_ids),0) not between 1 and 50 or cardinality(p_function_ids)<>(select count(distinct x) from unnest(p_function_ids) x) then raise exception 'Choose at least one function.'; end if;
  if p_family_side not in ('couple_one','couple_two','shared','unknown') then raise exception 'Invalid household family side.'; end if;
  if p_language not in ('en','hi','kn','tcy') then raise exception 'Invalid language.'; end if;
  if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '31 days' then raise exception 'Invalid private link expiry.'; end if;
  foreach v_function in array p_function_ids loop
    if not exists(select 1 from public.functions where wedding_id=p_wedding_id and id=v_function and archived_at is null and status<>'cancelled') then
      raise exception 'Choose functions that are still on.';
    end if;
  end loop;

  -- Two pastes at the same moment must not both add the same family.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('guest-families:'||p_wedding_id::text,0));

  for v_item in select value from jsonb_array_elements(p_families) loop
    if jsonb_typeof(v_item)<>'object' or jsonb_typeof(v_item->'name')<>'string' or jsonb_typeof(v_item->'phone')<>'string'
      or jsonb_typeof(v_item->'size')<>'number' or jsonb_typeof(v_item->'token_digest')<>'string' then raise exception 'Invalid family row.'; end if;
    v_name:=pg_catalog.regexp_replace(pg_catalog.btrim(v_item->>'name'),'\s+',' ','g');
    if char_length(v_name) not between 1 and 120 or char_length(v_item->>'phone')>40 or (v_item->>'token_digest') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid family row.'; end if;
    begin v_size:=(v_item->>'size')::integer; exception when others then raise exception 'Invalid family row.'; end;
    if v_size not between 1 and 20 or (v_item->>'size')::numeric<>v_size then raise exception 'Invalid family row.'; end if;
    v_key:=private.family_name_key(v_name);
    if v_key=any(v_seen) then v_errors:=v_errors||jsonb_build_object('index',v_index,'code','repeat');
    elsif exists(select 1 from public.guest_households h where h.wedding_id=p_wedding_id and private.family_name_key(h.name)=v_key) then v_errors:=v_errors||jsonb_build_object('index',v_index,'code','exists');
    end if;
    v_seen:=v_seen||v_key; v_index:=v_index+1;
  end loop;
  if (select count(distinct value->>'token_digest') from jsonb_array_elements(p_families))<>jsonb_array_length(p_families) then raise exception 'Invalid family row.'; end if;
  if jsonb_array_length(v_errors)>0 then return jsonb_build_object('status','invalid','errors',v_errors); end if;

  v_index:=0;
  for v_item in select value from jsonb_array_elements(p_families) loop
    v_name:=pg_catalog.regexp_replace(pg_catalog.btrim(v_item->>'name'),'\s+',' ','g');
    v_phone:=pg_catalog.btrim(v_item->>'phone'); v_size:=(v_item->>'size')::integer;
    insert into public.guest_households(wedding_id,name,contact_name,contact_phone,family_side,preferred_language,created_by_user_id)
    values(p_wedding_id,v_name,v_name,v_phone,p_family_side,p_language,v_user) returning id into v_household;
    v_people:='{}';
    for v_n in 1..v_size loop
      insert into public.guests(wedding_id,household_id,full_name,phone,family_side,is_placeholder,created_by_user_id)
      values(p_wedding_id,v_household,case when v_n=1 then v_name else v_name||' guest '||v_n end,case when v_n=1 then v_phone else '' end,p_family_side,true,v_user)
      returning id into v_guest;
      v_people:=v_people||v_guest;
      foreach v_function in array p_function_ids loop
        insert into public.guest_invitations(wedding_id,function_id,guest_id,invitation_kind,status,plus_one_allowed,invited_by_user_id)
        values(p_wedding_id,v_function,v_guest,'standard','invited',false,v_user);
      end loop;
    end loop;
    v_lead:=v_people[1];
    insert into public.guest_portal_links(wedding_id,household_id,guest_id,token_digest,expires_at,created_by_user_id)
    values(p_wedding_id,v_household,v_lead,v_item->>'token_digest',p_expires_at,v_user) returning id into v_link;
    insert into public.guest_portal_link_proxies(wedding_id,link_id,guest_id,authorized_by_user_id)
    select p_wedding_id,v_link,x,v_user from unnest(v_people[2:]) x;
    v_out:=v_out||jsonb_build_object('index',v_index,'household_id',v_household,'lead_guest_id',v_lead,'link_id',v_link,'people',v_size);
    v_index:=v_index+1;
  end loop;
  return jsonb_build_object('status','saved','families',v_out);
end $$;

/*
 * "Remove from list" and "Put back". Removing withdraws every invitation of the household's people
 * and cancels their private links; the people, their replies and reply history are kept.
 * Putting back re-invites them to the withdrawn functions that are still on. New links are made
 * from the desk when inviting again.
 */
create function public.set_guest_household_invited(p_wedding_id uuid,p_household_id uuid,p_invited boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_count integer;
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then
    raise exception 'Guest edit permission required.' using errcode='42501';
  end if;
  perform 1 from public.guest_households where wedding_id=p_wedding_id and id=p_household_id for update;
  if not found then raise exception 'Household not found in this wedding.' using errcode='23503'; end if;
  if p_invited then
    update public.guest_invitations i set status='invited',invited_by_user_id=v_user
    from public.guests g, public.functions f
    where i.wedding_id=p_wedding_id and g.wedding_id=i.wedding_id and g.id=i.guest_id and g.household_id=p_household_id
      and f.wedding_id=i.wedding_id and f.id=i.function_id and f.archived_at is null and f.status<>'cancelled' and i.status='withdrawn'
      and (i.invitation_kind='standard' or exists(select 1 from public.guest_invitations p where p.wedding_id=i.wedding_id and p.guest_id=i.plus_one_for_guest_id and p.function_id=i.function_id and p.status='invited'));
    get diagnostics v_count=row_count;
  else
    update public.guest_invitations i set status='withdrawn',invited_by_user_id=v_user
    from public.guests g
    where i.wedding_id=p_wedding_id and g.wedding_id=i.wedding_id and g.id=i.guest_id and g.household_id=p_household_id and i.status='invited';
    get diagnostics v_count=row_count;
    update public.guest_portal_links set revoked_at=now() where wedding_id=p_wedding_id and household_id=p_household_id and revoked_at is null;
  end if;
  return v_count;
end $$;

-- Which of the people this guest link may answer for still have a placeholder name.
create function public.get_guest_portal_placeholders(p_session_digest text)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare v_link public.guest_portal_links%rowtype;
begin
  if p_session_digest !~ '^[a-f0-9]{64}$' then return '{}'; end if;
  select l.* into v_link from public.guest_portal_sessions s join public.guest_portal_links l on l.wedding_id=s.wedding_id and l.id=s.link_id
  where s.session_digest=p_session_digest and s.expires_at>now() and l.guest_id is not null and l.revoked_at is null and l.expires_at>now();
  if not found then return '{}'; end if;
  return coalesce((select array_agg(g.id order by g.full_name) from public.guests g where g.wedding_id=v_link.wedding_id and g.is_placeholder
    and (g.id=v_link.guest_id or exists(select 1 from public.guest_portal_link_proxies p where p.wedding_id=v_link.wedding_id and p.link_id=v_link.id and p.guest_id=g.id))),'{}');
end $$;

/*
 * The family names a placeholder person from their invitation page. Allowed only for people the
 * link may answer for, only while the person is still a placeholder (so once), and recorded in
 * the profile-edit history with the old and new name.
 */
create function public.rename_guest_portal_placeholder(p_session_digest text,p_guest_id uuid,p_full_name text,p_submission_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_link public.guest_portal_links%rowtype; v_guest public.guests%rowtype; v_name text;
begin
  if p_session_digest !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','unavailable'); end if;
  select l.* into v_link from public.guest_portal_sessions s join public.guest_portal_links l on l.wedding_id=s.wedding_id and l.id=s.link_id
  where s.session_digest=p_session_digest and s.expires_at>now() and l.guest_id is not null and l.revoked_at is null and l.expires_at>now();
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if p_submission_key is null then return jsonb_build_object('status','invalid'); end if;
  if exists(select 1 from public.guest_profile_edit_history where submission_key=p_submission_key and portal_link_id=v_link.id) then return jsonb_build_object('status','duplicate'); end if;
  v_name:=pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_full_name,'')),'\s+',' ','g');
  if char_length(v_name) not between 1 and 120 then return jsonb_build_object('status','invalid'); end if;
  select * into v_guest from public.guests g where g.wedding_id=v_link.wedding_id and g.id=p_guest_id
    and (g.id=v_link.guest_id or exists(select 1 from public.guest_portal_link_proxies p where p.wedding_id=v_link.wedding_id and p.link_id=v_link.id and p.guest_id=g.id))
    for update;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if not v_guest.is_placeholder then return jsonb_build_object('status','conflict'); end if;
  update public.guests set full_name=v_name where wedding_id=v_link.wedding_id and id=p_guest_id;
  insert into public.guest_profile_edit_history(wedding_id,guest_id,source,portal_link_id,submission_key,old_values,new_values,portal_actor_guest_id)
  values(v_link.wedding_id,p_guest_id,'guest_portal',v_link.id,p_submission_key,jsonb_build_object('full_name',v_guest.full_name),jsonb_build_object('full_name',v_name),v_link.guest_id);
  return jsonb_build_object('status','saved');
end $$;

revoke all on function public.create_guest_families_bulk(uuid,jsonb,uuid[],text,text,timestamptz),public.set_guest_household_invited(uuid,uuid,boolean) from public,anon;
grant execute on function public.create_guest_families_bulk(uuid,jsonb,uuid[],text,text,timestamptz),public.set_guest_household_invited(uuid,uuid,boolean) to authenticated;
revoke all on function public.get_guest_portal_placeholders(text),public.rename_guest_portal_placeholder(text,uuid,text,uuid) from public,authenticated;
grant execute on function public.get_guest_portal_placeholders(text),public.rename_guest_portal_placeholder(text,uuid,text,uuid) to anon;
