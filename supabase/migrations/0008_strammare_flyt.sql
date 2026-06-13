-- =============================================================
-- Nor-Mær produksjonssystem — strammare flyt
-- Migrasjon 0008
--
-- 1. sendt_tilbake-grein i steg_logg_handter() krev no
--    noverande_status = 'venter'. Eit kort under operatør (paagaar)
--    kan ikkje sendast tilbake utan først å bli skanna ut.
--    Operatøren skal aldri få kortet "stelast" mens dei er midt
--    i arbeidet — det bryt audit-sporet (kven gjorde kva).
-- 2. steg_plan kan ikkje innehalde duplikat. Sveis to gonger på
--    rad var aldri intensjonen, og før/etter-sjekken i sendt_tilbake
--    (0006) føreset entydige stegposisjonar.
-- =============================================================

-- ---------------------------------------------------------
-- 1. Ny versjon av steg_logg_handter() — sendt_tilbake krev venter
-- ---------------------------------------------------------
create or replace function steg_logg_handter()
returns trigger language plpgsql security definer as $$
declare
  v_kort jobbkort%rowtype;
  v_neste record;
  v_neste_steg text;
  v_motteke int;
  v_sendt int;
  v_pos_no int;
  v_pos_mal int;
begin
  select * into v_kort from jobbkort where id = new.jobbkort_id for update;

  if not found then
    raise exception 'Jobbkort finst ikkje';
  end if;

  if new.hending = 'skann_avvist' then
    return new;
  end if;

  if new.hending = 'sleppt' then
    if v_kort.noverande_steg <> 'planlagt' then
      raise exception 'Jobbkort % er allereie sleppt', v_kort.jobbkort_nr;
    end if;
    update jobbkort set
      noverande_steg = steg_plan[1],
      noverande_status = 'venter',
      sleppt_dato = new.tidsstempel,
      sleppt_av = new.brukar_id
    where id = new.jobbkort_id;

  elsif new.hending = 'skann_inn' then
    if v_kort.noverande_steg <> new.steg then
      raise exception 'Jobbkort % er på %, ikkje på %',
        v_kort.jobbkort_nr, v_kort.noverande_steg, new.steg;
    end if;
    if v_kort.noverande_status <> 'venter' then
      raise exception 'Jobbkort % er ikkje i venter-status', v_kort.jobbkort_nr;
    end if;
    if exists (select 1 from jobbkort
               where aktiv_brukar_id = new.brukar_id
                 and noverande_status = 'paagaar') then
      raise exception 'Brukar har allereie eit aktivt jobbkort';
    end if;
    select * into v_neste from neste_i_koe(new.steg);
    if v_neste.jobbkort_id is distinct from v_kort.id then
      raise exception 'FIFO-brot: neste jobbkort på % er %', new.steg, v_neste.jobbkort_nr;
    end if;
    update jobbkort set
      noverande_status = 'paagaar',
      aktiv_brukar_id = new.brukar_id
    where id = new.jobbkort_id;

  elsif new.hending = 'skann_ut' then
    if v_kort.noverande_steg <> new.steg or v_kort.noverande_status <> 'paagaar' then
      raise exception 'Jobbkort % er ikkje i arbeid på %', v_kort.jobbkort_nr, new.steg;
    end if;
    v_neste_steg := neste_steg(new.jobbkort_id, v_kort.noverande_steg);
    update jobbkort set
      noverande_steg = v_neste_steg,
      noverande_status = case when v_neste_steg = 'ferdig' then 'ferdig' else 'venter' end,
      aktiv_brukar_id = null
    where id = new.jobbkort_id;

  elsif new.hending = 'sendt_tilbake' then
    -- Ferdige kort kan ikkje reopnast (frå 0006)
    if v_kort.noverande_steg = 'ferdig' then
      raise exception 'Jobbkort % er ferdig og kan ikkje sendast tilbake', v_kort.jobbkort_nr;
    end if;
    -- NYTT i 0008: kortet må vere i venter. Ein operatør som er midt i
    -- arbeidet skal ikkje få kortet stelast frå seg utan skann ut først.
    if v_kort.noverande_status <> 'venter' then
      raise exception 'Jobbkort % er i status % — operatøren må skann ut først før det kan sendast tilbake',
        v_kort.jobbkort_nr, v_kort.noverande_status;
    end if;
    -- Kan berre sendast tilbake frå noverande steg (frå 0006)
    if new.steg is distinct from v_kort.noverande_steg then
      raise exception 'sendt_tilbake må skje frå noverande steg (% er på %, ikkje %)',
        v_kort.jobbkort_nr, v_kort.noverande_steg, new.steg;
    end if;
    if new.sendt_tilbake_til_steg is null then
      raise exception 'sendt_tilbake krev sendt_tilbake_til_steg';
    end if;
    select idx into v_pos_mal
    from unnest(v_kort.steg_plan) with ordinality as u(steg, idx)
    where u.steg = new.sendt_tilbake_til_steg;
    if v_pos_mal is null then
      raise exception '% er ikkje i steg-planen til %',
        new.sendt_tilbake_til_steg, v_kort.jobbkort_nr;
    end if;
    select idx into v_pos_no
    from unnest(v_kort.steg_plan) with ordinality as u(steg, idx)
    where u.steg = v_kort.noverande_steg;
    if v_pos_no is null then
      raise exception 'Noverande steg % finst ikkje i planen til %',
        v_kort.noverande_steg, v_kort.jobbkort_nr;
    end if;
    if v_pos_mal >= v_pos_no then
      raise exception 'sendt_tilbake må peike på eit steg før noverande (% er ikkje før %)',
        new.sendt_tilbake_til_steg, v_kort.noverande_steg;
    end if;
    update jobbkort set
      noverande_steg = new.sendt_tilbake_til_steg,
      noverande_status = 'venter',
      aktiv_brukar_id = null,
      rework_runde = rework_runde + 1
    where id = new.jobbkort_id;

  elsif new.hending = 'godkjent' then
    if v_kort.noverande_steg <> 'admin_inspeksjon' then
      raise exception 'Jobbkort % er ikkje på admin-inspeksjon', v_kort.jobbkort_nr;
    end if;
    v_neste_steg := neste_steg(new.jobbkort_id, 'admin_inspeksjon');
    update jobbkort set
      noverande_steg = v_neste_steg,
      noverande_status = case when v_neste_steg = 'ferdig' then 'ferdig' else 'venter' end,
      aktiv_brukar_id = null
    where id = new.jobbkort_id;

  elsif new.hending = 'sendt_galv' then
    if v_kort.noverande_steg <> 'galv' or v_kort.noverande_status <> 'venter' then
      raise exception 'Jobbkort % ventar ikkje på galv-sending', v_kort.jobbkort_nr;
    end if;
    update jobbkort set
      noverande_status = 'paagaar',
      aktiv_brukar_id = null
    where id = new.jobbkort_id;

  elsif new.hending = 'motteke_galv' then
    if v_kort.noverande_steg <> 'galv' or v_kort.noverande_status <> 'paagaar' then
      raise exception 'Jobbkort % er ikkje hos galvanisør', v_kort.jobbkort_nr;
    end if;
    select coalesce(sum(sendt_antal), 0), coalesce(sum(motteke_antal), 0)
      into v_sendt, v_motteke
      from galvanisering where jobbkort_id = new.jobbkort_id;
    if v_motteke >= v_sendt then
      v_neste_steg := neste_steg(new.jobbkort_id, 'galv');
      update jobbkort set
        noverande_steg = v_neste_steg,
        noverande_status = case when v_neste_steg = 'ferdig' then 'ferdig' else 'venter' end
      where id = new.jobbkort_id;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------
-- 2. Trigger: steg_plan kan ikkje innehalde duplikat
--    (CHECK-constraintar tillet ikkje subquery, så vi brukar
--    BEFORE INSERT OR UPDATE trigger.)
-- ---------------------------------------------------------
create or replace function jobbkort_steg_plan_unik()
returns trigger language plpgsql as $$
declare
  v_unike int;
begin
  if new.steg_plan is null then
    return new;
  end if;
  select count(distinct e) into v_unike from unnest(new.steg_plan) e;
  if cardinality(new.steg_plan) <> v_unike then
    raise exception 'steg_plan kan ikkje innehalde duplikat (% har repeterte steg)',
      new.steg_plan;
  end if;
  return new;
end;
$$;

create trigger trg_jobbkort_steg_plan_unik
  before insert or update on jobbkort
  for each row execute function jobbkort_steg_plan_unik();
