-- Wedding-scoped supplier shortlist, venue research, visit notes, preferences,
-- dated quote versions, and optional links from planning tasks.

create type public.supplier_kind as enum ('venue', 'vendor');
create type public.supplier_status as enum (
  'researching', 'contacted', 'visit_planned', 'shortlisted',
  'selected', 'booked', 'rejected', 'archived'
);
create type public.venue_policy_status as enum ('unknown', 'allowed', 'not_allowed', 'conditional');
create type public.venue_availability_status as enum ('unknown', 'requested', 'available', 'unavailable', 'on_hold');
create type public.supplier_preference_value as enum ('prefer', 'neutral', 'not_preferred');
create type public.quote_line_kind as enum ('service', 'tax', 'additional');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  kind public.supplier_kind not null,
  name text not null check (char_length(trim(name)) between 1 and 200),
  category text not null check (char_length(trim(category)) between 1 and 120),
  contact_person text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  website_url text,
  map_url text,
  source text not null default '',
  notes text not null default '',
  responsible_user_id uuid,
  status public.supplier_status not null default 'researching',
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, responsible_user_id)
    references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, created_by_user_id)
    references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, updated_by_user_id)
    references public.wedding_members(wedding_id, user_id) on delete restrict,
  check (website_url is null or website_url ~* '^https?://'),
  check (map_url is null or map_url ~* '^https?://')
);

create index suppliers_wedding_status_idx on public.suppliers (wedding_id, status, name);
create index suppliers_wedding_category_idx on public.suppliers (wedding_id, category, status);

create table public.supplier_venue_details (
  wedding_id uuid not null,
  supplier_id uuid not null,
  room_availability_notes text not null default '',
  catering_notes text not null default '',
  outside_vendor_notes text not null default '',
  parking_notes text not null default '',
  accessibility_notes text not null default '',
  pet_policy public.venue_policy_status not null default 'unknown',
  alcohol_policy public.venue_policy_status not null default 'unknown',
  music_policy public.venue_policy_status not null default 'unknown',
  weather_backup_space text not null default '',
  weather_backup_capacity integer check (weather_backup_capacity is null or weather_backup_capacity >= 0),
  updated_at timestamptz not null default now(),
  primary key (wedding_id, supplier_id),
  foreign key (wedding_id, supplier_id) references public.suppliers(wedding_id, id) on delete cascade
);

create table public.supplier_event_spaces (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  supplier_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 160),
  capacity integer check (capacity is null or capacity >= 0),
  notes text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (wedding_id, supplier_id, id),
  foreign key (wedding_id, supplier_id) references public.suppliers(wedding_id, id) on delete cascade
);
create index supplier_event_spaces_supplier_idx on public.supplier_event_spaces (wedding_id, supplier_id, archived_at);

-- Availability is a dated observation. New checks append rows instead of erasing
-- prior answers. Unknown is explicit and is never converted to unavailable.
create table public.supplier_requested_dates (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  supplier_id uuid not null,
  requested_date date not null,
  availability_status public.venue_availability_status not null default 'unknown',
  checked_at date,
  hold_expires_on date,
  notes text not null default '',
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (wedding_id, supplier_id, id),
  foreign key (wedding_id, supplier_id) references public.suppliers(wedding_id, id) on delete cascade,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  check (availability_status in ('unknown', 'requested') or checked_at is not null)
);
create index supplier_requested_dates_date_idx on public.supplier_requested_dates (wedding_id, supplier_id, requested_date, created_at desc);

create table public.supplier_quotes (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  supplier_id uuid not null,
  version_number integer not null check (version_number > 0),
  quoted_on date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_amount numeric(14,2) check (total_amount is null or total_amount >= 0),
  includes text not null default '',
  excludes text not null default '',
  expires_on date,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (wedding_id, supplier_id, version_number),
  unique (wedding_id, supplier_id, id),
  foreign key (wedding_id, supplier_id) references public.suppliers(wedding_id, id) on delete cascade,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);
create index supplier_quotes_history_idx on public.supplier_quotes (wedding_id, supplier_id, version_number desc);

create table public.supplier_quote_items (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  supplier_id uuid not null,
  quote_id uuid not null,
  kind public.quote_line_kind not null,
  label text not null check (char_length(trim(label)) between 1 and 200),
  amount numeric(14,2) check (amount is null or amount >= 0),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  foreign key (wedding_id, supplier_id, quote_id)
    references public.supplier_quotes(wedding_id, supplier_id, id) on delete cascade
);
create index supplier_quote_items_order_idx on public.supplier_quote_items (wedding_id, quote_id, position);

