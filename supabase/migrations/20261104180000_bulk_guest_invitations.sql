create function public.set_guest_invitations_bulk(p_wedding_id uuid,p_invitations jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_guest_id uuid;
  v_function_id uuid;
  v_invited boolean;
  v_plus_one_allowed boolean;
  v_count integer := 0;
begin
  if (select auth.uid()) is null
    or not (select private.has_module_access(p_wedding_id,'guests','edit')) then
    raise exception 'Guest edit permission required.';
  end if;

  if p_invitations is null or jsonb_typeof(p_invitations) is distinct from 'array' then
    raise exception 'Invitation changes must be an array.';
  end if;
  if jsonb_array_length(p_invitations) < 1 or jsonb_array_length(p_invitations) > 500 then
    raise exception 'Submit between 1 and 500 invitation changes.';
  end if;

  for v_entry in select value from jsonb_array_elements(p_invitations)
  loop
    if jsonb_typeof(v_entry) is distinct from 'object'
      or jsonb_typeof(v_entry->'guest_id') is distinct from 'string'
      or jsonb_typeof(v_entry->'function_id') is distinct from 'string'
      or jsonb_typeof(v_entry->'invited') is distinct from 'boolean'
      or jsonb_typeof(v_entry->'plus_one_allowed') is distinct from 'boolean' then
      raise exception 'Invitation changes have invalid fields.';
    end if;

    begin
      v_guest_id := (v_entry->>'guest_id')::uuid;
      v_function_id := (v_entry->>'function_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invitation changes include an invalid guest or function.';
    end;

    v_invited := (v_entry->>'invited')::boolean;
    v_plus_one_allowed := (v_entry->>'plus_one_allowed')::boolean;

    perform public.set_guest_invitation(
      p_wedding_id,v_guest_id,v_function_id,v_invited,v_plus_one_allowed
    );
    v_count := v_count + 1;
  end loop;

  if exists (
    select 1
    from (
      select (value->>'guest_id')::uuid as guest_id,
             (value->>'function_id')::uuid as function_id
      from jsonb_array_elements(p_invitations)
    ) normalized
    group by guest_id,function_id
    having count(*) > 1
  ) then
    raise exception 'Each person and function may appear only once in a batch.';
  end if;

  return v_count;
end
$$;

revoke all on function public.set_guest_invitations_bulk(uuid,jsonb) from public,anon;
grant execute on function public.set_guest_invitations_bulk(uuid,jsonb) to authenticated;
