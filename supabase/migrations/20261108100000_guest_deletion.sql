-- Deleting guests and households.
--
-- Data impact: additive (functions only); no table or existing row is changed by this migration.
-- When a member uses these functions, the deleted person's personal data is removed:
--   invitations, replies and reply history, profile-edit history, travel needs, travel-group
--   membership, meal-category assignments, message records, cancelled stays, and seats on
--   completed or cancelled rides. Their id is also removed from guest-import duplicate suggestions.
--
-- Rules (each refusal says what to do instead):
-- * A guest with an active stay (not cancelled) or a seat on an upcoming ride (planned, assigned,
--   collected) cannot be deleted; cancel the stay or remove them from the ride first, so hotel and
--   driver lists never change silently.
-- * A guest who has a named plus-one cannot be deleted on their own; delete the plus-one first
--   (deleting the whole household handles plus-ones inside it automatically).
-- * A household can be deleted on its own only when it has no people. Deleting a household with
--   people requires p_delete_members = true and deletes them under the same rules.
-- * A household with documents attached (not yet permanently deleted) cannot be deleted.
-- Everything happens in one transaction: if any person cannot be deleted, nothing is deleted.

-- Completed-ride passenger lists stay protected, except while a whole person is being deleted.
create or replace function private.guard_passenger_removal() returns trigger language plpgsql set search_path='' as $$
begin
  if coalesce(current_setting('wedding.deleting_guest', true), '') <> 'on'
    and exists (select 1 from public.transport_journeys where wedding_id = old.wedding_id and id = old.journey_id and status = 'completed') then
    raise exception 'Passengers of a completed journey are kept as history.' using errcode = '23514';
  end if;
  return old;
end $$;
revoke all on function private.guard_passenger_removal() from public, anon, authenticated;

