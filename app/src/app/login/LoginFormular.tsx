"use client";

import { useFormStatus } from "react-dom";
import { loggInn } from "@/lib/auth";

function SubmitKnapp() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50"
      style={{
        background: pending ? "#2563eb" : "#3b82f6",
        borderRadius: 6,
      }}
    >
      {pending ? "Loggar inn…" : "Logg inn"}
    </button>
  );
}

const FEIL_TEKST: Record<string, string> = {
  innlogging: "Feil e-postadresse eller passord.",
  tilgang: "Kontoen har ikkje tilgang til administrasjonspanelet.",
  system: "Kunne ikkje kontrollere tilgangen no. Prøv igjen om litt.",
};

export function LoginFormular({ feil }: { feil?: string }) {
  const feilTekst = feil ? FEIL_TEKST[feil] ?? "Noko gjekk gale. Prøv igjen." : null;

  return (
    <form action={loggInn} className="flex flex-col gap-4">
      {feilTekst && (
        <div
          className="px-3 py-2.5 rounded-md text-sm"
          style={{
            background: "rgba(239,68,68,0.1)",
            color: "#fca5a5",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 6,
          }}
        >
          {feilTekst}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="epost"
          className="text-xs font-medium"
          style={{ color: "#8a8a8a" }}
        >
          E-postadresse
        </label>
        <input
          id="epost"
          name="epost"
          type="email"
          required
          autoComplete="email"
          className="w-full px-3 py-2 rounded-md text-sm outline-none transition-colors"
          style={{
            background: "#171717",
            border: "1px solid #2a2a2a",
            color: "#f0f0f0",
            borderRadius: 6,
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="passord"
          className="text-xs font-medium"
          style={{ color: "#8a8a8a" }}
        >
          Passord
        </label>
        <input
          id="passord"
          name="passord"
          type="password"
          required
          autoComplete="current-password"
          className="w-full px-3 py-2 rounded-md text-sm outline-none transition-colors"
          style={{
            background: "#171717",
            border: "1px solid #2a2a2a",
            color: "#f0f0f0",
            borderRadius: 6,
          }}
        />
      </div>

      <SubmitKnapp />
    </form>
  );
}
