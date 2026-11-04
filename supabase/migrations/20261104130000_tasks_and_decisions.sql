-- Planning tasks, individual decision preferences, and append-only activity history.

create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.task_status as enum ('not_started', 'in_progress', 'blocked', 'completed', 'cancelled');
create type public.wedding_decision_status as enum ('open', 'decided', 'deferred');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 10000),
  owner_user_id uuid,
  due_date date,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'not_started',
  related_vendor_reference text check (related_vendor_reference is null or char_length(related_vendor_reference) <= 240),
  related_booking_reference text check (related_booking_reference is null or char_length(related_booking_reference) <= 240),
  depends_on_task_id uuid,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, function_id)
    references public.functions(wedding_id, id) on delete restrict,
  foreign key (wedding_id, owner_user_id)
    references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, depends_on_task_id)
    references public.tasks(wedding_id, id) on delete restrict,
  foreign key (wedding_id, created_by_user_id)
    references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, updated_by_user_id)
    references public.wedding_members(wedding_id, user_id) on delete restrict,
  check (depends_on_task_id is null or depends_on_task_id <> id)
);

create index tasks_wedding_due_status_idx on public.tasks (wedding_id, due_date, status);
create index tasks_wedding_function_idx on public.tasks (wedding_id, function_id);
create index tasks_wedding_owner_idx on public.tasks (wedding_id, owner_user_id);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  task_id uuid not null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  author_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, task_id) references public.tasks(wedding_id, id) on delete restrict,
  foreign key (wedding_id, author_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  task_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 300),
  is_complete boolean not null default false,
  position integer not null default 0,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, task_id) references public.tasks(wedding_id, id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, updated_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);

create table public.task_activity (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  task_id uuid not null,
  actor_user_id uuid,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (wedding_id, task_id) references public.tasks(wedding_id, id) on delete restrict
);
create index task_activity_timeline_idx on public.task_activity (wedding_id, task_id, created_at desc);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  question text not null check (char_length(trim(question)) between 1 and 2000),
  status public.wedding_decision_status not null default 'open',
  final_option_id uuid,
  decision_maker_user_id uuid,
  decision_date date,
  reason text not null default '' check (char_length(reason) <= 10000),
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, created_by_user_id)
    references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, updated_by_user_id)
    references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, decision_maker_user_id)
    references public.wedding_members(wedding_id, user_id) on delete restrict,
  check (
    (status = 'decided' and final_option_id is not null and decision_maker_user_id is not null and decision_date is not null)
    or status <> 'decided'
  )
);
create index decisions_wedding_status_idx on public.decisions (wedding_id, status, updated_at desc);

