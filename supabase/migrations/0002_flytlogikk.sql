-- =============================================================
-- Nor-Mær produksjonssystem — flytlogikk
-- Migrasjon 0002
--
-- Prinsipp: databasen er sanninga. Appen INSERT-ar rader i
-- steg_logg; triggerar validerer reglane (FIFO, éin operatør —
-- eitt kort, rett steg) og oppdaterer jobbkort-tilstanden.
-- Frontend-validering er berre høflegheit.
-- =============================================================

-- ---------------------------------------------------------
-- PIN: sett og sjekk (aldri klartekst ut av databasen)
-- ---------------------------------------------------------
create or replace function sett_pin(p_brukar_id uuid, p_pin text)
returns void language sql security definer as $$
  update brukar set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_brukar_id;
$$;

create or replace function sjekk_pin(p_brukar_id uuid, p_pin text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from brukar
    where id = p_brukar_id
      and aktiv
      and pin_hash = crypt(p_pin, pin_hash)
  );
$$;

-- ---------------------------------------------------------
-- Neste steg i steg-planen til eit jobbkort
-- ---------------------------------------------------------
create or replace function neste_steg(p_jobbkort_id uuid, p_fraa_steg text)
returns text language sql stable as $$
  select coalesce(
    (select steg_plan[idx + 1]
     from jobbkort, unnest(steg_plan) with ordinality as u(steg, idx)
     where id = p_jobbkort_id and u.steg = p_fraa_steg),
    'ferdig'
  ) from jobbkort where id = p_jobbkort_id;
$$;

-- ---------------------------------------------------------
-- FIFO: kva jobbkort er NESTE i køen på eit steg?
-- Nivå 1: jobbpakke.rekkefoelge (heile pakka kan prioriterast)
-- Nivå 2: jobbkort.opprettet (FIFO innan pakka)
-- ---------------------------------------------------------
create or replace function neste_i_koe(p_steg text)
returns table (jobbkort_id uuid, jobbkort_nr text) language sql stable as $$
  select jk.id, jk.jobbkort_nr
  from jobbkort jk
  join jobbpakke jp on jp.id = jk.jobbpakke_id
  where jk.noverande_steg = p_steg
    and jk.noverande_status = 'venter'
  order by jp.rekkefoelge, jk.fifo_nr
  limit 1;
$$;

-- ---------------------------------------------------------
-- Sjekk om eit skann inn er lov — appen kallar denne (RPC)
-- FØR den prøver, for å gi grøn ✓ / raud ✕ med forklaring.
-- Triggeren nedanfor handhevar det same (aldri stol på frontend).
-- ---------------------------------------------------------
create or replace function sjekk_skann_inn(
  p_jobbkort_nr text,
  p_steg text,
  p_brukar_id uuid
) returns jsonb language plpgsql stable as $$
declare
  v_kort jobbkort%rowtype;
  v_neste record;
begin
  select * into v_kort from jobbkort where jobbkort_nr = p_jobbkort_nr;

  if not found then
    return jsonb_build_object('ok', false, 'feil', 'finst_ikkje',
      'melding', format('Fann ikkje jobbkort %s', p_jobbkort_nr));
  end if;

  if v_kort.noverande_steg = 'planlagt' then
    return jsonb_build_object('ok', false, 'feil', 'ikkje_sleppt',
      'melding', format('Jobbkort %s er ikkje sleppt til produksjon enno', p_jobbkort_nr));
  end if;

  if v_kort.noverande_steg <> p_steg then
    return jsonb_build_object('ok', false, 'feil', 'feil_steg',
      'melding', format('Jobbkort %s er på %s, ikkje på din stasjon',
                        p_jobbkort_nr, v_kort.noverande_steg));
  end if;

  if v_kort.noverande_status = 'paagaar' then
    return jsonb_build_object('ok', false, 'feil', 'alt_i_arbeid',
      'melding', format('Jobbkort %s er allereie i arbeid', p_jobbkort_nr));
  end if;

  if exists (select 1 from jobbkort
             where aktiv_brukar_id = p_brukar_id and noverande_status = 'paagaar') then
    return jsonb_build_object('ok', false, 'feil', 'har_aktivt_kort',
      'melding', 'Du har allereie eit aktivt jobbkort. Skann ut først.');
  end if;

  select * into v_neste from neste_i_koe(p_steg);
  if v_neste.jobbkort_id is distinct from v_kort.id then
    return jsonb_build_object('ok', false, 'feil', 'fifo',
      'melding', format('Feil rekkefølge. Neste jobbkort er %s', v_neste.jobbkort_nr),
      'neste_jobbkort_nr', v_neste.jobbkort_nr);
  end if;

  return jsonb_build_object('ok', true, 'jobbkort_id', v_kort.id,
    'melding', format('%s — klar til start', p_jobbkort_nr));
