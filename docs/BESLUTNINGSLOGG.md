# Beslutningslogg — Nor-Mær produksjonssystem

Vedtak frå avklaringsrundane (juni 2026). Endringar frå original spec er merka.

## Auth og identitet
- **Felles Supabase-konto per skannepunkt** (t.d. `tablet-kapp@normaer.no`). Operatør-identitet er app-tilstand verifisert med PIN, og blir stempla som `brukar_id` på kvar hending.
- **Kapp:** operatør loggar inn éin gong, gjeld til utlogging (typisk heile dagen).
- **Sveis:** re-identifisering (namn + PIN) ved **kvar skann ut** — dokumenterer kven som sveiste kva (ISO 3834).
- PIN lagrast **hasha** (bcrypt via pgcrypto), aldri klartekst. *(Endring frå original spec.)*
- Admin/leiar har personlege Supabase-kontoar (e-post/passord).

## Skannepunkt
Handhaldne skannarar (keyboard-emulering) er primær-input; QR-koden sit på produksjonstegninga. Skannepunkt: **kapp**, **sveis** (1–2), **kontroll**, **galv-port** (skann ut ved sending, inn ved retur), **smådeler**. Kamera (@zxing/browser) og manuell innskriving som fallback.

### Fleksibel skanneeining i pilotfasen *(mellombels vedtak 2026-06-13)*
Piloten startar med éin iPad og éin handhalden skannar. Eininga er ikkje låst til
ein fysisk stasjon. Etter QR-skann les appen `jobbkort.noverande_steg` og viser
operasjonen som skal utførast. Appen sender dette steget til
`sjekk_skann_inn()`, medan triggeren på `steg_logg` framleis handhevar rett steg,
FIFO og éin operatør–eitt kort.

Den fleksible flyten gjeld vanleg produksjonsskann for kapp, sveis og kontroll.
Admin-inspeksjon og galv har eigne hendingar og skal ikkje behandlast som vanleg
`skann_inn`/`skann_ut`. `skannepunkt_id` er null i pilotloggen fordi eininga
ikkje representerer ein fast fysisk plass.

Når fleire faste iPad-ar blir innførte, kan stasjonsbinding aktiverast att.
Fordeling mellom parallelle stasjonar, til dømes Sveis 1 og Sveis 2, skal vere
eit eige seinare vedtak basert på kø og flaskehalsdata. Jobbkortet eig framleis
stegrekkjefølgja; stasjonsfordeling skal ikkje endre eller hoppe over steg.

## Slepp til produksjon *(nytt steg)*
Jobbkort blir oppretta av ingeniør (modell → jobbpakker → jobbkort) med tilstand `planlagt`. Admin **slepper** kortet: QR-ark blir skrive ut, lagt på tegninga, kortet går til første steg i steg-planen. Dashbordet viser dermed heile biletet: ikkje sleppt / i produksjon / hos galv / ferdig = 100 % av modellen.

### Roller per steg_logg-hending
For å unngå at RLS og Server Actions glir frå kvarandre er kvar admin-hending bunde til éin rolleliste, både i RLS-policy og i Server Action:

| Hending | Rolle | Grunngjeving |
| --- | --- | --- |
| `sleppt` | admin, leiar | Slepp er ein produksjonsplanleggingsavgjerd — kvalitet skal sjekke, ikkje frigi |
| `godkjent` | admin, leiar, kvalitet | Kvalitet er sjølve godkjenningsinstansen i ISO 3834 |
| `sendt_tilbake` | admin, leiar, kvalitet | Same rolleliste som godkjent — same instans tek òg avvisingsavgjerda |
| `skann_inn` / `skann_ut` / `skann_avvist` / `sendt_galv` / `motteke_galv` | alle innlogga (skannepunkt) | Golvarbeid, handheva av FIFO og éin-operatør-trigger |

## Steg-plan per jobbkort *(endring frå fast løype)*
Ingeniøren set løypa per kort i admin. Standard: kapp → sveis → kontroll → admin_inspeksjon → galv. Smådel utan sveis kan t.d. ha kapp → galv. `sendt_tilbake` kan berre gå til steg som finst i planen, og målsteget må ligge **før** noverande steg (ingen hopp framover via rework-mekanismen). Ferdige kort kan aldri reopnast — produktet kan ha forlate huset, og audit-sporet skal forbli rein. Steg_plan kan berre innehalde kjende stegnamn (`kapp`, `sveis`, `kontroll`, `admin_inspeksjon`, `galv`), og ingen duplikat — handheva som CHECK-constraint + trigger på `jobbkort`.

