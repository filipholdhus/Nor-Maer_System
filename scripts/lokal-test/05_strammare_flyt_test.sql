-- =============================================================
-- Lokal test av migrasjon 0008 (strammare flyt).
-- Forventa: alle "OK:"-linjer + "ALLE TESTAR PASSERTE".
-- =============================================================
\set ON_ERROR_STOP on

begin;

-- ---- Basistestdata ----
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000e01', 'e-leiar@normaer.no');

insert into brukar (id, auth_id, namn, rolle) values
  ('10000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-000000000e01', 'E Leiar', 'leiar'),
  ('10000000-0000-0000-0000-00000000e002', null, 'E Operatør', 'operator');

insert into kunde (id, namn) values ('20000000-0000-0000-0000-00000000e001', 'E-Test AS');

insert into prosjekt (id, prosjekt_nr, kunde_id, total_vekt_kg) values
  ('30000000-0000-0000-0000-00000000e001', '2026-STRAM',
   '20000000-0000-0000-0000-00000000e001', 100.00);

insert into jobbpakke (id, pakke_nr, prosjekt_id, beskriving, total_vekt_planlagt_kg, rekkefoelge) values
  ('40000000-0000-0000-0000-00000000e001', '2026-STRAM-P01',
   '30000000-0000-0000-0000-00000000e001', 'Strammare-test', 100.00, 1);

-- =============================================================
-- Funn 5: steg_plan kan ikkje innehalde duplikat
-- =============================================================

do $$ begin
  insert into jobbkort (id, jobbkort_nr, jobbpakke_id, beskriving, vekt_kg, antal, steg_plan)
  values ('50000000-0000-0000-0000-00000000e990', '2026-STRAM-X1',
          '40000000-0000-0000-0000-00000000e001', 'Duplikat ved insert', 50, 1,
          array['kapp','sveis','sveis','galv']);
  raise exception 'FEIL: jobbkort med duplikat-steg vart godteke ved insert';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: insert med duplikat-steg vart avvist (%)', sqlerrm;
end $$;

-- Oppdatering til duplikat skal òg avvisast
insert into jobbkort (id, jobbkort_nr, jobbpakke_id, beskriving, vekt_kg, antal, steg_plan)
values ('50000000-0000-0000-0000-00000000e991', '2026-STRAM-O1',
        '40000000-0000-0000-0000-00000000e001', 'Original plan', 50, 1,
        array['kapp','sveis','galv']);

do $$ begin
  update jobbkort set steg_plan = array['kapp','kapp','galv']
  where id = '50000000-0000-0000-0000-00000000e991';
  raise exception 'FEIL: oppdatering til duplikat-steg vart godteke';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: update med duplikat-steg vart avvist (%)', sqlerrm;
end $$;

-- =============================================================
-- Funn 2: sendt_tilbake krev noverande_status = 'venter'
-- =============================================================

insert into jobbkort (id, jobbkort_nr, jobbpakke_id, beskriving, vekt_kg, antal, steg_plan)
values ('50000000-0000-0000-0000-00000000e001', '2026-STRAM-001',
        '40000000-0000-0000-0000-00000000e001', 'Paagaar-test', 50, 1,
        array['kapp','sveis','admin_inspeksjon','galv']);

-- Slepp + køyr fram til sveis/paagaar
insert into steg_logg (jobbkort_id, steg, hending, brukar_id) values
  ('50000000-0000-0000-0000-00000000e001', 'planlagt', 'sleppt',
   '10000000-0000-0000-0000-00000000e001'),
  ('50000000-0000-0000-0000-00000000e001', 'kapp', 'skann_inn',
   '10000000-0000-0000-0000-00000000e002'),
  ('50000000-0000-0000-0000-00000000e001', 'kapp', 'skann_ut',
   '10000000-0000-0000-0000-00000000e002'),
  ('50000000-0000-0000-0000-00000000e001', 'sveis', 'skann_inn',
   '10000000-0000-0000-0000-00000000e002');

-- Sjekk at kortet faktisk er paagaar
do $$ begin
  if (select noverande_steg || '/' || noverande_status from jobbkort
      where id = '50000000-0000-0000-0000-00000000e001') <> 'sveis/paagaar' then
    raise exception 'FEIL: kortet skulle vore sveis/paagaar før paagaar-test';
  end if;
  raise notice 'OK: kortet er sveis/paagaar — klart for paagaar-test';
end $$;

-- sendt_tilbake på paagaar → skal feile
do $$ begin
  insert into steg_logg (jobbkort_id, steg, hending, brukar_id, sendt_tilbake_til_steg)
  values ('50000000-0000-0000-0000-00000000e001', 'sveis', 'sendt_tilbake',
          '10000000-0000-0000-0000-00000000e001', 'kapp');
  raise exception 'FEIL: sendt_tilbake på paagaar vart godteke';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: sendt_tilbake på paagaar vart avvist (%)', sqlerrm;
end $$;

-- Operatøren skannar ut først — kortet blir admin_inspeksjon/venter
insert into steg_logg (jobbkort_id, steg, hending, brukar_id) values
  ('50000000-0000-0000-0000-00000000e001', 'sveis', 'skann_ut',
   '10000000-0000-0000-0000-00000000e002');

-- No skal sendt_tilbake gå
insert into steg_logg (jobbkort_id, steg, hending, brukar_id, sendt_tilbake_til_steg) values
  ('50000000-0000-0000-0000-00000000e001', 'admin_inspeksjon', 'sendt_tilbake',
   '10000000-0000-0000-0000-00000000e001', 'sveis');

do $$ begin
  if (select noverande_steg || '/' || noverande_status from jobbkort
      where id = '50000000-0000-0000-0000-00000000e001') <> 'sveis/venter' then
    raise exception 'FEIL: kortet skulle vore sveis/venter etter sendt_tilbake';
  end if;
  raise notice 'OK: sendt_tilbake går gjennom når status = venter';
end $$;

select 'ALLE TESTAR PASSERTE' as resultat;

rollback;
