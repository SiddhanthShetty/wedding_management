-- Private document metadata/versions, storage policies, message templates and manual
-- communication records.
--
-- Data impact: additive only. New enums, tables, functions and RLS policies. When the
-- Supabase `storage` schema exists, a private `wedding-documents` bucket and object policies
-- are created; in plain Postgres (tests) that block is skipped.
--
-- Documents
-- * Attach to an approved entity in the same wedding. Access follows the module that owns
--   the entity (suppliers/quotes/bookings/payments -> suppliers_finance, functions/general ->
--   planning, households -> guests, schedule items/arrangements -> logistics).
-- * Object keys are opaque: <wedding>/<document>/<version>. Filenames are display metadata only.
-- * Files are not malware-scanned. malware_scan_status is fixed to 'not_scanned' until a scanner exists.
-- * Deletion: editors archive (recoverable). Owners/co-owners can purge a document: its stored
--   files are removed and version metadata is kept, marked purged, for history.
--
-- Communications
-- * No live sending. Records are drafted, or manually marked sent/failed by a member.
--   'queued' and 'provider_confirmed' are reserved for a future provider integration and
--   require provider fields, so manual records can never claim delivery.

create type public.document_entity as enum ('wedding','function','supplier','supplier_quote','booking','booking_transaction','guest_household','schedule_item','arrangement');
create type public.document_status as enum ('active','archived','purged');
create type public.document_version_status as enum ('pending','available','failed','purged');
create type public.message_kind as enum ('invitation','reminder','update');
create type public.message_channel as enum ('email','sms','whatsapp','phone','in_person','post','other');
create type public.message_state as enum ('drafted','queued','sent','failed','provider_confirmed');

create function private.document_module(p_entity public.document_entity) returns public.wedding_module
language sql immutable set search_path='' as $$
  select (case p_entity
    when 'supplier' then 'suppliers_finance' when 'supplier_quote' then 'suppliers_finance'
    when 'booking' then 'suppliers_finance' when 'booking_transaction' then 'suppliers_finance'
    when 'guest_household' then 'guests'
    when 'schedule_item' then 'logistics' when 'arrangement' then 'logistics'
    else 'planning' end)::public.wedding_module
$$;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  entity_type public.document_entity not null,
  entity_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 200),
  category text not null default '' check (char_length(category) <= 80),
  notes text not null default '' check (char_length(notes) <= 2000),
  status public.document_status not null default 'active',
  current_version integer not null default 0 check (current_version >= 0),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  purged_at timestamptz,
  unique (wedding_id, id),
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  check ((entity_type = 'wedding') = (entity_id is null)),
  check ((status = 'archived') = (archived_at is not null) or status = 'purged'),
  check ((status = 'purged') = (purged_at is not null))
);
create index documents_entity_idx on public.documents(wedding_id, entity_type, entity_id);

