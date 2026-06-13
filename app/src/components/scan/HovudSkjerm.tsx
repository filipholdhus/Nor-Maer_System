"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useSkanner } from "@/hooks/useSkanner";
import { InnloggingSkjerm, type InnloggaBrukar } from "./InnloggingSkjerm";
import {
  FLEKSIBLE_SKANN_STEG,
  STEG_NAMN,
} from "@/lib/domene/typar";
import type { Rolle, Steg, SjekkSkannInnSvar } from "@/lib/domene/typar";

const SVEISAR_ROLLAR: Rolle[] = ["sveisar"];

interface Props {
  brukar: InnloggaBrukar;
  onLoggUt: () => void;
  onEndreEining: () => void;
}

type Tilstand =
  | { fase: "ledig" }
  | { fase: "sjekkar"; jobbkortNr: string }
  | { fase: "avvist"; melding: string; nesteJobbkortNr?: string }
  | { fase: "stadfest_inn"; jobbkortId: string; jobbkortNr: string; steg: Steg }
  | { fase: "aktivt_kort"; jobbkortId: string; jobbkortNr: string; steg: Steg }
  | { fase: "reid"; jobbkortId: string; jobbkortNr: string; steg: Steg }
  | { fase: "fullfoert"; jobbkortNr: string; nesteSteg: Steg };