create table public.supplier_preferences (
  wedding_id uuid not null,
  supplier_id uuid not null,
  member_user_id uuid not null,
  preference public.supplier_preference_value not null,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (wedding_id, supplier_id, member_user_id),
  foreign key (wedding_id, supplier_id) references public.suppliers(wedding_id, id) on delete cascade,
  foreign key (wedding_id, member_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);

create table public.supplier_visits (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  supplier_id uuid not null,
  visit_date date,
  notes text not null check (char_length(trim(notes)) between 1 and 10000),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (wedding_id, supplier_id, id),
  foreign key (wedding_id, supplier_id) references public.suppliers(wedding_id, id) on delete cascade,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);
create index supplier_visits_history_idx on public.supplier_visits (wedding_id, supplier_id, visit_date desc, created_at desc);

-- A supplier follow-up remains a normal planning task and is subject to both
-- supplier_finance and planning module permissions in application operations.
alter table public.tasks add column supplier_id uuid;
alter table public.tasks add constraint tasks_supplier_same_wedding_fk
  foreign key (wedding_id, supplier_id) references public.suppliers(wedding_id, id) on delete restrict;
create index tasks_supplier_idx on public.tasks (wedding_id, supplier_id) where supplier_id is not null;
grant update (supplier_id) on public.tasks to authenticated;

create function private.touch_supplier_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_table_name = 'suppliers' then
    new.updated_by_user_id := (select auth.uid());
    if tg_op = 'UPDATE' then
      new.created_by_user_id := old.created_by_user_id;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger suppliers_touch before insert or update on public.suppliers
  for each row execute function private.touch_supplier_record();
create trigger venue_details_touch before update on public.supplier_venue_details
  for each row execute function private.touch_supplier_record();
create trigger supplier_preferences_touch before insert or update on public.supplier_preferences
  for each row execute function private.touch_supplier_record();

create function private.guard_supplier_quote_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Quote versions are immutable; create a new version instead.';
end;
$$;
create trigger supplier_quote_no_update before update or delete on public.supplier_quotes
  for each row execute function private.guard_supplier_quote_immutable();
create trigger supplier_quote_item_no_update before update or delete on public.supplier_quote_items
  for each row execute function private.guard_supplier_quote_immutable();
create trigger supplier_visit_no_update before update or delete on public.supplier_visits
  for each row execute function private.guard_supplier_quote_immutable();
create trigger supplier_requested_date_no_update before update or delete on public.supplier_requested_dates
  for each row execute function private.guard_supplier_quote_immutable();

create function public.create_supplier_quote(
  p_wedding_id uuid,
  p_supplier_id uuid,
  p_quoted_on date,
  p_currency text,
  p_total_amount numeric,
  p_includes text,
  p_excludes text,
  p_expires_on date,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_id uuid;
  v_version integer;
  v_user_id uuid := (select auth.uid());
  v_item jsonb;
  v_position integer := 0;
begin
  if v_user_id is null or not (select private.has_module_access(p_wedding_id, 'suppliers_finance', 'edit')) then
    raise exception 'Supplier edit permission required.';
  end if;
  if p_currency !~ '^[A-Z]{3}$' or jsonb_typeof(p_items) <> 'array'
      or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Invalid quote currency or line items.';
  end if;

  perform 1 from public.suppliers
    where wedding_id = p_wedding_id and id = p_supplier_id
    for update;
  if not found then raise exception 'Supplier not found in this wedding.'; end if;

  select coalesce(max(version_number), 0) + 1 into v_version
    from public.supplier_quotes where wedding_id = p_wedding_id and supplier_id = p_supplier_id;
  insert into public.supplier_quotes (
    wedding_id, supplier_id, version_number, quoted_on, currency,
    total_amount, includes, excludes, expires_on, created_by_user_id
  ) values (
    p_wedding_id, p_supplier_id, v_version, p_quoted_on, p_currency,
    p_total_amount, coalesce(p_includes, ''), coalesce(p_excludes, ''), p_expires_on, v_user_id
  ) returning id into v_quote_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.supplier_quote_items (
      wedding_id, supplier_id, quote_id, kind, label, amount, position
    ) values (
      p_wedding_id, p_supplier_id, v_quote_id,
      (v_item ->> 'kind')::public.quote_line_kind,
      v_item ->> 'label',
      nullif(v_item ->> 'amount', '')::numeric,
      v_position
    );
    v_position := v_position + 1;
  end loop;
  return v_quote_id;
end;
$$;

create function public.save_wedding_supplier(
  p_wedding_id uuid,
  p_supplier_id uuid,
  p_values jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_supplier_id uuid;
  v_kind public.supplier_kind := (p_values ->> 'kind')::public.supplier_kind;
begin
  if v_user_id is null or not (select private.has_module_access(p_wedding_id, 'suppliers_finance', 'edit')) then
    raise exception 'Supplier edit permission required.';
  end if;

  if p_supplier_id is null then
    insert into public.suppliers (
      wedding_id, kind, name, category, contact_person, contact_email, contact_phone,
      website_url, map_url, source, notes, responsible_user_id, status,
      created_by_user_id, updated_by_user_id
    ) values (
      p_wedding_id, v_kind, p_values ->> 'name', p_values ->> 'category',
      coalesce(p_values ->> 'contactPerson', ''), coalesce(p_values ->> 'contactEmail', ''), coalesce(p_values ->> 'contactPhone', ''),
      nullif(p_values ->> 'websiteUrl', ''), nullif(p_values ->> 'mapUrl', ''),
      coalesce(p_values ->> 'source', ''), coalesce(p_values ->> 'notes', ''),
      nullif(p_values ->> 'responsibleUserId', '')::uuid, (p_values ->> 'status')::public.supplier_status,
      v_user_id, v_user_id
    ) returning id into v_supplier_id;
  else
    update public.suppliers set
      kind = v_kind,
      name = p_values ->> 'name',
      category = p_values ->> 'category',
      contact_person = coalesce(p_values ->> 'contactPerson', ''),
      contact_email = coalesce(p_values ->> 'contactEmail', ''),
      contact_phone = coalesce(p_values ->> 'contactPhone', ''),
      website_url = nullif(p_values ->> 'websiteUrl', ''),
      map_url = nullif(p_values ->> 'mapUrl', ''),
      source = coalesce(p_values ->> 'source', ''),
      notes = coalesce(p_values ->> 'notes', ''),
      responsible_user_id = nullif(p_values ->> 'responsibleUserId', '')::uuid,
      status = (p_values ->> 'status')::public.supplier_status
    where wedding_id = p_wedding_id and id = p_supplier_id
    returning id into v_supplier_id;
    if v_supplier_id is null then raise exception 'Supplier not found in this wedding.'; end if;
  end if;

  if v_kind = 'venue' then
    insert into public.supplier_venue_details (
      wedding_id, supplier_id, room_availability_notes, catering_notes, outside_vendor_notes,
      parking_notes, accessibility_notes, pet_policy, alcohol_policy, music_policy,
      weather_backup_space, weather_backup_capacity
    ) values (
      p_wedding_id, v_supplier_id, coalesce(p_values ->> 'roomAvailabilityNotes', ''),
      coalesce(p_values ->> 'cateringNotes', ''), coalesce(p_values ->> 'outsideVendorNotes', ''),
      coalesce(p_values ->> 'parkingNotes', ''), coalesce(p_values ->> 'accessibilityNotes', ''),
      coalesce((p_values ->> 'petPolicy')::public.venue_policy_status, 'unknown'),
      coalesce((p_values ->> 'alcoholPolicy')::public.venue_policy_status, 'unknown'),
      coalesce((p_values ->> 'musicPolicy')::public.venue_policy_status, 'unknown'),
      coalesce(p_values ->> 'weatherBackupSpace', ''), nullif(p_values ->> 'weatherBackupCapacity', '')::integer
    ) on conflict (wedding_id, supplier_id) do update set
      room_availability_notes = excluded.room_availability_notes,
      catering_notes = excluded.catering_notes,
      outside_vendor_notes = excluded.outside_vendor_notes,
      parking_notes = excluded.parking_notes,
      accessibility_notes = excluded.accessibility_notes,
      pet_policy = excluded.pet_policy,
      alcohol_policy = excluded.alcohol_policy,
      music_policy = excluded.music_policy,
      weather_backup_space = excluded.weather_backup_space,
      weather_backup_capacity = excluded.weather_backup_capacity;
  end if;
  return v_supplier_id;
end;
$$;

alter table public.suppliers enable row level security;
alter table public.supplier_venue_details enable row level security;
alter table public.supplier_event_spaces enable row level security;
alter table public.supplier_requested_dates enable row level security;
alter table public.supplier_quotes enable row level security;
alter table public.supplier_quote_items enable row level security;
alter table public.supplier_preferences enable row level security;
alter table public.supplier_visits enable row level security;

revoke all on table public.suppliers, public.supplier_venue_details, public.supplier_event_spaces,
  public.supplier_requested_dates, public.supplier_quotes, public.supplier_quote_items,
  public.supplier_preferences, public.supplier_visits from anon, authenticated;
grant select, insert, update on table public.suppliers to authenticated;
grant select, insert, update on table public.supplier_venue_details to authenticated;
grant select, insert, update on table public.supplier_event_spaces to authenticated;
grant select, insert on table public.supplier_requested_dates, public.supplier_quotes,
  public.supplier_quote_items, public.supplier_visits to authenticated;
grant select, insert, update on table public.supplier_preferences to authenticated;

create policy suppliers_read on public.suppliers for select to authenticated
  using ((select private.has_module_access(wedding_id, 'suppliers_finance', 'read')));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (created_by_user_id = (select auth.uid()) and updated_by_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'suppliers_finance', 'edit')));
create policy suppliers_update on public.suppliers for update to authenticated
  using ((select private.has_module_access(wedding_id, 'suppliers_finance', 'edit')))
  with check ((select private.has_module_access(wedding_id, 'suppliers_finance', 'edit')));

create policy venue_details_read on public.supplier_venue_details for select to authenticated
  using ((select private.has_module_access(wedding_id, 'suppliers_finance', 'read')));
create policy venue_details_write on public.supplier_venue_details for all to authenticated
  using ((select private.has_module_access(wedding_id, 'suppliers_finance', 'edit')))
  with check ((select private.has_module_access(wedding_id, 'suppliers_finance', 'edit')));

create policy event_spaces_read on public.supplier_event_spaces for select to authenticated
  using ((select private.has_module_access(wedding_id, 'suppliers_finance', 'read')));
create policy event_spaces_write on public.supplier_event_spaces for all to authenticated
  using ((select private.has_module_access(wedding_id, 'suppliers_finance', 'edit')))
  with check ((select private.has_module_access(wedding_id, 'suppliers_finance', 'edit')));

create policy requested_dates_read on public.supplier_requested_dates for select to authenticated
  using ((select private.has_module_access(wedding_id, 'suppliers_finance', 'read')));
create policy requested_dates_insert on public.supplier_requested_dates for insert to authenticated
  with check (created_by_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'suppliers_finance', 'edit')));

