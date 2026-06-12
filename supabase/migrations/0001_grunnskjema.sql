-- =============================================================
-- Nor-Mær produksjonssystem — grunnskjema
-- Migrasjon 0001
--
-- Vedtak bakt inn (sjå docs/BESLUTNINGSLOGG.md):
--  - ASCII-kolonnenamn (nynorsk berre i UI-laget)
--  - pin_hash i staden for klartekst-PIN (pgcrypto)
--  - jobbkort har steg_plan (sett av ingeniør) og tilstand
--    'planlagt' før slepp til produksjon
--  - avvik har manko_antal (delvis retur frå galv)
--  - smådel-spor med to-bøtte-prinsipp
-- =============================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- BRUKARSTYRING
-- ---------------------------------------------------------
create table brukar (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid references auth.users(id),  -- kopling til Supabase Auth (admin-brukarar)
  namn text not null,
  rolle text not null check (rolle in ('operator', 'sveisar', 'admin', 'kvalitet', 'leiar')),
  pin_hash text,  -- crypt(pin, gen_salt('bf')) — aldri klartekst
  aktiv boolean default true,
  opprettet timestamptz default now()
);

create table sertifisering (
  id uuid primary key default gen_random_uuid(),
  brukar_id uuid references brukar(id) not null,
  type text not null,  -- t.d. 'ISO_9606_MAG', 'IWS', 'kranfoerarbevis'
  utstedt date,
  utloepsdato date,
  dokument_url text,
  opprettet timestamptz default now()
);

create index idx_sertifisering_brukar on sertifisering(brukar_id);

-- ---------------------------------------------------------
-- SKANNEPUNKT (faste tablets/skjermar med handhaldt skannar)
-- ---------------------------------------------------------
create table skannepunkt (
  id uuid primary key default gen_random_uuid(),
  namn text not null,            -- t.d. 'Kapp 1', 'Sveis vest'
  stasjon text not null check (stasjon in
    ('kapp', 'sveis', 'kontroll', 'galv_port', 'smadeler')),
  aktiv boolean default true,
  opprettet timestamptz default now()
);

-- ---------------------------------------------------------
-- KUNDE OG PROSJEKT
-- ---------------------------------------------------------
create table kunde (
  id uuid primary key default gen_random_uuid(),
  namn text not null,
  org_nr text,
  kontakt_namn text,
  kontakt_epost text,
  kontakt_telefon text,
  opprettet timestamptz default now()
);

create table prosjekt (
  id uuid primary key default gen_random_uuid(),
  prosjekt_nr text unique not null,
  kunde_id uuid references kunde(id) not null,
  beskriving text,
  deadline date,
  sporings_nivaa text default 'standard' check (sporings_nivaa in ('full', 'standard', 'enkel')),
  status text default 'aktiv' check (status in ('tilbod', 'aktiv', 'levert', 'avlyst')),
  total_vekt_kg numeric(10,2),  -- "Anlegg" er medvite kollapsa inn her (1:1)
  opprettet timestamptz default now(),
  opprettet_av uuid references brukar(id)
);

-- ---------------------------------------------------------
-- MATERIALSERTIFIKAT (NYTEK23 / NS 9415)
-- ---------------------------------------------------------
create table materialsertifikat (
  id uuid primary key default gen_random_uuid(),
  prosjekt_id uuid references prosjekt(id) not null,
  charge_nr text not null,
  leverandoer text,
  materiale text,   -- t.d. 'S355J2+N'
  dimensjon text,   -- t.d. 'HEB200, 12m'
  mengd_kg numeric(10,2),
  sertifikat_pdf_url text,
  motteken_dato date,
  opprettet timestamptz default now()
);

create index idx_matsert_prosjekt on materialsertifikat(prosjekt_id);

-- ---------------------------------------------------------
-- JOBBPAKKE OG JOBBKORT
-- ---------------------------------------------------------
create table jobbpakke (
  id uuid primary key default gen_random_uuid(),
  pakke_nr text unique not null,
  prosjekt_id uuid references prosjekt(id) not null,
  beskriving text not null,
  rekkefoelge int default 0,  -- prioritering av heile pakka (FIFO-nivå 1)
  total_vekt_planlagt_kg numeric(10,2),  -- frå BOM
  validering_ok boolean default false,
  validert_av uuid references brukar(id),
  validert_dato timestamptz,
  opprettet timestamptz default now()
);

create index idx_jobbpakke_prosjekt on jobbpakke(prosjekt_id);

