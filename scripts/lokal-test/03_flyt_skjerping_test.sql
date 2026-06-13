-- =============================================================
-- Lokal test av migrasjon 0006 (flyt-skjerping).
-- Forventa: alle "OK:"-linjer + "ALLE TESTAR PASSERTE".
-- =============================================================
\set ON_ERROR_STOP on

begin;

-- ---- Basistestdata ----
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000ccc', 'test3@normaer.no');

insert into brukar (id, auth_id, namn, rolle) values
  ('10000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000000ccc', 'C Leiar', 'leiar'),
  ('10000000-0000-0000-0000-00000000c002', null, 'C Operatør', 'operator'),
  ('10000000-0000-0000-0000-00000000c003', null, 'C Sveisar', 'sveisar');

select sett_pin('10000000-0000-0000-0000-00000000c002', '1111');

insert into kunde (id, namn) values ('20000000-0000-0000-0000-00000000c001', 'C-Test AS');

insert into prosjekt (id, prosjekt_nr, kunde_id, total_vekt_kg) values
  ('30000000-0000-0000-0000-00000000c001', '2026-FLYT',
   '20000000-0000-0000-0000-00000000c001', 100.00);

insert into jobbpakke (id, pakke_nr, prosjekt_id, beskriving, total_vekt_planlagt_kg, rekkefoelge) values
  ('40000000-0000-0000-0000-00000000c001', '2026-FLYT-P01',
   '30000000-0000-0000-0000-00000000c001', 'Flytskjerping-pakke', 100.00, 1);

-- ---- Funn 2: ugyldig steg_plan skal avvisast ----
do $$ begin
  insert into jobbkort (id, jobbkort_nr, jobbpakke_id, beskriving, vekt_kg, antal, steg_plan)
  values ('50000000-0000-0000-0000-00000000c901', '2026-FLYT-X1',
          '40000000-0000-0000-0000-00000000c001', 'Ugyldig steg', 50.00, 1,
          array['kapp','ukjent_steg','galv']);
  raise exception 'FEIL: jobbkort med ukjent steg_plan vart godteke';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: ugyldig steg i steg_plan vart avvist (%)', sqlerrm;
end $$;

-- ---- Funn 2: 'planlagt' / 'ferdig' skal ikkje vere lovleg i planen ----
do $$ begin
  insert into jobbkort (id, jobbkort_nr, jobbpakke_id, beskriving, vekt_kg, antal, steg_plan)
  values ('50000000-0000-0000-0000-00000000c902', '2026-FLYT-X2',
          '40000000-0000-0000-0000-00000000c001', 'Ulovleg planlagt', 50.00, 1,
          array['planlagt','kapp','galv']);
  raise exception 'FEIL: jobbkort med planlagt i steg_plan vart godteke';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: planlagt i steg_plan vart avvist (%)', sqlerrm;
end $$;

do $$ begin
  insert into jobbkort (id, jobbkort_nr, jobbpakke_id, beskriving, vekt_kg, antal, steg_plan)
  values ('50000000-0000-0000-0000-00000000c903', '2026-FLYT-X3',
          '40000000-0000-0000-0000-00000000c001', 'Ulovleg ferdig', 50.00, 1,
          array['kapp','galv','ferdig']);
  raise exception 'FEIL: jobbkort med ferdig i steg_plan vart godteke';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: ferdig i steg_plan vart avvist (%)', sqlerrm;
end $$;

-- ---- Opprett gyldige kort for sendt_tilbake-testar ----
insert into jobbkort (id, jobbkort_nr, jobbpakke_id, beskriving, vekt_kg, antal, steg_plan) values
  ('50000000-0000-0000-0000-00000000c001', '2026-FLYT-001',
   '40000000-0000-0000-0000-00000000c001', 'Standard løype', 100.00, 1,
   array['kapp','sveis','kontroll','admin_inspeksjon','galv']);

-- Slepp + køyr kortet fram til sveis
insert into steg_logg (jobbkort_id, steg, hending, brukar_id) values
  ('50000000-0000-0000-0000-00000000c001', 'planlagt', 'sleppt', '10000000-0000-0000-0000-00000000c001'),
  ('50000000-0000-0000-0000-00000000c001', 'kapp', 'skann_inn', '10000000-0000-0000-0000-00000000c002'),
  ('50000000-0000-0000-0000-00000000c001', 'kapp', 'skann_ut', '10000000-0000-0000-0000-00000000c002'),
  ('50000000-0000-0000-0000-00000000c001', 'sveis', 'skann_inn', '10000000-0000-0000-0000-00000000c003'),
  ('50000000-0000-0000-0000-00000000c001', 'sveis', 'skann_ut', '10000000-0000-0000-0000-00000000c003');

-- Skal no vere på kontroll/venter
do $$ begin
  if (select noverande_steg from jobbkort where jobbkort_nr = '2026-FLYT-001') <> 'kontroll' then
    raise exception 'FEIL: kort skulle vore på kontroll etter sveis';
  end if;
  raise notice 'OK: kort er på kontroll, klart for sendt_tilbake-testar';
end $$;

