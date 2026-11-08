-- "Use your own artwork": one finished invitation image per design (from a designer, Canva or an
-- invitation studio), shown in place of the drawn card, optionally with each guest's name on it.
--
-- Data impact: additive. invitation_media accepts a third kind, 'artwork' (one per design, JPEG or
-- WebP, at most 1.3 MB). The media listing used by the guest page and family previews now also
-- returns the artwork id. No existing rows change.

alter table public.invitation_media drop constraint invitation_media_kind_check;
alter table public.invitation_media add constraint invitation_media_kind_check check (kind in ('music', 'gallery', 'artwork'));

alter table public.invitation_media drop constraint invitation_media_check;
alter table public.invitation_media add constraint invitation_media_check check (
     (kind = 'music' and mime like 'audio/%' and position = 0 and byte_size <= 1572864)
  or (kind = 'gallery' and mime like 'image/%' and byte_size <= 460000)
  or (kind = 'artwork' and mime like 'image/%' and position = 0 and byte_size <= 1300000)
);

create or replace function private.media_listing(p_design_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'music', (select id from public.invitation_media where design_id = p_design_id and kind = 'music'),
    'artwork', (select id from public.invitation_media where design_id = p_design_id and kind = 'artwork'),
    'gallery', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'caption', caption) order by position)
      from public.invitation_media where design_id = p_design_id and kind = 'gallery'), '[]'::jsonb))
$$;
revoke all on function private.media_listing(uuid) from public, anon, authenticated;
