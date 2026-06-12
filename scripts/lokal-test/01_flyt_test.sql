-- =============================================================
-- Lokal verifikasjonstest av Nor-Mær-skjemaet.
-- Køyrer heile flyten og sjekkar at reglane blir handheva.
-- Forventa resultat: alle "OK:"-linjer, ingen uventa feil.
-- =============================================================
\set ON_ERROR_STOP on

begin;

-- ---- Test-brukarar (steg to-kravet: sett inn test-brukar via SQL) ----
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aaaa', 'filip@normaer.no');

insert into brukar (id, auth_id, namn, rolle) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa', 'Filip Holdhus', 'leiar'),
  ('10000000-0000-0000-0000-000000000002', null, 'Ola Kappar', 'operator'),
  ('10000000-0000-0000-0000-000000000003', null, 'Kari Sveisar', 'sveisar');

select sett_pin('10000000-0000-0000-0000-000000000002', '1234');

do $$ begin
  if not sjekk_pin('10000000-0000-0000-0000-000000000002', '1234') then
    raise exception 'FEIL: rett PIN vart avvist';
  end if;
  if sjekk_pin('10000000-0000-0000-0000-000000000002', '9999') then
    raise exception 'FEIL: feil PIN vart godkjend';
  end if;
  raise notice 'OK: PIN-hashing og verifisering fungerer';
end $$;

do $$ begin
  if (select pin_hash from brukar where namn = 'Ola Kappar') like '1234%' then
    raise exception 'FEIL: PIN lagra i klartekst';
  end if;
  raise notice 'OK: PIN er hasha (bcrypt), ikkje klartekst';
end $$;

-- ---- Kunde, prosjekt, pakke, kort ----
insert into kunde (id, namn) values ('20000000-0000-0000-0000-000000000001', 'Testoppdrett AS');

insert into prosjekt (id, prosjekt_nr, kunde_id, total_vekt_kg) values
  ('30000000-0000-0000-0000-000000000001', '2026-047',
   '20000000-0000-0000-0000-000000000001', 300.00);

insert into jobbpakke (id, pakke_nr, prosjekt_id, beskriving, total_vekt_planlagt_kg) values
  ('40000000-0000-0000-0000-000000000001', '2026-047-P01',
   '30000000-0000-0000-0000-000000000001', 'Fortøyningssystem aust', 300.00);

-- To kort: 001 (full løype) og 002 (smådel utan sveis/kontroll)
insert into jobbkort (id, jobbkort_nr, jobbpakke_id, beskriving, vekt_kg, antal, steg_plan) values
  ('50000000-0000-0000-0000-000000000001', '2026-047-001',
   '40000000-0000-0000-0000-000000000001', 'Hovudbjelke HEB200', 200.00, 1,
   array['kapp','sveis','kontroll','admin_inspeksjon','galv']),
  ('50000000-0000-0000-0000-000000000002', '2026-047-002',
   '40000000-0000-0000-0000-000000000001', 'Braketter', 95.00, 10,
   array['kapp','galv']);

-- ---- Vektvalidering ----
do $$
declare r jsonb;
begin
  r := valider_jobbpakke_vekt('40000000-0000-0000-0000-000000000001');
  if (r->>'innan_toleranse')::boolean then
    raise notice 'OK: vektvalidering pakke: 295 mot 300 kg = innanfor 2%% (%)', r->>'avvik_prosent';
  else
    raise exception 'FEIL: 295/300 skulle vore innanfor toleranse: %', r;
  end if;
end $$;

-- ---- Skann inn FØR slepp skal nektast ----
do $$ begin
  insert into steg_logg (jobbkort_id, steg, hending, brukar_id)
  values ('50000000-0000-0000-0000-000000000001', 'kapp', 'skann_inn',
          '10000000-0000-0000-0000-000000000002');
  raise exception 'FEIL: skann inn på ikkje-sleppt kort vart godteke';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: skann inn nekta før slepp (%)', sqlerrm;
end $$;

-- ---- Slepp begge korta ----
insert into steg_logg (jobbkort_id, steg, hending, brukar_id) values
  ('50000000-0000-0000-0000-000000000001', 'planlagt', 'sleppt', '10000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002', 'planlagt', 'sleppt', '10000000-0000-0000-0000-000000000001');

do $$ begin
  if (select noverande_steg from jobbkort where jobbkort_nr = '2026-047-001') <> 'kapp' then
    raise exception 'FEIL: kort 001 skulle vore på kapp etter slepp';
  end if;
  raise notice 'OK: slepp flytta korta til første steg i steg-planen (kapp)';
end $$;

-- ---- Hard FIFO: kort 002 kan ikkje takast før 001 ----
do $$
declare r jsonb;
begin
  r := sjekk_skann_inn('2026-047-002', 'kapp', '10000000-0000-0000-0000-000000000002');
  if (r->>'ok')::boolean then
    raise exception 'FEIL: FIFO-brot vart godkjent av sjekk_skann_inn';
  end if;
  raise notice 'OK: sjekk_skann_inn gir raud ✕: "%" (neste: %)', r->>'melding', r->>'neste_jobbkort_nr';
