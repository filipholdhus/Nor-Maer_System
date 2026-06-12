# Nor-Mær produksjonssystem

Produksjonsstyring for galvaniserte stålanlegg: admin-panel (kontor) + skanne-app (golv).

## Status
Sprint 1 påbegynt: databaseskjema bygd og verifisert (17 automatiserte sjekkar),
Next.js-prosjekt scaffolda og byggjer. Sjå `docs/ARKITEKTUR.md` og `docs/BESLUTNINGSLOGG.md`.

## Kom i gang

1. Opprett Supabase-prosjekt (region: Frankfurt/Stockholm).
2. Køyr migrasjonane i rekkefølge i SQL-editoren (eller `supabase db push`):
   `supabase/migrations/0001..0003`
3. `cd app && cp .env.example .env.local` — fyll inn URL og anon-nøkkel.
4. `npm install && npm run dev`

## Verifisere skjemaet lokalt (utan Supabase)

Krev lokal Postgres 16+:
```
createdb normaer
psql -d normaer -f scripts/lokal-test/00_auth_stub.sql \
  -f supabase/migrations/0001_grunnskjema.sql \
  -f supabase/migrations/0002_flytlogikk.sql \
  -f supabase/migrations/0003_rls.sql
psql -d normaer -f scripts/lokal-test/01_flyt_test.sql
```
Forventa: 17 × «OK:» og «ALLE TESTAR PASSERTE». Testen rullar tilbake eigne data.