### Mottakskontroll — avvik FØR skann inn *(strammare 2026-06-13)*
Når sveisar/kontrollør ser feil på arbeidet frå førre stasjon, blir avviket registrert FØR skann inn. Kortet er då i venter-status, og admin/kvalitet sender det tilbake. Dette unngår at eit kort blir "stelast" frå ein operatør som er midt i arbeidet (paagaar), og bevarer audit-sporet om kven som faktisk handterte kortet. `sendt_tilbake` krev difor `noverande_status = 'venter'` — er kortet paagaar, må operatøren skann ut først.

## FIFO — hard handheving
- Nivå 1: `jobbpakke.rekkefoelge` (heile pakka prioriterast, aldri enkeltkort).
- Nivå 2: `jobbkort.fifo_nr` (løpenummer — tidsstempel er ikkje unikt ved batch-import frå BOM).
- Ved skann ut viser appen neste kort i køen. Feil kort → raud ✕ + «Neste er …». Rett → grøn ✓.
- Handheva i databasen (trigger), ikkje berre i appen. Avviste skann blir logga (`skann_avvist`).

## Kontroll i begge endar
Avvik kan meldast både ved skann inn (mottakskontroll: neste stasjon sjekkar arbeidet frå førre) og ved skann ut. `avvik.oppdaga_ved` skil dei. Innkomande feil → kortet kan sendast tilbake (rework_runde aukar).

## Galv og delvis retur
- Galv-porten skannar ut (`sendt_galv`) og inn (`motteke_galv`) med antal.
- **Kortet er ikkje ferdig før alt er tilbake.** Manko → avvik med `aarsakskode='galv_manko'` og `manko_antal`, synleg i admin på jobbkort- og jobbpakke-nivå (dobbeltsikring: du ser kor i løpet noko heng).

## Offline (standardval — Filip var usikker, kan endrast)
Offline tillèt berre skann ut og avviksmelding på allereie aktivt kort — aldri nye skann inn. Då kan ikkje FIFO- og éin-operatør-reglane brytast medan nettet er nede. Kø i IndexedDB, synk når nettet er tilbake.

## Smådeler — parallelt spor
Eige, enklare regime: fyll-arbeid ved ledig kapasitet, **ikkje** knytt til prosjekt i v1 (inga charge-sporing per kunde). To-bøtte-prinsipp: «Bøtte tom»-knapp på smådel-stasjonen → open bestilling hos admin.

## Vektvalidering — begge nivå
- Pakke: sum(jobbkort.vekt_kg) mot `jobbpakke.total_vekt_planlagt_kg` (BOM), ±2 %.
- Prosjekt: sum av alle jobbkort mot `prosjekt.total_vekt_kg`, ±2 %.
- `vekt_kg` på jobbkort er **totalvekt for heile kortet** (alle einingar), ikkje per stykk.
- «Anlegg» er medvite kollapsa inn i prosjekt (1:1-forhold).

## Tekniske vedtak
- ASCII-kolonnenamn i databasen (`aarsakskode`, `sporings_nivaa`, `sinklag_um`, `paagaar`) — nynorsk berre i UI-laget. Unngår varig friksjon i TypeScript-codegen og REST-API.
- `steg_logg.tidsstempel` brukar `clock_timestamp()` (veggklokke), ikkje `now()` (transaksjonsstart) — elles får hendingar synka i same batch identiske stempel.
- All flytlogikk i éin BEFORE-trigger på `steg_logg`: validerer reglane og utfører tilstandsovergangen rad for rad. Appen INSERT-ar berre hendingar — databasen er sanninga.
- `steg_logg` er låst mot UPDATE/DELETE (trigger) — audit-trail etter NYTEK23 § 33. Ingen DELETE-policyar i RLS i det heile.
- «Forsinka X timer»-taggen er utsett: ingen planlagt tid per kort finst enno. Viser «tid i noverande steg» i staden.
- Sveisarsertifikat som er utløpt: **varslar**, blokkerer ikkje produksjon. Raudt/oransje i admin (utløpt / utløper < 30 dagar).
