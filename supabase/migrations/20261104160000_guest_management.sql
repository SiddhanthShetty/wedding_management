-- Master guest list. People, invitations, individual responses, and household groups stay distinct.
create table public.guest_households (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 180),
  contact_name text not null default '' check (char_length(contact_name) <= 160),
  contact_email text not null default '' check (char_length(contact_email) <= 320),
  contact_phone text not null default '' check (char_length(contact_phone) <= 80),
  address text not null default '' check (char_length(address) <= 1200),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id,id),
  foreign key (wedding_id,created_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  household_id uuid,
  plus_one_for_guest_id uuid,
  full_name text not null check (char_length(trim(full_name)) between 1 and 180),
  email text not null default '' check (char_length(email) <= 320),
  phone text not null default '' check (char_length(phone) <= 80),
  family_side text not null default 'unknown' check (family_side in ('couple_one','couple_two','shared','unknown')),
  follow_up_owner_user_id uuid,
  meal_preference text not null default '' check (char_length(meal_preference) <= 500),
  allergies text not null default '' check (char_length(allergies) <= 2000),
  assistance_needs text not null default '' check (char_length(assistance_needs) <= 2000),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id,id),
  unique (wedding_id,id,plus_one_for_guest_id),
  foreign key (wedding_id,household_id) references public.guest_households(wedding_id,id) on delete restrict,
  foreign key (wedding_id,plus_one_for_guest_id) references public.guests(wedding_id,id) on delete restrict,
  foreign key (wedding_id,follow_up_owner_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict,
  foreign key (wedding_id,created_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict,
  check (plus_one_for_guest_id is null or plus_one_for_guest_id <> id)
);
create unique index guests_one_plus_one_per_person on public.guests(wedding_id,plus_one_for_guest_id) where plus_one_for_guest_id is not null;
create index guests_household_idx on public.guests(wedding_id,household_id,full_name);
create index guests_name_idx on public.guests(wedding_id,full_name);

create table public.guest_invitations (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  function_id uuid not null,
  guest_id uuid not null,
  invitation_kind text not null default 'standard' check (invitation_kind in ('standard','plus_one')),
  plus_one_for_guest_id uuid,
  status text not null default 'invited' check (status in ('invited','withdrawn')),
  plus_one_allowed boolean not null default false,
  invited_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id,id),
  unique (wedding_id,function_id,guest_id),
  foreign key (wedding_id,function_id) references public.functions(wedding_id,id) on delete restrict,
  foreign key (wedding_id,guest_id) references public.guests(wedding_id,id) on delete restrict,
  foreign key (wedding_id,guest_id,plus_one_for_guest_id) references public.guests(wedding_id,id,plus_one_for_guest_id) on delete restrict,
  foreign key (wedding_id,invited_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict,
  check ((invitation_kind='standard' and plus_one_for_guest_id is null) or (invitation_kind='plus_one' and plus_one_for_guest_id is not null and not plus_one_allowed))
);
create unique index guest_invitation_plus_one_cap on public.guest_invitations(wedding_id,function_id,plus_one_for_guest_id) where invitation_kind='plus_one';
create index guest_invitations_function_idx on public.guest_invitations(wedding_id,function_id,status);

create table public.guest_rsvps (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  invitation_id uuid not null,
  response text not null check (response in ('yes','no','maybe')),
  response_source text not null check (response_source in ('phone','email','in_person','portal','other')),
  response_note text not null default '' check (char_length(response_note) <= 2000),
  recorded_by_user_id uuid,
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id,invitation_id),
  foreign key (wedding_id,invitation_id) references public.guest_invitations(wedding_id,id) on delete restrict,
  foreign key (wedding_id,recorded_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict
);

create table public.guest_rsvp_history (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  invitation_id uuid not null,
  response text not null check (response in ('yes','no','maybe')),
  response_source text not null check (response_source in ('phone','email','in_person','portal','other')),
  response_note text not null default '',
  recorded_by_user_id uuid,
  responded_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (wedding_id,invitation_id) references public.guest_invitations(wedding_id,id) on delete restrict,
  foreign key (wedding_id,recorded_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict
);
create index guest_rsvp_history_invitation_idx on public.guest_rsvp_history(wedding_id,invitation_id,created_at desc);

create table public.guest_import_batches (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  file_name text not null check (char_length(file_name) between 1 and 255),
  row_count integer not null check (row_count between 0 and 500),
  imported_count integer not null default 0,
  review_count integer not null default 0,
  error_count integer not null default 0,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (wedding_id,file_sha256),
  unique (wedding_id,id),
  foreign key (wedding_id,created_by_user_id) references public.wedding_members(wedding_id,user_id) on delete restrict
);

create table public.guest_import_rows (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  batch_id uuid not null,
  row_number integer not null check (row_number > 0),
  raw_data jsonb not null,
  normalized_data jsonb not null default '{}'::jsonb,
  status text not null check (status in ('imported','duplicate_review','error')),
  errors text[] not null default array[]::text[],
  duplicate_guest_ids uuid[] not null default array[]::uuid[],
  created_at timestamptz not null default now(),
  unique (wedding_id,batch_id,row_number),
  foreign key (wedding_id,batch_id) references public.guest_import_batches(wedding_id,id) on delete cascade
);

create function private.touch_guest_updated_at()
returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at:=now(); return new; end $$;
create trigger guest_households_touch before update on public.guest_households for each row execute function private.touch_guest_updated_at();
create trigger guests_touch before update on public.guests for each row execute function private.touch_guest_updated_at();
create trigger guest_invitations_touch before update on public.guest_invitations for each row execute function private.touch_guest_updated_at();
create trigger guest_rsvps_touch before update on public.guest_rsvps for each row execute function private.touch_guest_updated_at();

create function public.save_guest_household(p_wedding_id uuid,p_household_id uuid,p_values jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid:=(select auth.uid());
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then raise exception 'Guest edit permission required.'; end if;
  if p_household_id is null then
    insert into public.guest_households(wedding_id,name,contact_name,contact_email,contact_phone,address,notes,created_by_user_id)
    values(p_wedding_id,p_values->>'name',coalesce(p_values->>'contact_name',''),coalesce(p_values->>'contact_email',''),coalesce(p_values->>'contact_phone',''),coalesce(p_values->>'address',''),coalesce(p_values->>'notes',''),v_user)
    returning id into v_id;
  else
    update public.guest_households set name=p_values->>'name',contact_name=coalesce(p_values->>'contact_name',''),contact_email=coalesce(p_values->>'contact_email',''),contact_phone=coalesce(p_values->>'contact_phone',''),address=coalesce(p_values->>'address',''),notes=coalesce(p_values->>'notes','')
    where wedding_id=p_wedding_id and id=p_household_id returning id into v_id;
    if not found then raise exception 'Household not found in this wedding.'; end if;
  end if;
  return v_id;
end $$;

create function public.save_guest(p_wedding_id uuid,p_guest_id uuid,p_values jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid:=(select auth.uid());
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then raise exception 'Guest edit permission required.'; end if;
  if p_guest_id is null then
    insert into public.guests(wedding_id,household_id,full_name,email,phone,family_side,follow_up_owner_user_id,meal_preference,allergies,assistance_needs,notes,created_by_user_id)
    values(p_wedding_id,nullif(p_values->>'household_id','')::uuid,p_values->>'full_name',coalesce(p_values->>'email',''),coalesce(p_values->>'phone',''),coalesce(p_values->>'family_side','unknown'),nullif(p_values->>'follow_up_owner_user_id','')::uuid,coalesce(p_values->>'meal_preference',''),coalesce(p_values->>'allergies',''),coalesce(p_values->>'assistance_needs',''),coalesce(p_values->>'notes',''),v_user)
    returning id into v_id;
  else
    update public.guests set household_id=nullif(p_values->>'household_id','')::uuid,full_name=p_values->>'full_name',email=coalesce(p_values->>'email',''),phone=coalesce(p_values->>'phone',''),family_side=coalesce(p_values->>'family_side','unknown'),follow_up_owner_user_id=nullif(p_values->>'follow_up_owner_user_id','')::uuid,meal_preference=coalesce(p_values->>'meal_preference',''),allergies=coalesce(p_values->>'allergies',''),assistance_needs=coalesce(p_values->>'assistance_needs',''),notes=coalesce(p_values->>'notes','')
    where wedding_id=p_wedding_id and id=p_guest_id returning id into v_id;
    if not found then raise exception 'Guest not found in this wedding or guest is a linked plus-one.'; end if;
  end if;
  return v_id;
end $$;

create function public.set_guest_invitation(p_wedding_id uuid,p_guest_id uuid,p_function_id uuid,p_invited boolean,p_plus_one_allowed boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid:=(select auth.uid()); v_primary uuid; v_kind text;
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then raise exception 'Guest edit permission required.'; end if;
  select plus_one_for_guest_id into v_primary from public.guests where wedding_id=p_wedding_id and id=p_guest_id;
  if not found or not exists(select 1 from public.functions where wedding_id=p_wedding_id and id=p_function_id and ((p_invited and archived_at is null and status <> 'cancelled') or not p_invited)) then raise exception 'Guest or active function not found in this wedding.'; end if;
  if v_primary is null then v_kind:='standard';
  else
    v_kind:='plus_one';
    if p_invited and not exists(select 1 from public.guest_invitations where wedding_id=p_wedding_id and guest_id=v_primary and function_id=p_function_id and status='invited' and plus_one_allowed) then raise exception 'Plus-one is not approved for this function.'; end if;
  end if;
  insert into public.guest_invitations(wedding_id,function_id,guest_id,invitation_kind,plus_one_for_guest_id,status,plus_one_allowed,invited_by_user_id)
  values(p_wedding_id,p_function_id,p_guest_id,v_kind,v_primary,case when p_invited then 'invited' else 'withdrawn' end,case when v_kind='standard' and p_invited then p_plus_one_allowed else false end,v_user)
  on conflict (wedding_id,function_id,guest_id) do update set status=excluded.status,plus_one_allowed=excluded.plus_one_allowed,invited_by_user_id=v_user
  returning id into v_id;
  return v_id;
end $$;

create function public.create_guest_plus_one(p_wedding_id uuid,p_primary_guest_id uuid,p_full_name text,p_function_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_guest uuid; v_user uuid:=(select auth.uid()); v_function uuid;
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then raise exception 'Guest edit permission required.'; end if;
  if char_length(trim(p_full_name)) not between 1 and 180 or coalesce(array_length(p_function_ids,1),0) not between 1 and 30 then raise exception 'Provide a name and at least one function.'; end if;
  if not exists(select 1 from public.guests where wedding_id=p_wedding_id and id=p_primary_guest_id and plus_one_for_guest_id is null) then raise exception 'Primary guest not found.'; end if;
  foreach v_function in array p_function_ids loop
    if not exists(select 1 from public.guest_invitations where wedding_id=p_wedding_id and guest_id=p_primary_guest_id and function_id=v_function and status='invited' and plus_one_allowed)
      or not exists(select 1 from public.functions where wedding_id=p_wedding_id and id=v_function and archived_at is null and status <> 'cancelled') then raise exception 'Plus-one is not approved for every selected function.'; end if;
  end loop;
  insert into public.guests(wedding_id,household_id,plus_one_for_guest_id,full_name,family_side,created_by_user_id)
  select p_wedding_id,household_id,p_primary_guest_id,trim(p_full_name),'unknown',v_user from public.guests where wedding_id=p_wedding_id and id=p_primary_guest_id returning id into v_guest;
  foreach v_function in array p_function_ids loop
    insert into public.guest_invitations(wedding_id,function_id,guest_id,invitation_kind,plus_one_for_guest_id,invited_by_user_id)
    values(p_wedding_id,v_function,v_guest,'plus_one',p_primary_guest_id,v_user);
  end loop;
  return v_guest;
end $$;

create function public.record_guest_rsvp(p_wedding_id uuid,p_invitation_id uuid,p_response text,p_source text,p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid:=(select auth.uid()); v_time timestamptz:=now();
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then raise exception 'Guest edit permission required.'; end if;
  if p_response not in ('yes','no','maybe') or p_source not in ('phone','email','in_person','other') then raise exception 'Invalid response or response source.'; end if;
  if not exists(select 1 from public.guest_invitations where wedding_id=p_wedding_id and id=p_invitation_id and status='invited') then raise exception 'Active invitation not found.'; end if;
  insert into public.guest_rsvps(wedding_id,invitation_id,response,response_source,response_note,recorded_by_user_id,responded_at)
  values(p_wedding_id,p_invitation_id,p_response,p_source,left(coalesce(p_note,''),2000),v_user,v_time)
  on conflict (wedding_id,invitation_id) do update set response=excluded.response,response_source=excluded.response_source,response_note=excluded.response_note,recorded_by_user_id=v_user,responded_at=v_time,updated_at=v_time returning id into v_id;
  insert into public.guest_rsvp_history(wedding_id,invitation_id,response,response_source,response_note,recorded_by_user_id,responded_at)
  values(p_wedding_id,p_invitation_id,p_response,p_source,left(coalesce(p_note,''),2000),v_user,v_time);
  return v_id;
end $$;

create function public.import_guest_rows(p_wedding_id uuid,p_file_hash text,p_file_name text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_batch uuid; v_user uuid:=(select auth.uid()); v_item jsonb; v_guest jsonb; v_raw jsonb; v_errors text[]; v_duplicates uuid[]; v_row integer; v_household uuid; v_households jsonb:='{}'::jsonb; v_status text; v_imported integer:=0; v_review integer:=0; v_error integer:=0; v_allow boolean; v_id uuid; v_household_key text;
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then raise exception 'Guest edit permission required.'; end if;
  if p_file_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 or char_length(p_file_name)>255 then raise exception 'Invalid import batch.'; end if;
  insert into public.guest_import_batches(wedding_id,file_sha256,file_name,row_count,created_by_user_id)
  values(p_wedding_id,p_file_hash,left(p_file_name,255),jsonb_array_length(p_rows),v_user) returning id into v_batch;
  for v_item in select value from jsonb_array_elements(p_rows) loop
    v_row:=(v_item->>'row_number')::integer; v_raw:=coalesce(v_item->'raw','{}'::jsonb); v_guest:=coalesce(v_item->'guest','{}'::jsonb); v_errors:=array(select jsonb_array_elements_text(coalesce(v_item->'errors','[]'::jsonb))); v_allow:=coalesce((v_item->>'allow_duplicate')::boolean,false); v_duplicates:=array[]::uuid[]; v_household:=null;
    if cardinality(v_errors)>0 then v_status:='error'; v_error:=v_error+1;
    else
      select coalesce(array_agg(g.id order by g.full_name),array[]::uuid[]) into v_duplicates from public.guests g left join public.guest_households h on h.wedding_id=g.wedding_id and h.id=g.household_id
      where g.wedding_id=p_wedding_id and (
        (nullif(lower(trim(v_guest->>'email')),'') is not null and lower(trim(g.email))=lower(trim(v_guest->>'email')))
        or (nullif(regexp_replace(v_guest->>'phone','\D','','g'),'') is not null and regexp_replace(g.phone,'\D','','g')=regexp_replace(v_guest->>'phone','\D','','g'))
        or (lower(trim(g.full_name))=lower(trim(v_guest->>'full_name')) and lower(trim(coalesce(h.name,'')))=lower(trim(coalesce(v_guest->>'household_name',''))))
      );
      if cardinality(v_duplicates)>0 and not v_allow then v_status:='duplicate_review'; v_review:=v_review+1;
      else
        v_household_key:=nullif(lower(trim(v_guest->>'household_name')),'');
        if v_household_key is not null then
          v_household:=nullif(v_households->>v_household_key,'')::uuid;
          if v_household is null then
            insert into public.guest_households(wedding_id,name,created_by_user_id) values(p_wedding_id,trim(v_guest->>'household_name'),v_user) returning id into v_household;
            v_households:=v_households||jsonb_build_object(v_household_key,v_household);
          end if;
        end if;
        insert into public.guests(wedding_id,household_id,full_name,email,phone,family_side,meal_preference,allergies,assistance_needs,created_by_user_id)
        values(p_wedding_id,v_household,trim(v_guest->>'full_name'),coalesce(v_guest->>'email',''),coalesce(v_guest->>'phone',''),coalesce(v_guest->>'family_side','unknown'),coalesce(v_guest->>'meal_preference',''),coalesce(v_guest->>'allergies',''),coalesce(v_guest->>'assistance_needs',''),v_user) returning id into v_id;
        v_status:='imported'; v_imported:=v_imported+1;
      end if;
    end if;
    insert into public.guest_import_rows(wedding_id,batch_id,row_number,raw_data,normalized_data,status,errors,duplicate_guest_ids)
    values(p_wedding_id,v_batch,v_row,v_raw,v_guest,v_status,v_errors,v_duplicates);
  end loop;
  update public.guest_import_batches set imported_count=v_imported,review_count=v_review,error_count=v_error where id=v_batch;
  return jsonb_build_object('batch_id',v_batch,'imported_count',v_imported,'review_count',v_review,'error_count',v_error);
exception when unique_violation then
  raise exception 'This exact file was already imported for this wedding, or contains a duplicate row number.' using errcode='23505';
end $$;

create function public.resolve_guest_import_duplicate(p_wedding_id uuid,p_import_row_id uuid,p_confirm_as_new boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_row public.guest_import_rows%rowtype; v_user uuid:=(select auth.uid()); v_household uuid; v_guest uuid; v_name text; v_household_name text;
begin
  if v_user is null or not (select private.has_module_access(p_wedding_id,'guests','edit')) then raise exception 'Guest edit permission required.'; end if;
  if not p_confirm_as_new then raise exception 'Explicit confirmation is required before importing a possible duplicate.'; end if;
  select * into v_row from public.guest_import_rows where wedding_id=p_wedding_id and id=p_import_row_id and status='duplicate_review' for update;
  if not found then raise exception 'Duplicate review row is unavailable or already handled.'; end if;
  v_name:=trim(v_row.normalized_data->>'full_name'); v_household_name:=nullif(trim(v_row.normalized_data->>'household_name'),'');
  if coalesce(v_name,'')='' then raise exception 'This row has no valid person name.'; end if;
  if v_household_name is not null then insert into public.guest_households(wedding_id,name,created_by_user_id) values(p_wedding_id,v_household_name,v_user) returning id into v_household; end if;
  insert into public.guests(wedding_id,household_id,full_name,email,phone,family_side,meal_preference,allergies,assistance_needs,created_by_user_id)
  values(p_wedding_id,v_household,v_name,coalesce(v_row.normalized_data->>'email',''),coalesce(v_row.normalized_data->>'phone',''),coalesce(v_row.normalized_data->>'family_side','unknown'),coalesce(v_row.normalized_data->>'meal_preference',''),coalesce(v_row.normalized_data->>'allergies',''),coalesce(v_row.normalized_data->>'assistance_needs',''),v_user) returning id into v_guest;
  update public.guest_import_rows set status='imported' where id=v_row.id;
  update public.guest_import_batches set imported_count=imported_count+1,review_count=greatest(review_count-1,0) where wedding_id=p_wedding_id and id=v_row.batch_id;
  return v_guest;
end $$;

do $$ declare t text; begin
  foreach t in array array['guest_households','guests','guest_invitations','guest_rsvps','guest_rsvp_history','guest_import_batches','guest_import_rows'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon,authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.has_module_access(wedding_id,''guests'',''read'')))',t||'_select',t);
  end loop;
end $$;

revoke all on function public.save_guest_household(uuid,uuid,jsonb) from public,anon;
revoke all on function public.save_guest(uuid,uuid,jsonb) from public,anon;
revoke all on function public.set_guest_invitation(uuid,uuid,uuid,boolean,boolean) from public,anon;
revoke all on function public.create_guest_plus_one(uuid,uuid,text,uuid[]) from public,anon;
revoke all on function public.record_guest_rsvp(uuid,uuid,text,text,text) from public,anon;
revoke all on function public.import_guest_rows(uuid,text,text,jsonb) from public,anon;
revoke all on function public.resolve_guest_import_duplicate(uuid,uuid,boolean) from public,anon;
grant execute on function public.save_guest_household(uuid,uuid,jsonb) to authenticated;
grant execute on function public.save_guest(uuid,uuid,jsonb) to authenticated;
grant execute on function public.set_guest_invitation(uuid,uuid,uuid,boolean,boolean) to authenticated;
grant execute on function public.create_guest_plus_one(uuid,uuid,text,uuid[]) to authenticated;
grant execute on function public.record_guest_rsvp(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.import_guest_rows(uuid,text,text,jsonb) to authenticated;
grant execute on function public.resolve_guest_import_duplicate(uuid,uuid,boolean) to authenticated;
