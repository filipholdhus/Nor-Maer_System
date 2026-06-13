-- =============================================================
-- Lokal test av migrasjon 0007 (tilgang-skjerping).
-- Testar at RLS-policyane er rolle-spesifikke per hending.
--
-- Køyrer som ulike "innlogga brukarar" via SET ROLE authenticated
-- + set_config('request.jwt.claim.sub', ...) — auth.uid() les denne.
-- Forventa: alle "OK:"-linjer + "ALLE TESTAR PASSERTE".
-- =============================================================
\set ON_ERROR_STOP on

begin;

-- ---- Brukarar med ulike roller ----
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000d01', 'd-admin@normaer.no'),
  ('00000000-0000-0000-0000-000000000d02', 'd-leiar@normaer.no'),
  ('00000000-0000-0000-0000-000000000d03', 'd-kvalitet@normaer.no'),
  ('00000000-0000-0000-0000-000000000d04', 'd-op@normaer.no');

insert into brukar (id, auth_id, namn, rolle) values
  ('10000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-000000000d01', 'D Admin', 'admin'),
  ('10000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-000000000d02', 'D Leiar', 'leiar'),
  ('10000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-000000000d03', 'D Kvalitet', 'kvalitet'),
  ('10000000-0000-0000-0000-00000000d004', '00000000-0000-0000-0000-000000000d04', 'D Op', 'operator');

-- Stamdata
insert into kunde (id, namn) values ('20000000-0000-0000-0000-00000000d001', 'D-Test AS');
insert into prosjekt (id, prosjekt_nr, kunde_id, total_vekt_kg) values
  ('30000000-0000-0000-0000-00000000d001', '2026-RLS',
   '20000000-0000-0000-0000-00000000d001', 100);
insert into jobbpakke (id, pakke_nr, prosjekt_id, beskriving, total_vekt_planlagt_kg, rekkefoelge) values
  ('40000000-0000-0000-0000-00000000d001', '2026-RLS-P01',
   '30000000-0000-0000-0000-00000000d001', 'RLS-test', 100, 1);
insert into jobbkort (id, jobbkort_nr, jobbpakke_id, beskriving, vekt_kg, antal, steg_plan) values
  ('50000000-0000-0000-0000-00000000d001', '2026-RLS-001',
   '40000000-0000-0000-0000-00000000d001', 'Kort A', 50, 1,
   array['kapp','admin_inspeksjon','galv']),
  ('50000000-0000-0000-0000-00000000d002', '2026-RLS-002',
   '40000000-0000-0000-0000-00000000d001', 'Kort B', 50, 1, array['kapp','galv']);

-- =============================================================
-- 'sleppt' krev admin eller leiar (IKKJE kvalitet, IKKJE operatør)
-- =============================================================

-- kvalitet skal nektast
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d03', true);

do $$ begin
  insert into steg_logg (jobbkort_id, steg, hending, brukar_id)
  values ('50000000-0000-0000-0000-00000000d001', 'planlagt', 'sleppt',
          '10000000-0000-0000-0000-00000000d003');
  raise exception 'FEIL: kvalitet fekk sleppe via RLS';
exception
  when insufficient_privilege then
    raise notice 'OK: RLS nektar kvalitet å sleppe (%)', sqlerrm;
  when others then
    raise exception 'FEIL: kvalitet-slepp feila av feil grunn: %', sqlerrm;
end $$;

reset role;

-- operatør skal nektast
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d04', true);

do $$ begin
  insert into steg_logg (jobbkort_id, steg, hending, brukar_id)
  values ('50000000-0000-0000-0000-00000000d001', 'planlagt', 'sleppt',
          '10000000-0000-0000-0000-00000000d004');
  raise exception 'FEIL: operatør fekk sleppe via RLS';
exception
  when insufficient_privilege then
    raise notice 'OK: RLS nektar operatør å sleppe (%)', sqlerrm;
  when others then
    raise exception 'FEIL: operatør-slepp feila av feil grunn: %', sqlerrm;
end $$;

reset role;

-- leiar skal få lov
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d02', true);

insert into steg_logg (jobbkort_id, steg, hending, brukar_id)
values ('50000000-0000-0000-0000-00000000d001', 'planlagt', 'sleppt',
        '10000000-0000-0000-0000-00000000d002');

reset role;

do $$ begin
  if (select noverande_steg from jobbkort where jobbkort_nr = '2026-RLS-001') <> 'kapp' then
    raise exception 'FEIL: leiar-slepp fekk ikkje flytta kort til kapp';
  end if;
  raise notice 'OK: leiar kan sleppe';
end $$;

-- admin skal få lov
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d01', true);

