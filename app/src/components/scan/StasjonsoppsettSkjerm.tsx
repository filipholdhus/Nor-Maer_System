"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { STASJON_NAMN } from "@/lib/domene/typar";
import type { Stasjon } from "@/lib/domene/typar";

type Fase = "laster" | "logg_inn" | "admin_val" | "pin_inn" | "stasjon_val";

interface AdminBrukar {
  id: string;
  namn: string;
}

interface Skannepunkt {
  id: string;
  namn: string;
  stasjon: Stasjon;
}

interface Props {
  onFullfoert: (sp: { id: string; namn: string; stasjon: string }) => void;
}

export function StasjonsoppsettSkjerm({ onFullfoert }: Props) {
  const supabase = useRef(supabaseBrowser()).current;

  const [fase, setFase] = useState<Fase>("laster");
  const [epost, setEpost] = useState("");
  const [passord, setPassord] = useState("");
  const [logginFeil, setLogginFeil] = useState<string | null>(null);
  const [adminBrukarar, setAdminBrukarar] = useState<AdminBrukar[]>([]);
  const [valgAdmin, setValgAdmin] = useState<AdminBrukar | null>(null);
  const [pin, setPin] = useState("");
  const [pinFeil, setPinFeil] = useState<string | null>(null);
  const [skannepunkt, setSkannepunkt] = useState<Skannepunkt[]>([]);
  const [arbeider, setArbeider] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        hentAdminBrukarar();
      } else {
        setFase("logg_inn");
      }
    });
    // hentAdminBrukarar is stable (defined outside render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function hentAdminBrukarar() {
    const { data } = await supabase
      .from("brukar")
      .select("id, namn")
      .in("rolle", ["admin", "leiar"])
      .eq("aktiv", true)
      .order("namn");
    setAdminBrukarar((data as AdminBrukar[] | null) ?? []);
    setFase("admin_val");
  }

  async function loggInn() {
    setArbeider(true);
    setLogginFeil(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: epost,
      password: passord,
    });
    setArbeider(false);
    if (error) {
      setLogginFeil("Feil e-post eller passord");
    } else {
      await hentAdminBrukarar();
    }
  }

  function velgAdmin(admin: AdminBrukar) {
    setValgAdmin(admin);
    setPin("");
    setPinFeil(null);
    setFase("pin_inn");
  }

  async function stadfestPin() {
    if (!valgAdmin || pin.length === 0) return;
    setArbeider(true);
    setPinFeil(null);

    const { data, error } = await supabase.rpc("sjekk_pin", {
      p_brukar_id: valgAdmin.id,
      p_pin: pin,
    });

    setArbeider(false);

    if (error || data !== true) {
      setPinFeil("Feil PIN. Prøv igjen.");
      setPin("");
      return;
    }

    const { data: spData } = await supabase
      .from("skannepunkt")
      .select("id, namn, stasjon")
      .eq("aktiv", true)
      .order("stasjon, namn");
    setSkannepunkt((spData as Skannepunkt[] | null) ?? []);
    setFase("stasjon_val");
  }

  function trykkSiffer(s: string) {
    if (pin.length < 6) setPin((p) => p + s);
  }

  function velgSkannepunkt(sp: Skannepunkt) {
    onFullfoert({ id: sp.id, namn: sp.namn, stasjon: sp.stasjon });
  }

  // ── Laster ──────────────────────────────────────────────────────────────────

  if (fase === "laster") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-400">Lastar…</p>
      </main>
    );
  }

  // ── Logg inn ────────────────────────────────────────────────────────────────

  if (fase === "logg_inn") {
    return (
      <main className="flex min-h-screen flex-col justify-center gap-6 p-6 w-full max-w-sm mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Konfigurer skannepunkt</h1>
          <p className="mt-1 text-neutral-400 text-sm">
            Logg inn som admin for å konfigurere denne eininga
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <input
            type="email"
            autoComplete="email"
            placeholder="E-post"
            value={epost}
            onChange={(e) => setEpost(e.target.value)}
            className="w-full rounded-xl bg-neutral-800 px-4 min-h-[48px] text-neutral-100 placeholder:text-neutral-500 outline-none focus:ring-2 focus:ring-neutral-500"
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Passord"
            value={passord}
            onChange={(e) => setPassord(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loggInn();
            }}
            className="w-full rounded-xl bg-neutral-800 px-4 min-h-[48px] text-neutral-100 placeholder:text-neutral-500 outline-none focus:ring-2 focus:ring-neutral-500"
          />
        </div>

        {logginFeil && (
          <p className="text-red-400 text-sm">{logginFeil}</p>
        )}

        <button
          onClick={loggInn}
          disabled={arbeider || !epost || !passord}
          className="min-h-[56px] w-full rounded-xl bg-neutral-100 text-neutral-900 font-semibold text-lg disabled:opacity-40 active:bg-neutral-300"
        >
          {arbeider ? "Loggar inn…" : "Logg inn"}
        </button>
      </main>
    );
  }

  // ── Vel admin-brukar ─────────────────────────────────────────────────────────

  if (fase === "admin_val") {
    return (
      <main className="flex min-h-screen flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Vel admin-brukar</h1>
          <p className="mt-1 text-neutral-400 text-sm">
            Kven konfigurerer denne eininga?
          </p>
        </div>

        {adminBrukarar.length === 0 ? (
          <p className="text-neutral-500">
            Ingen admin-brukarar funne. Kontakt systemadministrator.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {adminBrukarar.map((admin) => (
              <li key={admin.id}>
                <button
                  onClick={() => velgAdmin(admin)}
                  className="min-h-[56px] w-full rounded-xl bg-neutral-800 px-5 text-left text-lg font-medium active:bg-neutral-700"
                >
                  {admin.namn}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  // ── PIN-pad ──────────────────────────────────────────────────────────────────

  if (fase === "pin_inn") {
    return (
      <main className="flex min-h-screen flex-col gap-6 p-6 max-w-sm mx-auto w-full">
        <div>
          <button
            onClick={() => {
              setFase("admin_val");
              setPin("");
              setPinFeil(null);
            }}
            className="min-h-[48px] flex items-center text-neutral-400 text-sm mb-2"
          >
            ← Tilbake
          </button>
          <h1 className="text-2xl font-bold">Skriv inn PIN</h1>
          <p className="mt-1 text-neutral-400 text-sm">{valgAdmin?.namn}</p>
        </div>

        {/* PIN-prikkar */}
        <div className="flex justify-center gap-4 py-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-colors ${
                i < pin.length
                  ? "bg-neutral-100 border-neutral-100"
                  : "border-neutral-600"
              }`}
            />
          ))}
        </div>

        {pinFeil && (
          <p className="text-red-400 text-sm text-center">{pinFeil}</p>
        )}

        {/* Talpad */}
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((s) => (
            <button
              key={s}
              onClick={() => trykkSiffer(s)}
              className="min-h-[64px] rounded-xl bg-neutral-800 text-2xl font-semibold active:bg-neutral-700"
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => {
              setPin("");
              setPinFeil(null);
            }}
            className="min-h-[64px] rounded-xl bg-neutral-800 text-neutral-400 text-sm active:bg-neutral-700"
          >
            Slett
          </button>
          <button
            onClick={() => trykkSiffer("0")}
            className="min-h-[64px] rounded-xl bg-neutral-800 text-2xl font-semibold active:bg-neutral-700"
          >
            0
          </button>
          <button
            onClick={() => setPin((p) => p.slice(0, -1))}
            className="min-h-[64px] rounded-xl bg-neutral-800 text-xl text-neutral-300 active:bg-neutral-700"
          >
            ⌫
          </button>
        </div>

        <button
          onClick={stadfestPin}
          disabled={arbeider || pin.length === 0}
          className="min-h-[56px] w-full rounded-xl bg-neutral-100 text-neutral-900 font-bold text-lg disabled:opacity-40 active:bg-neutral-300"
        >
          {arbeider ? "Sjekkar…" : "Stadfest"}
        </button>
      </main>
    );
  }

  // ── Vel skannepunkt ──────────────────────────────────────────────────────────

  if (fase === "stasjon_val") {
    return (
      <main className="flex min-h-screen flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Vel skannepunkt</h1>
          <p className="mt-1 text-neutral-400 text-sm">
            Kva stasjon er denne eininga plassert på?
          </p>
        </div>

        {skannepunkt.length === 0 ? (
          <p className="text-neutral-500">
            Ingen aktive skannepunkt funne. Opprett skannepunkt i admin-panelet
            fyrst.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {skannepunkt.map((sp) => (
              <li key={sp.id}>
                <button
                  onClick={() => velgSkannepunkt(sp)}
                  className="min-h-[64px] w-full rounded-xl bg-neutral-800 px-5 text-left active:bg-neutral-700"
                >
                  <span className="block text-lg font-semibold">{sp.namn}</span>
                  <span className="block text-sm text-neutral-400">
                    {STASJON_NAMN[sp.stasjon] ?? sp.stasjon}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  return null;
}
