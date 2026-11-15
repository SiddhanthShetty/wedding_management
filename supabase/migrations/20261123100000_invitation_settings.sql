-- Invitation wording edited in the app (Guests → Invitation), with a draft and Publish.
-- Additive: two new tables, five functions, and get_family_invitation also returns the published
-- wording ("settings"). No existing row changes. Until the couple first publishes, settings is null
-- and family links keep using the wording in src/config/invitation.ts.
--
-- Who can edit: owners and co-owners only (the couple, and anyone they make a co-owner). Anyone
-- who can read the guest list can see the draft and history, read only. Writes go through the
-- functions below; there are no direct table writes. The wording itself is checked by the app;
-- here each version must be a JSON object of at most 64 KB.

create function private.can_edit_invitation(p_wedding_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_membership_role(p_wedding_id) in ('owner', 'co_owner'), false);
$$;
revoke all on function private.can_edit_invitation(uuid) from public, anon;
grant execute on function private.can_edit_invitation(uuid) to authenticated;

create table public.invitation_settings (
  wedding_id uuid primary key references public.weddings(id) on delete cascade,
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and pg_column_size(draft) <= 65536),
  draft_updated_at timestamptz not null default now(),
  draft_updated_by uuid not null,
  published jsonb check (published is null or (jsonb_typeof(published) = 'object' and pg_column_size(published) <= 65536)),
  published_version integer not null default 0 check (published_version >= 0),
  published_at timestamptz,
  published_by uuid
);

create table public.invitation_settings_history (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  version integer not null check (version >= 1),
  settings jsonb not null check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 65536),
  published_at timestamptz not null default now(),
  published_by uuid not null,
  primary key (wedding_id, version)
);

alter table public.invitation_settings enable row level security;
alter table public.invitation_settings_history enable row level security;
revoke all on table public.invitation_settings, public.invitation_settings_history from anon, authenticated;
grant select on table public.invitation_settings, public.invitation_settings_history to authenticated;
create policy invitation_settings_select on public.invitation_settings for select to authenticated
  using ((select private.has_module_access(wedding_id, 'guests', 'read')));
create policy invitation_settings_history_select on public.invitation_settings_history for select to authenticated
  using ((select private.has_module_access(wedding_id, 'guests', 'read')));

create function private.require_invitation_editor(p_wedding_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_edit_invitation(p_wedding_id) then
    raise exception 'Only the couple (owners and co-owners) can edit the invitation.' using errcode = '42501';
  end if;
end $$;
revoke all on function private.require_invitation_editor(uuid) from public, anon, authenticated;

-- p_base: the draft_updated_at the editor started from (null when there's no draft yet). If someone
-- else saved since, nothing is saved and the editor is asked to reload.
create function public.save_invitation_draft(p_wedding_id uuid, p_draft jsonb, p_base timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_current timestamptz; v_now timestamptz := clock_timestamp();
begin
  perform private.require_invitation_editor(p_wedding_id);
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then raise exception 'The wording must be a JSON object.' using errcode = '22023'; end if;
  select draft_updated_at into v_current from public.invitation_settings where wedding_id = p_wedding_id for update;
  if found then
    if p_base is distinct from v_current then raise exception 'The draft was changed by someone else. Reload to see their changes.' using errcode = '40001'; end if;
    update public.invitation_settings set draft = p_draft, draft_updated_at = v_now, draft_updated_by = auth.uid() where wedding_id = p_wedding_id;
  else
    if p_base is not null then raise exception 'The draft was changed by someone else. Reload to see their changes.' using errcode = '40001'; end if;
    insert into public.invitation_settings (wedding_id, draft, draft_updated_at, draft_updated_by) values (p_wedding_id, p_draft, v_now, auth.uid());
  end if;
  return v_now;
end $$;

-- Families see the draft from now on; it's kept in the history as the next version.
create function public.publish_invitation(p_wedding_id uuid, p_base timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_row public.invitation_settings%rowtype; v_version integer;
begin
  perform private.require_invitation_editor(p_wedding_id);
  select * into v_row from public.invitation_settings where wedding_id = p_wedding_id for update;
  if not found then raise exception 'There is no draft to publish.' using errcode = '22023'; end if;
  if p_base is distinct from v_row.draft_updated_at then raise exception 'The draft was changed by someone else. Reload to see their changes.' using errcode = '40001'; end if;
  v_version := v_row.published_version + 1;
  update public.invitation_settings set published = v_row.draft, published_version = v_version, published_at = clock_timestamp(), published_by = auth.uid() where wedding_id = p_wedding_id;
  insert into public.invitation_settings_history (wedding_id, version, settings, published_at, published_by) values (p_wedding_id, v_version, v_row.draft, clock_timestamp(), auth.uid());
  return v_version;
end $$;

-- Back to what families see now (or to the original wording if nothing was ever published).
create function public.discard_invitation_draft(p_wedding_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row public.invitation_settings%rowtype;
begin
  perform private.require_invitation_editor(p_wedding_id);
  select * into v_row from public.invitation_settings where wedding_id = p_wedding_id for update;
  if not found then return; end if;
  if v_row.published is null then
    delete from public.invitation_settings where wedding_id = p_wedding_id;
  else
    update public.invitation_settings set draft = v_row.published, draft_updated_at = clock_timestamp(), draft_updated_by = auth.uid() where wedding_id = p_wedding_id;
  end if;
end $$;

-- Copies an earlier published version into the draft, to check and publish again.
create function public.restore_invitation_version(p_wedding_id uuid, p_version integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_settings jsonb; v_now timestamptz := clock_timestamp();
begin
  perform private.require_invitation_editor(p_wedding_id);
  select settings into v_settings from public.invitation_settings_history where wedding_id = p_wedding_id and version = p_version;
  if not found then raise exception 'That version no longer exists.' using errcode = '22023'; end if;
  update public.invitation_settings set draft = v_settings, draft_updated_at = v_now, draft_updated_by = auth.uid() where wedding_id = p_wedding_id;
  return v_now;
end $$;

revoke all on function public.save_invitation_draft(uuid, jsonb, timestamptz), public.publish_invitation(uuid, timestamptz),
  public.discard_invitation_draft(uuid), public.restore_invitation_version(uuid, integer) from public, anon;
grant execute on function public.save_invitation_draft(uuid, jsonb, timestamptz), public.publish_invitation(uuid, timestamptz),
  public.discard_invitation_draft(uuid), public.restore_invitation_version(uuid, integer) to authenticated;

-- The family link also gets the published wording (never the draft). Same as before otherwise.
create or replace function public.get_family_invitation(p_code text)
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
      from public.family_replies r where r.wedding_id=v_household.wedding_id and r.household_id=v_household.id),
    'settings',(select s.published from public.invitation_settings s where s.wedding_id=v_household.wedding_id)
  );
end $$;