-- ---- Funn 1a: sendt_tilbake til steg FRAMOM noverande skal avvisast ----
-- Kortet er på kontroll. Forsøk å sende det "tilbake" til admin_inspeksjon (framom) → skal feile.
do $$ begin
  insert into steg_logg (jobbkort_id, steg, hending, brukar_id, sendt_tilbake_til_steg)
  values ('50000000-0000-0000-0000-00000000c001', 'kontroll', 'sendt_tilbake',
          '10000000-0000-0000-0000-00000000c001', 'admin_inspeksjon');
  raise exception 'FEIL: sendt_tilbake framover (kontroll→admin_inspeksjon) vart godteke';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: hopp framover via sendt_tilbake vart avvist (%)', sqlerrm;
end $$;

-- ---- Funn 1b: sendt_tilbake til same steg som noverande skal avvisast ----
do $$ begin
  insert into steg_logg (jobbkort_id, steg, hending, brukar_id, sendt_tilbake_til_steg)
  values ('50000000-0000-0000-0000-00000000c001', 'kontroll', 'sendt_tilbake',
          '10000000-0000-0000-0000-00000000c001', 'kontroll');
  raise exception 'FEIL: sendt_tilbake til same steg som noverande vart godteke';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: sendt_tilbake til same steg vart avvist (%)', sqlerrm;
end $$;

-- ---- Funn 1c: new.steg <> noverande_steg skal avvisast ----
-- Kortet er på kontroll. Forsøk å registrere sendt_tilbake frå 'sveis' → skal feile.
do $$ begin
  insert into steg_logg (jobbkort_id, steg, hending, brukar_id, sendt_tilbake_til_steg)
  values ('50000000-0000-0000-0000-00000000c001', 'sveis', 'sendt_tilbake',
          '10000000-0000-0000-0000-00000000c001', 'kapp');
  raise exception 'FEIL: sendt_tilbake frå feil steg vart godteke';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: sendt_tilbake med feil new.steg vart avvist (%)', sqlerrm;
end $$;

-- ---- Funn 1d: gyldig sendt_tilbake (kontroll → sveis) skal gå ----
insert into steg_logg (jobbkort_id, steg, hending, brukar_id, sendt_tilbake_til_steg, kommentar)
values ('50000000-0000-0000-0000-00000000c001', 'kontroll', 'sendt_tilbake',
        '10000000-0000-0000-0000-00000000c001', 'sveis', 'Sveisefeil oppdaga');

do $$ begin
  if (select noverande_steg from jobbkort where jobbkort_nr = '2026-FLYT-001') <> 'sveis' then
    raise exception 'FEIL: kortet skulle vore tilbake på sveis';
  end if;
  if (select rework_runde from jobbkort where jobbkort_nr = '2026-FLYT-001') <> 1 then
    raise exception 'FEIL: rework_runde skulle vore 1';
  end if;
  raise notice 'OK: gyldig sendt_tilbake (kontroll→sveis) → rework_runde=1';
end $$;

-- ---- Funn 1e: ferdige kort kan ikkje reopnast ----
-- Køyr kortet heile vegen til ferdig
insert into steg_logg (jobbkort_id, steg, hending, brukar_id) values
  ('50000000-0000-0000-0000-00000000c001', 'sveis', 'skann_inn', '10000000-0000-0000-0000-00000000c003'),
  ('50000000-0000-0000-0000-00000000c001', 'sveis', 'skann_ut', '10000000-0000-0000-0000-00000000c003'),
  ('50000000-0000-0000-0000-00000000c001', 'kontroll', 'skann_inn', '10000000-0000-0000-0000-00000000c002'),
  ('50000000-0000-0000-0000-00000000c001', 'kontroll', 'skann_ut', '10000000-0000-0000-0000-00000000c002'),
  ('50000000-0000-0000-0000-00000000c001', 'admin_inspeksjon', 'godkjent', '10000000-0000-0000-0000-00000000c001'),
  ('50000000-0000-0000-0000-00000000c001', 'galv', 'sendt_galv', '10000000-0000-0000-0000-00000000c001');

insert into galvanisering (jobbkort_id, sendt_dato, sendt_antal, motteke_dato, motteke_antal, sinklag_um)
values ('50000000-0000-0000-0000-00000000c001', current_date - 5, 1, current_date, 1, 85);

insert into steg_logg (jobbkort_id, steg, hending, brukar_id, metadata)
values ('50000000-0000-0000-0000-00000000c001', 'galv', 'motteke_galv',
        '10000000-0000-0000-0000-00000000c001', '{"antal": 1}');

do $$ begin
  if (select noverande_steg from jobbkort where jobbkort_nr = '2026-FLYT-001') <> 'ferdig' then
    raise exception 'FEIL: kortet skulle vore ferdig før reopen-testen';
  end if;
  raise notice 'OK: kortet er ferdig, klart for reopen-test';
end $$;

do $$ begin
  insert into steg_logg (jobbkort_id, steg, hending, brukar_id, sendt_tilbake_til_steg)
  values ('50000000-0000-0000-0000-00000000c001', 'ferdig', 'sendt_tilbake',
          '10000000-0000-0000-0000-00000000c001', 'kontroll');
  raise exception 'FEIL: ferdige kort kunne sendast tilbake';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: ferdige kort kan ikkje reopnast (%)', sqlerrm;
end $$;

select 'ALLE TESTAR PASSERTE' as resultat;

rollback;
