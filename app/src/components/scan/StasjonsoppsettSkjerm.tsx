"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface Props {
  onFullfoert: () => void;
}

export function StasjonsoppsettSkjerm({ onFullfoert }: Props) {
  const supabase = useRef(supabaseBrowser()).current;
  const [laster, setLaster] = useState(true);
  const [epost, setEpost] = useState("");
  const [passord, setPassord] = useState("");
  const [feil, setFeil] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        void stadfestTilgang();
      } else {
        setLaster(false);
      }
    });
    // Supabase-klienten er stabil gjennom useRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function stadfestTilgang() {
    setLaster(true);
    setFeil(null);

    const {
      data: { user },
      error: brukarFeil,
    } = await supabase.auth.getUser();

    if (brukarFeil || !user) {
      setLaster(false);
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
      setLaster(false);
      setFeil("Kontoen har ikkje tilgang til å aktivere skanneeininga.");
      return;
    }

    onFullfoert();
  }

  async function loggInn() {
    if (laster || !epost || !passord) return;

    setLaster(true);
    setFeil(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: epost,
      password: passord,
    });

    if (error) {
      setLaster(false);
      setFeil("Feil e-post eller passord.");
      return;
    }

    await stadfestTilgang();
  }

  if (laster) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-400">Lastar…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 p-6 mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Aktiver skanneeining</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Logg inn som admin éin gong. Jobbkortet bestemmer operasjonen.
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
        disabled={laster || !epost || !passord}
        className="min-h-[56px] w-full rounded-xl bg-neutral-100 text-lg font-semibold text-neutral-900 disabled:opacity-40 active:bg-neutral-300"
      >
        {laster ? "Aktiverer…" : "Aktiver"}
      </button>
    </main>
  );
}