end $$;

do $$ begin
  insert into steg_logg (jobbkort_id, steg, hending, brukar_id)
  values ('50000000-0000-0000-0000-000000000002', 'kapp', 'skann_inn',
          '10000000-0000-0000-0000-000000000002');
  raise exception 'FEIL: FIFO-brot vart godteke av databasen';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: databasen blokkerte FIFO-brot (%)', sqlerrm;
end $$;

-- Avvist skann skal kunne loggast (audit):
insert into steg_logg (jobbkort_id, steg, hending, brukar_id, metadata)
values ('50000000-0000-0000-0000-000000000002', 'kapp', 'skann_avvist',
        '10000000-0000-0000-0000-000000000002', '{"avvist_grunn": "fifo"}');

-- ---- Rett kort: grøn ✓ og skann inn ----
do $$
declare r jsonb;
begin
  r := sjekk_skann_inn('2026-047-001', 'kapp', '10000000-0000-0000-0000-000000000002');
  if not (r->>'ok')::boolean then
    raise exception 'FEIL: rett kort vart nekta: %', r;
  end if;
  raise notice 'OK: sjekk_skann_inn gir grøn ✓ for rett kort';
end $$;

insert into steg_logg (jobbkort_id, steg, hending, brukar_id)
values ('50000000-0000-0000-0000-000000000001', 'kapp', 'skann_inn',
        '10000000-0000-0000-0000-000000000002');

-- ---- Éin operatør, eitt kort ----
do $$ begin
  insert into steg_logg (jobbkort_id, steg, hending, brukar_id)
  values ('50000000-0000-0000-0000-000000000002', 'kapp', 'skann_inn',
          '10000000-0000-0000-0000-000000000002');
  raise exception 'FEIL: same operatør fekk to aktive kort';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: éin operatør, eitt kort handheva (%)', sqlerrm;
end $$;

-- ---- Skann ut: kapp → sveis ----
insert into steg_logg (jobbkort_id, steg, hending, brukar_id)
values ('50000000-0000-0000-0000-000000000001', 'kapp', 'skann_ut',
        '10000000-0000-0000-0000-000000000002');

do $$ begin
  if (select noverande_steg || '/' || noverande_status from jobbkort
      where jobbkort_nr = '2026-047-001') <> 'sveis/venter' then
    raise exception 'FEIL: kort 001 skulle vore sveis/venter';
  end if;
  if (select aktiv_brukar_id from jobbkort where jobbkort_nr = '2026-047-001') is not null then
    raise exception 'FEIL: aktiv_brukar_id skulle vore nullstilt';
  end if;
  raise notice 'OK: skann ut flytta kortet til neste steg i planen (sveis)';
end $$;

-- ---- Sveis: inn, mottakskontroll finn feil → avvik + sendt tilbake ----
insert into steg_logg (jobbkort_id, steg, hending, brukar_id)
values ('50000000-0000-0000-0000-000000000001', 'sveis', 'skann_inn',
        '10000000-0000-0000-0000-000000000003');

insert into avvik (jobbkort_id, oppdaga_paa_steg, oppdaga_ved, aarsak_steg, aarsakskode,
                   kommentar, opprettet_av)
values ('50000000-0000-0000-0000-000000000001', 'sveis', 'skann_inn', 'kapp', 'feil_maal',
        'Kappa 5 mm for kort', '10000000-0000-0000-0000-000000000003');

insert into steg_logg (jobbkort_id, steg, hending, brukar_id, sendt_tilbake_til_steg, kommentar)
values ('50000000-0000-0000-0000-000000000001', 'sveis', 'sendt_tilbake',
        '10000000-0000-0000-0000-000000000003', 'kapp', 'Feil mål oppdaga ved mottak');

do $$ begin
  if (select noverande_steg || '/' || rework_runde::text from jobbkort
      where jobbkort_nr = '2026-047-001') <> 'kapp/1' then
    raise exception 'FEIL: sendt_tilbake skulle gitt kapp + rework_runde=1';
  end if;
  raise notice 'OK: avvik ved mottak → sendt tilbake til kapp, rework_runde=1';
end $$;

-- ---- Køyr 001 gjennom resten av løypa ----
insert into steg_logg (jobbkort_id, steg, hending, brukar_id) values
  ('50000000-0000-0000-0000-000000000001', 'kapp', 'skann_inn',  '10000000-0000-0000-0000-000000000002'),
  ('50000000-0000-0000-0000-000000000001', 'kapp', 'skann_ut',   '10000000-0000-0000-0000-000000000002'),
  ('50000000-0000-0000-0000-000000000001', 'sveis', 'skann_inn', '10000000-0000-0000-0000-000000000003');

-- Sveisar dokumenterer WPS ved skann ut (ISO 3834):
insert into steg_logg (jobbkort_id, steg, hending, brukar_id, metadata) values
  ('50000000-0000-0000-0000-000000000001', 'sveis', 'skann_ut',
   '10000000-0000-0000-0000-000000000003', '{"wps": "WPS-204"}');

