import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { PakkeDetalj } from "./_components/PakkeDetalj";
import type { VektValidering } from "../../page";

export type PakkeFull = {
  id: string;
  pakke_nr: string;
  beskriving: string;
  rekkefoelge: number;
  total_vekt_planlagt_kg: number | null;
  prosjekt: {
    id: string;
    prosjekt_nr: string;
  } | null;
};

export type JobbkortRad = {
  id: string;
  jobbkort_nr: string;
  jobbpakke_id: string;
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
  fifo_nr: number;
  opprettet: string;
};

export default async function PakkeDetaljSidePage({
  params,
}: {
  params: Promise<{ id: string; pakkeId: string }>;
}) {
  const { id, pakkeId } = await params;
  const supabase = await supabaseServer();

  const [{ data: rawPakke }, { data: rawJobbkort }, { data: vektRaw }] =
    await Promise.all([
      supabase
        .from("jobbpakke")
        .select(
          "id, pakke_nr, beskriving, rekkefoelge, total_vekt_planlagt_kg, prosjekt:prosjekt_id(id, prosjekt_nr)"
        )
        .eq("id", pakkeId)
        .single(),
      supabase
        .from("jobbkort")
        .select(
          "id, jobbkort_nr, jobbpakke_id, beskriving, materiale, dimensjon, vekt_kg, antal, tegning_referanse, tegning_pdf_url, steg_plan, noverande_steg, noverande_status, fifo_nr, opprettet"
        )
        .eq("jobbpakke_id", pakkeId)
        .order("fifo_nr", { ascending: true }),
      supabase.rpc("valider_jobbpakke_vekt", { p_jobbpakke_id: pakkeId }),
    ]);

  if (!rawPakke) notFound();

  return (
    <PakkeDetalj
      pakke={rawPakke as unknown as PakkeFull}
      jobbkort={(rawJobbkort ?? []) as JobbkortRad[]}
      vektValidering={(vektRaw as VektValidering | null) ?? null}
      prosjektId={id}
    />
  );
}
