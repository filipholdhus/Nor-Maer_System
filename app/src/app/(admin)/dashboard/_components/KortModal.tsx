"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { STEG_NAMN, HENDING_NAMN } from "@/lib/domene/typar";
import type { Hending } from "@/lib/domene/typar";
import { godkjennJobbkort, sendTilbake } from "../actions";

type KortDetalj = {
  id: string;
  jobbkort_nr: string;
  beskriving: string;
  materiale: string | null;
  dimensjon: string | null;
  vekt_kg: number | null;
  antal: number;
  tegning_referanse: string | null;
  tegning_pdf_url: string | null;
  steg_plan: string[];
  noverande_steg: string;
  noverande_status: string;
  rework_runde: number;
  jobbpakke: {
    pakke_nr: string;
    prosjekt: { prosjekt_nr: string } | null;
  } | null;
};

type StegTid = {
  steg: string;
  inn_tid: string;
  ut_tid: string | null;
  varighet_min: number | null;
};

type LoggRad = {
  id: string;
  tidsstempel: string;
  hending: string;
  steg: string;
  kommentar: string | null;
  sendt_tilbake_til_steg: string | null;
  brukar: { namn: string } | null;
};

function formaterDato(iso: string) {
  return new Date(iso).toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formaterVarighet(min: number | null): string {
  if (min == null) return "—";
  const t = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (t === 0) return `${m} min`;
  return m > 0 ? `${t}t ${m}m` : `${t}t`;
}

// ── Steg-plan framdrift ───────────────────────────────────────

function StegPlanTrack({
  stegPlan,
  noverandeSteg,
  stegTider,
}: {
  stegPlan: string[];
  noverandeSteg: string;
  stegTider: StegTid[];
}) {
  const noverandeIdx = stegPlan.indexOf(noverandeSteg);

  const totaltTidPer: Record<string, number> = {};
  for (const t of stegTider) {
    if (t.varighet_min != null) {
      totaltTidPer[t.steg] = (totaltTidPer[t.steg] ?? 0) + t.varighet_min;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {stegPlan.map((steg, idx) => {
        const erFerdig = noverandeSteg === "ferdig" || idx < noverandeIdx;
        const erAktiv = idx === noverandeIdx;
        const varighet = totaltTidPer[steg];

        return (
          <div
            key={steg}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "5px 0",
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                background: erFerdig
                  ? "var(--nm-ferdig)"
                  : erAktiv
                  ? "var(--nm-paagaar)"
                  : "var(--nm-surface-3)",
                color: erFerdig || erAktiv ? "#fff" : "var(--nm-text-3)",
                border: erAktiv ? "2px solid var(--nm-paagaar)" : "none",
              }}
            >
              {erFerdig ? "✓" : idx + 1}
            </div>
            <div style={{ flex: 1 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: erAktiv ? 600 : 400,
                  color: erFerdig
                    ? "var(--nm-ferdig)"
                    : erAktiv
                    ? "var(--nm-text-1)"
                    : "var(--nm-text-3)",
                }}
              >
                {STEG_NAMN[steg as keyof typeof STEG_NAMN] ?? steg}
              </span>
            </div>
            <span style={{ fontSize: 11, color: "var(--nm-text-3)" }}>
              {formaterVarighet(varighet ?? null)}
            </span>
          </div>
        );
      })}
      {noverandeSteg === "ferdig" && (
        <div
          style={{
            marginTop: 4,
            padding: "4px 10px",
            borderRadius: "var(--nm-r-sm)",
            background: "var(--nm-ferdig-bg)",
            color: "var(--nm-ferdig)",
            fontSize: 11,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          Ferdig
        </div>
      )}
    </div>
  );
}

// ── Hendingslogg ──────────────────────────────────────────────

function HendingsLogg({ logg }: { logg: LoggRad[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {logg.map((h) => (
        <div
          key={h.id}
          style={{
            padding: "7px 0",
            borderBottom: "1px solid var(--nm-border)",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "2px 12px",
            alignItems: "start",
          }}
        >
          <div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color:
                  h.hending === "sendt_tilbake"
                    ? "var(--nm-avvik)"
                    : h.hending === "godkjent"
                    ? "var(--nm-ferdig)"
                    : "var(--nm-text-1)",
              }}
            >
              {HENDING_NAMN[h.hending as Hending] ?? h.hending}
            </span>
            <span
              style={{ fontSize: 11, color: "var(--nm-text-3)", marginLeft: 6 }}
            >
              ({STEG_NAMN[h.steg as keyof typeof STEG_NAMN] ?? h.steg})
            </span>
            {h.sendt_tilbake_til_steg && (
              <span style={{ fontSize: 11, color: "var(--nm-avvik)", marginLeft: 4 }}>
                → {STEG_NAMN[h.sendt_tilbake_til_steg as keyof typeof STEG_NAMN] ?? h.sendt_tilbake_til_steg}
              </span>
            )}
            {h.kommentar && (
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  color: "var(--nm-text-2)",
                  fontStyle: "italic",
                }}
              >
                &ldquo;{h.kommentar}&rdquo;
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "var(--nm-text-3)" }}>
              {formaterDato(h.tidsstempel)}
            </div>
            <div style={{ fontSize: 10, color: "var(--nm-text-2)" }}>
              {h.brukar?.namn ?? "—"}
            </div>
          </div>
        </div>
      ))}
      {logg.length === 0 && (
        <div style={{ padding: 16, fontSize: 12, color: "var(--nm-text-3)", textAlign: "center" }}>
          Ingen hendingar
        </div>
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────

export function KortModal({
  kortId,
  onLukk,
}: {
  kortId: string;
  onLukk: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [kort, setKort] = useState<KortDetalj | null>(null);
  const [stegTider, setStegTider] = useState<StegTid[]>([]);
  const [logg, setLogg] = useState<LoggRad[]>([]);
  const [laster, setLaster] = useState(true);
  const [feil, setFeil] = useState<string | null>(null);

  const [sendTilbakeSteg, setSendTilbakeSteg] = useState("");
  const [sendTilbakeKommentar, setSendTilbakeKommentar] = useState("");
  const [aksjonfeil, setAksjonfeil] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    let avbroten = false;
    async function hentData() {
      setLaster(true);
      setFeil(null);
      const sb = supabaseBrowser();
      try {
        const [kortRes, stegTidRes, loggRes] = await Promise.all([
          sb
            .from("jobbkort")
            .select(
              "id, jobbkort_nr, beskriving, materiale, dimensjon, vekt_kg, antal, tegning_referanse, tegning_pdf_url, steg_plan, noverande_steg, noverande_status, rework_runde, jobbpakke:jobbpakke_id(pakke_nr, prosjekt:prosjekt_id(prosjekt_nr))"
            )
            .eq("id", kortId)
            .single(),
          sb
            .from("tid_per_steg_per_jobbkort")
            .select("steg, inn_tid, ut_tid, varighet_min")
            .eq("jobbkort_id", kortId)
            .order("inn_tid"),
          sb
            .from("steg_logg")
            .select(
              "id, tidsstempel, hending, steg, kommentar, sendt_tilbake_til_steg, brukar:brukar_id(namn)"
            )
            .eq("jobbkort_id", kortId)
            .order("tidsstempel", { ascending: false }),
        ]);
        if (avbroten) return;
        const dataFeil = kortRes.error ?? stegTidRes.error ?? loggRes.error;
        if (dataFeil) throw new Error(dataFeil.message);
        setKort(kortRes.data as unknown as KortDetalj);
        setStegTider((stegTidRes.data ?? []) as unknown as StegTid[]);
        setLogg((loggRes.data ?? []) as unknown as LoggRad[]);
        setLaster(false);
      } catch (err) {
        if (avbroten) return;
        setFeil((err as Error).message);
        setLaster(false);
      }
    }
    hentData();
    return () => { avbroten = true; };
  }, [kortId]);

  function handleBackdrop(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onLukk();
  }

  async function opneTegning() {
    if (!kort?.tegning_pdf_url) return;
    const sb = supabaseBrowser();
    const { data, error } = await sb.storage
      .from("tegningar")
      .createSignedUrl(kort.tegning_pdf_url, 3600);
    if (error) {
      setAksjonfeil(error.message);
      return;
    }
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  function handleGodkjenn() {
    if (!kort) return;
    setAksjonfeil(null);
    startTransition(async () => {
      const res = await godkjennJobbkort(kort.id);
      if (!res.ok) {
        setAksjonfeil(res.feil);
        return;
      }
      onLukk();
    });
  }

  function handleSendTilbake() {
    if (!kort || !sendTilbakeSteg) return;
    setAksjonfeil(null);
    startTransition(async () => {
      const res = await sendTilbake(
        kort.id,
        kort.noverande_steg,
        sendTilbakeSteg,
        sendTilbakeKommentar || undefined
      );
      if (!res.ok) {
        setAksjonfeil(res.feil);
        return;
      }
      onLukk();
    });
  }

  const kanGodkjenne =
    kort?.noverande_steg === "admin_inspeksjon" &&
    kort?.noverande_status === "venter";

  const stegFoerNoverande = kort
    ? kort.steg_plan.slice(
        0,
        kort.steg_plan.indexOf(kort.noverande_steg)
      )
    : [];

  // Frå migrasjon 0008: sendt_tilbake krev noverande_status = 'venter'.
  // Operatøren skal aldri få kortet stelast frå seg utan skann ut først.
  const kanSendeTilbake =
    kort &&
    kort.noverande_steg !== "planlagt" &&
    kort.noverande_steg !== "ferdig" &&
    kort.noverande_status === "venter" &&
    stegFoerNoverande.length > 0;

  return (
    <dialog
      ref={dialogRef}
      className="nm-dialog"
      style={{ width: "min(680px, calc(100vw - 32px))" }}
      onClick={handleBackdrop}
      onClose={onLukk}
    >
      {/* Header */}
      <div className="nm-dialog-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="nm-dialog-tittel font-nm-mono">
            {kort?.jobbkort_nr ?? "Lastar…"}
          </span>
          {kort && (
            <span style={{ fontSize: 11, color: "var(--nm-text-3)" }}>
              {kort.jobbpakke?.prosjekt?.prosjekt_nr} / {kort.jobbpakke?.pakke_nr}
            </span>
          )}
        </div>
        <button
          type="button"
          className="nm-btn nm-btn-ghost nm-btn-sm"
          onClick={onLukk}
          aria-label="Lukk"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="nm-dialog-body" style={{ gap: 20 }}>
        {laster && (
          <div style={{ padding: 32, textAlign: "center", color: "var(--nm-text-3)", fontSize: 13 }}>
            Lastar…
          </div>
        )}
        {feil && (
          <div className="nm-dialog-feil">{feil}</div>
        )}

        {kort && !laster && (
          <>
            {/* Info-grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                background: "var(--nm-surface-2)",
                borderRadius: "var(--nm-r-md)",
                padding: 14,
              }}
            >
              <InfoRad label="Beskriving" verdi={kort.beskriving} fullBreidd />
              {kort.materiale && <InfoRad label="Materiale" verdi={kort.materiale} />}
              {kort.dimensjon && <InfoRad label="Dimensjon" verdi={kort.dimensjon} />}
              <InfoRad
                label="Vekt"
                verdi={kort.vekt_kg != null ? `${kort.vekt_kg.toFixed(1)} kg` : "—"}
              />
              <InfoRad label="Antal" verdi={String(kort.antal)} />
              {kort.tegning_referanse && (
                <InfoRad label="Teikning" verdi={kort.tegning_referanse} />
              )}
              <InfoRad
                label="Status"
                verdi={
                  <span
                    className={`nm-badge ${
                      kort.noverande_steg === "ferdig"
                        ? "nm-badge-ferdig"
                        : kort.noverande_status === "paagaar"
                        ? "nm-badge-paagaar"
                        : "nm-badge-venter"
                    }`}
                  >
                    {STEG_NAMN[kort.noverande_steg as keyof typeof STEG_NAMN] ??
                      kort.noverande_steg}
                  </span>
                }
              />
              {kort.rework_runde > 0 && (
                <InfoRad
                  label="Rework"
                  verdi={
                    <span className="nm-badge nm-badge-avvik">
                      Runde {kort.rework_runde}
                    </span>
                  }
                />
              )}
              {kort.tegning_pdf_url && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <button
                    type="button"
                    className="nm-btn nm-btn-sekundær nm-btn-sm"
                    onClick={opneTegning}
                  >
                    Opne teikning (PDF)
                  </button>
                </div>
              )}
            </div>

            {/* Steg-plan framdrift */}
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--nm-text-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 8,
                }}
              >
                Steg-plan
              </div>
              <StegPlanTrack
                stegPlan={kort.steg_plan}
                noverandeSteg={kort.noverande_steg}
                stegTider={stegTider}
              />
            </div>

            {/* Hendingslogg */}
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--nm-text-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 4,
                }}
              >
                Hendingslogg
              </div>
              <HendingsLogg logg={logg} />
            </div>

            {/* Feilmelding frå aksjonar */}
            {aksjonfeil && (
              <div className="nm-dialog-feil">{aksjonfeil}</div>
            )}

            {/* Godkjenn */}
            {kanGodkjenne && (
              <div
                style={{
                  padding: 12,
                  borderRadius: "var(--nm-r-md)",
                  border: "1px solid var(--nm-ferdig)",
                  background: "var(--nm-ferdig-bg)",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--nm-text-1)", marginBottom: 8 }}>
                  Jobbkortet er klar for admin-inspeksjon.
                </div>
                <button
                  type="button"
                  className="nm-btn nm-btn-primær"
                  onClick={handleGodkjenn}
                  disabled={pending}
                  style={{ background: "var(--nm-ferdig)" }}
                >
                  {pending ? "…" : "Godkjenn"}
                </button>
              </div>
            )}

            {/* Send tilbake */}
            {kanSendeTilbake && (
              <div
                style={{
                  padding: 12,
                  borderRadius: "var(--nm-r-md)",
                  border: "1px solid var(--nm-border-2)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--nm-text-3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 10,
                  }}
                >
                  Send tilbake
                </div>
                <div className="nm-stack" style={{ gap: 8 }}>
                  <div className="nm-form-gruppe">
                    <label className="nm-label">Tilbake til steg</label>
                    <select
                      className="nm-select"
                      value={sendTilbakeSteg}
                      onChange={(e) => setSendTilbakeSteg(e.target.value)}
                    >
                      <option value="">Vel steg…</option>
                      {stegFoerNoverande.map((s) => (
                        <option key={s} value={s}>
                          {STEG_NAMN[s as keyof typeof STEG_NAMN] ?? s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="nm-form-gruppe">
                    <label className="nm-label">Kommentar (valfri)</label>
                    <textarea
                      className="nm-textarea"
                      rows={2}
                      placeholder="Kva er grunnen?"
                      value={sendTilbakeKommentar}
                      onChange={(e) => setSendTilbakeKommentar(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="nm-btn nm-btn-sekundær"
                    onClick={handleSendTilbake}
                    disabled={pending || !sendTilbakeSteg}
                    style={{ borderColor: "var(--nm-avvik)", color: "var(--nm-avvik)" }}
                  >
                    {pending ? "…" : "Send tilbake"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}

function InfoRad({
  label,
  verdi,
  fullBreidd,
}: {
  label: string;
  verdi: React.ReactNode;
  fullBreidd?: boolean;
}) {
  return (
    <div style={{ gridColumn: fullBreidd ? "1 / -1" : undefined }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--nm-text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, color: "var(--nm-text-1)" }}>{verdi}</div>
    </div>
  );
}