create table public.decision_options (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  decision_id uuid not null,
  label text not null check (char_length(trim(label)) between 1 and 500),
  position integer not null default 0,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (wedding_id, decision_id, id),
  foreign key (wedding_id, decision_id) references public.decisions(wedding_id, id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);
create unique index decision_options_unique_label_idx
  on public.decision_options (wedding_id, decision_id, lower(trim(label)));

alter table public.decisions
  add constraint decisions_final_option_same_decision
  foreign key (wedding_id, id, final_option_id)
  references public.decision_options(wedding_id, decision_id, id)
  on delete restrict;

create table public.decision_preferences (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  decision_id uuid not null,
  member_user_id uuid not null,
  option_id uuid not null,
  preference_note text not null default '' check (char_length(preference_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, decision_id, member_user_id),
  foreign key (wedding_id, decision_id) references public.decisions(wedding_id, id) on delete restrict,
  foreign key (wedding_id, member_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, decision_id, option_id)
    references public.decision_options(wedding_id, decision_id, id) on delete restrict
);

create table public.decision_comments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  decision_id uuid not null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  author_user_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (wedding_id, decision_id) references public.decisions(wedding_id, id) on delete restrict,
  foreign key (wedding_id, author_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);

create table public.decision_activity (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  decision_id uuid not null,
  actor_user_id uuid,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (wedding_id, decision_id) references public.decisions(wedding_id, id) on delete restrict
);
create index decision_activity_timeline_idx on public.decision_activity (wedding_id, decision_id, created_at desc);

create function private.guard_task_dependency_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle boolean;
begin
  if new.depends_on_task_id is null then return new; end if;
  if new.depends_on_task_id = new.id then
    raise exception 'a task cannot depend on itself' using errcode = '23514';
  end if;

  with recursive dependency_chain(task_id, depends_on_task_id, path) as (
    select task.id, task.depends_on_task_id, array[task.id]::uuid[]
    from public.tasks as task
    where task.wedding_id = new.wedding_id and task.id = new.depends_on_task_id
    union all
    select parent.id, parent.depends_on_task_id, dependency_chain.path || parent.id
    from public.tasks as parent
    join dependency_chain on parent.wedding_id = new.wedding_id
      and parent.id = dependency_chain.depends_on_task_id
    where not parent.id = any(dependency_chain.path)
  )
  select exists(select 1 from dependency_chain where task_id = new.id) into v_cycle;

  if v_cycle then
    raise exception 'task dependency would create a circular chain' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tasks_dependency_cycle_guard
  before insert or update of wedding_id, depends_on_task_id on public.tasks
  for each row execute function private.guard_task_dependency_cycle();

create function private.touch_task_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_user_id := (select auth.uid());
    new.updated_by_user_id := (select auth.uid());
    new.version := 1;
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
  else
    new.created_by_user_id := old.created_by_user_id;
    new.updated_by_user_id := (select auth.uid());
    new.version := old.version + 1;
    new.created_at := old.created_at;
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create function private.touch_checklist_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_user_id := (select auth.uid());
    new.updated_by_user_id := (select auth.uid());
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
  else
    new.created_by_user_id := old.created_by_user_id;
    new.updated_by_user_id := (select auth.uid());
    new.created_at := old.created_at;
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create function private.touch_decision_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_user_id := (select auth.uid());
    new.updated_by_user_id := (select auth.uid());
    new.version := 1;
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
  else
    new.created_by_user_id := old.created_by_user_id;
    new.updated_by_user_id := (select auth.uid());
    new.version := old.version + 1;
    new.created_at := old.created_at;
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create function private.touch_preference_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
  else
    new.updated_at := clock_timestamp();
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create function private.touch_comment_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_user_id := (select auth.uid());
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create function private.touch_decision_option_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_user_id := (select auth.uid());
    new.created_at := clock_timestamp();
  else
    new.created_by_user_id := old.created_by_user_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger tasks_touch before insert or update on public.tasks
  for each row execute function private.touch_task_record();
create trigger checklist_touch before insert or update on public.task_checklist_items
  for each row execute function private.touch_checklist_record();
create trigger decisions_touch before insert or update on public.decisions
  for each row execute function private.touch_decision_record();
create trigger decision_preferences_touch before insert or update on public.decision_preferences
  for each row execute function private.touch_preference_record();
create trigger comments_touch before insert on public.task_comments
  for each row execute function private.touch_comment_record();
create trigger decision_comments_touch before insert on public.decision_comments
  for each row execute function private.touch_comment_record();
create trigger decision_options_touch before insert or update on public.decision_options
  for each row execute function private.touch_decision_option_record();

create function private.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_activity (wedding_id, task_id, actor_user_id, event_type, details)
  values (
    new.wedding_id, new.id, (select auth.uid()),
    case when tg_op = 'INSERT' then 'task_created' else 'task_updated' end,
    case when tg_op = 'INSERT' then to_jsonb(new) - 'created_by_user_id' - 'updated_by_user_id'
         else jsonb_build_object('before', to_jsonb(old) - 'updated_by_user_id', 'after', to_jsonb(new) - 'updated_by_user_id') end
  );
  return new;
end;
$$;

create function private.log_task_child_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record jsonb := to_jsonb(new);
  v_details jsonb;
begin
  v_details := case when tg_op = 'UPDATE'
    then jsonb_build_object(
      'before', to_jsonb(old) - 'updated_by_user_id',
      'after', v_record - 'updated_by_user_id'
    )
    else v_record - 'author_user_id' - 'created_by_user_id' - 'updated_by_user_id'
  end;
  insert into public.task_activity (wedding_id, task_id, actor_user_id, event_type, details)
  values (
    new.wedding_id, new.task_id, (select auth.uid()),
    case when tg_table_name = 'task_comments' then 'comment_added' else 'checklist_item_changed' end,
    v_details
  );
  return new;
end;
$$;

create function private.log_decision_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.decision_activity (wedding_id, decision_id, actor_user_id, event_type, details)
  values (
    new.wedding_id, new.id, (select auth.uid()),
    case when tg_op = 'INSERT' then 'decision_created' else 'decision_updated' end,
    case when tg_op = 'INSERT' then to_jsonb(new) - 'created_by_user_id' - 'updated_by_user_id'
         else jsonb_build_object('before', to_jsonb(old) - 'updated_by_user_id', 'after', to_jsonb(new) - 'updated_by_user_id') end
  );
  return new;
end;
$$;

create function private.log_decision_child_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_details jsonb;
begin
  v_details := case when tg_op = 'UPDATE'
    then jsonb_build_object(
      'before', to_jsonb(old) - 'updated_by_user_id',
      'after', to_jsonb(new) - 'updated_by_user_id'
    )
    else to_jsonb(new) - 'author_user_id' - 'created_by_user_id' - 'updated_by_user_id'
  end;
  insert into public.decision_activity (wedding_id, decision_id, actor_user_id, event_type, details)
  values (
    new.wedding_id, new.decision_id, (select auth.uid()),
    case tg_table_name
      when 'decision_preferences' then 'preference_changed'
      when 'decision_comments' then 'comment_added'
      when 'decision_options' then case when tg_op = 'UPDATE' then 'option_updated' else 'option_added' end
      else 'option_added'
    end,
    v_details
  );
  return new;
end;
$$;

create trigger tasks_log_activity after insert or update on public.tasks
  for each row execute function private.log_task_activity();
create trigger task_comments_log_activity after insert on public.task_comments
  for each row execute function private.log_task_child_activity();
create trigger checklist_log_activity after insert or update on public.task_checklist_items
  for each row execute function private.log_task_child_activity();
create trigger decisions_log_activity after insert or update on public.decisions
  for each row execute function private.log_decision_activity();
create trigger decision_options_log_activity after insert or update on public.decision_options
  for each row execute function private.log_decision_child_activity();
create trigger decision_preferences_log_activity after insert or update on public.decision_preferences
  for each row execute function private.log_decision_child_activity();
create trigger decision_comments_log_activity after insert on public.decision_comments
  for each row execute function private.log_decision_child_activity();

create function public.create_wedding_decision(
  p_wedding_id uuid,
  p_question text,
  p_options text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision_id uuid;
  v_option text;
  v_position integer := 0;
  v_options text[];
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not private.has_module_access(p_wedding_id, 'planning', 'edit') then
    raise exception 'planning edit access required' using errcode = '42501';
  end if;
  if p_question is null or char_length(trim(p_question)) not between 1 and 2000 then
    raise exception 'question is required' using errcode = '22023';
  end if;
  select array_agg(option_label order by option_position)
  into v_options
  from (
    select distinct on (lower(trim(candidate.option_label)))
      trim(candidate.option_label) as option_label,
      candidate.option_position
    from unnest(coalesce(p_options, array[]::text[])) with ordinality
      as candidate(option_label, option_position)
    where char_length(trim(candidate.option_label)) between 1 and 500
    order by lower(trim(candidate.option_label)), candidate.option_position
  ) as unique_options;
  if coalesce(cardinality(v_options), 0) < 2 then
    raise exception 'at least two distinct decision options are required' using errcode = '22023';
  end if;

  insert into public.decisions (wedding_id, question)
  values (p_wedding_id, trim(p_question))
  returning id into v_decision_id;

  foreach v_option in array v_options loop
    insert into public.decision_options (wedding_id, decision_id, label, position, created_by_user_id)
    values (p_wedding_id, v_decision_id, v_option, v_position, auth.uid());
    v_position := v_position + 1;
  end loop;

  return v_decision_id;
end;
$$;

alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.task_activity enable row level security;
alter table public.decisions enable row level security;
alter table public.decision_options enable row level security;
alter table public.decision_preferences enable row level security;
alter table public.decision_comments enable row level security;
alter table public.decision_activity enable row level security;

revoke all on table public.tasks, public.task_comments, public.task_checklist_items,
  public.task_activity, public.decisions, public.decision_options,
  public.decision_preferences, public.decision_comments, public.decision_activity
from anon, authenticated;

grant select, insert on table public.tasks to authenticated;
grant update (
  function_id, title, description, owner_user_id, due_date, priority, status,
  related_vendor_reference, related_booking_reference, depends_on_task_id
) on public.tasks to authenticated;
grant select, insert (wedding_id, task_id, body) on table public.task_comments to authenticated;
grant select, insert (wedding_id, task_id, title, position), update (title, is_complete, position)
  on table public.task_checklist_items to authenticated;
grant select on table public.task_activity to authenticated;
grant select on table public.decisions to authenticated;
grant update (question, status, final_option_id, decision_maker_user_id, decision_date, reason)
  on public.decisions to authenticated;
grant select, insert (wedding_id, decision_id, label, position), update (label, position)
  on table public.decision_options to authenticated;
grant select, insert (wedding_id, decision_id, member_user_id, option_id, preference_note),
  update (option_id, preference_note) on table public.decision_preferences to authenticated;
grant select, insert (wedding_id, decision_id, body) on table public.decision_comments to authenticated;
grant select on table public.decision_activity to authenticated;

create policy tasks_select_planning on public.tasks for select to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'read')));
create policy tasks_insert_planning on public.tasks for insert to authenticated
  with check (
    created_by_user_id = (select auth.uid())
    and updated_by_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'planning', 'edit'))
  );
