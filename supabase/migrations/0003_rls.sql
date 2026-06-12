-- =============================================================
-- Nor-Mær produksjonssystem — Row Level Security
-- Migrasjon 0003
--
-- Auth-modell (vedtak): felles Supabase-konto per skannepunkt,
-- operatør-identitet er app-tilstand (brukar_id på kvar hending,
-- verifisert med PIN). Admin/leiar har personlege kontoar.
--
-- Konsekvens: RLS skil mellom KONTOTYPAR (skannepunkt vs admin
-- vs leiar), ikkje mellom enkeltoperatørar. Brukar-statistikk
-- (feilrate per person) skal berre eksponerast gjennom views
-- med leiar-sjekk — aldri direkte til skannepunkt-kontoane.
-- =============================================================

-- Hjelpefunksjon: rolla til den innlogga auth-kontoen
create or replace function min_rolle()
returns text language sql stable security definer as $$
  select rolle from brukar where auth_id = auth.uid() limit 1;
$$;

alter table brukar enable row level security;
alter table sertifisering enable row level security;
alter table skannepunkt enable row level security;
alter table kunde enable row level security;
alter table prosjekt enable row level security;
alter table materialsertifikat enable row level security;
alter table jobbpakke enable row level security;
alter table jobbkort enable row level security;
alter table steg_logg enable row level security;
alter table avvik enable row level security;
alter table galvanisering enable row level security;
alter table smadel_artikkel enable row level security;
alter table smadel_bestilling enable row level security;
alter table wps enable row level security;

-- Alle innlogga kontoar kan lese (skannepunkt treng jobbkort, kø, osb.)
create policy les_alt on brukar for select to authenticated using (true);
create policy les_alt on sertifisering for select to authenticated using (true);
create policy les_alt on skannepunkt for select to authenticated using (true);
create policy les_alt on kunde for select to authenticated using (true);
create policy les_alt on prosjekt for select to authenticated using (true);
create policy les_alt on materialsertifikat for select to authenticated using (true);
create policy les_alt on jobbpakke for select to authenticated using (true);
create policy les_alt on jobbkort for select to authenticated using (true);
create policy les_alt on steg_logg for select to authenticated using (true);
create policy les_alt on avvik for select to authenticated using (true);
create policy les_alt on galvanisering for select to authenticated using (true);
create policy les_alt on smadel_artikkel for select to authenticated using (true);
create policy les_alt on smadel_bestilling for select to authenticated using (true);
create policy les_alt on wps for select to authenticated using (true);

-- Skriving frå golvet: hendingar, avvik, galv, smådel-bestilling
create policy skriv_logg on steg_logg for insert to authenticated with check (true);
create policy skriv_avvik on avvik for insert to authenticated with check (true);
create policy skriv_galv on galvanisering for insert to authenticated with check (true);
create policy skriv_smadel on smadel_bestilling for insert to authenticated with check (true);

-- Planleggings- og stamdata: berre admin/leiar/kvalitet
create policy admin_kunde on kunde for all to authenticated
  using (min_rolle() in ('admin','leiar')) with check (min_rolle() in ('admin','leiar'));
create policy admin_prosjekt on prosjekt for all to authenticated
  using (min_rolle() in ('admin','leiar')) with check (min_rolle() in ('admin','leiar'));
create policy admin_matsert on materialsertifikat for all to authenticated
  using (min_rolle() in ('admin','leiar','kvalitet')) with check (min_rolle() in ('admin','leiar','kvalitet'));
create policy admin_jobbpakke on jobbpakke for all to authenticated
  using (min_rolle() in ('admin','leiar')) with check (min_rolle() in ('admin','leiar'));
create policy admin_jobbkort on jobbkort for insert to authenticated
  with check (min_rolle() in ('admin','leiar'));
create policy admin_jobbkort_endre on jobbkort for update to authenticated
  using (min_rolle() in ('admin','leiar'));
create policy admin_brukar on brukar for all to authenticated
  using (min_rolle() in ('admin','leiar')) with check (min_rolle() in ('admin','leiar'));
create policy admin_sert on sertifisering for all to authenticated
  using (min_rolle() in ('admin','leiar','kvalitet')) with check (min_rolle() in ('admin','leiar','kvalitet'));
create policy admin_avvik_endre on avvik for update to authenticated
  using (min_rolle() in ('admin','leiar','kvalitet'));
create policy admin_galv_endre on galvanisering for update to authenticated
  using (min_rolle() in ('admin','leiar'));
create policy admin_smadel on smadel_artikkel for all to authenticated
  using (min_rolle() in ('admin','leiar')) with check (min_rolle() in ('admin','leiar'));
create policy admin_smadel_best on smadel_bestilling for update to authenticated
  using (min_rolle() in ('admin','leiar'));
create policy admin_wps on wps for all to authenticated
  using (min_rolle() in ('admin','leiar','kvalitet')) with check (min_rolle() in ('admin','leiar','kvalitet'));
create policy admin_skannepunkt on skannepunkt for all to authenticated
  using (min_rolle() in ('admin','leiar')) with check (min_rolle() in ('admin','leiar'));

-- MERK: jobbkort blir oppdatert av triggerar (steg_logg-insert),
-- som køyrer med rettane til den som insertar. Skannepunkt-kontoar
-- har ikkje UPDATE-policy på jobbkort, så overgangs-triggeren må
-- køyre som definer. Vi gjer trigger-funksjonen security definer:
-- (steg_logg_handter() er definert som security definer i 0002.)
alter function meld_boette_tom(uuid, uuid) security definer;

-- Ingen DELETE-policyar i det heile: ingenting kan slettast via API.
-- (steg_logg er i tillegg låst med trigger, jf. migrasjon 0002.)