insert into steg_logg (jobbkort_id, steg, hending, brukar_id) values
  ('50000000-0000-0000-0000-000000000001', 'kontroll', 'skann_inn', '10000000-0000-0000-0000-000000000002'),
  ('50000000-0000-0000-0000-000000000001', 'kontroll', 'skann_ut',  '10000000-0000-0000-0000-000000000002');

-- Admin godkjenner:
insert into steg_logg (jobbkort_id, steg, hending, brukar_id) values
  ('50000000-0000-0000-0000-000000000001', 'admin_inspeksjon', 'godkjent', '10000000-0000-0000-0000-000000000001');

-- No er 001 på galv/venter, og 002 er neste i kø på kapp:
do $$
declare r record;
begin
  select * into r from neste_i_koe('kapp');
  if r.jobbkort_nr <> '2026-047-002' then
    raise exception 'FEIL: neste i kø på kapp skulle vore 002';
  end if;
  raise notice 'OK: FIFO-køen peikar no på 2026-047-002';
end $$;

-- ---- Galv: send 10, få 8 tilbake (delvis retur) ----
insert into steg_logg (jobbkort_id, steg, hending, brukar_id) values
  ('50000000-0000-0000-0000-000000000001', 'galv', 'sendt_galv', '10000000-0000-0000-0000-000000000001');

insert into galvanisering (jobbkort_id, sendt_dato, sendt_antal, motteke_dato, motteke_antal, sinklag_um)
values ('50000000-0000-0000-0000-000000000001', current_date - 7, 10, current_date, 8, 85);

insert into avvik (jobbkort_id, oppdaga_paa_steg, oppdaga_ved, aarsakskode, manko_antal,
                   kommentar, opprettet_av)
values ('50000000-0000-0000-0000-000000000001', 'galv', 'admin', 'galv_manko', 2,
        '2 braketter ikkje returnert frå galvanisør', '10000000-0000-0000-0000-000000000001');

insert into steg_logg (jobbkort_id, steg, hending, brukar_id, metadata) values
  ('50000000-0000-0000-0000-000000000001', 'galv', 'motteke_galv',
   '10000000-0000-0000-0000-000000000001', '{"antal": 8}');

do $$ begin
  if (select noverande_steg from jobbkort where jobbkort_nr = '2026-047-001') <> 'galv' then
    raise exception 'FEIL: kortet skulle blitt VERANDE på galv ved delvis retur';
  end if;
  raise notice 'OK: delvis retur (8 av 10) → kortet blir på galv, avvik med manko_antal=2';
end $$;

-- Resten kjem:
insert into galvanisering (jobbkort_id, motteke_dato, motteke_antal, sinklag_um)
values ('50000000-0000-0000-0000-000000000001', current_date + 3, 2, 87);

insert into steg_logg (jobbkort_id, steg, hending, brukar_id, metadata) values
  ('50000000-0000-0000-0000-000000000001', 'galv', 'motteke_galv',
   '10000000-0000-0000-0000-000000000001', '{"antal": 2}');

do $$ begin
  if (select noverande_steg || '/' || noverande_status from jobbkort
      where jobbkort_nr = '2026-047-001') <> 'ferdig/ferdig' then
    raise exception 'FEIL: kortet skulle vore ferdig når alt er tilbake frå galv';
  end if;
  raise notice 'OK: full retur frå galv → kortet er ferdig';
end $$;

-- ---- Audit-trail kan ikkje endrast ----
do $$ begin
  delete from steg_logg where hending = 'skann_avvist';
  raise exception 'FEIL: fekk slette frå steg_logg';
exception when others then
  if sqlerrm like 'FEIL:%' then raise; end if;
  raise notice 'OK: steg_logg er låst mot sletting/endring (%)', sqlerrm;
end $$;

-- ---- Smådeler: bøtte tom ----
insert into smadel_artikkel (id, artikkel_nr, namn, boette_storrelse)
values ('60000000-0000-0000-0000-000000000001', 'SM-001', 'Sjakkel-feste 12mm', 50);

select meld_boette_tom('60000000-0000-0000-0000-000000000001',
                       '10000000-0000-0000-0000-000000000002');

do $$ begin
  if (select boette_status from smadel_artikkel where artikkel_nr = 'SM-001') <> 'ei_tom'
     or not exists (select 1 from smadel_bestilling where status = 'open') then
    raise exception 'FEIL: bøtte tom-flyten fungerte ikkje';
  end if;
  raise notice 'OK: bøtte tom → status oppdatert + open bestilling til admin';
end $$;

-- ---- Tidsanalyse-view gir data ----
do $$
declare n int;
begin
  select count(*) into n from tid_per_steg_per_jobbkort;
  if n < 3 then
    raise exception 'FEIL: tid_per_steg-viewet skulle hatt minst 3 rader, fekk %', n;
  end if;
  raise notice 'OK: tid_per_steg_per_jobbkort gir % målte stasjonsopphald', n;
end $$;

select 'ALLE TESTAR PASSERTE' as resultat;

rollback;  -- testdata skal ikkje bli liggande
