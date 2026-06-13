-- BERRE FOR LOKAL TESTING — Supabase har dette innebygd.
-- Stubbar auth-skjemaet så migrasjonane kan verifiserast mot rein Postgres.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Supabase har òg rolla "authenticated":
do $$ begin
  create role authenticated;
exception when duplicate_object then null;
end $$;

-- I Supabase får rolla "authenticated" automatisk SELECT/INSERT/UPDATE/DELETE-grants
-- på public via plattformen. Når vi køyrer mot rein Postgres må vi gjere dette
-- eksplisitt slik at RLS-testar (SET ROLE authenticated) treffer RLS i staden
-- for å feile på rein permission-denied.
grant usage on schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