insert into steg_logg (jobbkort_id, steg, hending, brukar_id)
values ('50000000-0000-0000-0000-00000000d002', 'planlagt', 'sleppt',
        '10000000-0000-0000-0000-00000000d001');

reset role;

do $$ begin
  if (select noverande_steg from jobbkort where jobbkort_nr = '2026-RLS-002') <> 'kapp' then
    raise exception 'FEIL: admin-slepp fekk ikkje flytta kort til kapp';
  end if;
  raise notice 'OK: admin kan sleppe';
end $$;

-- =============================================================
-- 'godkjent' krev admin/leiar/kvalitet (operatør nektast)
-- =============================================================

-- Domenemessig gyldig tilstand: utan RLS ville hendinga blitt godteken.
update jobbkort
set noverande_steg = 'admin_inspeksjon', noverande_status = 'venter'
where id = '50000000-0000-0000-0000-00000000d001';

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d04', true);

do $$ begin
  insert into steg_logg (jobbkort_id, steg, hending, brukar_id)
  values ('50000000-0000-0000-0000-00000000d001', 'admin_inspeksjon', 'godkjent',
          '10000000-0000-0000-0000-00000000d004');
  raise exception 'FEIL: operatør fekk registrere godkjent';
exception
  when insufficient_privilege then
    raise notice 'OK: RLS nektar operatør å registrere godkjent (%)', sqlerrm;
  when others then
    raise exception 'FEIL: operatør-godkjenning feila av feil grunn: %', sqlerrm;
end $$;

reset role;

-- kvalitet skal få lov
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d03', true);

insert into steg_logg (jobbkort_id, steg, hending, brukar_id)
values ('50000000-0000-0000-0000-00000000d001', 'admin_inspeksjon', 'godkjent',
        '10000000-0000-0000-0000-00000000d003');

reset role;

do $$ begin
  if (select noverande_steg from jobbkort where id = '50000000-0000-0000-0000-00000000d001') <> 'galv' then
    raise exception 'FEIL: kvalitet-godkjenning flytta ikkje kortet til galv';
  end if;
  raise notice 'OK: kvalitet kan registrere godkjent';
end $$;

-- =============================================================
-- 'sendt_tilbake' krev admin/leiar/kvalitet (operatør nektast)
-- =============================================================

-- Domenemessig gyldig tilstand: galv → kapp er bakover i steg-planen.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d04', true);

do $$ begin
  insert into steg_logg (jobbkort_id, steg, hending, brukar_id, sendt_tilbake_til_steg)
  values ('50000000-0000-0000-0000-00000000d001', 'galv', 'sendt_tilbake',
          '10000000-0000-0000-0000-00000000d004', 'kapp');
  raise exception 'FEIL: operatør fekk sende tilbake';
exception
  when insufficient_privilege then
    raise notice 'OK: RLS nektar operatør å sende tilbake (%)', sqlerrm;
  when others then
    raise exception 'FEIL: operatør-retur feila av feil grunn: %', sqlerrm;
end $$;

reset role;

-- kvalitet skal få lov
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000d03', true);

insert into steg_logg (jobbkort_id, steg, hending, brukar_id, sendt_tilbake_til_steg)
values ('50000000-0000-0000-0000-00000000d001', 'galv', 'sendt_tilbake',
        '10000000-0000-0000-0000-00000000d003', 'kapp');

reset role;

do $$ begin
  if (select noverande_steg from jobbkort where id = '50000000-0000-0000-0000-00000000d001') <> 'kapp' then
    raise exception 'FEIL: kvalitet-retur flytta ikkje kortet til kapp';
  end if;
  raise notice 'OK: kvalitet kan registrere sendt_tilbake';
end $$;

-- =============================================================
-- Storage: tegningar-bucket har serverside MIME/storleik
-- =============================================================

do $$
declare
  v_limit bigint;
  v_mimes text[];
begin
  select file_size_limit, allowed_mime_types
    into v_limit, v_mimes
    from storage.buckets where id = 'tegningar';

  if v_limit is null or v_limit <> 20971520 then
    raise exception 'FEIL: file_size_limit ikkje sett til 20 MB (er: %)', v_limit;
  end if;
  if v_mimes is null or v_mimes <> array['application/pdf'] then
    raise exception 'FEIL: allowed_mime_types ikkje sett (er: %)', v_mimes;
  end if;
  raise notice 'OK: tegningar-bucket har file_size_limit=% og allowed_mime_types=%',
    v_limit, v_mimes;
end $$;

-- DELETE-policyen finst
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'slett_tegningar'
  ) then
    raise exception 'FEIL: slett_tegningar-policy finst ikkje';
  end if;
  raise notice 'OK: DELETE-policy på tegningar finst (admin/leiar)';
end $$;

select 'ALLE TESTAR PASSERTE' as resultat;

rollback;
