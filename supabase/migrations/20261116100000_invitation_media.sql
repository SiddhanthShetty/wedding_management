-- Invitation music and photo gallery.
--
-- Data impact: additive. A new invitation_media table and five functions. No existing rows change.
-- Each design can have one music file (at most 1.5 MB) and up to 8 gallery photos (each at most
-- ~450 KB, already resized on the planner's device). Files are stored base64-encoded in the row,
-- like the couple photo, because invited guests use the anonymous portal and cannot read Storage.
--
-- Rules
-- * Guest-list readers can see the media of their wedding; guest-list editors can add, caption,
--   reorder and remove it. Deleting a design deletes its media.
-- * Guests reach media only through their own valid session, and only for the design guests see.
-- * Family previews reach media only through a valid, unexpired preview link, for that link's design.

create table public.invitation_media (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  design_id uuid not null,
  kind text not null check (kind in ('music', 'gallery')),
  position smallint not null default 0 check (position between 0 and 7),
  mime text not null check (mime in ('image/jpeg', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/ogg')),
  data text not null check (data ~ '^[A-Za-z0-9+/]+=*$' and char_length(data) <= 2100000),
  byte_size integer not null check (byte_size > 0),
  caption text not null default '' check (char_length(caption) <= 80),
  created_by_user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (wedding_id, design_id) references public.invitation_designs(wedding_id, id) on delete cascade,
  unique (wedding_id, design_id, kind, position),
  check ((kind = 'music' and mime like 'audio/%' and position = 0 and byte_size <= 1572864)
      or (kind = 'gallery' and mime like 'image/%' and byte_size <= 460000))
);
alter table public.invitation_media enable row level security;
revoke all on table public.invitation_media from public, anon, authenticated;
grant select, insert, delete on table public.invitation_media to authenticated;
grant update (caption, position) on table public.invitation_media to authenticated;
create policy invitation_media_read on public.invitation_media for select to authenticated
  using ((select private.has_module_access(wedding_id, 'guests'::public.wedding_module, 'read'::public.module_access_level)));
create policy invitation_media_insert on public.invitation_media for insert to authenticated
  with check ((select private.has_module_access(wedding_id, 'guests'::public.wedding_module, 'edit'::public.module_access_level)) and created_by_user_id = (select auth.uid()));
create policy invitation_media_update on public.invitation_media for update to authenticated
  using ((select private.has_module_access(wedding_id, 'guests'::public.wedding_module, 'edit'::public.module_access_level)))
  with check ((select private.has_module_access(wedding_id, 'guests'::public.wedding_module, 'edit'::public.module_access_level)));
create policy invitation_media_delete on public.invitation_media for delete to authenticated
  using ((select private.has_module_access(wedding_id, 'guests'::public.wedding_module, 'edit'::public.module_access_level)));

-- The design a valid guest session sees (the wedding's default design), or null.
create function private.portal_session_design(p_session_digest text)
returns uuid language sql stable security definer set search_path='' as $$
  select d.id from public.guest_portal_sessions s
    join public.guest_portal_links l on l.wedding_id = s.wedding_id and l.id = s.link_id
    join public.invitation_designs d on d.wedding_id = l.wedding_id and d.is_default
  where p_session_digest ~ '^[a-f0-9]{64}$' and s.session_digest = p_session_digest and s.expires_at > now()
    and l.guest_id is not null and l.revoked_at is null and l.expires_at > now()
$$;
revoke all on function private.portal_session_design(text) from public, anon, authenticated;

-- The design of a valid family preview link, or null.
create function private.preview_link_design(p_token_digest text)
returns uuid language sql stable security definer set search_path='' as $$
  select design_id from public.invitation_preview_links
  where p_token_digest ~ '^[a-f0-9]{64}$' and token_digest = p_token_digest and expires_at > now()
$$;
revoke all on function private.preview_link_design(text) from public, anon, authenticated;

create function private.media_listing(p_design_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'music', (select id from public.invitation_media where design_id = p_design_id and kind = 'music'),
    'gallery', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'caption', caption) order by position)
      from public.invitation_media where design_id = p_design_id and kind = 'gallery'), '[]'::jsonb))
$$;
revoke all on function private.media_listing(uuid) from public, anon, authenticated;

create function public.list_guest_portal_media(p_session_digest text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_design uuid := private.portal_session_design(p_session_digest);
begin
  if v_design is null then return null; end if;
  return private.media_listing(v_design);
end $$;

create function public.get_guest_portal_media(p_session_digest text, p_media_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_design uuid := private.portal_session_design(p_session_digest);
begin
  if v_design is null then return null; end if;
  return (select jsonb_build_object('mime', mime, 'data', data) from public.invitation_media where id = p_media_id and design_id = v_design);
end $$;

create function public.list_invitation_preview_media(p_token_digest text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_design uuid := private.preview_link_design(p_token_digest);
begin
  if v_design is null then return null; end if;
  return private.media_listing(v_design);
end $$;

create function public.get_invitation_preview_media(p_token_digest text, p_media_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_design uuid := private.preview_link_design(p_token_digest);
begin
  if v_design is null then return null; end if;
  return (select jsonb_build_object('mime', mime, 'data', data) from public.invitation_media where id = p_media_id and design_id = v_design);
end $$;

revoke all on function public.list_guest_portal_media(text) from public, authenticated;
revoke all on function public.get_guest_portal_media(text, uuid) from public, authenticated;
revoke all on function public.list_invitation_preview_media(text) from public, authenticated;
revoke all on function public.get_invitation_preview_media(text, uuid) from public, authenticated;
grant execute on function public.list_guest_portal_media(text) to anon;
grant execute on function public.get_guest_portal_media(text, uuid) to anon;
grant execute on function public.list_invitation_preview_media(text) to anon;
grant execute on function public.get_invitation_preview_media(text, uuid) to anon;