create table jobbkort (
  id uuid primary key default gen_random_uuid(),
  jobbkort_nr text unique not null,  -- format: PROSJEKT-PAKKE-NR, t.d. '2026-047-012'
  jobbpakke_id uuid references jobbpakke(id) not null,

  -- Spesifikasjon
  beskriving text not null,
  materiale text,
  dimensjon text,
  vekt_kg numeric(10,2),      -- TOTALvekt for heile kortet (alle einingar)
  antal int default 1,
  tegning_referanse text,     -- t.d. 'T-204 Rev.B'
  tegning_pdf_url text,

  -- Steg-plan: ingeniøren bestemmer løypa per kort.
  -- Standard er full løype; smådel utan sveis kan t.d. vere
  -- {kapp,galv}. 'admin_inspeksjon' kan utelatast for enkle deler.
  steg_plan text[] not null
    default array['kapp','sveis','kontroll','admin_inspeksjon','galv'],

  -- Tilstand (denormalisert for raske kanban-spørringar;
  -- steg_logg er sanninga, triggerar held desse i synk)
  noverande_steg text not null default 'planlagt' check (noverande_steg in
    ('planlagt', 'kapp', 'sveis', 'kontroll', 'admin_inspeksjon', 'galv', 'ferdig')),
  noverande_status text not null default 'venter' check (noverande_status in
    ('venter', 'paagaar', 'ferdig')),
  aktiv_brukar_id uuid references brukar(id),  -- null = ingen jobbar med det no

  -- Slepp til produksjon (QR-ark skrive ut, lagt på tegning)
  sleppt_dato timestamptz,
  sleppt_av uuid references brukar(id),

  -- FIFO: deterministisk rekkefølge (tidsstempel er ikkje unikt
  -- ved batch-insert, t.d. BOM-import)
  fifo_nr bigint generated always as identity,

  -- Sporings-metadata
  rework_runde int default 0,
  opprettet timestamptz default now(),
  opprettet_av uuid references brukar(id),

  constraint steg_plan_ikkje_tom check (cardinality(steg_plan) > 0)
);

create index idx_jobbkort_steg on jobbkort(noverande_steg, noverande_status);
create index idx_jobbkort_pakke on jobbkort(jobbpakke_id);
create index idx_jobbkort_aktiv_brukar on jobbkort(aktiv_brukar_id);

-- Handhevar "éin operatør, eitt jobbkort" på databasenivå:
create unique index idx_ein_aktiv_per_brukar
  on jobbkort(aktiv_brukar_id)
  where aktiv_brukar_id is not null and noverande_status = 'paagaar';

-- ---------------------------------------------------------
-- HENDELSESLOGG (kjernen — audit-trail, NYTEK23 § 33)
-- Historikk skal ALDRI overskrivast eller slettast.
-- ---------------------------------------------------------
create table steg_logg (
  id uuid primary key default gen_random_uuid(),
  jobbkort_id uuid references jobbkort(id) not null,
  steg text not null,
  hending text not null check (hending in
    ('sleppt',          -- admin slepper kortet til produksjon
     'skann_inn',
     'skann_ut',
     'skann_avvist',    -- FIFO/regelbrot — logga, ingen tilstandsendring
     'sendt_tilbake',
     'godkjent',        -- admin-inspeksjon OK
     'sendt_galv',
     'motteke_galv')),
  brukar_id uuid references brukar(id) not null,
  skannepunkt_id uuid references skannepunkt(id),
  tidsstempel timestamptz default clock_timestamp(),  -- veggklokke: hendingar i same transaksjon får ulike stempel
  kommentar text,
  sendt_tilbake_til_steg text,  -- berre relevant ved 'sendt_tilbake'
  metadata jsonb  -- t.d. {"wps": "WPS-204", "antal_skannet": 5, "avvist_grunn": "fifo"}
);

create index idx_logg_jobbkort on steg_logg(jobbkort_id, tidsstempel);
create index idx_logg_brukar on steg_logg(brukar_id, tidsstempel);
create index idx_logg_tid on steg_logg(tidsstempel desc);

-- ---------------------------------------------------------
-- AVVIK (kan meldast både ved skann inn og skann ut)
-- ---------------------------------------------------------
create table avvik (
  id uuid primary key default gen_random_uuid(),
  jobbkort_id uuid references jobbkort(id) not null,
  oppdaga_paa_steg text not null,
  oppdaga_ved text default 'skann_ut' check (oppdaga_ved in ('skann_inn', 'skann_ut', 'admin')),
  aarsak_steg text,  -- "kor kom feilen frå?"
  aarsakskode text not null check (aarsakskode in
    ('feil_maal', 'feil_materiale', 'sveisefeil', 'skade', 'manglar_deler',
     'tegningsfeil', 'galv_feil', 'galv_manko', 'anna')),
  manko_antal int,  -- ved delvis retur frå galv: kor mange manglar
  kommentar text,
  bilete_url text,
  status text default 'open' check (status in ('open', 'lukka', 'avvist')),
  opprettet_av uuid references brukar(id) not null,
  opprettet timestamptz default now(),
  lukka_av uuid references brukar(id),
  lukka_dato timestamptz,
  lukka_kommentar text
);

