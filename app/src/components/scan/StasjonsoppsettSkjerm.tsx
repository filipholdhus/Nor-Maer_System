"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { STASJON_NAMN } from "@/lib/domene/typar";
import type { Stasjon } from "@/lib/domene/typar";

type Fase = "laster" | "logg_inn" | "stasjon_val";

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
  const [feil, setFeil] = useState<string | null>(null);
  const [skannepunkt, setSkannepunkt] = useState<Skannepunkt[]>([]);
  const [arbeider, setArbeider] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        void hentSkannepunkt();
      } else {
        setFase("logg_inn");
      }
    });
    // Supabase-klienten er stabil gjennom useRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function hentSkannepunkt() {
    setArbeider(true);
    setFeil(null);

    const {
      data: { user },
      error: brukarFeil,
    } = await supabase.auth.getUser();

    if (brukarFeil || !user) {
      setArbeider(false);
      setFase("logg_inn");
      return;
    }

    const { data: admin, error: rolleFeil } = await supabase
      .from("brukar")
      .select("id")
      .eq("auth_id", user.id)
      .eq("aktiv", true)
      .in("rolle", ["admin", "leiar"])
      .maybeSingle();

    if (rolleFeil || !admin) {
      await supabase.auth.signOut();
      setArbeider(false);
      setFeil("Kontoen har ikkje tilgang til å konfigurere skannepunkt.");
      setFase("logg_inn");
      return;
    }

    const { data, error } = await supabase
      .from("skannepunkt")
      .select("id, namn, stasjon")
      .eq("aktiv", true)
      .order("stasjon, namn");

    setArbeider(false);

    if (error) {
      setFeil(`Klarte ikkje hente skannepunkt: ${error.message}`);
      setFase("stasjon_val");
      return;
    }

    setSkannepunkt((data as Skannepunkt[] | null) ?? []);
    setFase("stasjon_val");
  }

  async function loggInn() {
    if (arbeider || !epost || !passord) return;

    setArbeider(true);
    setFeil(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: epost,
      password: passord,
    });

    if (error) {
      setArbeider(false);
      setFeil("Feil e-post eller passord.");
      return;
    }

    await hentSkannepunkt();
  }

  if (fase === "laster") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-400">Lastar…</p>
      </main>
    );
  }

  if (fase === "logg_inn") {
    return (
      <main className="flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 p-6 mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Konfigurer skannepunkt</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Logg inn som admin éin gong for å velje stasjon
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <input
            type="email"
            autoComplete="email"
            placeholder="E-post"
            value={epost}
            onChange={(e) => setEpost(e.target.value)}
            className="min-h-[48px] w-full rounded-xl bg-neutral-800 px-4 text-neutral-100 outline-none placeholder:text-neutral-500 focus:ring-2 focus:ring-neutral-500"
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Passord"
            value={passord}
            onChange={(e) => setPassord(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void loggInn();
            }}
            className="min-h-[48px] w-full rounded-xl bg-neutral-800 px-4 text-neutral-100 outline-none placeholder:text-neutral-500 focus:ring-2 focus:ring-neutral-500"
          />
        </div>

        {feil && <p className="text-sm text-red-400">{feil}</p>}

        <button
          type="button"
          onClick={() => void loggInn()}
          disabled={arbeider || !epost || !passord}
          className="min-h-[56px] w-full rounded-xl bg-neutral-100 text-lg font-semibold text-neutral-900 disabled:opacity-40 active:bg-neutral-300"
        >
          {arbeider ? "Loggar inn…" : "Logg inn"}
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Vel skannepunkt</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Dette valet blir lagra på denne eininga.
        </p>
      </div>

      {feil && <p className="text-sm text-red-400">{feil}</p>}

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
                type="button"
                onClick={() =>
                  onFullfoert({
                    id: sp.id,
                    namn: sp.namn,
                    stasjon: sp.stasjon,
                  })
                }
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