create function private.validate_document_entity() returns trigger language plpgsql set search_path='' as $$
declare v_found boolean;
begin
  v_found := case new.entity_type
    when 'wedding' then true
    when 'function' then exists (select 1 from public.functions where wedding_id = new.wedding_id and id = new.entity_id)
    when 'supplier' then exists (select 1 from public.suppliers where wedding_id = new.wedding_id and id = new.entity_id)
    when 'supplier_quote' then exists (select 1 from public.supplier_quotes where wedding_id = new.wedding_id and id = new.entity_id)
    when 'booking' then exists (select 1 from public.bookings where wedding_id = new.wedding_id and id = new.entity_id)
    when 'booking_transaction' then exists (select 1 from public.booking_transactions where wedding_id = new.wedding_id and id = new.entity_id)
    when 'guest_household' then exists (select 1 from public.guest_households where wedding_id = new.wedding_id and id = new.entity_id)
    when 'schedule_item' then exists (select 1 from public.schedule_items where wedding_id = new.wedding_id and id = new.entity_id)
    when 'arrangement' then exists (select 1 from public.arrangement_items where wedding_id = new.wedding_id and id = new.entity_id)
  end;
  if not v_found then raise exception 'The linked record does not exist in this wedding.' using errcode = '23503'; end if;
  if tg_op = 'UPDATE' and (new.entity_type <> old.entity_type or new.entity_id is distinct from old.entity_id or new.wedding_id <> old.wedding_id) then
    raise exception 'A document cannot be moved to another record.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger documents_validate_entity before insert or update on public.documents for each row execute function private.validate_document_entity();

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  document_id uuid not null,
  version_number integer not null check (version_number > 0),
  object_key text not null unique check (object_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  original_filename text not null check (char_length(original_filename) between 1 and 200),
  detected_type text not null check (detected_type in ('application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  size_bytes bigint not null check (size_bytes between 1 and 8388608),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status public.document_version_status not null default 'pending',
  malware_scan_status text not null default 'not_scanned' check (malware_scan_status = 'not_scanned'),
  uploaded_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  purged_at timestamptz,
  unique (wedding_id, id),
  unique (wedding_id, document_id, version_number),
  foreign key (wedding_id, document_id) references public.documents(wedding_id, id) on delete restrict,
  foreign key (wedding_id, uploaded_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  check (split_part(object_key, '/', 1) = wedding_id::text and split_part(object_key, '/', 2) = document_id::text and split_part(object_key, '/', 3) = id::text)
);

create function private.can_access_document(p_wedding_id uuid, p_document_id uuid, p_level public.module_access_level)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select private.has_module_access(d.wedding_id, private.document_module(d.entity_type), p_level)
    from public.documents d where d.wedding_id = p_wedding_id and d.id = p_document_id), false)
$$;

-- Reserve a version row before uploading. Returns the opaque object key to upload to.
create function public.begin_document_upload(
  p_wedding_id uuid, p_document_id uuid, p_entity_type public.document_entity, p_entity_id uuid, p_title text, p_category text,
  p_filename text, p_detected_type text, p_size_bytes bigint, p_sha256 text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_document public.documents; v_version uuid := gen_random_uuid(); v_number integer; v_key text;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_document_id is null then
    if not private.has_module_access(p_wedding_id, private.document_module(p_entity_type), 'edit') then raise exception 'Edit permission required for this record.' using errcode = '42501'; end if;
    insert into public.documents (wedding_id, entity_type, entity_id, title, category, created_by_user_id)
      values (p_wedding_id, p_entity_type, p_entity_id, trim(p_title), coalesce(trim(p_category), ''), v_user) returning * into v_document;
  else
    select * into v_document from public.documents where wedding_id = p_wedding_id and id = p_document_id for update;
    if not found then raise exception 'Document not found.' using errcode = '23503'; end if;
    if v_document.status <> 'active' then raise exception 'Restore the document before adding a new version.' using errcode = '23514'; end if;
    if not private.has_module_access(p_wedding_id, private.document_module(v_document.entity_type), 'edit') then raise exception 'Edit permission required for this record.' using errcode = '42501'; end if;
  end if;
  select coalesce(max(version_number), 0) + 1 into v_number from public.document_versions where wedding_id = p_wedding_id and document_id = v_document.id;
  v_key := p_wedding_id::text || '/' || v_document.id::text || '/' || v_version::text;
  insert into public.document_versions (id, wedding_id, document_id, version_number, object_key, original_filename, detected_type, size_bytes, sha256, uploaded_by_user_id)
    values (v_version, p_wedding_id, v_document.id, v_number, v_key, p_filename, p_detected_type, p_size_bytes, p_sha256, v_user);
  return jsonb_build_object('document_id', v_document.id, 'version_id', v_version, 'object_key', v_key, 'version_number', v_number);
end $$;

create function public.finish_document_upload(p_wedding_id uuid, p_version_id uuid, p_succeeded boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_version public.document_versions;
begin
  select * into v_version from public.document_versions where wedding_id = p_wedding_id and id = p_version_id and status = 'pending' for update;
  if not found then raise exception 'Upload not found or already finished.' using errcode = '23503'; end if;
  if v_version.uploaded_by_user_id <> (select auth.uid()) or not private.can_access_document(p_wedding_id, v_version.document_id, 'edit') then
    raise exception 'Edit permission required for this record.' using errcode = '42501';
  end if;
  update public.document_versions set status = case when p_succeeded then 'available'::public.document_version_status else 'failed'::public.document_version_status end, completed_at = now()
    where wedding_id = p_wedding_id and id = p_version_id;
  if p_succeeded then
    update public.documents set current_version = greatest(current_version, v_version.version_number) where wedding_id = p_wedding_id and id = v_version.document_id;
  end if;
end $$;

create function public.set_document_archived(p_wedding_id uuid, p_document_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.can_access_document(p_wedding_id, p_document_id, 'edit') then raise exception 'Edit permission required for this record.' using errcode = '42501'; end if;
  update public.documents set status = case when p_archived then 'archived'::public.document_status else 'active'::public.document_status end,
    archived_at = case when p_archived then now() else null end
    where wedding_id = p_wedding_id and id = p_document_id and status <> 'purged';
  if not found then raise exception 'Document not found or already purged.' using errcode = '23503'; end if;
end $$;

-- Owners/co-owners only. Call after the stored objects were removed; keeps metadata as history.
create function public.mark_document_purged(p_wedding_id uuid, p_document_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce(private.current_membership_role(p_wedding_id) in ('owner','co_owner'), false) is not true then
    raise exception 'Only an owner can permanently delete files.' using errcode = '42501';
  end if;
  update public.document_versions set status = 'purged', purged_at = now() where wedding_id = p_wedding_id and document_id = p_document_id and status <> 'purged';
  update public.documents set status = 'purged', purged_at = now() where wedding_id = p_wedding_id and id = p_document_id and status = 'archived';
  if not found then raise exception 'Archive the document before deleting its files permanently.' using errcode = '23514'; end if;
end $$;

alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
revoke all on table public.documents, public.document_versions from anon, authenticated;
grant select on table public.documents, public.document_versions to authenticated;
create policy documents_read on public.documents for select to authenticated
  using ((select private.has_module_access(wedding_id, private.document_module(entity_type), 'read')));
create policy document_versions_read on public.document_versions for select to authenticated
  using ((select private.can_access_document(wedding_id, document_id, 'read')));
-- All writes go through the functions above.
revoke all on function public.begin_document_upload(uuid,uuid,public.document_entity,uuid,text,text,text,text,bigint,text), public.finish_document_upload(uuid,uuid,boolean),
  public.set_document_archived(uuid,uuid,boolean), public.mark_document_purged(uuid,uuid) from public, anon;
grant execute on function public.begin_document_upload(uuid,uuid,public.document_entity,uuid,text,text,text,text,bigint,text), public.finish_document_upload(uuid,uuid,boolean),
  public.set_document_archived(uuid,uuid,boolean), public.mark_document_purged(uuid,uuid) to authenticated;

-- Supabase Storage: private bucket and object policies tied to version metadata.
do $storage$ begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('wedding-documents', 'wedding-documents', false, 8388608, array['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
    execute $p$create policy wedding_documents_read on storage.objects for select to authenticated using (
      bucket_id = 'wedding-documents' and exists (select 1 from public.document_versions v where v.object_key = name and v.status = 'available'
        and private.can_access_document(v.wedding_id, v.document_id, 'read')))$p$;
    execute $p$create policy wedding_documents_insert on storage.objects for insert to authenticated with check (
      bucket_id = 'wedding-documents' and exists (select 1 from public.document_versions v where v.object_key = name and v.status = 'pending'
        and v.uploaded_by_user_id = (select auth.uid()) and private.can_access_document(v.wedding_id, v.document_id, 'edit')))$p$;
    execute $p$create policy wedding_documents_delete on storage.objects for delete to authenticated using (
      bucket_id = 'wedding-documents' and exists (select 1 from public.document_versions v join public.documents d on d.wedding_id = v.wedding_id and d.id = v.document_id
        where v.object_key = name and d.status = 'archived' and coalesce(private.current_membership_role(v.wedding_id) in ('owner','co_owner'), false)))$p$;
  end if;
end $storage$;

-- Communications ------------------------------------------------------------------------
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  kind public.message_kind not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  function_id uuid,
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  archived_at timestamptz,
  version integer not null default 1,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  unique (wedding_id, name),
  foreign key (wedding_id, function_id) references public.functions(wedding_id, id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, updated_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);
create function private.comms_touch_version() returns trigger language plpgsql set search_path='' as $$
begin new.version := old.version + 1; new.updated_at := now(); return new; end $$;
create trigger message_templates_version before update on public.message_templates for each row execute function private.comms_touch_version();

create table public.communication_records (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  guest_id uuid not null,
  function_id uuid,
  template_id uuid,
  channel public.message_channel not null,
  subject text not null default '' check (char_length(subject) <= 200),
  body_snapshot text not null check (char_length(body_snapshot) between 1 and 6000),
  state public.message_state not null default 'drafted',
  manual boolean not null default true,
  sent_at timestamptz,
  failure_reason text not null default '' check (char_length(failure_reason) <= 1000),
  provider_name text,
  provider_message_id text,
  provider_status_at timestamptz,
  dedupe_key text not null check (char_length(dedupe_key) between 8 and 200),
  notes text not null default '' check (char_length(notes) <= 2000),
  recorded_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  unique (wedding_id, dedupe_key),
  foreign key (wedding_id, guest_id) references public.guests(wedding_id, id) on delete restrict,
  foreign key (wedding_id, function_id) references public.functions(wedding_id, id) on delete restrict,
  foreign key (wedding_id, template_id) references public.message_templates(wedding_id, id) on delete restrict,
  foreign key (wedding_id, recorded_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  -- Manual records cannot be queued or provider-confirmed; those states need a provider.
  check (not manual or state in ('drafted','sent','failed')),
  check (manual or provider_name is not null),
  check (state <> 'provider_confirmed' or (provider_message_id is not null and provider_status_at is not null)),
  check (state not in ('sent','provider_confirmed') or sent_at is not null),
  check (state not in ('drafted','queued') or sent_at is null),
  check (state <> 'failed' or char_length(trim(failure_reason)) > 0)
);
create index communication_records_guest_idx on public.communication_records(wedding_id, guest_id, created_at desc);
create trigger communication_records_touch before update on public.communication_records for each row execute function private.travel_touch();

create function private.guard_communication_state() returns trigger language plpgsql set search_path='' as $$
begin
  -- Allowed manual transitions: drafted -> sent | failed, failed -> drafted (retry). Sent is final.
  if new.state <> old.state and not (
       (old.state = 'drafted' and new.state in ('sent','failed','queued'))
    or (old.state = 'failed' and new.state = 'drafted')
    or (old.state = 'queued' and new.state in ('sent','failed'))
    or (old.state = 'sent' and new.state in ('provider_confirmed','failed') and not new.manual)) then
    raise exception 'A message cannot move from % to %.', old.state, new.state using errcode = '23514';
  end if;
  if new.body_snapshot <> old.body_snapshot and old.state <> 'drafted' then
    raise exception 'Only drafts can be edited; create a new draft instead.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger communication_records_state before update on public.communication_records for each row execute function private.guard_communication_state();

do $$ declare t text; begin
  foreach t in array array['message_templates','communication_records'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.has_module_access(wedding_id, ''guests'', ''read'')))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.has_module_access(wedding_id, ''guests'', ''edit'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.has_module_access(wedding_id, ''guests'', ''edit''))) with check ((select private.has_module_access(wedding_id, ''guests'', ''edit'')))', t || '_update', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
  end loop;
end $$;
-- Members may record only their own manual actions.
drop policy communication_records_insert on public.communication_records;
create policy communication_records_insert on public.communication_records for insert to authenticated
  with check ((select private.has_module_access(wedding_id, 'guests', 'edit')) and recorded_by_user_id = (select auth.uid()) and manual);

-- Function names/dates for guest-module members, who may not hold planning access.
create function public.get_guest_function_references(p_wedding_id uuid)
returns table (id uuid, name text, function_date date, start_time time, venue_name text, status text, archived_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.has_module_access(p_wedding_id, 'guests', 'read') then raise exception 'Guest read permission required.' using errcode = '42501'; end if;
  return query select f.id, f.name, f.function_date, f.start_time, f.venue_name, f.status::text, f.archived_at
    from public.functions f where f.wedding_id = p_wedding_id order by f.function_date nulls last, f.start_time nulls last, f.name;
end $$;
revoke all on function public.get_guest_function_references(uuid) from public, anon;
grant execute on function public.get_guest_function_references(uuid) to authenticated;

-- Hardening: follow the foundation pattern for private helpers.
revoke all on function private.validate_document_entity(), private.comms_touch_version(), private.guard_communication_state() from public, anon, authenticated;
revoke all on function private.document_module(public.document_entity), private.can_access_document(uuid, uuid, public.module_access_level) from public, anon;
grant execute on function private.document_module(public.document_entity), private.can_access_document(uuid, uuid, public.module_access_level) to authenticated;
