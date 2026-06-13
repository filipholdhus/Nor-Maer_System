"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
  opprettJobbkort,
  oppdaterJobbkort,
  oppdaterTegningUrl,
  sleppJobbkort,
} from "../../../../actions";
import { STANDARD_STEG_PLAN, STEG_NAMN, VEKT_TOLERANSE } from "@/lib/domene/typar";
import type { PakkeFull, JobbkortRad } from "../page";
import type { VektValidering } from "../../../page";

const STEG_PLAN_OPSJONER = STANDARD_STEG_PLAN;

const STEG_STATUS_KLASSE: Record<string, string> = {
  planlagt: "nm-badge-nøytral",
  kapp: "nm-badge-venter",
  sveis: "nm-badge-paagaar",
  kontroll: "nm-badge-paagaar",
  admin_inspeksjon: "nm-badge-paagaar",
  galv: "nm-badge-paagaar",
  ferdig: "nm-badge-ferdig",
};

function VektBadge({ v }: { v: VektValidering | null | undefined }) {
  if (!v) return <span className="nm-vekt-ukjent">—</span>;
  const planlagt = v.planlagt_kg ?? v.total_vekt_kg ?? null;
  if (planlagt == null || planlagt === 0)
    return <span className="nm-vekt-ukjent">Ingen planvekt</span>;
  if (v.innan_toleranse) {
    return (
      <span className="nm-vekt-ok">
        ✓ {v.sum_jobbkort_kg.toFixed(1)} / {planlagt.toFixed(1)} kg
      </span>
    );
  }
  return (
    <span className="nm-vekt-feil">
      ✕ {v.avvik_prosent != null ? `${v.avvik_prosent.toFixed(1)}% avvik` : ""}
      {" "}
      ({v.sum_jobbkort_kg.toFixed(1)} / {planlagt.toFixed(1)} kg)
    </span>
  );
}

// Live weight preview based on current jobbkort list + pending edit value
function EstimertVektBadge({
  planlagt_kg,
  jobbkort,
  redigerKortId,
  nyVekt,
}: {
  planlagt_kg: number | null;
  jobbkort: JobbkortRad[];
  redigerKortId: string | null;
  nyVekt: string;
}) {
  if (planlagt_kg == null || planlagt_kg === 0)
    return <span className="nm-vekt-ukjent">Ingen planvekt</span>;

  const andreKort = redigerKortId
    ? jobbkort.filter((k) => k.id !== redigerKortId)
    : jobbkort;
  const sumAndre = andreKort.reduce((s, k) => s + (k.vekt_kg ?? 0), 0);
  const tillegg = nyVekt ? parseFloat(nyVekt) || 0 : 0;
  const sum = sumAndre + tillegg;
  const avvik = Math.abs(sum - planlagt_kg) / planlagt_kg;
  const ok = avvik <= VEKT_TOLERANSE;

  if (ok) {
    return (
      <span className="nm-vekt-ok">
        ✓ {sum.toFixed(1)} / {planlagt_kg.toFixed(1)} kg
      </span>
    );
  }
  return (
    <span className="nm-vekt-feil">
      ✕ {(avvik * 100).toFixed(1)}% avvik ({sum.toFixed(1)} /{" "}
      {planlagt_kg.toFixed(1)} kg)
    </span>
  );
}

type KortForm = {
  beskriving: string;
  materiale: string;
  dimensjon: string;
  vekt_kg: string;
  antal: string;
  tegning_referanse: string;
  steg_plan: string[];
};

const tomKortForm = (): KortForm => ({
  beskriving: "",
  materiale: "",
  dimensjon: "",
  vekt_kg: "",
  antal: "1",
  tegning_referanse: "",
  steg_plan: [...STANDARD_STEG_PLAN],
});

type Props = {
  pakke: PakkeFull;
  jobbkort: JobbkortRad[];
  vektValidering: VektValidering | null;
  prosjektId: string;
};