end;
$$;

-- ---------------------------------------------------------
-- Trigger: validering + tilstandsovergang i steg_logg
--
-- Alt skjer i éin BEFORE-trigger som køyrer rad for rad, slik
-- at sekvensielle hendingar i same insert-setning (t.d. ved
-- offline-synk av fleire køa hendingar) ser oppdatert tilstand.
-- ---------------------------------------------------------
create or replace function steg_logg_handter()
returns trigger language plpgsql security definer as $$
declare
  v_kort jobbkort%rowtype;
  v_neste record;
  v_neste_steg text;
  v_motteke int;
  v_sendt int;
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
    -- Éin operatør, eitt kort (dobbeltsikra av unik indeks)
    if exists (select 1 from jobbkort
               where aktiv_brukar_id = new.brukar_id
                 and noverande_status = 'paagaar') then
      raise exception 'Brukar har allereie eit aktivt jobbkort';
    end if;
    -- Hard FIFO
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
    if new.sendt_tilbake_til_steg is null then
      raise exception 'sendt_tilbake krev sendt_tilbake_til_steg';
    end if;
    if not (new.sendt_tilbake_til_steg = any(v_kort.steg_plan)) then
      raise exception '% er ikkje i steg-planen til %',
        new.sendt_tilbake_til_steg, v_kort.jobbkort_nr;
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
    -- Delvis retur: kortet blir verande hos galv til alt er tilbake.
    -- Appen opprettar avvik (galv_manko) når motteke < sendt.
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

create trigger trg_steg_logg_handter
  before insert on steg_logg
  for each row execute function steg_logg_handter();

-- ---------------------------------------------------------
-- Audit-trail: historikk skal aldri endrast eller slettast
-- ---------------------------------------------------------
create or replace function nekta_endring()
returns trigger language plpgsql as $$
begin
  raise exception 'steg_logg er audit-trail (NYTEK23 § 33) — kan ikkje endrast eller slettast';
end;
$$;

create trigger trg_steg_logg_laast
  before update or delete on steg_logg
  for each row execute function nekta_endring();

-- ---------------------------------------------------------
-- Vektvalidering — begge nivå (RPC-ar for admin-UI)
-- ---------------------------------------------------------
create or replace function valider_jobbpakke_vekt(p_jobbpakke_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'planlagt_kg', jp.total_vekt_planlagt_kg,
    'sum_jobbkort_kg', coalesce(sum(jk.vekt_kg), 0),
    'avvik_prosent', case when jp.total_vekt_planlagt_kg > 0
      then round(abs(coalesce(sum(jk.vekt_kg), 0) - jp.total_vekt_planlagt_kg)
                 / jp.total_vekt_planlagt_kg * 100, 2) end,
    'innan_toleranse', jp.total_vekt_planlagt_kg > 0
      and abs(coalesce(sum(jk.vekt_kg), 0) - jp.total_vekt_planlagt_kg)
          / jp.total_vekt_planlagt_kg <= 0.02
  )
  from jobbpakke jp
  left join jobbkort jk on jk.jobbpakke_id = jp.id
  where jp.id = p_jobbpakke_id
  group by jp.id, jp.total_vekt_planlagt_kg;
$$;

create or replace function valider_prosjekt_vekt(p_prosjekt_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total_vekt_kg', p.total_vekt_kg,
    'sum_jobbkort_kg', coalesce(sum(jk.vekt_kg), 0),
    'innan_toleranse', p.total_vekt_kg > 0
      and abs(coalesce(sum(jk.vekt_kg), 0) - p.total_vekt_kg)
          / p.total_vekt_kg <= 0.02
  )
  from prosjekt p
  left join jobbpakke jp on jp.prosjekt_id = p.id
  left join jobbkort jk on jk.jobbpakke_id = jp.id
  where p.id = p_prosjekt_id
  group by p.id, p.total_vekt_kg;
$$;

-- ---------------------------------------------------------
-- Smådeler: "bøtte tom"-knappen
-- ---------------------------------------------------------
create or replace function meld_boette_tom(p_artikkel_id uuid, p_brukar_id uuid)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  update smadel_artikkel set boette_status = 'ei_tom' where id = p_artikkel_id;
  insert into smadel_bestilling (artikkel_id, utloest_av)
  values (p_artikkel_id, p_brukar_id)
  returning id into v_id;
  return v_id;
end;
$$;