create policy tasks_update_planning on public.tasks for update to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'edit')))
  with check ((select private.has_module_access(wedding_id, 'planning', 'edit')));

create policy task_comments_select_planning on public.task_comments for select to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'read')));
create policy task_comments_insert_planning on public.task_comments for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'planning', 'edit'))
  );

create policy task_checklist_select_planning on public.task_checklist_items for select to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'read')));
create policy task_checklist_insert_planning on public.task_checklist_items for insert to authenticated
  with check (
    created_by_user_id = (select auth.uid())
    and updated_by_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'planning', 'edit'))
  );
create policy task_checklist_update_planning on public.task_checklist_items for update to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'edit')))
  with check ((select private.has_module_access(wedding_id, 'planning', 'edit')));
create policy task_activity_select_planning on public.task_activity for select to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'read')));

create policy decisions_select_planning on public.decisions for select to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'read')));
create policy decisions_update_planning on public.decisions for update to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'edit')))
  with check ((select private.has_module_access(wedding_id, 'planning', 'edit')));

create policy decision_options_select_planning on public.decision_options for select to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'read')));
create policy decision_options_insert_planning on public.decision_options for insert to authenticated
  with check (
    created_by_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'planning', 'edit'))
  );
create policy decision_options_update_planning on public.decision_options for update to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'edit')))
  with check ((select private.has_module_access(wedding_id, 'planning', 'edit')));

