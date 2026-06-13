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

GitHub Actions køyrer testane på kvar push og PR (`.github/workflows/sql-tests.yml`).
Lokalt har du to alternativ:

### Alternativ A — Docker (anbefalt, ingen lokal Postgres)
```
docker run -d --name normaer-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
sleep 3
docker exec -i normaer-pg createdb -U postgres normaer_test

for f in scripts/lokal-test/00_auth_stub.sql \
         scripts/lokal-test/00_storage_stub.sql \
         supabase/migrations/0001_grunnskjema.sql \
         supabase/migrations/0002_flytlogikk.sql \
         supabase/migrations/0003_rls.sql \
         supabase/migrations/0004_storage.sql \
         supabase/migrations/0005_jobbkort_integritet.sql \
         supabase/migrations/0006_flyt_skjerping.sql \
         supabase/migrations/0007_tilgang_skjerping.sql \
         scripts/lokal-test/01_flyt_test.sql \
         scripts/lokal-test/02_integritet_test.sql \
         scripts/lokal-test/03_flyt_skjerping_test.sql \
         scripts/lokal-test/04_tilgang_test.sql; do
  docker exec -i normaer-pg psql -v ON_ERROR_STOP=1 -U postgres -d normaer_test < "$f"
done

docker rm -f normaer-pg
```

### Alternativ B — Lokal Postgres 16+
```
createdb normaer_test
psql -v ON_ERROR_STOP=1 -d normaer_test \
  -f scripts/lokal-test/00_auth_stub.sql \
  -f scripts/lokal-test/00_storage_stub.sql \
  -f supabase/migrations/0001_grunnskjema.sql \
  -f supabase/migrations/0002_flytlogikk.sql \
  -f supabase/migrations/0003_rls.sql \
  -f supabase/migrations/0004_storage.sql \
  -f supabase/migrations/0005_jobbkort_integritet.sql \
  -f supabase/migrations/0006_flyt_skjerping.sql \
  -f supabase/migrations/0007_tilgang_skjerping.sql
psql -v ON_ERROR_STOP=1 -d normaer_test -f scripts/lokal-test/01_flyt_test.sql
psql -v ON_ERROR_STOP=1 -d normaer_test -f scripts/lokal-test/02_integritet_test.sql
psql -v ON_ERROR_STOP=1 -d normaer_test -f scripts/lokal-test/03_flyt_skjerping_test.sql
psql -v ON_ERROR_STOP=1 -d normaer_test -f scripts/lokal-test/04_tilgang_test.sql
```

Forventa: «OK:»-linjer + «ALLE TESTAR PASSERTE» i alle testfilene.
Testane rullar tilbake eigne data (transaksjonsbasert).
