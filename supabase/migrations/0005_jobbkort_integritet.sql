-- =============================================================
-- Nor-Mær produksjonssystem — jobbkort-integritet
-- Migrasjon 0005
--
-- 1. Atomisk nummergenerering  (eliminerer race condition)
-- 2. Trigger: immutable felt etter slepp
-- 3. Bulk vektvalidering      (eitt RPC-kall per prosjekt)
-- 4. Tydelegare RLS            (admin-hendingar krev admin-rolle)
-- =============================================================

-- ---------------------------------------------------------
-- 1. Atomisk opprettelse av jobbkort
--    SELECT ... FOR UPDATE på jobbpakke serialiserer alle
--    parallelle insert-ar og eliminerer race condition.
--    Funksjonen er IKKJE security definer — RLS på jobbkort
--    (admin_jobbkort: berre admin/leiar) gjeld normalt.
-- ---------------------------------------------------------
create or replace function opprett_jobbkort(
  p_jobbpakke_id     uuid,
  p_beskriving       text,
  p_materiale        text     default null,
  p_dimensjon        text     default null,
  p_vekt_kg          numeric  default null,
  p_antal            int      default 1,
  p_tegning_referanse text    default null,
  p_steg_plan        text[]   default array['kapp','sveis','kontroll','admin_inspeksjon','galv']
) returns table(id uuid, jobbkort_nr text)
language plpgsql as $$
declare
  v_pakke jobbpakke%rowtype;
  v_seq   bigint;
  v_nr    text;
  v_id    uuid;
begin
  -- Lås pakka for å serialisere parallelle insert-ar
  select * into v_pakke from jobbpakke
  where jobbpakke.id = p_jobbpakke_id
  for update;

  if not found then
    raise exception 'Jobbpakke finst ikkje';
  end if;

  -- Tell eksisterande kort innanfor låsen
  select count(*) + 1 into v_seq
  from jobbkort
  where jobbkort.jobbpakke_id = p_jobbpakke_id;

  v_nr := v_pakke.pakke_nr || '-' || lpad(v_seq::text, 3, '0');

  insert into jobbkort (
    jobbkort_nr, jobbpakke_id, beskriving, materiale, dimensjon,
    vekt_kg, antal, tegning_referanse, steg_plan
  ) values (
    v_nr, p_jobbpakke_id, p_beskriving, p_materiale, p_dimensjon,
    p_vekt_kg, coalesce(p_antal, 1), p_tegning_referanse, p_steg_plan
  )
  returning jobbkort.id, jobbkort.jobbkort_nr into v_id, v_nr;

  return query select v_id, v_nr;
end;
$$;

-- ---------------------------------------------------------
-- 2. Trigger: beskyttar immutable felt etter slepp
--    steg_plan, jobbkort_nr og jobbpakke_id skal ikkje
--    kunna endrast når kortet er i produksjon.
-- ---------------------------------------------------------
create or replace function jobbkort_beskytt_etter_slepp()
returns trigger language plpgsql as $$
begin
  if old.noverande_steg <> 'planlagt' then
    if new.steg_plan is distinct from old.steg_plan then
      raise exception 'Steg-planen kan ikkje endrast etter at jobbkortet er sleppt til produksjon';
    end if;
    if new.jobbkort_nr is distinct from old.jobbkort_nr then
      raise exception 'Jobbkortnummer kan ikkje endrast etter slepp';
    end if;
    if new.jobbpakke_id is distinct from old.jobbpakke_id then
      raise exception 'Jobbpakke kan ikkje endrast etter slepp';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_jobbkort_beskytt
  before update on jobbkort
  for each row execute function jobbkort_beskytt_etter_slepp();

-- ---------------------------------------------------------
-- 3. Bulk vektvalidering — éitt RPC-kall per prosjekt
--    Erstattar N separate valider_jobbpakke_vekt-kall.
-- ---------------------------------------------------------
create or replace function valider_alle_pakkar_vekt(p_prosjekt_id uuid)
returns table(
  pakke_id          uuid,
  planlagt_kg       numeric,
  sum_jobbkort_kg   numeric,
  avvik_prosent     numeric,
  innan_toleranse   boolean
)
language sql stable as $$
  select
    jp.id                                          as pakke_id,
    jp.total_vekt_planlagt_kg                      as planlagt_kg,
    coalesce(sum(jk.vekt_kg), 0)                   as sum_jobbkort_kg,
    case when coalesce(jp.total_vekt_planlagt_kg, 0) > 0
      then round(
        abs(coalesce(sum(jk.vekt_kg), 0) - jp.total_vekt_planlagt_kg)
        / jp.total_vekt_planlagt_kg * 100, 2)
    end                                            as avvik_prosent,
    coalesce(jp.total_vekt_planlagt_kg, 0) > 0
      and abs(coalesce(sum(jk.vekt_kg), 0) - jp.total_vekt_planlagt_kg)
          / jp.total_vekt_planlagt_kg <= 0.02      as innan_toleranse
  from jobbpakke jp
  left join jobbkort jk on jk.jobbpakke_id = jp.id
  where jp.prosjekt_id = p_prosjekt_id
  group by jp.id, jp.total_vekt_planlagt_kg;
$$;

-- ---------------------------------------------------------
-- 4. Tydelegare RLS på steg_logg
--    Admin-hendingar (slepp, godkjenn, send tilbake) krev
--    admin/leiar/kvalitet-rolle. Scan-hendingar er opne for
--    alle innlogga (skannepunkt-kontoar).
-- ---------------------------------------------------------
drop policy if exists skriv_logg on steg_logg;

-- Golv-hendingar: alle innlogga (skannepunkt + admin)
create policy skriv_logg_scan on steg_logg for insert to authenticated
  with check (
    hending in ('skann_inn', 'skann_ut', 'skann_avvist', 'sendt_galv', 'motteke_galv')
  );

-- Admin-hendingar: krev admin/leiar/kvalitet-rolle
create policy skriv_logg_admin on steg_logg for insert to authenticated
  with check (
    hending in ('sleppt', 'godkjent', 'sendt_tilbake')
    and min_rolle() in ('admin', 'leiar', 'kvalitet')
  );
