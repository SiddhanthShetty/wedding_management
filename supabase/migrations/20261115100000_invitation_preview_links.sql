-- Family preview links for an invitation design.
--
-- Data impact: additive. A new invitation_preview_links table and two functions. No existing rows
-- change. Rows are short-lived (30 minutes); expired rows for a wedding are removed whenever a
-- new preview link is created for it.
--
-- Rules
-- * Only guest-list editors (and owners) can create a preview link, for a design of their wedding.
-- * The token is never stored: only its keyed digest, like guest links.
-- * A preview shows the design, its website content and the wedding's functions (the details
--   guests see). It contains no guest data, and replies cannot be made through it.
-- * The table itself is not readable by anyone through the API; only the functions below use it.

create table public.invitation_preview_links (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  design_id uuid not null,
  token_digest text not null unique check (token_digest ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (wedding_id, design_id) references public.invitation_designs(wedding_id, id) on delete cascade
);
create index invitation_preview_links_wedding_idx on public.invitation_preview_links (wedding_id, expires_at);
alter table public.invitation_preview_links enable row level security;
revoke all on table public.invitation_preview_links from public, anon, authenticated;

create function public.create_invitation_preview_link(p_wedding_id uuid, p_design_id uuid, p_token_digest text)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_expires timestamptz := now() + interval '30 minutes';
begin
  if auth.uid() is null or not private.has_module_access(p_wedding_id, 'guests'::public.wedding_module, 'edit'::public.module_access_level) then
    raise exception 'Guest-list edit access is needed to create a preview link.' using errcode = '42501';
  end if;
  if p_token_digest is null or p_token_digest !~ '^[a-f0-9]{64}$' then raise exception 'Invalid preview link.' using errcode = '22023'; end if;
  if not exists (select 1 from public.invitation_designs where wedding_id = p_wedding_id and id = p_design_id) then
    raise exception 'This design no longer exists.' using errcode = 'P0002';
  end if;
  delete from public.invitation_preview_links where wedding_id = p_wedding_id and expires_at <= now();
  if (select count(*) from public.invitation_preview_links where wedding_id = p_wedding_id) >= 20 then
    raise exception 'Too many preview links are open. Try again in 30 minutes.' using errcode = '23514';
  end if;
  insert into public.invitation_preview_links (wedding_id, design_id, token_digest, expires_at, created_by_user_id)
  values (p_wedding_id, p_design_id, p_token_digest, v_expires, auth.uid());
  return v_expires;
end $$;
revoke all on function public.create_invitation_preview_link(uuid, uuid, text) from public, anon;
grant execute on function public.create_invitation_preview_link(uuid, uuid, text) to authenticated;

create function public.get_invitation_preview(p_token_digest text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_link public.invitation_preview_links%rowtype; v_design public.invitation_designs%rowtype; v_wedding public.weddings%rowtype;
begin
  if p_token_digest is null or p_token_digest !~ '^[a-f0-9]{64}$' then return null; end if;
  select * into v_link from public.invitation_preview_links where token_digest = p_token_digest and expires_at > now();
  if not found then return null; end if;
  select * into v_design from public.invitation_designs where wedding_id = v_link.wedding_id and id = v_link.design_id;
  if not found then return null; end if;
  select * into v_wedding from public.weddings where id = v_link.wedding_id;
  return jsonb_build_object(
    'expires_at', v_link.expires_at,
    'couple_names', array_remove(array[v_wedding.partner_one_display_name, v_wedding.partner_two_display_name], ''),
    'design', jsonb_build_object('theme', v_design.theme, 'accent', v_design.accent, 'texts', v_design.texts, 'site', v_design.site,
      'photo_data', v_design.photo_data, 'show_monogram', v_design.show_monogram),
    'functions', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'type', f.function_type, 'date', f.function_date,
        'start_time', f.start_time, 'end_time', f.end_time, 'timezone', v_wedding.timezone, 'location', f.venue_name, 'map_url', f.guest_map_url,
        'dress_code', f.dress_code, 'status', f.status::text) order by f.function_date, f.start_time)
      from public.functions f where f.wedding_id = v_link.wedding_id and f.archived_at is null and f.status <> 'cancelled'), '[]'::jsonb)
  );
end $$;
revoke all on function public.get_invitation_preview(text) from public, authenticated;
grant execute on function public.get_invitation_preview(text) to anon;
