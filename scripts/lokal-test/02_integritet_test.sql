-- =============================================================
-- Lokal test av migrasjon 0005 (jobbkort-integritet).
-- Køyr etter 01_flyt_test.sql (som rullar tilbake testdata).
-- Forventa: alle "OK:"-linjer + "ALLE TESTAR PASSERTE".
-- =============================================================
\set ON_ERROR_STOP on

begin;

-- ---- Basistestdata ----
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000bbb', 'test2@normaer.no');

insert into brukar (id, auth_id, namn, rolle) values
  ('10000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-000000000bbb', 'Test Leiar', 'leiar'),
  ('10000000-0000-0000-0000-00000000b002', null, 'Test Operatør', 'operator');

insert into kunde (id, namn) values ('20000000-0000-0000-0000-00000000b001', 'TestAS');

insert into prosjekt (id, prosjekt_nr, kunde_id, total_vekt_kg) values
  ('30000000-0000-0000-0000-00000000b001', '2026-INT', '20000000-0000-0000-0000-00000000b001', 200.00);

insert into jobbpakke (id, pakke_nr, prosjekt_id, beskriving, total_vekt_planlagt_kg) values
  ('40000000-0000-0000-0000-00000000b001', '2026-INT-P01',
   '30000000-0000-0000-0000-00000000b001', 'Integrasjonstest-pakke', 200.00);

-- ---- Test: opprett_jobbkort genererer sekvensnummer korrekt ----
do $$
declare
  r1 record; r2 record;
begin
  select * into r1 from opprett_jobbkort(
    '40000000-0000-0000-0000-00000000b001',
    'Kort A', null, null, 100.0, 1, null,
    array['kapp','sveis','galv']
  );
  select * into r2 from opprett_jobbkort(
    '40000000-0000-0000-0000-00000000b001',
    'Kort B', null, null, 90.0, 1, null,
    array['kapp','galv']
  );

  if r1.jobbkort_nr <> '2026-INT-P01-001' then
    raise exception 'FEIL: første nummer skulle vore 2026-INT-P01-001, fekk %', r1.jobbkort_nr;
  end if;
  if r2.jobbkort_nr <> '2026-INT-P01-002' then
    raise exception 'FEIL: andre nummer skulle vore 2026-INT-P01-002, fekk %', r2.jobbkort_nr;
  end if;

  raise notice 'OK: opprett_jobbkort genererer sekvensnummer atomisk (%, %)',
    r1.jobbkort_nr, r2.jobbkort_nr;
end $$;

-- ---- Test: steg_plan kan ikkje endrast etter slepp ----
do $$
declare v_id uuid;
begin
  select id into v_id from jobbkort where jobbkort_nr = '2026-INT-P01-001';

  -- Slepp kortet
  insert into steg_logg (jobbkort_id, steg, hending, brukar_id)
  values (v_id, 'planlagt', 'sleppt', '10000000-0000-0000-0000-00000000b001');

  -- Forsøk å endre steg_plan etter slepp → skal feile
  begin
    update jobbkort set steg_plan = array['kapp','galv'] where id = v_id;
    raise exception 'FEIL: steg_plan vart endra etter slepp';
  exception when others then
    if sqlerrm like 'FEIL:%' then raise; end if;
    raise notice 'OK: steg_plan er immutable etter slepp (%)', sqlerrm;
  end;

  -- Forsøk å endre jobbkort_nr etter slepp → skal feile
  begin
    update jobbkort set jobbkort_nr = 'HACKA-001' where id = v_id;
    raise exception 'FEIL: jobbkort_nr vart endra etter slepp';
  exception when others then
    if sqlerrm like 'FEIL:%' then raise; end if;
    raise notice 'OK: jobbkort_nr er immutable etter slepp (%)', sqlerrm;
  end;

  -- Endre beskriving skal framleis gå (ikkje beskytta)
  update jobbkort set beskriving = 'Oppdatert beskriving' where id = v_id;
  raise notice 'OK: beskriving kan framleis endrast etter slepp';
end $$;

-- ---- Test: valider_alle_pakkar_vekt returnerer riktig ----
do $$
declare r record;
begin
  select * into r from valider_alle_pakkar_vekt('30000000-0000-0000-0000-00000000b001')
  where pakke_id = '40000000-0000-0000-0000-00000000b001';

  -- 190 kg av 200 planlagt = 5% avvik = utanfor toleranse
  if r.innan_toleranse then
    raise exception 'FEIL: 190/200 kg (5%%) skulle vore utanfor toleranse';
  end if;
  if round(r.avvik_prosent, 1) <> 5.0 then
    raise exception 'FEIL: avvik_prosent = %, forventa 5.0', r.avvik_prosent;
  end if;
  raise notice 'OK: valider_alle_pakkar_vekt: 190/200 kg = %% avvik (utanfor toleranse)', r.avvik_prosent;
end $$;

-- ---- Test: steg_logg-audit kan framleis ikkje endrast ----
do $$
declare v_id uuid;
begin
  select id into v_id from jobbkort where jobbkort_nr = '2026-INT-P01-001';

  begin
    delete from steg_logg where jobbkort_id = v_id;
    raise exception 'FEIL: sletting frå steg_logg vart godteke';
  exception when others then
    if sqlerrm like 'FEIL:%' then raise; end if;
    raise notice 'OK: steg_logg er framleis låst (%)', sqlerrm;
  end;
end $$;

select 'ALLE TESTAR PASSERTE' as resultat;

rollback;
