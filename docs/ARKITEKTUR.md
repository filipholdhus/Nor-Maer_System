# Arkitektur og filstruktur — Nor-Mær produksjonssystem

Dette er skissa du bad om i steg tre: modulgrensene før features blir implementert.

## Overordna

```
nor-maer/
├── app/                          ← Next.js 14+ (App Router, TypeScript, Tailwind)
├── supabase/
│   └── migrations/               ← Sanninga om databasen. Køyrast i rekkefølge.
│       ├── 0001_grunnskjema.sql      tabellar, indeksar, views
│       ├── 0002_flytlogikk.sql       triggerar, FIFO, PIN, validerings-RPC-ar
│       └── 0003_rls.sql              Row Level Security
├── scripts/
│   └── lokal-test/               ← verifikasjon mot rein Postgres (CI-vennleg)
│       ├── 00_auth_stub.sql          stubbar Supabase sitt auth-skjema
│       └── 01_flyt_test.sql          17 sjekkar av heile flyten
└── docs/
    ├── ARKITEKTUR.md             ← dette dokumentet
    └── BESLUTNINGSLOGG.md        ← alle vedtak frå avklaringsrundane
```

## Frontend-struktur (app/src/)

```
src/
├── app/
│   ├── layout.tsx                ← rot: INGA font-lasting (skanne-appen krev system-fontar)
│   ├── page.tsx                  ← landingsside → ruter til /dashboard eller /scan
│   │
│   ├── (admin)/                  ← route group: desktop-først, mørkt tema
│   │   ├── layout.tsx                sidebar (Planlegging/Produksjon/Ressursar/Innstillingar)
│   │   │                             + DM Sans/DM Mono lastast HER, scopa til admin
│   │   ├── dashboard/                Sprint 3: kanban (Realtime), KPI, aktivitetsfeed
│   │   ├── prosjekt/                 Sprint 1/3: prosjektliste → detalj → jobbpakke → jobbkort
│   │   ├── avvik/                    Sprint 4: liste + Pareto-analyse
│   │   ├── brukarar/                 Sprint 1/5: brukarar, roller, sertifiseringar
│   │   └── smadeler/                 smådel-katalog + bestillingar
│   │
│   └── scan/                     ← PWA, mobil-først, system-fontar, offline-kø
│       ├── layout.tsx                eige skal — delar INGENTING visuelt med admin
│       └── page.tsx                  Sprint 2: stasjonsoppsett → innlogging → hovudskjerm
│
├── components/
│   ├── admin/                    ← kanban-kort, jobbkort-modal, progress-track, …
│   └── scan/                     ← PIN-pad, skannar-lyttar, avvik-flyt, offline-banner
│
└── lib/
    ├── supabase/
    │   ├── browser.ts                klient for client components
    │   └── server.ts                 klient for server components / route handlers
    └── domene/
        └── typar.ts                  Steg, Hending, Rolle, Aarsakskode + nynorsk UI-namn
                                      (éin stad — speglar databaseskjemaet)
```

## Modulgrenser — dei viktige linjene

**1. Databasen eig flyten.** Appen INSERT-ar hendingar i `steg_logg`; éin BEFORE-trigger
validerer (rett steg, éin operatør–eitt kort, hard FIFO) og utfører tilstandsovergangen.
Frontend kallar `sjekk_skann_inn()` (RPC) først for å gi grøn ✓/raud ✕ med forklaring —
men databasen handhevar uansett. Ingen flytlogikk skal duplikerast i TypeScript.

**2. /scan og (admin) er to produkt.** Dei delar `lib/` (Supabase-klientar, domenetypar)
og ingenting anna. Ulike layoutar, ulike fontstrategi, ulike komponentkatalogar.
Admin: desktop-først, DM Sans/Mono, shadcn/ui. Scan: mobil-først, system-fontar,
store knappar for arbeidshanskar.

**3. Domenetypar éin stad.** `lib/domene/typar.ts` speglar skjemaet (ASCII-namn) og
ber nynorsk-tekstane for UI. Når skjemaet endrast, endrast denne fila — ingen
strenglitteralar for steg/hendingar spreidd i komponentane.

**4. Tilstand utanfor Supabase er avgrensa til:** stasjonsval (localStorage) og
offline-kø (IndexedDB). Alt anna les/skriv mot databasen.

## Dataflyt — skann inn (døme)

```
Skannar (keyboard) → /scan fangar streng + Enter
  → RPC sjekk_skann_inn(nr, stasjon, brukar_id)
      ├─ {ok:false, feil:'fifo', neste:'2026-047-012'} → raud ✕, vis rett kort
      └─ {ok:true} → grøn ✓, "Bekreft start"
          → INSERT steg_logg (skann_inn)
              → trigger validerer på nytt + set paagaar/aktiv_brukar
                  → Realtime pushar endringa → admin-kanban oppdaterer seg
```

## Sprint-kart (uendra frå spec)

1. **Fundament** ✓ påbegynt: skjema verifisert, prosjekt scaffolda. Att: Supabase-kopling, enkel brukar/prosjekt-admin.
2. **Skanne-app MVP**: stasjonsoppsett, innlogging, skann inn/ut. Test i verkstaden.
3. **Admin kanban + jobbkort-modal** (Realtime).
4. **Avvik + BOM-import + QR-utskrift + 100 %-validering.**
5. **Galv-port + sertifiseringar + MRB-generering.**
