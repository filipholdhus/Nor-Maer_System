import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { supabaseServer } from "@/lib/supabase/server";
import { SkrivUtKnapp } from "./_components/SkrivUtKnapp";

export default async function SkriverkSidePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; pakkeId: string }>;
  searchParams: Promise<{ kort?: string }>;
}) {
  const { id: prosjektId, pakkeId } = await params;
  const { kort: kortParam } = await searchParams;

  const kortIds = (kortParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (kortIds.length === 0) notFound();

  const supabase = await supabaseServer();

  const [{ data: rawKort }, { data: rawPakke }] = await Promise.all([
    supabase
      .from("jobbkort")
      .select(
        "id, jobbpakke_id, jobbkort_nr, beskriving, materiale, dimensjon, vekt_kg, antal, tegning_referanse, steg_plan"
      )
      .in("id", kortIds)
      .order("fifo_nr", { ascending: true }),
    supabase
      .from("jobbpakke")
      .select("id, pakke_nr, prosjekt:prosjekt_id(id, prosjekt_nr)")
      .eq("id", pakkeId)
      .single(),
  ]);

  if (!rawPakke || !rawKort || rawKort.length === 0) notFound();

  // Sikre at alle kortIDs faktisk høyrer til denne pakka og prosjektet
  type RawKort = { id: string; jobbpakke_id: string };
  const ugyldig = (rawKort as unknown as RawKort[]).some(
    (k) => k.jobbpakke_id !== pakkeId
  );
  if (ugyldig) notFound();

  type Pakke = {
    pakke_nr: string;
    prosjekt: { id: string; prosjekt_nr: string } | null;
  };
  const pakke = rawPakke as unknown as Pakke;
  const prosjektNr = pakke.prosjekt?.prosjekt_nr ?? prosjektId;

  // Generate QR SVGs server-side — one per jobbkort
  const kort = await Promise.all(
    rawKort.map(async (k) => {
      const svg = await QRCode.toString(k.jobbkort_nr, {
        type: "svg",
        errorCorrectionLevel: "H",
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
      return { ...k, svg };
    })
  );

  return (
    <>
      {/* ── Inline print CSS ────────────────────────────────────── */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .nm-qr-svg svg { width: 100%; height: 100%; display: block; }
      `,
        }}
      />

      {/* ── Skjermvisning: knappar (skjult ved utskrift) ─────────── */}
      <div
        className="no-print nm-page-header"
        style={{ gap: 12 }}
      >
        <Link
          href={`/prosjekt/${prosjektId}/pakke/${pakkeId}`}
          className="nm-tilbake"
        >
          ← Tilbake til pakke
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--nm-text-2)" }}>
            {kort.length} ark
          </span>
          <SkrivUtKnapp />
        </div>
      </div>

      {/* ── QR-kort ─────────────────────────────────────────────── */}
      <div
        style={{
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: 32,
          background: "var(--nm-bg)",
        }}
      >
        {kort.map((k, i) => (
          <QrKort
            key={k.id}
            jobbkort_nr={k.jobbkort_nr}
            beskriving={k.beskriving}
            materiale={k.materiale}
            dimensjon={k.dimensjon}
            vekt_kg={k.vekt_kg}
            antal={k.antal}
            tegning_referanse={k.tegning_referanse}
            steg_plan={k.steg_plan}
            prosjekt_nr={prosjektNr}
            pakke_nr={pakke.pakke_nr}
            svg={k.svg}
            sist={i === kort.length - 1}
          />
        ))}
      </div>
    </>
  );
}

type QrKortProps = {
  jobbkort_nr: string;
  beskriving: string;
  materiale: string | null;
  dimensjon: string | null;
  vekt_kg: number | null;
  antal: number;
  tegning_referanse: string | null;
  steg_plan: string[];
  prosjekt_nr: string;
  pakke_nr: string;
  svg: string;
  sist: boolean;
};

const STEG_ETIKETT: Record<string, string> = {
  kapp: "Kapp",
  sveis: "Sveis",
  kontroll: "Kontroll",
  admin_inspeksjon: "Adm.insp.",
  galv: "Galv",
};

function QrKort({
  jobbkort_nr,
  beskriving,
  materiale,
  dimensjon,
  vekt_kg,
  antal,
  tegning_referanse,
  steg_plan,
  prosjekt_nr,
  pakke_nr,
  svg,
  sist,
}: QrKortProps) {
  return (
    <div
      className={`nm-qr-print-side${sist ? " nm-qr-print-sist" : ""}`}
      style={{
        background: "#ffffff",
        color: "#000000",
        width: 460,
        padding: "20px 24px 24px",
        border: "1px solid #d0d0d0",
        borderRadius: 6,
        pageBreakAfter: sist ? "auto" : "always",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* QR-kode */}
      <div
        className="nm-qr-svg"
        style={{
          width: 280,
          height: 280,
          margin: "0 auto 16px",
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      {/* Jobbkort-nr */}
      <div
        style={{
          fontFamily: "'DM Mono', 'Courier New', monospace",
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "0.02em",
          textAlign: "center",
          marginBottom: 14,
          lineHeight: 1.2,
        }}
      >
        {jobbkort_nr}
      </div>

      <hr style={{ border: "none", borderTop: "2px solid #000", margin: "0 0 14px" }} />

      {/* Beskriving */}
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          marginBottom: 14,
          lineHeight: 1.3,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}
      >
        {beskriving}
      </div>

      {/* Detaljar */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <tbody>
          {materiale && (
            <Rad label="Materiale" verdi={materiale} />
          )}
          {dimensjon && (
            <Rad label="Dimensjon" verdi={dimensjon} />
          )}
          <Rad
            label="Vekt"
            verdi={vekt_kg != null ? `${vekt_kg.toFixed(1)} kg` : "—"}
          />
          <Rad label="Antal" verdi={String(antal)} />
          {tegning_referanse && (
            <Rad label="Teikning" verdi={tegning_referanse} />
          )}
          <Rad
            label="Steg-plan"
            verdi={steg_plan
              .map((s) => STEG_ETIKETT[s] ?? s)
              .join(" → ")}
          />
        </tbody>
      </table>

      <hr style={{ border: "none", borderTop: "1px solid #888", margin: "14px 0 10px" }} />

      {/* Prosjekt / pakke */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#444" }}>
        <span>
          <strong>Prosjekt:</strong>{" "}
          <span style={{ fontFamily: "'DM Mono', 'Courier New', monospace" }}>
            {prosjekt_nr}
          </span>
        </span>
        <span>
          <strong>Pakke:</strong>{" "}
          <span style={{ fontFamily: "'DM Mono', 'Courier New', monospace" }}>
            {pakke_nr}
          </span>
        </span>
      </div>
    </div>
  );
}

function Rad({ label, verdi }: { label: string; verdi: string }) {
  return (
    <tr>
      <td
        style={{
          padding: "3px 12px 3px 0",
          fontWeight: 600,
          color: "#444",
          textTransform: "uppercase",
          fontSize: 10,
          letterSpacing: "0.05em",
          whiteSpace: "nowrap",
          verticalAlign: "top",
        }}
      >
        {label}
      </td>
      <td style={{ padding: "3px 0", verticalAlign: "top" }}>{verdi}</td>
    </tr>
  );
}
