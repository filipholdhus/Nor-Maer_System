"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ROLLE_NAMN } from "@/lib/domene/typar";
import type { Rolle } from "@/lib/domene/typar";

const OPERATØR_ROLLAR: Rolle[] = ["operator", "sveisar", "kvalitet"];
const MAX_FEIL = 3;
const LAAST_SEK = 30;

export interface InnloggaBrukar {
  id: string;
  namn: string;
  rolle: Rolle;
}

interface Props {
  onInnlogga: (brukar: InnloggaBrukar) => void;
  rollarFilter?: Rolle[];
  tittel?: string;
  onAvbryt?: () => void;
}

export function InnloggingSkjerm({
  onInnlogga,
  rollarFilter,
  tittel,
  onAvbryt,
}: Props) {
  const [brukarar, setBrukarar] = useState<InnloggaBrukar[]>([]);
  const [lasterBrukarar, setLasterBrukarar] = useState(true);
  const [valgBrukar, setValgBrukar] = useState<InnloggaBrukar | null>(null);
  const [pin, setPin] = useState("");
  const [feil, setFeil] = useState(0);
  // nedteljing > 0 means locked; counts down by 1/sec until 0
  const [nedteljing, setNedteljing] = useState(0);
  const [arbeider, setArbeider] = useState(false);
  const [pinFeil, setPinFeil] = useState<string | null>(null);

  // Fetch operator/sveisar/kvalitet users on mount
  // setState is called in .then() — async callback, not synchronously in effect body
  useEffect(() => {
    const client = supabaseBrowser();
    client
      .from("brukar")
      .select("id, namn, rolle")
      .in("rolle", rollarFilter ?? OPERATØR_ROLLAR)
      .eq("aktiv", true)
      .order("namn")
      .then(({ data }) => {
        setBrukarar((data as InnloggaBrukar[] | null) ?? []);
        setLasterBrukarar(false);
      });
  }, [rollarFilter]);

  // Countdown: chain of 1s timeouts. setState calls are in the async callback.
  // When it hits 0: resets feil so user gets fresh attempts after lockout.
  useEffect(() => {
    if (nedteljing <= 0) return;
    const id = setTimeout(() => {
      if (nedteljing <= 1) {
        setNedteljing(0);
        setFeil(0);
        setPinFeil(null);
      } else {
        setNedteljing(nedteljing - 1);
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [nedteljing]);

  const erLaast = nedteljing > 0;

  function trykkBrukar(brukar: InnloggaBrukar) {
    setValgBrukar(brukar);
    setPin("");
    setFeil(0);
    setNedteljing(0);
    setPinFeil(null);
  }

  function trykkSiffer(s: string) {
    if (erLaast || arbeider || pin.length >= 4) return;
    const nyPin = pin + s;
    setPin(nyPin);
    if (nyPin.length === 4) {
      void stadfestPin(nyPin);
    }
  }

  async function stadfestPin(pinVerdi: string) {
    if (!valgBrukar || arbeider) return;
    setArbeider(true);
    setPinFeil(null);

    const client = supabaseBrowser();
    const { data, error } = await client.rpc("sjekk_pin", {
      p_brukar_id: valgBrukar.id,
      p_pin: pinVerdi,
    });

    setArbeider(false);

    if (error || data !== true) {
      const nyFeil = feil + 1;
      setFeil(nyFeil);
      setPin("");
      if (nyFeil >= MAX_FEIL) {
        setNedteljing(LAAST_SEK);
        setPinFeil(`For mange feil. Vent ${LAAST_SEK} sekund.`);
      } else {
        setPinFeil(`Feil PIN. ${MAX_FEIL - nyFeil} forsøk att.`);
      }
    } else {
      onInnlogga(valgBrukar);
    }
  }

  // ── Laster ──────────────────────────────────────────────────────────────────

  if (lasterBrukarar) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-400">Lastar brukarar…</p>
      </main>
    );
  }

  // ── Brukarval ───────────────────────────────────────────────────────────────

  if (!valgBrukar) {
    return (
      <main className="flex min-h-screen flex-col p-4 gap-4">
        {onAvbryt && (
          <button
            onClick={onAvbryt}
            className="min-h-[48px] flex items-center text-neutral-400 text-sm -mb-2"
          >
            ← Tilbake
          </button>
        )}
        <h1 className="text-xl font-bold pt-2">{tittel ?? "Kven er du?"}</h1>

        {brukarar.length === 0 ? (
          <p className="text-neutral-500 text-sm">
            Ingen aktive brukarar funne. Kontakt admin.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {brukarar.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => trykkBrukar(b)}
                  className="min-h-[80px] w-full rounded-2xl bg-neutral-800 flex flex-col items-center justify-center gap-1 px-3 py-4 active:bg-neutral-700"
                >
                  <span className="text-lg font-semibold text-center leading-tight">
                    {b.namn}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {ROLLE_NAMN[b.rolle]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  // ── PIN-pad ──────────────────────────────────────────────────────────────────

  return (
    <main className="flex min-h-screen flex-col p-4 gap-5 max-w-sm mx-auto w-full">
      <div>
        <button
          onClick={() => setValgBrukar(null)}
          className="min-h-[48px] flex items-center text-neutral-400 text-sm mb-1"
        >
          ← Tilbake
        </button>
        <h1 className="text-xl font-bold">{valgBrukar.namn}</h1>
        <p className="text-sm text-neutral-400">{ROLLE_NAMN[valgBrukar.rolle]}</p>
      </div>

      {/* PIN dots */}
      <div className="flex justify-center gap-5 py-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full border-2 transition-colors ${
              i < pin.length
                ? "bg-neutral-100 border-neutral-100"
                : "border-neutral-600"
            }`}
          />
        ))}
      </div>

      {/* Status line */}
      <div className="min-h-[20px] text-center">
        {erLaast ? (
          <p className="text-red-400 text-sm font-medium">
            Låst — {nedteljing} sekund att
          </p>
        ) : pinFeil ? (
          <p className="text-red-400 text-sm">{pinFeil}</p>
        ) : arbeider ? (
          <p className="text-neutral-500 text-sm">Sjekkar…</p>
        ) : null}
      </div>

      {/* Numeric keypad */}
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((s) => (
          <button
            key={s}
            onClick={() => trykkSiffer(s)}
            disabled={erLaast || arbeider}
            className="min-h-[64px] rounded-2xl bg-neutral-800 text-2xl font-semibold disabled:opacity-30 active:bg-neutral-700"
          >
            {s}
          </button>
        ))}
        <div aria-hidden="true" />
        <button
          onClick={() => trykkSiffer("0")}
          disabled={erLaast || arbeider}
          className="min-h-[64px] rounded-2xl bg-neutral-800 text-2xl font-semibold disabled:opacity-30 active:bg-neutral-700"
        >
          0
        </button>
        <button
          onClick={() => setPin((p) => p.slice(0, -1))}
          disabled={erLaast || pin.length === 0}
          className="min-h-[64px] rounded-2xl bg-neutral-800 text-xl text-neutral-300 disabled:opacity-30 active:bg-neutral-700"
        >
          ⌫
        </button>
      </div>
    </main>
  );
}
