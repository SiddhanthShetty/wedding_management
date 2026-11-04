-- Local-only synthetic fixtures. These identities use reserved .test addresses and have
-- no usable passwords. Never copy this seed into a real wedding project.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'partner-one@wedding.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Partner One"}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'partner-two@wedding.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Partner Two"}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'planner@wedding.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Scoped Collaborator"}', now(), now()),
  ('10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'reader@wedding.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Read-only Collaborator"}', now(), now()),
  ('20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'other-wedding@wedding.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Other Wedding Owner"}', now(), now())
on conflict (id) do nothing;

insert into public.weddings (id, name, timezone, currency, created_by_user_id)
values
  ('a0000000-0000-4000-8000-000000000001', 'DEMO Wedding Alder', 'Europe/Dublin', 'EUR', '10000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001', 'DEMO Wedding Birch', 'Europe/London', 'GBP', '20000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

set constraints all deferred;
insert into public.wedding_members (id, wedding_id, user_id, role, status, created_by_user_id)
values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', 'active', '10000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'owner', 'active', '10000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'scoped_collaborator', 'active', '10000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'read_only_collaborator', 'active', '10000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'owner', 'active', '20000000-0000-4000-8000-000000000001');

insert into public.member_module_permissions (wedding_id, membership_id, module, access_level)
values
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'planning', 'edit'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'logistics', 'read'),
  ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'planning', 'read');

insert into public.functions (id, wedding_id, name, starts_at, venue_name, status, created_by_user_id)
values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'DEMO Alder Welcome Dinner', '2027-06-17 18:00:00+01', 'Synthetic Venue A', 'confirmed', '10000000-0000-4000-8000-000000000001'),
  ('a2000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'DEMO Alder Ceremony', '2027-06-18 14:30:00+01', 'Synthetic Venue A', 'tentative', '10000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'DEMO Birch Celebration', '2027-08-12 15:00:00+01', 'Synthetic Venue B', 'confirmed', '20000000-0000-4000-8000-000000000001');