create policy decision_preferences_select_planning on public.decision_preferences for select to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'read')));
create policy decision_preferences_insert_self on public.decision_preferences for insert to authenticated
  with check (
    member_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'planning', 'edit'))
  );
create policy decision_preferences_update_self on public.decision_preferences for update to authenticated
  using (
    member_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'planning', 'edit'))
  )
  with check (
    member_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'planning', 'edit'))
  );

create policy decision_comments_select_planning on public.decision_comments for select to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'read')));
create policy decision_comments_insert_planning on public.decision_comments for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and (select private.has_module_access(wedding_id, 'planning', 'edit'))
  );
create policy decision_activity_select_planning on public.decision_activity for select to authenticated
  using ((select private.has_module_access(wedding_id, 'planning', 'read')));

revoke all on function private.guard_task_dependency_cycle() from public, anon, authenticated;
revoke all on function private.touch_task_record() from public, anon, authenticated;
revoke all on function private.touch_checklist_record() from public, anon, authenticated;
revoke all on function private.touch_decision_record() from public, anon, authenticated;
revoke all on function private.touch_preference_record() from public, anon, authenticated;
revoke all on function private.touch_comment_record() from public, anon, authenticated;
revoke all on function private.touch_decision_option_record() from public, anon, authenticated;
revoke all on function private.log_task_activity() from public, anon, authenticated;
revoke all on function private.log_task_child_activity() from public, anon, authenticated;
revoke all on function private.log_decision_activity() from public, anon, authenticated;
revoke all on function private.log_decision_child_activity() from public, anon, authenticated;
revoke all on function public.create_wedding_decision(uuid, text, text[]) from public, anon;
grant execute on function public.create_wedding_decision(uuid, text, text[]) to authenticated;
