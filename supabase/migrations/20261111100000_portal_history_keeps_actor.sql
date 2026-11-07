-- Fix: deleting a guest (or household) whose private link was used to edit another person's
-- details failed, because detaching the link from guest_profile_edit_history broke the rule
-- "guest-portal edits must reference a link".
--
-- Data impact: no rows are deleted. One check constraint is replaced and one trigger function
-- is replaced. From now on, when a link is deleted, its history rows keep who acted
-- (portal_actor_guest_id) instead of the link id. Existing rows already satisfy the new rule.

alter table public.guest_profile_edit_history drop constraint guest_profile_edit_history_check;
alter table public.guest_profile_edit_history add constraint guest_profile_edit_history_actor_check check (
  (source = 'planner' and changed_by_user_id is not null and portal_link_id is null)
  or (source = 'guest_portal' and changed_by_user_id is null and (portal_link_id is not null or portal_actor_guest_id is not null))
);

-- Before a link row disappears, record the acting guest on its history rows, then detach the link.
-- Legacy household links have no owner, so the edited guest is recorded as the actor.
create or replace function private.detach_deleted_guest_portal_link_history() returns trigger
language plpgsql set search_path='' as $$
begin
  update public.guest_rsvp_history h
    set portal_actor_guest_id = coalesce(h.portal_actor_guest_id, old.guest_id), portal_link_id = null
    where h.wedding_id = old.wedding_id and h.portal_link_id = old.id;
  update public.guest_profile_edit_history h
    set portal_actor_guest_id = coalesce(h.portal_actor_guest_id, old.guest_id, h.guest_id), portal_link_id = null
    where h.wedding_id = old.wedding_id and h.portal_link_id = old.id;
  return old;
end $$;
revoke all on function private.detach_deleted_guest_portal_link_history() from public, anon, authenticated;
