// Domenetypar — speglar databaseskjemaet (migrasjon 0001).
// Kolonnenamn i databasen er ASCII; nynorsk-tekst for UI ligg i STEG_NAMN m.fl.

export const STEG = [
  "planlagt",
  "kapp",
  "sveis",
  "kontroll",
  "admin_inspeksjon",
  "galv",
  "ferdig",
] as const;
export type Steg = (typeof STEG)[number];

export const STEG_NAMN: Record<Steg, string> = {
  planlagt: "Ikkje sleppt",
  kapp: "Kapp",
  sveis: "Sveis",
  kontroll: "Kontroll",
  admin_inspeksjon: "Admin-inspeksjon",
  galv: "Galvanisering",
  ferdig: "Ferdig",
};

export const STANDARD_STEG_PLAN: Steg[] = [
  "kapp",
  "sveis",
  "kontroll",
  "admin_inspeksjon",
  "galv",
];

export const HENDING = [
  "sleppt",
  "skann_inn",
  "skann_ut",
  "skann_avvist",
  "sendt_tilbake",
  "godkjent",
  "sendt_galv",
  "motteke_galv",
] as const;
export type Hending = (typeof HENDING)[number];

export const ROLLE = ["operator", "sveisar", "admin", "kvalitet", "leiar"] as const;
export type Rolle = (typeof ROLLE)[number];

export const ROLLE_NAMN: Record<Rolle, string> = {
  operator: "Operatør",
  sveisar: "Sveisar",
  admin: "Admin",
  kvalitet: "Kvalitet",
  leiar: "Leiar",
};

export const STASJON = ["kapp", "sveis", "kontroll", "galv_port", "smadeler"] as const;
export type Stasjon = (typeof STASJON)[number];

export const STASJON_NAMN: Record<Stasjon, string> = {
  kapp: "Kapp",
  sveis: "Sveis",
  kontroll: "Kontroll",
  galv_port: "Galv-port",
  smadeler: "Smådeler",
};

// Maps a physical station to the steg value used in steg_logg.
// galv_port scans to the "galv" step; smadeler has no jobbkort steg.
export const STASJON_TIL_STEG: Record<Stasjon, Steg | null> = {
  kapp: "kapp",
  sveis: "sveis",
  kontroll: "kontroll",
  galv_port: "galv",
  smadeler: null,
};

export const AARSAKSKODE = [
  "feil_maal",
  "feil_materiale",
  "sveisefeil",
  "skade",
  "manglar_deler",
  "tegningsfeil",
  "galv_feil",
  "galv_manko",
  "anna",
] as const;
export type Aarsakskode = (typeof AARSAKSKODE)[number];

export const AARSAKSKODE_NAMN: Record<Aarsakskode, string> = {
  feil_maal: "Feil mål",
  feil_materiale: "Feil materiale",
  sveisefeil: "Sveisefeil",
  skade: "Skade",
  manglar_deler: "Manglar deler",
  tegningsfeil: "Tegningsfeil",
  galv_feil: "Galvfeil",
  galv_manko: "Manko frå galv",
  anna: "Anna",
};

export interface Jobbkort {
  id: string;
  jobbkort_nr: string;
  jobbpakke_id: string;
  beskriving: string;
  materiale: string | null;
  dimensjon: string | null;
  vekt_kg: number | null; // TOTALvekt for heile kortet
  antal: number;
  tegning_referanse: string | null;
  tegning_pdf_url: string | null;
  steg_plan: Steg[];
  noverande_steg: Steg;
  noverande_status: "venter" | "paagaar" | "ferdig";
  aktiv_brukar_id: string | null;
  sleppt_dato: string | null;
  rework_runde: number;
  fifo_nr: number;
  opprettet: string;
}

export interface SjekkSkannInnSvar {
  ok: boolean;
  feil?:
    | "finst_ikkje"
    | "ikkje_sleppt"
    | "feil_steg"
    | "alt_i_arbeid"
    | "har_aktivt_kort"
    | "fifo";
  melding: string;
  neste_jobbkort_nr?: string;
  jobbkort_id?: string;
}
