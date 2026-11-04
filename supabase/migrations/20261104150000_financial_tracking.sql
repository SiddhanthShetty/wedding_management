-- Financial records are isolated by wedding. Amounts use PostgreSQL numeric; no FX is implied.
create table public.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid,
  category text not null check (char_length(trim(category)) between 1 and 120),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (wedding_id, function_id) references public.functions(wedding_id, id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);

create table public.financial_estimates (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid,
  category text not null check (char_length(trim(category)) between 1 and 120),
  label text not null check (char_length(trim(label)) between 1 and 200),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active','converted','void')),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (wedding_id, function_id) references public.functions(wedding_id, id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  unique (wedding_id, id)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  supplier_id uuid,
  source_estimate_id uuid,
  category text not null check (char_length(trim(category)) between 1 and 120),
  label text not null check (char_length(trim(label)) between 1 and 200),
  agreed_total numeric(14,2) not null check (agreed_total >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'tentative' check (status in ('tentative','confirmed','cancelled')),
  cancellation_note text not null default '' check (char_length(cancellation_note) <= 4000),
  cancelled_at timestamptz,
  refund_expected_amount numeric(14,2) check (refund_expected_amount is null or refund_expected_amount >= 0),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  unique (wedding_id, source_estimate_id),
  foreign key (wedding_id, supplier_id) references public.suppliers(wedding_id, id) on delete restrict,
  foreign key (wedding_id, source_estimate_id) references public.financial_estimates(wedding_id, id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);

create table public.booking_function_allocations (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  booking_id uuid not null,
  function_id uuid,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  foreign key (wedding_id, booking_id) references public.bookings(wedding_id, id) on delete cascade,
  foreign key (wedding_id, function_id) references public.functions(wedding_id, id) on delete restrict
);
create unique index booking_function_allocations_per_function
  on public.booking_function_allocations(wedding_id, booking_id, function_id) where function_id is not null;
create unique index booking_function_allocations_wedding_wide
  on public.booking_function_allocations(wedding_id, booking_id) where function_id is null;

create table public.booking_payment_obligations (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  booking_id uuid not null,
  label text not null check (char_length(trim(label)) between 1 and 120),
  due_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (wedding_id, booking_id) references public.bookings(wedding_id, id) on delete cascade,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  unique (wedding_id, id)
);

create table public.booking_transactions (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  booking_id uuid not null,
  kind text not null check (kind in ('payment','refund')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  happened_on date not null,
  payer_label text not null default '' check (char_length(payer_label) <= 160),
  obligation_id uuid,
  idempotency_key uuid not null,
  note text not null default '' check (char_length(note) <= 4000),
  recorded_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (wedding_id, booking_id) references public.bookings(wedding_id, id) on delete cascade,
  foreign key (wedding_id, obligation_id) references public.booking_payment_obligations(wedding_id, id) on delete restrict,
  foreign key (wedding_id, recorded_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  unique (wedding_id, idempotency_key),
  unique (wedding_id, id)
);

create table public.booking_transaction_contributions (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  transaction_id uuid not null,
  member_user_id uuid,
  contributor_label text not null check (char_length(trim(contributor_label)) between 1 and 160),
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  foreign key (wedding_id, transaction_id) references public.booking_transactions(wedding_id, id) on delete cascade,
  foreign key (wedding_id, member_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);

create table public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  booking_id uuid,
  from_user_id uuid,
  to_user_id uuid,
  from_label text not null check (char_length(trim(from_label)) between 1 and 160),
  to_label text not null check (char_length(trim(to_label)) between 1 and 160),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  due_date date,
  status text not null default 'planned' check (status in ('planned','paid','cancelled')),
  idempotency_key uuid not null,
  note text not null default '' check (char_length(note) <= 4000),
  recorded_by_user_id uuid not null,
  paid_on date,
  created_at timestamptz not null default now(),
  foreign key (wedding_id, booking_id) references public.bookings(wedding_id, id) on delete restrict,
  foreign key (wedding_id, from_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, to_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  foreign key (wedding_id, recorded_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict,
  unique (wedding_id, idempotency_key)
);

create table public.forecast_adjustments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  function_id uuid,
  category text not null check (char_length(trim(category)) between 1 and 120),
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  amount numeric(14,2) not null check (amount <> 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (wedding_id, function_id) references public.functions(wedding_id, id) on delete restrict,
  foreign key (wedding_id, created_by_user_id) references public.wedding_members(wedding_id, user_id) on delete restrict
);

create function private.check_booking_allocation_reconciliation()
returns trigger language plpgsql set search_path = '' as $$
declare v_wedding uuid; v_booking uuid; v_total numeric(14,2); v_allocated numeric(14,2);
begin
  v_wedding := coalesce(new.wedding_id, old.wedding_id);
  v_booking := coalesce(new.booking_id, old.booking_id);
  select agreed_total into v_total from public.bookings where wedding_id = v_wedding and id = v_booking;
  if not found then return null; end if;
  select coalesce(sum(amount), 0) into v_allocated from public.booking_function_allocations where wedding_id = v_wedding and booking_id = v_booking;
  if v_allocated <> v_total then raise exception 'Function allocations must equal the agreed booking total.' using errcode = '23514'; end if;
  return null;
end $$;
create constraint trigger booking_allocation_reconciles after insert or update or delete on public.booking_function_allocations
  deferrable initially deferred for each row execute function private.check_booking_allocation_reconciliation();

create function public.create_financial_booking(p_values jsonb, p_allocations jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid := (select auth.uid()); v_wedding uuid := (p_values->>'wedding_id')::uuid;
  v_estimate uuid := nullif(p_values->>'source_estimate_id','')::uuid; v_alloc jsonb; v_sum numeric(14,2) := 0; v_total numeric(14,2);
begin
  if v_user is null or not (select private.has_module_access(v_wedding,'suppliers_finance','edit')) then raise exception 'Financial edit permission required.'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) < 1 or jsonb_array_length(p_allocations) > 30 then raise exception 'Provide one or more function allocations.'; end if;
  v_total := (p_values->>'agreed_total')::numeric;
  insert into public.bookings(wedding_id,supplier_id,source_estimate_id,category,label,agreed_total,currency,status,created_by_user_id)
  values(v_wedding,nullif(p_values->>'supplier_id','')::uuid,v_estimate,p_values->>'category',p_values->>'label',v_total,p_values->>'currency',p_values->>'status',v_user)
  returning id into v_id;
  for v_alloc in select value from jsonb_array_elements(p_allocations) loop
    v_sum := v_sum + (v_alloc->>'amount')::numeric;
    insert into public.booking_function_allocations(wedding_id,booking_id,function_id,amount)
    values(v_wedding,v_id,nullif(v_alloc->>'function_id','')::uuid,(v_alloc->>'amount')::numeric);
  end loop;
  if v_sum <> v_total then raise exception 'Function allocations must add up to the agreed booking total.' using errcode = '23514'; end if;
  if v_estimate is not null then
    update public.financial_estimates set status='converted', updated_at=now()
    where wedding_id=v_wedding and id=v_estimate and status='active' and currency=p_values->>'currency';
    if not found then raise exception 'The source estimate is no longer active or has a different currency.'; end if;
  end if;
  return v_id;
end $$;

create function public.record_booking_transaction(p_values jsonb, p_contributions jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid := (select auth.uid()); v_wedding uuid := (p_values->>'wedding_id')::uuid;
  v_sum numeric(14,2) := 0; v_contribution jsonb; v_existing public.booking_transactions; v_booking_currency text;
begin
  if v_user is null or not (select private.has_module_access(v_wedding,'suppliers_finance','edit')) then raise exception 'Financial edit permission required.'; end if;
  if jsonb_typeof(p_contributions) <> 'array' or jsonb_array_length(p_contributions) > 30 then raise exception 'Invalid payment contributions.'; end if;
  select currency into v_booking_currency from public.bookings where wedding_id=v_wedding and id=(p_values->>'booking_id')::uuid for update;
  if not found or v_booking_currency <> p_values->>'currency' then raise exception 'Payment currency must match the selected booking.'; end if;
  if nullif(p_values->>'obligation_id','') is not null and not exists(select 1 from public.booking_payment_obligations where wedding_id=v_wedding and booking_id=(p_values->>'booking_id')::uuid and id=(p_values->>'obligation_id')::uuid) then raise exception 'Due item must belong to this booking.'; end if;
  insert into public.booking_transactions(wedding_id,booking_id,kind,amount,currency,happened_on,payer_label,obligation_id,idempotency_key,note,recorded_by_user_id)
  values(v_wedding,(p_values->>'booking_id')::uuid,p_values->>'kind',(p_values->>'amount')::numeric,p_values->>'currency',(p_values->>'happened_on')::date,coalesce(p_values->>'payer_label',''),nullif(p_values->>'obligation_id','')::uuid,(p_values->>'idempotency_key')::uuid,coalesce(p_values->>'note',''),v_user)
  on conflict (wedding_id,idempotency_key) do nothing returning id into v_id;
  if v_id is null then
    select * into v_existing from public.booking_transactions where wedding_id=v_wedding and idempotency_key=(p_values->>'idempotency_key')::uuid;
    if v_existing.booking_id <> (p_values->>'booking_id')::uuid or v_existing.kind <> p_values->>'kind' or v_existing.amount <> (p_values->>'amount')::numeric or v_existing.currency <> p_values->>'currency' or v_existing.happened_on <> (p_values->>'happened_on')::date then
      raise exception 'This submission key was already used for different payment details.' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  for v_contribution in select value from jsonb_array_elements(p_contributions) loop
    v_sum := v_sum + (v_contribution->>'amount')::numeric;
    insert into public.booking_transaction_contributions(wedding_id,transaction_id,member_user_id,contributor_label,amount)
    values(v_wedding,v_id,nullif(v_contribution->>'member_user_id','')::uuid,v_contribution->>'contributor_label',(v_contribution->>'amount')::numeric);
  end loop;
  if jsonb_array_length(p_contributions) > 0 and v_sum <> (p_values->>'amount')::numeric then raise exception 'Contributions must add up to the payment amount.' using errcode = '23514'; end if;
  return v_id;
end $$;

create function public.cancel_financial_booking(p_wedding_id uuid,p_booking_id uuid,p_note text,p_refund_expected numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.has_module_access(p_wedding_id,'suppliers_finance','edit')) then raise exception 'Financial edit permission required.'; end if;
  update public.bookings set status='cancelled',cancelled_at=now(),cancellation_note=left(coalesce(p_note,''),4000),refund_expected_amount=p_refund_expected,updated_at=now()
  where wedding_id=p_wedding_id and id=p_booking_id and status <> 'cancelled';
  if not found then raise exception 'Booking was already cancelled or is unavailable.'; end if;
end $$;

create function private.guard_financial_rows()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_wedding uuid := coalesce(new.wedding_id,old.wedding_id);
begin
  if not (select private.has_module_access(v_wedding,'suppliers_finance','edit')) then raise exception 'Financial edit permission required.'; end if;
  if tg_op = 'INSERT' and new.created_by_user_id is distinct from (select auth.uid()) then raise exception 'Record author must be the current user.'; end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['budget_allocations','financial_estimates','bookings','booking_function_allocations','booking_payment_obligations','booking_transactions','booking_transaction_contributions','reimbursements','forecast_adjustments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon, authenticated',t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated',t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.has_module_access(wedding_id,''suppliers_finance'',''read'')))',t||'_select',t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.has_module_access(wedding_id,''suppliers_finance'',''edit'')))',t||'_insert',t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.has_module_access(wedding_id,''suppliers_finance'',''edit''))) with check ((select private.has_module_access(wedding_id,''suppliers_finance'',''edit'')))',t||'_update',t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.has_module_access(wedding_id,''suppliers_finance'',''edit'')))',t||'_delete',t);
  end loop;
end $$;

-- Mutations go through the guarded server functions; no direct table mutation privileges.
revoke insert, update, delete on public.budget_allocations, public.financial_estimates, public.bookings,
  public.booking_function_allocations, public.booking_payment_obligations, public.booking_transactions,
  public.booking_transaction_contributions, public.reimbursements, public.forecast_adjustments from authenticated;
grant insert on public.budget_allocations, public.financial_estimates, public.booking_payment_obligations,
  public.reimbursements, public.forecast_adjustments to authenticated;
grant update on public.financial_estimates, public.booking_payment_obligations, public.reimbursements to authenticated;
drop policy financial_estimates_insert on public.financial_estimates;
create policy financial_estimates_insert on public.financial_estimates for insert to authenticated
  with check ((select private.has_module_access(wedding_id,'suppliers_finance','edit')) and created_by_user_id=(select auth.uid()));
drop policy financial_estimates_update on public.financial_estimates;
create policy financial_estimates_update on public.financial_estimates for update to authenticated
  using ((select private.has_module_access(wedding_id,'suppliers_finance','edit')))
  with check ((select private.has_module_access(wedding_id,'suppliers_finance','edit')) and created_by_user_id=(select auth.uid()));
drop policy budget_allocations_insert on public.budget_allocations;
create policy budget_allocations_insert on public.budget_allocations for insert to authenticated
  with check ((select private.has_module_access(wedding_id,'suppliers_finance','edit')) and created_by_user_id=(select auth.uid()));
drop policy booking_payment_obligations_insert on public.booking_payment_obligations;
create policy booking_payment_obligations_insert on public.booking_payment_obligations for insert to authenticated
  with check ((select private.has_module_access(wedding_id,'suppliers_finance','edit')) and created_by_user_id=(select auth.uid()));
drop policy reimbursements_insert on public.reimbursements;
create policy reimbursements_insert on public.reimbursements for insert to authenticated
  with check ((select private.has_module_access(wedding_id,'suppliers_finance','edit')) and recorded_by_user_id=(select auth.uid()));
drop policy reimbursements_update on public.reimbursements;
create policy reimbursements_update on public.reimbursements for update to authenticated
  using ((select private.has_module_access(wedding_id,'suppliers_finance','edit')))
  with check ((select private.has_module_access(wedding_id,'suppliers_finance','edit')) and recorded_by_user_id=(select auth.uid()));
drop policy forecast_adjustments_insert on public.forecast_adjustments;
create policy forecast_adjustments_insert on public.forecast_adjustments for insert to authenticated
  with check ((select private.has_module_access(wedding_id,'suppliers_finance','edit')) and created_by_user_id=(select auth.uid()));
revoke all on function public.create_financial_booking(jsonb,jsonb) from public,anon;
revoke all on function public.record_booking_transaction(jsonb,jsonb) from public,anon;
revoke all on function public.cancel_financial_booking(uuid,uuid,text,numeric) from public,anon;
grant execute on function public.create_financial_booking(jsonb,jsonb) to authenticated;
grant execute on function public.record_booking_transaction(jsonb,jsonb) to authenticated;
grant execute on function public.cancel_financial_booking(uuid,uuid,text,numeric) to authenticated;
revoke all on function private.check_booking_allocation_reconciliation() from public,anon,authenticated;
revoke all on function private.guard_financial_rows() from public,anon,authenticated;