export function PakkeDetalj({
  pakke,
  jobbkort,
  vektValidering,
  prosjektId,
}: Props) {
  const router = useRouter();

  const kortDialogRef = useRef<HTMLDialogElement>(null);
  const [kortForm, setKortForm] = useState<KortForm>(tomKortForm());
  const [redigerKortId, setRedigerKortId] = useState<string | null>(null);
  const [kortFeil, setKortFeil] = useState<string | null>(null);
  const [kortPending, startKortTransition] = useTransition();

  // Slepp-state
  const [sleppFeil, setSleppFeil] = useState<string | null>(null);
  const [sleppPending, startSleppTransition] = useTransition();

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadKortId, setUploadKortId] = useState<string | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadFeil, setUploadFeil] = useState<string | null>(null);

  function opneNyttKort() {
    setRedigerKortId(null);
    setKortForm(tomKortForm());
    setKortFeil(null);
    kortDialogRef.current?.showModal();
  }

  function opneRedigerKort(kart: JobbkortRad) {
    setRedigerKortId(kart.id);
    setKortForm({
      beskriving: kart.beskriving,
      materiale: kart.materiale ?? "",
      dimensjon: kart.dimensjon ?? "",
      vekt_kg: kart.vekt_kg?.toString() ?? "",
      antal: kart.antal.toString(),
      tegning_referanse: kart.tegning_referanse ?? "",
      steg_plan: [...kart.steg_plan],
    });
    setKortFeil(null);
    kortDialogRef.current?.showModal();
  }

  function sleppKort(ids: string[]) {
    setSleppFeil(null);
    startSleppTransition(async () => {
      const res = await sleppJobbkort(ids);
      if (!res.ok) {
        setSleppFeil(res.feil);
        return;
      }
      router.push(
        `/prosjekt/${prosjektId}/pakke/${pakke.id}/skriv-ut?kort=${ids.join(",")}`
      );
    });
  }

  function toggleSteg(steg: string) {
    setKortForm((p) => ({
      ...p,
      steg_plan: p.steg_plan.includes(steg)
        ? p.steg_plan.filter((s) => s !== steg)
        : [...p.steg_plan, steg],
    }));
  }

  function handleKortSubmit() {
    if (!kortForm.beskriving.trim()) {
      setKortFeil("Beskriving er påkravd.");
      return;
    }
    if (kortForm.steg_plan.length === 0) {
      setKortFeil("Minst eitt steg må vere valt.");
      return;
    }
    setKortFeil(null);

    // Keep plan in fixed order
    const ordnaStegPlan = STEG_PLAN_OPSJONER.filter((s) =>
      kortForm.steg_plan.includes(s)
    );

    startKortTransition(async () => {
      if (redigerKortId) {
        const res = await oppdaterJobbkort(redigerKortId, pakke.id, prosjektId, {
          beskriving: kortForm.beskriving.trim(),
          materiale: kortForm.materiale || null,
          dimensjon: kortForm.dimensjon || null,
          vekt_kg: kortForm.vekt_kg ? parseFloat(kortForm.vekt_kg) : null,
          antal: parseInt(kortForm.antal) || 1,
          tegning_referanse: kortForm.tegning_referanse || null,
          steg_plan: ordnaStegPlan,
        });
        if (!res.ok) {
          setKortFeil(res.feil);
          return;
        }
      } else {
        const res = await opprettJobbkort({
          jobbpakke_id: pakke.id,
          beskriving: kortForm.beskriving.trim(),
          materiale: kortForm.materiale || undefined,
          dimensjon: kortForm.dimensjon || undefined,
          vekt_kg: kortForm.vekt_kg ? parseFloat(kortForm.vekt_kg) : undefined,
          antal: parseInt(kortForm.antal) || 1,
          tegning_referanse: kortForm.tegning_referanse || undefined,
          steg_plan: ordnaStegPlan,
        });
        if (!res.ok) {
          setKortFeil(res.feil);
          return;
        }
      }
      kortDialogRef.current?.close();
      router.refresh();
    });
  }

  async function lastOppTegning(kortId: string) {
    const fil = fileInputRef.current?.files?.[0];
    if (!fil) return;
    if (fil.type !== "application/pdf") {
      setUploadFeil("Berre PDF-filer er støtta.");
      return;
    }
    if (fil.size > 20 * 1024 * 1024) {
      setUploadFeil("Fila er for stor (maks 20 MB).");
      return;
    }
    setUploadPending(true);
    setUploadFeil(null);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const storagePath = `${kortId}/tegning.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("tegningar")
      .upload(storagePath, fil, { upsert: true });

    if (uploadError) {
      setUploadFeil(uploadError.message);
      setUploadPending(false);
      return;
    }

    const res = await oppdaterTegningUrl(kortId, pakke.id, prosjektId, storagePath);
    if (!res.ok) {
      // Metadataoppdatering feila — slett opplasta fil for å unngå foreldrelaus fil
      await supabase.storage.from("tegningar").remove([storagePath]);
      setUploadFeil(res.feil);
    } else {
      router.refresh();
    }
    setUploadPending(false);
    setUploadKortId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function opneTegning(kortId: string) {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase.storage
      .from("tegningar")
      .createSignedUrl(`${kortId}/tegning.pdf`, 3600);
    if (error) {
      setUploadFeil(error.message);
      return;
    }
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === kortDialogRef.current) kortDialogRef.current?.close();
  }

  const prosjektNr = pakke.prosjekt?.prosjekt_nr ?? prosjektId;

  return (
    <>
      {/* ── Sidehovud ─────────────────────────────────────────── */}
      <div className="nm-page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/prosjekt" className="nm-tilbake">
            ← Prosjekt
          </Link>
          <span style={{ color: "var(--nm-text-3)" }}>/</span>
          <Link
            href={`/prosjekt/${prosjektId}`}
            className="nm-tilbake"
            style={{ color: "var(--nm-text-2)", fontFamily: "var(--font-dm-mono), monospace", fontSize: 12 }}
          >
            {prosjektNr}
          </Link>
          <span style={{ color: "var(--nm-text-3)" }}>/</span>
          <span className="nm-page-title font-nm-mono">{pakke.pakke_nr}</span>
        </div>
        <button
          type="button"
          className="nm-btn nm-btn-primær nm-btn-sm"
          onClick={opneNyttKort}
        >
          + Nytt jobbkort
        </button>
      </div>

      <div className="nm-page-body nm-stack">
        {/* ── Pakkeinfo ────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--nm-text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
              Beskriving
            </div>
            <div style={{ fontSize: 13, color: "var(--nm-text-1)" }}>
              {pakke.beskriving}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--nm-text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
              Vektvalidering
            </div>
            <VektBadge v={vektValidering} />
          </div>
          {pakke.total_vekt_planlagt_kg != null && (
            <div>
              <div style={{ fontSize: 11, color: "var(--nm-text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                Planvekt
              </div>
              <div style={{ fontSize: 13, color: "var(--nm-text-2)" }}>
                {pakke.total_vekt_planlagt_kg.toFixed(1)} kg
              </div>
            </div>
          )}
        </div>

        {/* ── Slepp-feil ───────────────────────────────────────── */}
        {sleppFeil && (
          <div
            style={{
              padding: "8px 12px",
              background: "var(--nm-avvik-bg)",
              color: "var(--nm-avvik)",
              borderRadius: "var(--nm-r-md)",
              fontSize: 12,
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            {sleppFeil}
          </div>
        )}

        {/* ── Jobbkort-liste ───────────────────────────────────── */}
        <div className="nm-card">
          <div className="nm-card-header">
            <span className="nm-card-tittel">
              Jobbkort ({jobbkort.length})
            </span>
            {(() => {
              const planlagtIds = jobbkort
                .filter((k) => k.noverande_steg === "planlagt")
                .map((k) => k.id);
              return planlagtIds.length > 1 ? (
                <button
                  type="button"
                  className="nm-btn nm-btn-sekundær nm-btn-sm"
                  disabled={sleppPending}
                  onClick={() => sleppKort(planlagtIds)}
                >
                  {sleppPending
                    ? "Slepper…"
                    : `Slepp alle (${planlagtIds.length})`}
                </button>
              ) : null;
            })()}
          </div>

          {jobbkort.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                color: "var(--nm-text-3)",
                fontSize: 13,
              }}
            >
              Ingen jobbkort enno — klikk «Nytt jobbkort»
            </div>
          ) : (
            <table className="nm-table">
              <thead>
                <tr>
                  <th>Jobbkortnr</th>
                  <th>Beskriving</th>
                  <th>Mat / Dim</th>
                  <th style={{ textAlign: "right" }}>Vekt (kg)</th>
                  <th style={{ textAlign: "right" }}>Antal</th>
                  <th>Steg-plan</th>
                  <th>Status</th>
                  <th>Teikning</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {jobbkort.map((k) => (
                  <tr key={k.id}>
                    <td>
                      <span
                        className="font-nm-mono"
                        style={{ fontSize: 12, color: "var(--nm-accent)" }}
                      >
                        {k.jobbkort_nr}
                      </span>
                    </td>
                    <td style={{ color: "var(--nm-text-2)", maxWidth: 200 }}>
                      {k.beskriving}
                    </td>
                    <td
                      style={{
                        color: "var(--nm-text-3)",
                        fontSize: 11,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {k.materiale}
                      {k.materiale && k.dimensjon ? " · " : ""}
                      {k.dimensjon}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontFamily: "var(--font-dm-mono), monospace",
                        fontSize: 12,
                      }}
                    >
                      {k.vekt_kg != null ? k.vekt_kg.toFixed(1) : "—"}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        color: "var(--nm-text-2)",
                        fontSize: 12,
                      }}
                    >
                      {k.antal}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {k.steg_plan.map((s) => (
                          <span key={s} className="nm-steg-chip">
                            {STEG_NAMN[s as keyof typeof STEG_NAMN] ?? s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`nm-badge ${STEG_STATUS_KLASSE[k.noverande_steg] ?? "nm-badge-nøytral"}`}
                        style={{ fontSize: 10 }}
                      >
                        {STEG_NAMN[k.noverande_steg as keyof typeof STEG_NAMN] ??
                          k.noverande_steg}
                      </span>
                    </td>
                    <td>
                      {k.tegning_pdf_url ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            type="button"
                            className="nm-btn nm-btn-ghost nm-btn-sm"
                            onClick={() => opneTegning(k.id)}
                            title="Opne PDF"
                          >
                            PDF
                          </button>
                          <button
                            type="button"
                            className="nm-btn nm-btn-ghost nm-btn-sm"
                            onClick={() => {
                              setUploadKortId(k.id);
                              fileInputRef.current?.click();
                            }}
                            title="Byt ut PDF"
                          >
                            Byt
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="nm-btn nm-btn-sekundær nm-btn-sm"
                          onClick={() => {
                            setUploadKortId(k.id);
                            fileInputRef.current?.click();
                          }}
                        >
                          Last opp
                        </button>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        {k.noverande_steg === "planlagt" && (
                          <button
                            type="button"
                            className="nm-btn nm-btn-primær nm-btn-sm"
                            disabled={sleppPending}
                            onClick={() => sleppKort([k.id])}
                          >
                            Slepp
                          </button>
                        )}
                        <button
                          type="button"
                          className="nm-btn nm-btn-ghost nm-btn-sm"
                          onClick={() => opneRedigerKort(k)}
                        >
                          Rediger
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Hidden file input for uploads */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: "none" }}
          onChange={() => {
            if (uploadKortId) lastOppTegning(uploadKortId);
          }}
        />
        {uploadPending && (
          <div style={{ fontSize: 12, color: "var(--nm-text-2)" }}>
            Lastar opp teikning…
          </div>
        )}
        {uploadFeil && (
          <div
            style={{
              fontSize: 12,
              color: "var(--nm-avvik)",
              background: "var(--nm-avvik-bg)",
              padding: "6px 10px",
              borderRadius: "var(--nm-r-sm)",
            }}
          >
            {uploadFeil}
          </div>
        )}
      </div>

      {/* ── Dialog: opprett/rediger jobbkort ─────────────────── */}
      <dialog
        ref={kortDialogRef}
        className="nm-dialog"
        onClick={handleBackdrop}
        style={{ width: "min(560px, calc(100vw - 32px))" }}
      >
        <div className="nm-dialog-header">
          <span className="nm-dialog-tittel">
            {redigerKortId ? "Rediger jobbkort" : "Nytt jobbkort"}
          </span>
          <button
            type="button"
            className="nm-btn nm-btn-ghost nm-btn-sm"
            onClick={() => kortDialogRef.current?.close()}
          >
            ✕
          </button>
        </div>
        <div className="nm-dialog-body">
          {kortFeil && <div className="nm-dialog-feil">{kortFeil}</div>}

          <div className="nm-form-gruppe">
            <label className="nm-label">Beskriving *</label>
            <textarea
              className="nm-textarea"
              placeholder="t.d. Bjelke HEB200 6m"
              value={kortForm.beskriving}
              onChange={(e) =>
                setKortForm((p) => ({ ...p, beskriving: e.target.value }))
              }
            />
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <div className="nm-form-gruppe">
              <label className="nm-label">Materiale</label>
              <input
                className="nm-input"
                placeholder="t.d. S355J2+N"
                value={kortForm.materiale}
                onChange={(e) =>
                  setKortForm((p) => ({ ...p, materiale: e.target.value }))
                }
              />
            </div>
            <div className="nm-form-gruppe">
              <label className="nm-label">Dimensjon</label>
              <input
                className="nm-input"
                placeholder="t.d. HEB200, 6m"
                value={kortForm.dimensjon}
                onChange={(e) =>
                  setKortForm((p) => ({ ...p, dimensjon: e.target.value }))
                }
              />
            </div>
            <div className="nm-form-gruppe">
              <label className="nm-label">Vekt (kg)</label>
              <input
                className="nm-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={kortForm.vekt_kg}
                onChange={(e) =>
                  setKortForm((p) => ({ ...p, vekt_kg: e.target.value }))
                }
              />
            </div>
            <div className="nm-form-gruppe">
              <label className="nm-label">Antal</label>
              <input
                className="nm-input"
                type="number"
                min="1"
                value={kortForm.antal}
                onChange={(e) =>
                  setKortForm((p) => ({ ...p, antal: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="nm-form-gruppe">
            <label className="nm-label">Tegningsreferanse</label>
            <input
              className="nm-input"
              placeholder="t.d. T-204 Rev.B"
              value={kortForm.tegning_referanse}
              onChange={(e) =>
                setKortForm((p) => ({
                  ...p,
                  tegning_referanse: e.target.value,
                }))
              }
            />
          </div>

          {/* Steg-plan */}
          <div className="nm-form-gruppe">
            <label className="nm-label">Steg-plan</label>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "10px 12px",
                background: "var(--nm-surface-2)",
                borderRadius: "var(--nm-r-md)",
                border: "1px solid var(--nm-border)",
              }}
            >
              {STEG_PLAN_OPSJONER.map((s) => (
                <label
                  key={s}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    className="nm-input"
                    checked={kortForm.steg_plan.includes(s)}
                    onChange={() => toggleSteg(s)}
                  />
                  <span>{STEG_NAMN[s]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Live weight preview */}
          {pakke.total_vekt_planlagt_kg != null && (
            <div
              style={{
                padding: "8px 12px",
                background: "var(--nm-surface-2)",
                borderRadius: "var(--nm-r-md)",
                fontSize: 12,
              }}
            >
              <span
                style={{
                  color: "var(--nm-text-3)",
                  textTransform: "uppercase",
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  marginRight: 8,
                }}
              >
                Pakke etter endring:
              </span>
              <EstimertVektBadge
                planlagt_kg={pakke.total_vekt_planlagt_kg}
                jobbkort={jobbkort}
                redigerKortId={redigerKortId}
                nyVekt={kortForm.vekt_kg}
              />
            </div>
          )}
        </div>

        <div className="nm-dialog-footer">
          <button
            type="button"
            className="nm-btn nm-btn-sekundær"
            onClick={() => kortDialogRef.current?.close()}
            disabled={kortPending}
          >
            Avbryt
          </button>
          <button
            type="button"
            className="nm-btn nm-btn-primær"
            onClick={handleKortSubmit}
            disabled={kortPending}
          >
            {kortPending
              ? "Lagrar…"
              : redigerKortId
                ? "Lagre"
                : "Opprett jobbkort"}
          </button>
        </div>
      </dialog>
    </>
  );
}
