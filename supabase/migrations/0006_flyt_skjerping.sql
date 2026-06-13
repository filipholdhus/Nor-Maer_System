-- =============================================================
-- Nor-Mær produksjonssystem — flyt-skjerping
-- Migrasjon 0006
--
-- 1. sendt_tilbake-grein i steg_logg_handter() krev no:
--    - kortet er ikkje 'ferdig' (kan ikkje reopnast)
--    - new.steg = noverande_steg (kan berre sendast tilbake derifrå)
--    - sendt_tilbake_til_steg ligg FØR noverande_steg i steg_plan
-- 2. steg_plan kan berre innehalde kjende stegnamn
--    (kapp, sveis, kontroll, admin_inspeksjon, galv).
-- =============================================================

-- ---------------------------------------------------------
-- 1. Ny versjon av steg_logg_handter() — strammar sendt_tilbake
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

  -- Rein loggføring av avviste skann — ingen reglar, ingen overgang
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
    -- Ferdige kort kan ikkje reopnast (NYTEK23: audit-spor må forbli rein,
    -- og produktet kan ha forlate huset).
    if v_kort.noverande_steg = 'ferdig' then
      raise exception 'Jobbkort % er ferdig og kan ikkje sendast tilbake', v_kort.jobbkort_nr;
    end if;
    -- Kan berre sendast tilbake frå noverande steg
    if new.steg is distinct from v_kort.noverande_steg then
      raise exception 'sendt_tilbake må skje frå noverande steg (% er på %, ikkje %)',
        v_kort.jobbkort_nr, v_kort.noverande_steg, new.steg;
    end if;
    if new.sendt_tilbake_til_steg is null then
      raise exception 'sendt_tilbake krev sendt_tilbake_til_steg';
    end if;
    -- Posisjon for målsteget i planen
    select idx into v_pos_mal
    from unnest(v_kort.steg_plan) with ordinality as u(steg, idx)
    where u.steg = new.sendt_tilbake_til_steg;
    if v_pos_mal is null then
      raise exception '% er ikkje i steg-planen til %',
        new.sendt_tilbake_til_steg, v_kort.jobbkort_nr;
    end if;
    -- Posisjon for noverande steg
    select idx into v_pos_no
    from unnest(v_kort.steg_plan) with ordinality as u(steg, idx)
    where u.steg = v_kort.noverande_steg;
    if v_pos_no is null then
      raise exception 'Noverande steg % finst ikkje i planen til %',
        v_kort.noverande_steg, v_kort.jobbkort_nr;
    end if;
    -- Målsteget MÅ kome før noverande (ingen hopp framover via sendt_tilbake)
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
-- 2. CHECK: steg_plan kan berre innehalde kjende steg
-- ---------------------------------------------------------
alter table jobbkort
  add constraint chk_steg_plan_gyldige_steg
  check (
    steg_plan is null
    or steg_plan <@ array['kapp','sveis','kontroll','admin_inspeksjon','galv']::text[]
  );