create index idx_avvik_jobbkort on avvik(jobbkort_id);
create index idx_avvik_status on avvik(status);

-- ---------------------------------------------------------
-- GALVANISERING (ekstern leverandør, skannast ved galv-porten)
-- ---------------------------------------------------------
create table galvanisering (
  id uuid primary key default gen_random_uuid(),
  jobbkort_id uuid references jobbkort(id) not null,
  sendt_dato date,
  sendt_antal int,
  forventa_retur date,
  motteke_dato date,
  motteke_antal int,
  sinklag_um int,  -- mikrometer
  batch_rapport_url text,
  avvik_id uuid references avvik(id),  -- ved manko/feil
  opprettet timestamptz default now()
);

create index idx_galv_jobbkort on galvanisering(jobbkort_id);

-- ---------------------------------------------------------
-- SMÅDELER — parallelt, enklare spor (to-bøtte-prinsipp)
-- Ikkje knytt til prosjekt i v1. Fyll-arbeid ved ledig kapasitet.
-- ---------------------------------------------------------
create table smadel_artikkel (
  id uuid primary key default gen_random_uuid(),
  artikkel_nr text unique not null,
  namn text not null,
  materiale text,
  dimensjon text,
  boette_storrelse int not null default 1,  -- antal per bøtte
  boette_status text not null default 'to_fulle' check (boette_status in
    ('to_fulle', 'ei_tom', 'bestilt')),
  aktiv boolean default true,
  opprettet timestamptz default now()
);

create table smadel_bestilling (
  id uuid primary key default gen_random_uuid(),
  artikkel_id uuid references smadel_artikkel(id) not null,
  status text not null default 'open' check (status in ('open', 'bestilt', 'motteke')),
  utloest_av uuid references brukar(id),       -- kven trykte "bøtte tom"
  utloest_dato timestamptz default now(),
  bestilt_av uuid references brukar(id),
  bestilt_dato timestamptz,
  motteke_dato timestamptz,
  kommentar text
);

create index idx_smadel_bestilling_status on smadel_bestilling(status);

-- ---------------------------------------------------------
-- WPS (datamodell klar no, UI i Sprint 4)
-- ---------------------------------------------------------
create table wps (
  id uuid primary key default gen_random_uuid(),
  wps_nr text unique not null,   -- t.d. 'WPS-204'
  beskriving text,
  aktiv boolean default true,
  opprettet timestamptz default now()
);

-- ---------------------------------------------------------
-- VIEWS FOR RASK SPØRJING
-- ---------------------------------------------------------
create view aktive_jobbkort_per_stasjon as
select
  noverande_steg,
  noverande_status,
  count(*) as antal,
  array_agg(jobbkort_nr order by opprettet) as jobbkort_nummer
from jobbkort
where noverande_steg not in ('ferdig', 'planlagt')
group by noverande_steg, noverande_status;

-- Kvar skann_inn blir para med FØRSTE påfølgjande skann_ut på same
-- steg (robust mot rework-rundar der same steg skjer fleire gonger)
create view tid_per_steg_per_jobbkort as
select
  l1.jobbkort_id,
  l1.steg,
  l1.tidsstempel as inn_tid,
  ut.tidsstempel as ut_tid,
  extract(epoch from (ut.tidsstempel - l1.tidsstempel))/60 as varighet_min,
  l1.brukar_id as inn_brukar,
  ut.brukar_id as ut_brukar
from steg_logg l1
cross join lateral (
  select l2.tidsstempel, l2.brukar_id
  from steg_logg l2
  where l2.jobbkort_id = l1.jobbkort_id
    and l2.steg = l1.steg
    and l2.hending = 'skann_ut'
    and l2.tidsstempel > l1.tidsstempel
  order by l2.tidsstempel
  limit 1
) ut
where l1.hending = 'skann_inn';

-- Prosjekt-oversikt: kor mykje av modellen er kor (alle jobbkort = 100 %)
create view prosjekt_framdrift as
select
  p.id as prosjekt_id,
  p.prosjekt_nr,
  count(jk.id) as jobbkort_totalt,
  count(*) filter (where jk.noverande_steg = 'planlagt') as ikkje_sleppt,
  count(*) filter (where jk.noverande_steg not in ('planlagt','galv','ferdig')) as i_produksjon,
  count(*) filter (where jk.noverande_steg = 'galv') as hos_galv,
  count(*) filter (where jk.noverande_steg = 'ferdig') as ferdig,
  coalesce(sum(jk.vekt_kg), 0) as vekt_totalt_kg,
  coalesce(sum(jk.vekt_kg) filter (where jk.noverande_steg = 'ferdig'), 0) as vekt_ferdig_kg
from prosjekt p
left join jobbpakke jp on jp.prosjekt_id = p.id
left join jobbkort jk on jk.jobbpakke_id = jp.id
group by p.id, p.prosjekt_nr;
