-- Show planners when a guest last opened their private link ("Opened 2 h ago").
--
-- Data impact: none. list_guest_portal_links is replaced to add last_opened_at, read from the
-- existing guest_portal_sessions timestamps. Nothing new is recorded about guests.

create or replace function public.list_guest_portal_links(p_wedding_id uuid,p_household_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not (select private.has_module_access(p_wedding_id,'guests','read')) then raise exception 'Guest read permission required.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',l.id,'household_id',l.household_id,'guest_id',l.guest_id,'proxy_guest_ids',coalesce((select jsonb_agg(p.guest_id order by p.authorized_at) from public.guest_portal_link_proxies p where p.wedding_id=l.wedding_id and p.link_id=l.id),'[]'::jsonb),
    'expires_at',l.expires_at,'revoked_at',l.revoked_at,'created_at',l.created_at,'last_opened_at',(select max(coalesce(s.last_used_at,s.created_at)) from public.guest_portal_sessions s where s.wedding_id=l.wedding_id and s.link_id=l.id),'active',l.guest_id is not null and l.revoked_at is null and l.expires_at>now()
  ) order by l.created_at desc) from public.guest_portal_links l where l.wedding_id=p_wedding_id and (p_household_id is null or l.household_id=p_household_id)),'[]'::jsonb);
end $$;
revoke all on function public.list_guest_portal_links(uuid,uuid) from public, anon;
grant execute on function public.list_guest_portal_links(uuid,uuid) to authenticated;
