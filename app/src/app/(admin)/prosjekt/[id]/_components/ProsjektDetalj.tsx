"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  oppdaterProsjekt,
  opprettJobbpakke,
  oppdaterJobbpakke,
} from "../../actions";
import type {
  ProsjektFull,
  PakkeRad,
  VektValidering,
  KortTeljar,
} from "../page";

const STATUS_NAMN: Record<string, string> = {
  tilbod: "Tilbod",
  aktiv: "Aktiv",
  levert: "Levert",
  avlyst: "Avlyst",
};
const STATUS_KLASSE: Record<string, string> = {
  tilbod: "nm-badge-venter",
  aktiv: "nm-badge-paagaar",
  levert: "nm-badge-ferdig",
  avlyst: "nm-badge-nøytral",
};

function formaterDato(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("nb-NO");
}

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
      {" "}({v.sum_jobbkort_kg.toFixed(1)} / {planlagt.toFixed(1)} kg)
    </span>
  );
}

type Props = {
  prosjekt: ProsjektFull;
  pakkar: PakkeRad[];
  pakkarVekt: Record<string, VektValidering>;
  kortTeljar: Record<string, KortTeljar>;
  prosjektVekt: VektValidering | null;
};

export function ProsjektDetalj({
  prosjekt,
  pakkar,
  pakkarVekt,
  kortTeljar,
  prosjektVekt,
}: Props) {
  const router = useRouter();

  // Edit prosjekt dialog
  const redigerDialogRef = useRef<HTMLDialogElement>(null);
  const [redigerForm, setRedigerForm] = useState({
    beskriving: prosjekt.beskriving ?? "",
    deadline: prosjekt.deadline ?? "",
    total_vekt_kg: prosjekt.total_vekt_kg?.toString() ?? "",
    status: prosjekt.status,
  });
  const [redigerFeil, setRedigerFeil] = useState<string | null>(null);
  const [redigerPending, startRedigerTransition] = useTransition();

  // Ny pakke dialog
  const nyPakkeDialogRef = useRef<HTMLDialogElement>(null);
  const [pakkeForm, setPakkeForm] = useState({
    pakke_nr: "",
    beskriving: "",
    rekkefoelge: "0",
    total_vekt_planlagt_kg: "",
  });
  const [pakkeFeil, setPakkeFeil] = useState<string | null>(null);
  const [pakkePending, startPakkeTransition] = useTransition();

  // Rediger pakke dialog
  const redigerPakkeDialogRef = useRef<HTMLDialogElement>(null);
  const [aktivPakke, setAktivPakke] = useState<PakkeRad | null>(null);
  const [redigerPakkeForm, setRedigerPakkeForm] = useState({
    beskriving: "",
    rekkefoelge: "0",
    total_vekt_planlagt_kg: "",
  });
  const [redigerPakkeFeil, setRedigerPakkeFeil] = useState<string | null>(null);
  const [redigerPakkePending, startRedigerPakkeTransition] = useTransition();

  // ── Edit prosjekt ─────────────────────────────────────────────

  function opneRedigering() {
    setRedigerForm({
      beskriving: prosjekt.beskriving ?? "",
      deadline: prosjekt.deadline ?? "",
      total_vekt_kg: prosjekt.total_vekt_kg?.toString() ?? "",
      status: prosjekt.status,
    });
    setRedigerFeil(null);
    redigerDialogRef.current?.showModal();
  }

  function lagreProsjekt() {
    setRedigerFeil(null);
    startRedigerTransition(async () => {
      const res = await oppdaterProsjekt(prosjekt.id, {
        beskriving: redigerForm.beskriving || null,
        deadline: redigerForm.deadline || null,
        total_vekt_kg: redigerForm.total_vekt_kg
          ? parseFloat(redigerForm.total_vekt_kg)
          : null,
        status: redigerForm.status,
      });
      if (!res.ok) {
        setRedigerFeil(res.feil);
        return;
      }
      redigerDialogRef.current?.close();
      router.refresh();
    });
  }

  // ── Ny pakke ──────────────────────────────────────────────────

  function opneNyPakke() {
    setPakkeForm({
      pakke_nr: "",
      beskriving: "",
      rekkefoelge: String(pakkar.length),
      total_vekt_planlagt_kg: "",
    });
    setPakkeFeil(null);
    nyPakkeDialogRef.current?.showModal();
  }

  function lagreNyPakke() {
    if (!pakkeForm.pakke_nr.trim()) {
      setPakkeFeil("Pakkenummer er påkravd.");
      return;
    }
    if (!pakkeForm.beskriving.trim()) {
      setPakkeFeil("Beskriving er påkravd.");
      return;
    }
    setPakkeFeil(null);
    startPakkeTransition(async () => {
      const res = await opprettJobbpakke({
        prosjekt_id: prosjekt.id,
        pakke_nr: pakkeForm.pakke_nr.trim(),
        beskriving: pakkeForm.beskriving.trim(),
        rekkefoelge: parseInt(pakkeForm.rekkefoelge) || 0,
        total_vekt_planlagt_kg: pakkeForm.total_vekt_planlagt_kg
          ? parseFloat(pakkeForm.total_vekt_planlagt_kg)
          : undefined,
      });
      if (!res.ok) {
        setPakkeFeil(res.feil);
        return;
      }
      nyPakkeDialogRef.current?.close();
      router.push(`/prosjekt/${prosjekt.id}/pakke/${res.data.id}`);
    });
  }

  // ── Rediger pakke ─────────────────────────────────────────────

  function opneRedigerPakke(pakke: PakkeRad) {
    setAktivPakke(pakke);
    setRedigerPakkeForm({
      beskriving: pakke.beskriving,
      rekkefoelge: String(pakke.rekkefoelge),
      total_vekt_planlagt_kg:
        pakke.total_vekt_planlagt_kg?.toString() ?? "",
    });
    setRedigerPakkeFeil(null);
    redigerPakkeDialogRef.current?.showModal();
  }

  function lagreRedigerPakke() {
    if (!aktivPakke) return;
    if (!redigerPakkeForm.beskriving.trim()) {
      setRedigerPakkeFeil("Beskriving er påkravd.");
      return;
    }
    setRedigerPakkeFeil(null);
    startRedigerPakkeTransition(async () => {
      const res = await oppdaterJobbpakke(aktivPakke.id, prosjekt.id, {
        beskriving: redigerPakkeForm.beskriving.trim(),
        rekkefoelge: parseInt(redigerPakkeForm.rekkefoelge) || 0,
        total_vekt_planlagt_kg: redigerPakkeForm.total_vekt_planlagt_kg
          ? parseFloat(redigerPakkeForm.total_vekt_planlagt_kg)
          : null,
      });
      if (!res.ok) {
        setRedigerPakkeFeil(res.feil);
        return;
      }
      redigerPakkeDialogRef.current?.close();
      router.refresh();
    });
  }

  function handleBackdrop(
    e: React.MouseEvent<HTMLDialogElement>,
    ref: React.RefObject<HTMLDialogElement | null>
  ) {
    if (e.target === ref.current) ref.current?.close();
  }

  return (
    <>
      {/* ── Sidehovud ─────────────────────────────────────────── */}
      <div className="nm-page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/prosjekt" className="nm-tilbake">
            ← Prosjekt
          </Link>
          <span style={{ color: "var(--nm-text-3)" }}>/</span>
          <span className="nm-page-title font-nm-mono">
            {prosjekt.prosjekt_nr}
          </span>
        </div>
        <button
          type="button"
          className="nm-btn nm-btn-sekundær nm-btn-sm"
          onClick={opneRedigering}
        >
          Rediger
        </button>
      </div>

      <div className="nm-page-body nm-stack">
        {/* ── Prosjektinfo ─────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          <InfoBoks tittel="Kunde" verdi={prosjekt.kunde?.namn ?? "—"} />
          <InfoBoks tittel="Deadline" verdi={formaterDato(prosjekt.deadline)} />
          <InfoBoks
            tittel="Status"
            verdi={
              <span
                className={`nm-badge ${STATUS_KLASSE[prosjekt.status] ?? "nm-badge-nøytral"}`}
              >
                {STATUS_NAMN[prosjekt.status] ?? prosjekt.status}
              </span>
            }
          />
          <InfoBoks
            tittel="Prosjektvekt"
            verdi={<VektBadge v={prosjektVekt} />}
          />
          {prosjekt.beskriving && (
            <InfoBoks
              tittel="Beskriving"
              verdi={prosjekt.beskriving}
              span={2}
            />
          )}
        </div>

        {/* ── Jobbpakkar ───────────────────────────────────────── */}
        <div className="nm-card">
          <div className="nm-card-header">
            <span className="nm-card-tittel">Jobbpakkar</span>
            <button
              type="button"
              className="nm-btn nm-btn-primær nm-btn-sm"
              onClick={opneNyPakke}
            >
              + Ny pakke
            </button>
          </div>

          {pakkar.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                color: "var(--nm-text-3)",
                fontSize: 13,
              }}
            >
              Ingen jobbpakkar enno
            </div>
          ) : (
            <table className="nm-table">
              <thead>
                <tr>
                  <th>Pakkenr</th>
                  <th>Beskriving</th>
                  <th style={{ textAlign: "right" }}>Rekkefølgje</th>
                  <th>Vektvalidering</th>
                  <th>Jobbkort</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pakkar.map((p) => {
                  const teller = kortTeljar[p.id];
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link
                          href={`/prosjekt/${prosjekt.id}/pakke/${p.id}`}
                          style={{
                            color: "var(--nm-accent)",
                            textDecoration: "none",
                            fontFamily: "var(--font-dm-mono), monospace",
                            fontSize: 12,
                          }}
                        >
                          {p.pakke_nr}
                        </Link>
                      </td>
                      <td style={{ color: "var(--nm-text-2)" }}>
                        {p.beskriving}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          color: "var(--nm-text-3)",
                          fontSize: 12,
                        }}
                      >
                        {p.rekkefoelge}
                      </td>
                      <td>
                        <VektBadge v={pakkarVekt[p.id]} />
                      </td>
                      <td style={{ color: "var(--nm-text-2)", fontSize: 12 }}>
                        {teller
                          ? `${teller.ferdig}/${teller.totalt}`
                          : "0/0"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="nm-btn nm-btn-ghost nm-btn-sm"
                          onClick={() => opneRedigerPakke(p)}
                        >
                          Rediger
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Dialog: rediger prosjekt ─────────────────────────── */}
      <dialog
        ref={redigerDialogRef}
        className="nm-dialog"
        onClick={(e) => handleBackdrop(e, redigerDialogRef)}
      >
        <div className="nm-dialog-header">
          <span className="nm-dialog-tittel">Rediger prosjekt</span>
          <button
            type="button"
            className="nm-btn nm-btn-ghost nm-btn-sm"
            onClick={() => redigerDialogRef.current?.close()}
          >
            ✕
          </button>
        </div>
        <div className="nm-dialog-body">
          {redigerFeil && (
            <div className="nm-dialog-feil">{redigerFeil}</div>
          )}
          <div className="nm-form-gruppe">
            <label className="nm-label">Beskriving</label>
            <textarea
              className="nm-textarea"
              value={redigerForm.beskriving}
              onChange={(e) =>
                setRedigerForm((p) => ({ ...p, beskriving: e.target.value }))
              }
            />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <div className="nm-form-gruppe">
              <label className="nm-label">Deadline</label>
              <input
                className="nm-input"
                type="date"
                value={redigerForm.deadline}
                onChange={(e) =>
                  setRedigerForm((p) => ({ ...p, deadline: e.target.value }))
                }
              />
            </div>
            <div className="nm-form-gruppe">
              <label className="nm-label">Total vekt (kg)</label>
              <input
                className="nm-input"
                type="number"
                min="0"
                step="0.01"
                value={redigerForm.total_vekt_kg}
                onChange={(e) =>
                  setRedigerForm((p) => ({
                    ...p,
                    total_vekt_kg: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="nm-form-gruppe">
            <label className="nm-label">Status</label>
            <select
              className="nm-select"
              value={redigerForm.status}
              onChange={(e) =>
                setRedigerForm((p) => ({
                  ...p,
                  status: e.target.value as ProsjektFull["status"],
                }))
              }
            >
              <option value="tilbod">Tilbod</option>
              <option value="aktiv">Aktiv</option>
              <option value="levert">Levert</option>
              <option value="avlyst">Avlyst</option>
            </select>
          </div>
        </div>
        <div className="nm-dialog-footer">
          <button
            type="button"
            className="nm-btn nm-btn-sekundær"
            onClick={() => redigerDialogRef.current?.close()}
            disabled={redigerPending}
          >
            Avbryt
          </button>
          <button
            type="button"
            className="nm-btn nm-btn-primær"
            onClick={lagreProsjekt}
            disabled={redigerPending}
          >
            {redigerPending ? "Lagrar…" : "Lagre"}
          </button>
        </div>
      </dialog>

      {/* ── Dialog: ny pakke ─────────────────────────────────── */}
      <dialog
        ref={nyPakkeDialogRef}
        className="nm-dialog"
        onClick={(e) => handleBackdrop(e, nyPakkeDialogRef)}
      >
        <div className="nm-dialog-header">
          <span className="nm-dialog-tittel">Ny jobbpakke</span>
          <button
            type="button"
            className="nm-btn nm-btn-ghost nm-btn-sm"
            onClick={() => nyPakkeDialogRef.current?.close()}
          >
            ✕
          </button>
        </div>
        <div className="nm-dialog-body">
          {pakkeFeil && <div className="nm-dialog-feil">{pakkeFeil}</div>}
          <div className="nm-form-gruppe">
            <label className="nm-label">Pakkenummer *</label>
            <input
              className="nm-input font-nm-mono"
              placeholder={`${prosjekt.prosjekt_nr}-A`}
              value={pakkeForm.pakke_nr}
              onChange={(e) =>
                setPakkeForm((p) => ({ ...p, pakke_nr: e.target.value }))
              }
            />
          </div>
          <div className="nm-form-gruppe">
            <label className="nm-label">Beskriving *</label>
            <textarea
              className="nm-textarea"
              placeholder="Kva type delar inneheld pakka?"
              value={pakkeForm.beskriving}
              onChange={(e) =>
                setPakkeForm((p) => ({ ...p, beskriving: e.target.value }))
              }
            />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <div className="nm-form-gruppe">
              <label className="nm-label">Rekkefølgje (FIFO)</label>
              <input
                className="nm-input"
                type="number"
                min="0"
                value={pakkeForm.rekkefoelge}
                onChange={(e) =>
                  setPakkeForm((p) => ({
                    ...p,
                    rekkefoelge: e.target.value,
                  }))
                }
              />
            </div>
            <div className="nm-form-gruppe">
              <label className="nm-label">Planvekt (kg)</label>
              <input
                className="nm-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={pakkeForm.total_vekt_planlagt_kg}
                onChange={(e) =>
                  setPakkeForm((p) => ({
                    ...p,
                    total_vekt_planlagt_kg: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        </div>
        <div className="nm-dialog-footer">
          <button
            type="button"
            className="nm-btn nm-btn-sekundær"
            onClick={() => nyPakkeDialogRef.current?.close()}
            disabled={pakkePending}
          >
            Avbryt
          </button>
          <button
            type="button"
            className="nm-btn nm-btn-primær"
            onClick={lagreNyPakke}
            disabled={pakkePending}
          >
            {pakkePending ? "Lagrar…" : "Opprett pakke"}
          </button>
        </div>
      </dialog>

      {/* ── Dialog: rediger pakke ────────────────────────────── */}
      <dialog
        ref={redigerPakkeDialogRef}
        className="nm-dialog"
        onClick={(e) => handleBackdrop(e, redigerPakkeDialogRef)}
      >
        <div className="nm-dialog-header">
          <span className="nm-dialog-tittel">
            Rediger pakke{aktivPakke ? ` ${aktivPakke.pakke_nr}` : ""}
          </span>
          <button
            type="button"
            className="nm-btn nm-btn-ghost nm-btn-sm"
            onClick={() => redigerPakkeDialogRef.current?.close()}
          >
            ✕
          </button>
        </div>
        <div className="nm-dialog-body">
          {redigerPakkeFeil && (
            <div className="nm-dialog-feil">{redigerPakkeFeil}</div>
          )}
          <div className="nm-form-gruppe">
            <label className="nm-label">Beskriving *</label>
            <textarea
              className="nm-textarea"
              value={redigerPakkeForm.beskriving}
              onChange={(e) =>
                setRedigerPakkeForm((p) => ({
                  ...p,
                  beskriving: e.target.value,
                }))
              }
            />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <div className="nm-form-gruppe">
              <label className="nm-label">Rekkefølgje (FIFO)</label>
              <input
                className="nm-input"
                type="number"
                min="0"
                value={redigerPakkeForm.rekkefoelge}
                onChange={(e) =>
                  setRedigerPakkeForm((p) => ({
                    ...p,
                    rekkefoelge: e.target.value,
                  }))
                }
              />
            </div>
            <div className="nm-form-gruppe">
              <label className="nm-label">Planvekt (kg)</label>
              <input
                className="nm-input"
                type="number"
                min="0"
                step="0.01"
                value={redigerPakkeForm.total_vekt_planlagt_kg}
                onChange={(e) =>
                  setRedigerPakkeForm((p) => ({
                    ...p,
                    total_vekt_planlagt_kg: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        </div>
        <div className="nm-dialog-footer">
          <button
            type="button"
            className="nm-btn nm-btn-sekundær"
            onClick={() => redigerPakkeDialogRef.current?.close()}
            disabled={redigerPakkePending}
          >
            Avbryt
          </button>
          <button
            type="button"
            className="nm-btn nm-btn-primær"
            onClick={lagreRedigerPakke}
            disabled={redigerPakkePending}
          >
            {redigerPakkePending ? "Lagrar…" : "Lagre"}
          </button>
        </div>
      </dialog>
    </>
  );
}

function InfoBoks({
  tittel,
  verdi,
  span,
}: {
  tittel: string;
  verdi: React.ReactNode;
  span?: number;
}) {
  return (
    <div
      style={{
        background: "var(--nm-surface-1)",
        border: "1px solid var(--nm-border)",
        borderRadius: "var(--nm-r-md)",
        padding: "10px 14px",
        gridColumn: span ? `span ${span}` : undefined,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: "var(--nm-text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {tittel}
      </div>
      <div style={{ fontSize: 13, color: "var(--nm-text-1)" }}>{verdi}</div>
    </div>
  );
}
