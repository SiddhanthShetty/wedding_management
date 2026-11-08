-- Guest-page rate limits sized for a wedding venue, plus a separate limit for photos and music.
--
-- Data impact: none to wedding data. guest_portal_rate_limits accepts a new scope, 'media', and the
-- rate-limit function is replaced with higher limits. Existing counters are kept.
--
-- Why: limits are counted per network address, and a whole venue (or a family home) shares one
-- Wi-Fi address. Guest links carry 256-bit secrets that cannot be guessed, so these limits only
-- protect the database from load; the old limits (30 link openings per 15 minutes, 120 page reads
-- per minute) could lock out guests opening their links together on the day. Each guest page also
-- loads up to about 10 photos and music files, now counted separately.
--
--   scope     before          after
--   exchange  30 / 15 min     200 / 15 min   (opening a private link)
--   submit    30 / 15 min     120 / 15 min   (replies, profile, blessings)
--   read      120 / minute    600 / minute   (guest page data)
--   media     (counted as read) 1500 / minute (couple photo, gallery photos, music)

alter table public.guest_portal_rate_limits drop constraint if exists guest_portal_rate_limits_scope_check;
alter table public.guest_portal_rate_limits add constraint guest_portal_rate_limits_scope_check check (scope in ('exchange', 'submit', 'read', 'media'));

create or replace function public.consume_guest_portal_rate_limit(p_scope text, p_key_digest text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_window bigint; v_attempts integer; v_limit integer; v_window_seconds integer;
begin
  if p_scope = 'exchange' then v_limit := 200; v_window_seconds := 900;
  elsif p_scope = 'submit' then v_limit := 120; v_window_seconds := 900;
  elsif p_scope = 'read' then v_limit := 600; v_window_seconds := 60;
  elsif p_scope = 'media' then v_limit := 1500; v_window_seconds := 60;
  else return false; end if;
  if p_key_digest !~ '^[a-f0-9]{64}$' then return false; end if;
  v_window := floor(extract(epoch from now()) / v_window_seconds)::bigint;
  delete from public.guest_portal_rate_limits
  where (scope in ('read', 'media') and window_number < v_window - 10080) or (scope not in ('read', 'media') and window_number < v_window - 672);
  insert into public.guest_portal_rate_limits(scope, key_digest, window_number, attempts) values (p_scope, p_key_digest, v_window, 1)
  on conflict (scope, key_digest, window_number) do update set attempts = public.guest_portal_rate_limits.attempts + 1
  returning attempts into v_attempts;
  return v_attempts <= v_limit;
end; $$;
