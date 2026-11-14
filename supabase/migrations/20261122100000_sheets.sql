-- Sheets: spreadsheets uploaded by the couple become tables they manage in the app.
-- Additive: two new tables, one helper check, one row-limit trigger and one create function.
-- No existing table or row is changed. Access follows the Plan ("planning") permission:
-- read to see tables, edit to create, change or delete them. Enforced here by RLS.

-- Columns are a JSON array of {id, name, type}: id "c1".."c999" (stable, used as the cell key),
-- name 1-80 characters, type text | number | date | boolean | link. 1 to 50 columns, unique ids.
create function private.valid_data_table_columns(p_columns jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_columns) = 'array'
    and jsonb_array_length(p_columns) between 1 and 50
    and not exists (
      select 1 from jsonb_array_elements(p_columns) c
      where jsonb_typeof(c) <> 'object'
         or coalesce(c->>'id', '') !~ '^c[0-9]{1,3}$'
         or char_length(btrim(coalesce(c->>'name', ''))) not between 1 and 80
         or coalesce(c->>'type', '') not in ('text', 'number', 'date', 'boolean', 'link')
    )
    and (select count(distinct c->>'id') from jsonb_array_elements(p_columns) c) = jsonb_array_length(p_columns);
$$;

create table public.data_tables (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120 and name !~ '[<>]'),
  source_filename text not null default '' check (char_length(source_filename) <= 255),
  source_sheet text not null default '' check (char_length(source_sheet) <= 120),
  columns jsonb not null check (private.valid_data_table_columns(columns)),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id)
);
create unique index data_tables_name_idx on public.data_tables (wedding_id, lower(btrim(name)));

create table public.data_table_rows (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  table_id uuid not null,
  position integer not null check (position >= 0),
  -- Cells keyed by column id; values are text, numbers, true/false or null. At most 64 KB a row.
  cells jsonb not null check (jsonb_typeof(cells) = 'object' and pg_column_size(cells) <= 65536),
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (wedding_id, table_id) references public.data_tables(wedding_id, id) on delete cascade
);
create index data_table_rows_table_idx on public.data_table_rows (table_id, position);

create trigger data_tables_touch_updated_at before update on public.data_tables
  for each row execute function private.touch_updated_at();
create trigger data_table_rows_touch_updated_at before update on public.data_table_rows
  for each row execute function private.touch_updated_at();

-- A table holds at most 2,000 rows.
create function private.check_data_table_row_limit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.data_table_rows r
    where r.table_id in (select distinct table_id from new_rows)
    group by r.table_id having count(*) > 2000
  ) then
    raise exception 'A table can hold up to 2,000 rows.' using errcode = '23514';
  end if;
  return null;
end;
$$;
create trigger data_table_rows_limit after insert on public.data_table_rows
  referencing new table as new_rows for each statement execute function private.check_data_table_row_limit();

alter table public.data_tables enable row level security;
alter table public.data_table_rows enable row level security;
revoke all on table public.data_tables, public.data_table_rows from anon, authenticated;
grant select, insert (wedding_id, name, source_filename, source_sheet, columns, created_by_user_id, updated_by_user_id),
  update (name, columns, updated_by_user_id), delete on table public.data_tables to authenticated;
grant select, insert (wedding_id, table_id, position, cells, updated_by_user_id),
  update (position, cells, updated_by_user_id), delete on table public.data_table_rows to authenticated;

create policy data_tables_select on public.data_tables for select to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'read')));
create policy data_tables_insert on public.data_tables for insert to authenticated
  with check (created_by_user_id = (select auth.uid()) and updated_by_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'planning', 'edit')));
create policy data_tables_update on public.data_tables for update to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'edit')))
  with check (updated_by_user_id = (select auth.uid()) and (select private.has_module_access(wedding_id, 'planning', 'edit')));
create policy data_tables_delete on public.data_tables for delete to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'edit')));

create policy data_table_rows_select on public.data_table_rows for select to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'read')));
create policy data_table_rows_insert on public.data_table_rows for insert to authenticated
  with check (updated_by_user_id = (select auth.uid()) and (select private.has_module_access(wedding_id, 'planning', 'edit')));
create policy data_table_rows_update on public.data_table_rows for update to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'edit')))
  with check (updated_by_user_id = (select auth.uid()) and (select private.has_module_access(wedding_id, 'planning', 'edit')));
create policy data_table_rows_delete on public.data_table_rows for delete to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'edit')));

-- Creates a table and all its rows in one transaction. Runs as the caller, so the policies above
-- apply. p_rows is a JSON array of cell objects, in order.
create function public.create_data_table(p_wedding_id uuid, p_name text, p_source_filename text, p_source_sheet text, p_columns jsonb, p_rows jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Rows must be a list.' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'A table can hold up to 2,000 rows.' using errcode = '23514'; end if;
  insert into public.data_tables (wedding_id, name, source_filename, source_sheet, columns, created_by_user_id, updated_by_user_id)
  values (p_wedding_id, btrim(p_name), coalesce(p_source_filename, ''), coalesce(p_source_sheet, ''), p_columns, auth.uid(), auth.uid())
  returning id into v_id;
  insert into public.data_table_rows (wedding_id, table_id, position, cells, updated_by_user_id)
  select p_wedding_id, v_id, (r.n - 1)::integer, r.cells, auth.uid()
  from jsonb_array_elements(p_rows) with ordinality as r(cells, n);
  return v_id;
end;
$$;
revoke all on function public.create_data_table(uuid, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_data_table(uuid, text, text, text, jsonb, jsonb) to authenticated;
-- The column check runs inside the table's CHECK constraint, as the person writing.
revoke all on function private.valid_data_table_columns(jsonb) from public, anon;
grant execute on function private.valid_data_table_columns(jsonb) to authenticated;
revoke all on function private.check_data_table_row_limit() from public, anon, authenticated;