create policy supplier_quotes_read on public.supplier_quotes for select to authenticated
  using ((select private.has_module_access(wedding_id, 'suppliers_finance', 'read')));
create policy supplier_quote_items_read on public.supplier_quote_items for select to authenticated
  using ((select private.has_module_access(wedding_id, 'suppliers_finance', 'read')));

create policy supplier_preferences_read on public.supplier_preferences for select to authenticated
  using ((select private.has_module_access(wedding_id, 'suppliers_finance', 'read')));
create policy supplier_preferences_insert_self on public.supplier_preferences for insert to authenticated
  with check (member_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'suppliers_finance', 'edit')));
create policy supplier_preferences_update_self on public.supplier_preferences for update to authenticated
  using (member_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'suppliers_finance', 'edit')))
  with check (member_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'suppliers_finance', 'edit')));

create policy supplier_visits_read on public.supplier_visits for select to authenticated
  using ((select private.has_module_access(wedding_id, 'suppliers_finance', 'read')));
create policy supplier_visits_insert on public.supplier_visits for insert to authenticated
  with check (created_by_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'suppliers_finance', 'edit')));

revoke all on function private.touch_supplier_record() from public, anon, authenticated;
revoke all on function private.guard_supplier_quote_immutable() from public, anon, authenticated;
revoke all on function public.create_supplier_quote(uuid, uuid, date, text, numeric, text, text, date, jsonb) from public, anon;
revoke all on function public.save_wedding_supplier(uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_supplier_quote(uuid, uuid, date, text, numeric, text, text, date, jsonb) to authenticated;
grant execute on function public.save_wedding_supplier(uuid, uuid, jsonb) to authenticated;
