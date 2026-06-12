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
