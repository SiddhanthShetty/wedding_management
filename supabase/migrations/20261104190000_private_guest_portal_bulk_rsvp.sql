create function public.record_guest_portal_rsvps(p_session_digest text,p_guest_id uuid,p_responses jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.guest_portal_links%rowtype;
  v_entry jsonb;
  v_response jsonb;
  v_expected_at timestamptz;
  v_status text;
  v_error_message text;
  v_saved_count integer := 0;
  v_duplicate_count integer := 0;
begin
  if p_session_digest !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status','unavailable');
  end if;

  select l.* into v_link
  from public.guest_portal_sessions s
  join public.guest_portal_links l on l.wedding_id=s.wedding_id and l.id=s.link_id
  where s.session_digest=p_session_digest and s.expires_at>now()
    and l.revoked_at is null and l.expires_at>now();
  if not found then return jsonb_build_object('status','unavailable'); end if;

  if p_guest_id is null or p_responses is null
    or jsonb_typeof(p_responses) is distinct from 'array' then
    return jsonb_build_object('status','invalid');
  end if;
  if jsonb_array_length(p_responses)<1 or jsonb_array_length(p_responses)>50 then
    return jsonb_build_object('status','invalid');
  end if;

  -- Validate the complete request before touching RSVP rows.
  for v_entry in select value from jsonb_array_elements(p_responses)
  loop
    if jsonb_typeof(v_entry) is distinct from 'object'
      or jsonb_typeof(v_entry->'invitation_id') is distinct from 'string'
      or jsonb_typeof(v_entry->'response') is distinct from 'string'
      or jsonb_typeof(v_entry->'note') is distinct from 'string'
      or jsonb_typeof(v_entry->'submission_key') is distinct from 'string'
      or (v_entry ? 'expected_updated_at'
          and jsonb_typeof(v_entry->'expected_updated_at') not in ('string','null')) then
      return jsonb_build_object('status','invalid');
    end if;
    if v_entry->>'response' not in ('yes','no','maybe')
      or char_length(v_entry->>'note')>2000 then
      return jsonb_build_object('status','invalid');
    end if;
    begin
      perform (v_entry->>'invitation_id')::uuid;
      perform (v_entry->>'submission_key')::uuid;
      v_expected_at:=nullif(v_entry->>'expected_updated_at','')::timestamptz;
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      return jsonb_build_object('status','invalid');
    end;
  end loop;

  if exists (
    select 1 from (
      select (value->>'invitation_id')::uuid as invitation_id
      from jsonb_array_elements(p_responses)
    ) entries group by invitation_id having count(*)>1
  ) or exists (
    select 1 from (
      select (value->>'submission_key')::uuid as submission_key
      from jsonb_array_elements(p_responses)
    ) entries group by submission_key having count(*)>1
  ) then
    return jsonb_build_object('status','invalid');
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_responses) as entry(value)
    where not exists (
      select 1
      from public.guest_invitations i
      join public.guests g on g.wedding_id=i.wedding_id and g.id=i.guest_id
      join public.functions f on f.wedding_id=i.wedding_id and f.id=i.function_id
      where i.wedding_id=v_link.wedding_id
        and i.id=(entry.value->>'invitation_id')::uuid
        and i.guest_id=p_guest_id and i.status='invited'
        and g.household_id=v_link.household_id
        and f.archived_at is null and f.status<>'cancelled'
    )
  ) then
    return jsonb_build_object('status','unavailable');
  end if;

  -- This exception block is a subtransaction. A stale or invalid row rolls
  -- back every RSVP in this person's batch before returning its status.
  begin
    for v_entry in
      select value from jsonb_array_elements(p_responses)
      order by value->>'invitation_id'
    loop
      v_expected_at:=nullif(v_entry->>'expected_updated_at','')::timestamptz;
      v_response:=public.record_guest_portal_rsvp(
        p_session_digest,
        (v_entry->>'invitation_id')::uuid,
        v_entry->>'response',
        v_entry->>'note',
        v_expected_at,
        (v_entry->>'submission_key')::uuid
      );
      v_status:=v_response->>'status';
      if v_status='saved' then
        v_saved_count:=v_saved_count+1;
      elsif v_status='duplicate' then
        v_duplicate_count:=v_duplicate_count+1;
      else
        raise exception using errcode='P0001',message='portal_rsvp_batch:'||coalesce(v_status,'unavailable');
      end if;
    end loop;
  exception when others then
    get stacked diagnostics v_error_message=message_text;
    if v_error_message like 'portal_rsvp_batch:%' then
      return jsonb_build_object('status',substring(v_error_message from length('portal_rsvp_batch:')+1));
    end if;
    return jsonb_build_object('status','unavailable');
  end;

  if v_saved_count=0 and v_duplicate_count>0 then
    return jsonb_build_object('status','duplicate','saved_count',0);
  end if;
  return jsonb_build_object('status','saved','saved_count',v_saved_count);
end
$$;

revoke all on function public.record_guest_portal_rsvps(text,uuid,jsonb) from public,authenticated;
grant execute on function public.record_guest_portal_rsvps(text,uuid,jsonb) to anon;