create function private.delete_guest_record(p_wedding_id uuid, p_guest_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_guest public.guests; v_plus_one text;
begin
  select * into v_guest from public.guests where wedding_id = p_wedding_id and id = p_guest_id for update;
  if not found then raise exception 'Guest not found in this wedding.' using errcode = '23503'; end if;
  select full_name into v_plus_one from public.guests where wedding_id = p_wedding_id and plus_one_for_guest_id = p_guest_id limit 1;
  if found then raise exception '% has a named plus-one (%). Delete the plus-one first.', v_guest.full_name, v_plus_one using errcode = '23514'; end if;
  if exists (select 1 from public.accommodation_assignments where wedding_id = p_wedding_id and guest_id = p_guest_id and status <> 'cancelled') then
    raise exception '% has a room allocated. Cancel the stay on Stays & travel first.', v_guest.full_name using errcode = '23514';
  end if;
  if exists (select 1 from public.transport_passengers p join public.transport_journeys j on j.wedding_id = p.wedding_id and j.id = p.journey_id
    where p.wedding_id = p_wedding_id and p.guest_id = p_guest_id and j.status in ('planned', 'assigned', 'collected')) then
    raise exception '% is booked on an upcoming ride. Remove them from the ride first.', v_guest.full_name using errcode = '23514';
  end if;

  delete from public.guest_rsvp_history h using public.guest_invitations i
    where h.wedding_id = p_wedding_id and i.wedding_id = h.wedding_id and i.id = h.invitation_id and i.guest_id = p_guest_id;
  delete from public.guest_rsvps r using public.guest_invitations i
    where r.wedding_id = p_wedding_id and i.wedding_id = r.wedding_id and i.id = r.invitation_id and i.guest_id = p_guest_id;
  delete from public.guest_invitations where wedding_id = p_wedding_id and guest_id = p_guest_id;
  delete from public.guest_profile_edit_history where wedding_id = p_wedding_id and guest_id = p_guest_id;
  delete from public.communication_records where wedding_id = p_wedding_id and guest_id = p_guest_id;
  delete from public.accommodation_assignments where wedding_id = p_wedding_id and guest_id = p_guest_id and status = 'cancelled';
  -- Completed rides keep their history row; only this person's seat is removed.
  perform pg_catalog.set_config('wedding.deleting_guest', 'on', true);
  delete from public.transport_passengers where wedding_id = p_wedding_id and guest_id = p_guest_id;
  perform pg_catalog.set_config('wedding.deleting_guest', 'off', true);
  update public.guest_import_rows set duplicate_guest_ids = pg_catalog.array_remove(duplicate_guest_ids, p_guest_id)
    where wedding_id = p_wedding_id and p_guest_id = any(duplicate_guest_ids);
  -- Travel profile, travel-group membership and meal-category assignments cascade with the guest.
  delete from public.guests where wedding_id = p_wedding_id and id = p_guest_id;
end $$;

create function public.delete_guest(p_wedding_id uuid, p_guest_id uuid, p_expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare v_updated timestamptz;
begin
  if (select auth.uid()) is null or not private.has_module_access(p_wedding_id, 'guests', 'edit') then
    raise exception 'Guest edit permission required.' using errcode = '42501';
  end if;
  select updated_at into v_updated from public.guests where wedding_id = p_wedding_id and id = p_guest_id;
  if not found then raise exception 'Guest not found in this wedding.' using errcode = '23503'; end if;
  if p_expected_updated_at is not null and v_updated <> p_expected_updated_at then
    raise exception 'This guest was changed after you opened the list. Refresh and check before deleting.' using errcode = '40001';
  end if;
  perform private.delete_guest_record(p_wedding_id, p_guest_id);
end $$;

create function public.delete_guest_household(p_wedding_id uuid, p_household_id uuid, p_delete_members boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare v_household public.guest_households; v_member record; v_count integer := 0; v_total integer;
begin
  if (select auth.uid()) is null or not private.has_module_access(p_wedding_id, 'guests', 'edit') then
    raise exception 'Guest edit permission required.' using errcode = '42501';
  end if;
  select * into v_household from public.guest_households where wedding_id = p_wedding_id and id = p_household_id for update;
  if not found then raise exception 'Household not found in this wedding.' using errcode = '23503'; end if;
  if exists (select 1 from public.documents where wedding_id = p_wedding_id and entity_type = 'guest_household' and entity_id = p_household_id and status <> 'purged') then
    raise exception 'This household has documents attached. Archive and permanently delete them on Documents first.' using errcode = '23514';
  end if;
  select count(*) into v_total from public.guests where wedding_id = p_wedding_id and household_id = p_household_id;
  if v_total > 0 and not coalesce(p_delete_members, false) then
    raise exception 'This household still has % people. Move them to another household, or delete the household with everyone in it.', v_total using errcode = '23514';
  end if;
  -- A plus-one in another household would be orphaned; refuse rather than delete people outside this household.
  if exists (select 1 from public.guests p join public.guests primary_guest on primary_guest.wedding_id = p.wedding_id and primary_guest.id = p.plus_one_for_guest_id
    where p.wedding_id = p_wedding_id and primary_guest.household_id = p_household_id and p.household_id is distinct from p_household_id) then
    raise exception 'Someone in this household has a plus-one in another household. Delete or move that plus-one first.' using errcode = '23514';
  end if;
  -- Plus-ones first, so their primary guests have no plus-one left when they are deleted.
  for v_member in select id from public.guests where wedding_id = p_wedding_id and household_id = p_household_id order by (plus_one_for_guest_id is null), full_name loop
    perform private.delete_guest_record(p_wedding_id, v_member.id);
    v_count := v_count + 1;
  end loop;
  -- Private links (and their sessions) cascade with the household.
  delete from public.guest_households where wedding_id = p_wedding_id and id = p_household_id;
  return v_count;
end $$;

revoke all on function private.delete_guest_record(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_guest(uuid, uuid, timestamptz), public.delete_guest_household(uuid, uuid, boolean) from public, anon;
grant execute on function public.delete_guest(uuid, uuid, timestamptz), public.delete_guest_household(uuid, uuid, boolean) to authenticated;
