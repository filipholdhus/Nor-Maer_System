"use client";

import { useSyncExternalStore, useState } from "react";
import { StasjonsoppsettSkjerm } from "@/components/scan/StasjonsoppsettSkjerm";
import {
  InnloggingSkjerm,
  type InnloggaBrukar,
} from "@/components/scan/InnloggingSkjerm";
import { HovudSkjerm } from "@/components/scan/HovudSkjerm";

const STASJON_KEY = "nor_maer_skannepunkt";
const STASJON_ENDRA_EVENT = "nor_maer_stasjon_endra";

interface LagretStasjon {
  id: string;
  namn: string;
  stasjon: string;
}

function subscribe(cb: () => void) {
  window.addEventListener(STASJON_ENDRA_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(STASJON_ENDRA_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): LagretStasjon | null {
  const raw = localStorage.getItem(STASJON_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LagretStasjon;
  } catch {
    return null;
  }
}

export default function ScanSide() {
  // undefined = server snapshot (hydration guard before localStorage is read)
  const stasjon = useSyncExternalStore(subscribe, getSnapshot, () => undefined);
  const [visOppsett, setVisOppsett] = useState(false);
  const [brukar, setBrukar] = useState<InnloggaBrukar | null>(null);

  if (stasjon === undefined) return null;

  // ── Stasjonsoppsett ────────────────────────────────────────────────────────
  if (stasjon === null || visOppsett) {
    return (
      <StasjonsoppsettSkjerm
        onFullfoert={(sp) => {
          localStorage.setItem(STASJON_KEY, JSON.stringify(sp));
          window.dispatchEvent(new Event(STASJON_ENDRA_EVENT));
          setBrukar(null); // log out current user when station changes
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
      stasjon={stasjon}
      brukar={brukar}
      onLoggUt={() => setBrukar(null)}
      onEndreStasjon={() => setVisOppsett(true)}
    />
  );
}
