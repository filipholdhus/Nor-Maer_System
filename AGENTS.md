# Nor-Mær produksjonssystem — instruksjonar for KI-agentar

Produksjonsstyring for Nor-Mær AS (galvaniserte stålanlegg til fiskeoppdrett).
To produkt i eitt repo: admin-panel (kontor, desktop) og skanne-app (verkstadgolv, tablets).

## Les først
- `docs/ARKITEKTUR.md` — filstruktur og modulgrenser
- `docs/BESLUTNINGSLOGG.md` — alle designvedtak med grunngjeving. IKKJE fråvik desse utan å spørje.

## Ufråvikelege reglar

1. **Databasen er sanninga.** All flytlogikk bur i Postgres-triggerar (migrasjon 0002).
   Appen INSERT-ar hendingar i `steg_logg` og les tilstand. ALDRI dupliser flytreglar
   (FIFO, éin operatør–eitt kort, steg-overgangar) i TypeScript — frontend kallar
   `sjekk_skann_inn()` (RPC) for brukarvenleg tilbakemelding, databasen handhevar.
2. **`steg_logg` er audit-trail (NYTEK23 § 33).** Aldri UPDATE/DELETE, aldri foreslå det,
   aldri fjern låse-triggeren. Feilregistreringar korrigerast med nye, kompenserande hendingar.
3. **Migrasjonar er append-only.** Endringar i skjemaet = ny fil `supabase/migrations/000N_*.sql`.
   Rediger ALDRI ein eksisterande migrasjon som kan vere køyrd i produksjon.
4. **`/scan` brukar BERRE system-fontar.** Ingen next/font/google, ingen eksterne fontar,
   ingen import som kan blokkere på dårleg wifi. Admin `(admin)/` kan bruke DM Sans/DM Mono,
   scopa til admin-layouten — aldri i rot-layouten.
5. **Språk:** UI-tekst, feilmeldingar og dokumentasjon på nynorsk. Kode, variablar og
   databasekolonner på engelsk/ASCII (sjå `lib/domene/typar.ts` for mapping).
6. **Tilstand utanfor Supabase:** berre stasjonsval (localStorage) og offline-kø (IndexedDB).
7. **Skanne-appen er for arbeidshanskar:** store treffflater (min. 48px), få steg,
   handhaldt skannar (keyboard-emulering som endar med Enter) er primær-input.

## Verifikasjon — køyr dette før du seier deg ferdig

```bash
# 1. Skjema + flyt-testar (krev lokal Postgres, sjå README):
psql -d normaer_test -f scripts/lokal-test/00_auth_stub.sql \
  -f supabase/migrations/0001_grunnskjema.sql \
  -f supabase/migrations/0002_flytlogikk.sql \
  -f supabase/migrations/0003_rls.sql \
  -f supabase/migrations/0005_jobbkort_integritet.sql \
  && psql -d normaer_test -f scripts/lokal-test/01_flyt_test.sql \
  && psql -d normaer_test -f scripts/lokal-test/02_integritet_test.sql
# Forventa: alle "OK:"-linjer + "ALLE TESTAR PASSERTE". Databasen kan droppast/gjenskapast fritt.

# 2. Frontend:
cd app && npm run build && npm run lint
```

Endrar du flytlogikk i 0002 eller seinare migrasjonar: legg til nye sjekkar i
`scripts/lokal-test/01_flyt_test.sql` (eller ny testfil) som dekkjer endringa.
Testfila brukar mønsteret: forsøk ulovleg operasjon → forvent exception → NOTICE 'OK: …'.

## Arbeidsform
- Små, avgrensa oppgåver. Éi feature eller éin fiks per økt/PR.
- Ved tvil om eit designval: sjekk BESLUTNINGSLOGG.md. Står det ikkje der, spør
  mennesket i staden for å gjette — vedtak skal inn i loggen, ikkje berre i koden.
- Ikkje legg til bibliotek utan grunn. Stacken er: Next.js App Router, Tailwind,
  shadcn/ui (berre admin), @supabase/ssr + supabase-js, @zxing/browser (berre scan).
