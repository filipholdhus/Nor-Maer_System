"use client";

import { useSyncExternalStore, useState } from "react";
import { StasjonsoppsettSkjerm } from "@/components/scan/StasjonsoppsettSkjerm";
import {
  InnloggingSkjerm,
  type InnloggaBrukar,
} from "@/components/scan/InnloggingSkjerm";
import { HovudSkjerm } from "@/components/scan/HovudSkjerm";

// Beheld den gamle nøkkelen slik at allereie konfigurerte einingar blir
// migrerte direkte til fleksibel pilotmodus.
const EINING_KEY = "nor_maer_skannepunkt";
const EINING_ENDRA_EVENT = "nor_maer_stasjon_endra";

function subscribe(cb: () => void) {
  window.addEventListener(EINING_ENDRA_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EINING_ENDRA_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): string | null {
  return localStorage.getItem(EINING_KEY);
}

export default function ScanSide() {
  // undefined = server snapshot (hydration guard before localStorage is read)
  const lagretEining = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => undefined
  );
  const [visOppsett, setVisOppsett] = useState(false);
  const [brukar, setBrukar] = useState<InnloggaBrukar | null>(null);

  if (lagretEining === undefined) return null;

  if (lagretEining === null || visOppsett) {
    return (
      <StasjonsoppsettSkjerm
        onFullfoert={() => {
          localStorage.setItem(EINING_KEY, JSON.stringify({ modus: "fleksibel" }));
          window.dispatchEvent(new Event(EINING_ENDRA_EVENT));
          setBrukar(null);
          setVisOppsett(false);
        }}
      />
    );
  }

  // ── Innlogging ─────────────────────────────────────────────────────────────
  if (!brukar) {
    return <InnloggingSkjerm onInnlogga={setBrukar} />;
  }

  // ── Hovudskjerm ────────────────────────────────────────────────────────────
  return (
    <HovudSkjerm
      brukar={brukar}
      onLoggUt={() => setBrukar(null)}
      onEndreEining={() => setVisOppsett(true)}
    />
  );
}
