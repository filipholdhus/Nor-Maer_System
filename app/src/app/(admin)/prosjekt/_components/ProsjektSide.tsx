"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { opprettKunde, opprettProsjekt } from "../actions";
import type { ProsjektRad, Framdrift } from "../page";

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

type Props = {
  prosjektar: ProsjektRad[];
  framdrift: Framdrift[];
  kundar: { id: string; namn: string }[];
};

type OpprettForm = {
  prosjekt_nr: string;
  kunde_id: string;
  beskriving: string;
  deadline: string;
  total_vekt_kg: string;
  ny_kunde_namn: string;
  ny_kunde_kontakt: string;
  ny_kunde_epost: string;
};

const tomForm = (): OpprettForm => ({
  prosjekt_nr: "",
  kunde_id: "",
  beskriving: "",
  deadline: "",
  total_vekt_kg: "",
  ny_kunde_namn: "",
  ny_kunde_kontakt: "",
  ny_kunde_epost: "",
});

export function ProsjektSide({ prosjektar, framdrift, kundar }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<OpprettForm>(tomForm());
  const [visNyKunde, setVisNyKunde] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const framdriftMap = Object.fromEntries(
    framdrift.map((f) => [f.prosjekt_id, f])
  );

  function opne() {
    setForm(tomForm());
    setFeil(null);
    setVisNyKunde(false);
    dialogRef.current?.showModal();
  }

  function lukk() {
    dialogRef.current?.close();
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) lukk();
  }

  function setFelt(key: keyof OpprettForm, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  function handleSubmit() {
    if (!form.prosjekt_nr.trim()) {
      setFeil("Prosjektnummer er påkravd.");
      return;
    }
    setFeil(null);
    startTransition(async () => {
      let kundeId = form.kunde_id;

      if (visNyKunde) {
        if (!form.ny_kunde_namn.trim()) {
          setFeil("Kundenamn er påkravd.");
          return;
        }
        const res = await opprettKunde({
          namn: form.ny_kunde_namn,
          kontakt_namn: form.ny_kunde_kontakt || undefined,
          kontakt_epost: form.ny_kunde_epost || undefined,
        });
        if (!res.ok) {
          setFeil(res.feil);
          return;
        }
        kundeId = res.data.id;
      }

      if (!kundeId) {
        setFeil("Vel ein kunde.");
        return;
      }

      const res = await opprettProsjekt({
        prosjekt_nr: form.prosjekt_nr.trim(),
        kunde_id: kundeId,
        beskriving: form.beskriving || undefined,
        deadline: form.deadline || undefined,
        total_vekt_kg: form.total_vekt_kg
          ? parseFloat(form.total_vekt_kg)
          : undefined,
      });

      if (!res.ok) {
        setFeil(res.feil);
        return;
      }

      lukk();
      router.push(`/prosjekt/${res.data.id}`);
    });
  }

  return (
    <>
      <div className="nm-page-header">
        <h1 className="nm-page-title">Prosjekt</h1>
        <button type="button" className="nm-btn nm-btn-primær" onClick={opne}>
          + Nytt prosjekt
        </button>
      </div>

      <div className="nm-page-body">
        {prosjektar.length === 0 ? (
          <div className="nm-kjem-snart">
            <p className="nm-kjem-snart-tittel">Ingen prosjekt enno</p>
            <p className="nm-kjem-snart-body">
              Klikk «Nytt prosjekt» for å leggje inn det første.
            </p>
          </div>
        ) : (
          <div className="nm-card">
            <table className="nm-table nm-table-klikkbar">
              <thead>
                <tr>
                  <th>Nr</th>
                  <th>Kunde</th>
                  <th>Deadline</th>
                  <th>Framdrift</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {prosjektar.map((p) => {
                  const fr = framdriftMap[p.id];
                  const totalt = fr?.jobbkort_totalt ?? 0;
                  const ferdig = fr?.ferdig ?? 0;
                  const pct = totalt > 0 ? Math.round((ferdig / totalt) * 100) : 0;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/prosjekt/${p.id}`)}
                    >
                      <td>
                        <span className="font-nm-mono" style={{ fontSize: 12 }}>
                          {p.prosjekt_nr}
                        </span>
                      </td>
                      <td style={{ color: "var(--nm-text-2)" }}>
                        {p.kunde?.namn ?? "—"}
                      </td>
                      <td style={{ color: "var(--nm-text-2)", fontSize: 12 }}>
                        {formaterDato(p.deadline)}
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <div className="nm-progress" style={{ width: 72 }}>
                            <div
                              className="nm-progress-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--nm-text-2)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ferdig}/{totalt}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`nm-badge ${STATUS_KLASSE[p.status] ?? "nm-badge-nøytral"}`}
                        >
                          {STATUS_NAMN[p.status] ?? p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <dialog
        ref={dialogRef}
        className="nm-dialog"
        onClick={handleBackdrop}
      >
        <div className="nm-dialog-header">
          <span className="nm-dialog-tittel">Nytt prosjekt</span>
          <button
            type="button"
            className="nm-btn nm-btn-ghost nm-btn-sm"
            onClick={lukk}
            aria-label="Lukk"
          >
            ✕
          </button>
        </div>

        <div className="nm-dialog-body">
          {feil && <div className="nm-dialog-feil">{feil}</div>}

          <div className="nm-form-gruppe">
            <label className="nm-label">Prosjektnummer *</label>
            <input
              className="nm-input"
              placeholder="t.d. NM-2026-047"
              value={form.prosjekt_nr}
              onChange={(e) => setFelt("prosjekt_nr", e.target.value)}
            />
          </div>

          {!visNyKunde ? (
            <div className="nm-form-gruppe">
              <label className="nm-label">Kunde *</label>
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  className="nm-select"
                  value={form.kunde_id}
                  onChange={(e) => setFelt("kunde_id", e.target.value)}
                >
                  <option value="">— vel kunde —</option>
                  {kundar.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.namn}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="nm-btn nm-btn-sekundær nm-btn-sm"
                  style={{ whiteSpace: "nowrap" }}
                  onClick={() => {
                    setVisNyKunde(true);
                    setFelt("kunde_id", "");
                  }}
                >
                  + Ny kunde
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "12px",
                background: "var(--nm-surface-2)",
                borderRadius: "var(--nm-r-md)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span className="nm-label">Ny kunde</span>
                <button
                  type="button"
                  className="nm-btn nm-btn-ghost nm-btn-sm"
                  onClick={() => setVisNyKunde(false)}
                >
                  ← Tilbake
                </button>
              </div>
              <div className="nm-form-gruppe">
                <label className="nm-label">Kundenamn *</label>
                <input
                  className="nm-input"
                  placeholder="t.d. Salmar AS"
                  value={form.ny_kunde_namn}
                  onChange={(e) => setFelt("ny_kunde_namn", e.target.value)}
                />
              </div>
              <div className="nm-form-gruppe">
                <label className="nm-label">Kontaktperson</label>
                <input
                  className="nm-input"
                  placeholder="Namn"
                  value={form.ny_kunde_kontakt}
                  onChange={(e) => setFelt("ny_kunde_kontakt", e.target.value)}
                />
              </div>
              <div className="nm-form-gruppe">
                <label className="nm-label">E-post</label>
                <input
                  className="nm-input"
                  type="email"
                  placeholder="e-post@firma.no"
                  value={form.ny_kunde_epost}
                  onChange={(e) => setFelt("ny_kunde_epost", e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="nm-form-gruppe">
            <label className="nm-label">Beskriving</label>
            <textarea
              className="nm-textarea"
              placeholder="Kort skildring av prosjektet"
              value={form.beskriving}
              onChange={(e) => setFelt("beskriving", e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="nm-form-gruppe">
              <label className="nm-label">Deadline</label>
              <input
                className="nm-input"
                type="date"
                value={form.deadline}
                onChange={(e) => setFelt("deadline", e.target.value)}
              />
            </div>
            <div className="nm-form-gruppe">
              <label className="nm-label">Total vekt (kg)</label>
              <input
                className="nm-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.total_vekt_kg}
                onChange={(e) => setFelt("total_vekt_kg", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="nm-dialog-footer">
          <button
            type="button"
            className="nm-btn nm-btn-sekundær"
            onClick={lukk}
            disabled={pending}
          >
            Avbryt
          </button>
          <button
            type="button"
            className="nm-btn nm-btn-primær"
            onClick={handleSubmit}
            disabled={pending}
          >
            {pending ? "Lagrar…" : "Opprett prosjekt"}
          </button>
        </div>
      </dialog>
    </>
  );
}