export function HovudSkjerm({ brukar, onLoggUt, onEndreEining }: Props) {
  const [tilstand, setTilstand] = useState<Tilstand>({ fase: "ledig" });
  const [sekund, setSekund] = useState(0);
  const [arbeider, setArbeider] = useState(false);
  const [aktivFeil, setAktivFeil] = useState<string | null>(null);

  // On mount: restore active card if this operator already has one in DB
  useEffect(() => {
    const client = supabaseBrowser();
    client
      .from("jobbkort")
      .select("id, jobbkort_nr, noverande_steg")
      .eq("aktiv_brukar_id", brukar.id)
      .eq("noverande_status", "paagaar")
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setTilstand({
            fase: "aktivt_kort",
            jobbkortId: data[0].id as string,
            jobbkortNr: data[0].jobbkort_nr as string,
            steg: data[0].noverande_steg as Steg,
          });
          setSekund(0);
        }
      });
  }, [brukar.id]);

  // Live timer — counts up while a card is active
  useEffect(() => {
    if (tilstand.fase !== "aktivt_kort") return;
    const id = setInterval(() => {
      setSekund((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [tilstand]);

  useEffect(() => {
    if (tilstand.fase !== "fullfoert") return;
    const id = setTimeout(() => setTilstand({ fase: "ledig" }), 5000);
    return () => clearTimeout(id);
  }, [tilstand]);

  useEffect(() => {
    if (!aktivFeil) return;
    const id = setTimeout(() => setAktivFeil(null), 4000);
    return () => clearTimeout(id);
  }, [aktivFeil]);

  // Auto-dismiss AVVIST after 5 s
  useEffect(() => {
    if (tilstand.fase !== "avvist") return;
    const id = setTimeout(() => {
      setTilstand({ fase: "ledig" });
    }, 5000);
    return () => clearTimeout(id);
  }, [tilstand]);

  async function handterSkann(jobbkortNr: string) {
    if (tilstand.fase === "aktivt_kort") {
      if (jobbkortNr !== tilstand.jobbkortNr) {
        setAktivFeil(
          `Du arbeider på ${tilstand.jobbkortNr}. Skann same kort for å avslutte.`
        );
        return;
      }
      setAktivFeil(null);
      trykkFerdig();
      return;
    }

    if (tilstand.fase !== "ledig" && tilstand.fase !== "avvist") return;
    setTilstand({ fase: "sjekkar", jobbkortNr });

    const client = supabaseBrowser();
    const { data: kort, error: kortFeil } = await client
      .from("jobbkort")
      .select("id, noverande_steg")
      .eq("jobbkort_nr", jobbkortNr)
      .maybeSingle();

    if (kortFeil || !kort) {
      setTilstand({
        fase: "avvist",
        melding: kortFeil?.message ?? `Fann ikkje jobbkort ${jobbkortNr}`,
      });
      return;
    }

    const steg = kort.noverande_steg as Steg;
    if (!(FLEKSIBLE_SKANN_STEG as readonly Steg[]).includes(steg)) {
      const melding =
        steg === "admin_inspeksjon"
          ? "Jobbkortet ventar på admin-inspeksjon."
          : steg === "galv"
            ? "Jobbkortet ventar på behandling ved galv-porten."
            : steg === "planlagt"
              ? "Jobbkortet er ikkje sleppt til produksjon."
              : "Jobbkortet er allereie ferdig.";
      setTilstand({ fase: "avvist", melding });
      return;
    }

    const { data, error } = await client.rpc("sjekk_skann_inn", {
      p_jobbkort_nr: jobbkortNr,
      p_steg: steg,
      p_brukar_id: brukar.id,
    });

    if (error || data == null) {
      setTilstand({ fase: "avvist", melding: error?.message ?? "Ukjent feil" });
      return;
    }

    const svar = data as SjekkSkannInnSvar;
    if (!svar.ok) {
      setTilstand({
        fase: "avvist",
        melding: svar.melding,
        nesteJobbkortNr: svar.neste_jobbkort_nr,
      });
    } else {
      setTilstand({
        fase: "stadfest_inn",
        jobbkortId: svar.jobbkort_id!,
        jobbkortNr,
        steg,
      });
    }
  }

  async function stadfestInn() {
    if (tilstand.fase !== "stadfest_inn" || arbeider) return;
    setArbeider(true);

    const { jobbkortId, jobbkortNr, steg } = tilstand;
    const client = supabaseBrowser();
    const { error } = await client.from("steg_logg").insert({
      jobbkort_id: jobbkortId,
      steg,
      hending: "skann_inn",
      brukar_id: brukar.id,
    });

    setArbeider(false);

    if (error) {
      setTilstand({ fase: "avvist", melding: error.message });
      return;
    }

    setSekund(0);
    setAktivFeil(null);
    setTilstand({ fase: "aktivt_kort", jobbkortId, jobbkortNr, steg });
  }

  async function skannUt(sveisar?: InnloggaBrukar) {
    if (tilstand.fase !== "aktivt_kort" && tilstand.fase !== "reid") return;
    if (arbeider) return;

    const { jobbkortId, jobbkortNr, steg } = tilstand;
    const utBrukarId = sveisar ? sveisar.id : brukar.id;

    setArbeider(true);
    const client = supabaseBrowser();
    const { error } = await client.from("steg_logg").insert({
      jobbkort_id: jobbkortId,
      steg,
      hending: "skann_ut",
      brukar_id: utBrukarId,
    });

    setArbeider(false);

    if (error) {
      setTilstand({ fase: "avvist", melding: error.message });
      return;
    }

    const { data: oppdatertKort } = await client
      .from("jobbkort")
      .select("noverande_steg")
      .eq("id", jobbkortId)
      .maybeSingle();

    setSekund(0);
    setTilstand({
      fase: "fullfoert",
      jobbkortNr,
      nesteSteg: (oppdatertKort?.noverande_steg as Steg | undefined) ?? "ferdig",
    });
  }

  function trykkFerdig() {
    if (tilstand.fase !== "aktivt_kort") return;
    if (tilstand.steg === "sveis") {
      setTilstand({
        fase: "reid",
        jobbkortId: tilstand.jobbkortId,
        jobbkortNr: tilstand.jobbkortNr,
        steg: tilstand.steg,
      });
    } else {
      void skannUt();
    }
  }

  useSkanner(
    handterSkann,
    tilstand.fase === "ledig" ||
      tilstand.fase === "avvist" ||
      tilstand.fase === "aktivt_kort"
  );

  const min = Math.floor(sekund / 60);
  const sek = sekund % 60;
  const timerTekst = `${min.toString().padStart(2, "0")}:${sek.toString().padStart(2, "0")}`;

  // ── REID — sveis re-identification on scan-out ────────────────────────────
  if (tilstand.fase === "reid") {
    const { jobbkortId, jobbkortNr, steg } = tilstand;
    return (
      <InnloggingSkjerm
        tittel="Identifiser sveisar"
        rollarFilter={SVEISAR_ROLLAR}
        onInnlogga={(s) => void skannUt(s)}
        onAvbryt={() =>
          setTilstand({ fase: "aktivt_kort", jobbkortId, jobbkortNr, steg })
        }
      />
    );
  }

  // ── SJEKKAR ───────────────────────────────────────────────────────────────
  if (tilstand.fase === "sjekkar") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-2xl font-bold text-neutral-200">{tilstand.jobbkortNr}</p>
        <p className="text-neutral-500 text-sm">Sjekkar…</p>
      </main>
    );
  }

  // ── AVVIST — red ✕ with message; scanner stays active for retry ──────────
  if (tilstand.fase === "avvist") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="text-7xl font-bold text-red-400">✕</div>
        <p className="text-lg font-semibold text-red-300 leading-snug">
          {tilstand.melding}
        </p>
        {tilstand.nesteJobbkortNr != null && (
          <div>
            <p className="text-neutral-500 text-xs uppercase tracking-widest">
              Neste i køen
            </p>
            <p className="text-4xl font-bold text-neutral-100 mt-1">
              {tilstand.nesteJobbkortNr}
            </p>
          </div>
        )}
        <button
          onClick={() => setTilstand({ fase: "ledig" })}
          className="min-h-[48px] px-8 rounded-xl bg-neutral-800 text-neutral-300 active:bg-neutral-700"
        >
          OK
        </button>
      </main>
    );
  }

  // ── STADFEST INN — green ✓ confirmation before writing steg_logg ─────────
  if (tilstand.fase === "stadfest_inn") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="text-7xl font-bold text-green-400">✓</div>
        <p className="text-2xl font-bold text-neutral-100">{tilstand.jobbkortNr}</p>
        <div>
          <p className="text-xs uppercase tracking-widest text-neutral-500">
            Operasjon
          </p>
          <p className="mt-1 text-3xl font-bold text-neutral-100">
            {STEG_NAMN[tilstand.steg]}
          </p>
        </div>
        <p className="text-neutral-400 text-sm">Start arbeid på dette kortet?</p>
        <div className="flex gap-3 w-full max-w-xs">
          <button
            onClick={() => void stadfestInn()}
            disabled={arbeider}
            className="flex-1 min-h-[64px] rounded-2xl bg-green-700 text-xl font-semibold active:bg-green-600 disabled:opacity-30"
          >
            {arbeider ? "…" : "Start"}
          </button>
          <button
            onClick={() => setTilstand({ fase: "ledig" })}
            disabled={arbeider}
            className="min-h-[64px] px-6 rounded-2xl bg-neutral-800 text-neutral-300 active:bg-neutral-700 disabled:opacity-30"
          >
            Avbryt
          </button>
        </div>
      </main>
    );
  }

  if (tilstand.fase === "fullfoert") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="text-7xl font-bold text-green-400">✓</div>
        <div>
          <p className="text-2xl font-bold text-neutral-100">
            {tilstand.jobbkortNr}
          </p>
          <p className="mt-2 text-sm text-neutral-500">Steget er fullført</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-neutral-500">
            {tilstand.nesteSteg === "ferdig" ? "Status" : "Neste steg"}
          </p>
          <p className="mt-1 text-3xl font-bold text-neutral-100">
            {STEG_NAMN[tilstand.nesteSteg]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTilstand({ fase: "ledig" })}
          className="min-h-[48px] rounded-xl bg-neutral-800 px-8 text-neutral-300 active:bg-neutral-700"
        >
          OK
        </button>
      </main>
    );
  }

  // ── AKTIVT KORT — live timer + Ferdig button ──────────────────────────────
  if (tilstand.fase === "aktivt_kort") {
    return (
      <main className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="flex flex-col">
            <span className="text-xs text-neutral-500 uppercase tracking-widest leading-tight">
              {STEG_NAMN[tilstand.steg]}
            </span>
            <span className="font-semibold leading-tight">{brukar.namn}</span>
          </div>
          <button
            onClick={onLoggUt}
            className="min-h-[48px] px-4 rounded-xl bg-neutral-800 text-sm text-neutral-300 active:bg-neutral-700"
          >
            Logg ut
          </button>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-xs text-neutral-500 uppercase tracking-widest">
            I ARBEID
          </p>
          <p className="text-3xl font-bold text-neutral-100">
            {tilstand.jobbkortNr}
          </p>
          <p className="text-5xl font-mono font-semibold text-neutral-300 tabular-nums">
            {timerTekst}
          </p>
          <p className="text-sm text-neutral-500">
            Skann same jobbkort for å avslutte steget
          </p>
          {aktivFeil && (
            <p className="max-w-sm text-sm font-medium text-red-400">
              {aktivFeil}
            </p>
          )}
        </div>

        <div className="px-4 pb-8">
          <button
            onClick={trykkFerdig}
            disabled={arbeider}
            className="w-full min-h-[72px] rounded-2xl bg-blue-700 text-xl font-bold active:bg-blue-600 disabled:opacity-30"
          >
            {arbeider
              ? "…"
              : tilstand.steg === "sveis"
              ? "Reserve: ferdig — identifiser sveisar"
              : "Reserve: ferdig"}
          </button>
        </div>
      </main>
    );
  }

  // ── LEDIG — waiting for scanner input ────────────────────────────────────
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="flex flex-col">
            <span className="text-xs text-neutral-500 uppercase tracking-widest leading-tight">
              Fleksibel skann
            </span>
          <span className="font-semibold leading-tight">{brukar.namn}</span>
        </div>
        <button
          onClick={onLoggUt}
          className="min-h-[48px] px-4 rounded-xl bg-neutral-800 text-sm text-neutral-300 active:bg-neutral-700"
        >
          Logg ut
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="w-20 h-20 rounded-full border-2 border-dashed border-neutral-700 flex items-center justify-center">
          <span className="text-3xl text-neutral-600">⊞</span>
        </div>
        <p className="text-neutral-500 text-sm mt-2">
          Klar — skann eit jobbkort
        </p>
      </div>

      <footer className="px-4 py-3 border-t border-neutral-800">
        <button
          onClick={onEndreEining}
          className="text-xs text-neutral-600 active:text-neutral-400"
        >
          Nullstill skanneeining
        </button>
      </footer>
    </main>
  );
}
