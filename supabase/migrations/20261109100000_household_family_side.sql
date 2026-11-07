-- Family side belongs to the household. guest.family_side remains a synchronized
-- compatibility projection for existing reads and exports.
-- Existing household members with one unanimous value backfill that value. A
-- mixed household becomes unknown and every member receives that shared value.
-- Existing guests with no household
-- remain untouched, while new or updated guest records must have a household.

alter table public.guest_households
  add column family_side text not null default 'unknown'
    check (family_side in ('couple_one','couple_two','shared','unknown'));

with household_sides as (
  select household_id,
    case when count(distinct family_side)=1 then min(family_side) else 'unknown' end as family_side
  from public.guests
  where household_id is not null
  group by household_id
)
update public.guest_households h
set family_side=s.family_side
from household_sides s
where h.id=s.household_id;

update public.guests g
set family_side=h.family_side
from public.guest_households h
where h.wedding_id=g.wedding_id and h.id=g.household_id;

alter table public.guests
  add constraint guests_household_required check (household_id is not null) not valid;

comment on column public.guests.family_side is
  'Compatibility projection only. Source of truth is guest_households.family_side; synchronized by private triggers.';

create function private.sync_guest_family_side_from_household()
returns trigger language plpgsql set search_path='' as $$
declare v_side text;
begin
  if new.household_id is null then
    raise exception 'Choose a household for this guest.' using errcode='23514';
  end if;
  select h.family_side into v_side
  from public.guest_households h
  where h.wedding_id=new.wedding_id and h.id=new.household_id;
  if not found then
    raise exception 'Choose a household from this wedding.' using errcode='23503';
  end if;

  -- Imports may create a household before the first person. Let that first
  -- imported person's side establish the household value. Later mismatches are
  -- rejected instead of silently assigning one household to two sides.
  if tg_op='INSERT' and v_side='unknown' and new.family_side<>'unknown'
    and not exists(select 1 from public.guests g where g.wedding_id=new.wedding_id and g.household_id=new.household_id) then
    update public.guest_households
    set family_side=new.family_side
    where wedding_id=new.wedding_id and id=new.household_id;
    v_side:=new.family_side;
  elsif tg_op='INSERT' and new.family_side not in ('unknown',v_side) then
    raise exception 'All people imported into a household must use the household family side.' using errcode='23514';
  end if;

  new.family_side:=v_side;
  return new;
end $$;
revoke all on function private.sync_guest_family_side_from_household() from public,anon,authenticated;

create trigger guests_family_side_from_household
before insert or update of wedding_id,household_id,family_side on public.guests
for each row execute function private.sync_guest_family_side_from_household();

create function private.sync_guest_members_after_household_side_change()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.family_side is distinct from new.family_side then
    update public.guests
    set family_side=new.family_side
    where wedding_id=new.wedding_id and household_id=new.id
      and family_side is distinct from new.family_side;
  end if;
  return new;
end $$;
revoke all on function private.sync_guest_members_after_household_side_change() from public,anon,authenticated;

create trigger guest_households_sync_family_side
after update of family_side on public.guest_households
for each row execute function private.sync_guest_members_after_household_side_change();

create or replace function public.save_guest_household(p_wedding_id uuid,p_household_id uuid,p_values jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_user uuid:=(select auth.uid()); v_side text;
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then
    raise exception 'Guest edit permission required.' using errcode='42501';
  end if;
  if p_household_id is null then
    v_side:=coalesce(p_values->>'family_side','unknown');
    if v_side not in ('couple_one','couple_two','shared','unknown') then raise exception 'Invalid household family side.'; end if;
    insert into public.guest_households(wedding_id,name,contact_name,contact_email,contact_phone,address,notes,family_side,created_by_user_id)
    values(p_wedding_id,p_values->>'name',coalesce(p_values->>'contact_name',''),coalesce(p_values->>'contact_email',''),coalesce(p_values->>'contact_phone',''),coalesce(p_values->>'address',''),coalesce(p_values->>'notes',''),v_side,v_user)
    returning id into v_id;
  else
    update public.guest_households set
      name=p_values->>'name',
      contact_name=coalesce(p_values->>'contact_name',''),
      contact_email=coalesce(p_values->>'contact_email',''),
      contact_phone=coalesce(p_values->>'contact_phone',''),
      address=coalesce(p_values->>'address',''),
      notes=coalesce(p_values->>'notes',''),
      family_side=coalesce(p_values->>'family_side',family_side)
    where wedding_id=p_wedding_id and id=p_household_id returning id into v_id;
    if not found then raise exception 'Household not found in this wedding.'; end if;
  end if;
  return v_id;
end $$;

-- Keep edits to an existing unassigned guest possible only when the editor
-- assigns that person to a real household. The NOT VALID constraint preserves
-- untouched legacy rows without creating fabricated household records.
