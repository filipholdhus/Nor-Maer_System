import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { ProsjektDetalj } from "./_components/ProsjektDetalj";

export type PakkeRad = {
  id: string;
  pakke_nr: string;
  beskriving: string;
  rekkefoelge: number;
  total_vekt_planlagt_kg: number | null;
};

export type ProsjektFull = {
  id: string;
  prosjekt_nr: string;
  beskriving: string | null;
  deadline: string | null;
  status: "tilbod" | "aktiv" | "levert" | "avlyst";
  total_vekt_kg: number | null;
  kunde: {
    id: string;
    namn: string;
    kontakt_namn: string | null;
    kontakt_epost: string | null;
  } | null;
};

export type VektValidering = {
  pakke_id?: string;
  planlagt_kg?: number | null;
  total_vekt_kg?: number | null;
  sum_jobbkort_kg: number;
  avvik_prosent?: number | null;
  innan_toleranse: boolean;
};

export type KortTeljar = {
  pakke_id: string;
  totalt: number;
  ferdig: number;
  sum_kg: number;
};

export default async function ProsjektDetaljSidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();

  // Trinn 1: prosjekt, pakkar og vektvalidering parallelt
  const [
    { data: rawProsjekt },
    { data: rawPakkar },
    { data: prosjektVektRaw },
    { data: alleVektRaw },
  ] = await Promise.all([
    supabase
      .from("prosjekt")
      .select(
        "id, prosjekt_nr, beskriving, deadline, status, total_vekt_kg, kunde:kunde_id(id, namn, kontakt_namn, kontakt_epost)"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("jobbpakke")
      .select("id, pakke_nr, beskriving, rekkefoelge, total_vekt_planlagt_kg")
      .eq("prosjekt_id", id)
      .order("rekkefoelge", { ascending: true })
      .order("opprettet", { ascending: true }),
    supabase.rpc("valider_prosjekt_vekt", { p_prosjekt_id: id }),
    // Éitt RPC-kall for alle pakkar (migrasjon 0005 — erstattar N kall)
    supabase.rpc("valider_alle_pakkar_vekt", { p_prosjekt_id: id }),
  ]);

  if (!rawProsjekt) notFound();

  const pakkar = (rawPakkar ?? []) as PakkeRad[];

  // Trinn 2: jobbkort-teljing (krev pakke-IDs frå trinn 1)
  const { data: kortData } = pakkar.length
    ? await supabase
        .from("jobbkort")
        .select("id, jobbpakke_id, noverande_steg, vekt_kg")
        .in(
          "jobbpakke_id",
          pakkar.map((p) => p.id)
        )
    : { data: [] };

  const pakkarVekt = Object.fromEntries(
    ((alleVektRaw ?? []) as VektValidering[]).map((v) => [v.pakke_id!, v])
  );

  const kortTeljar: Record<string, KortTeljar> = {};
  for (const p of pakkar) {
    const kort = (kortData ?? []).filter((k) => k.jobbpakke_id === p.id);
    kortTeljar[p.id] = {
      pakke_id: p.id,
      totalt: kort.length,
      ferdig: kort.filter((k) => k.noverande_steg === "ferdig").length,
      sum_kg: kort.reduce((s, k) => s + ((k.vekt_kg as number | null) ?? 0), 0),
    };
  }

  return (
    <ProsjektDetalj
      prosjekt={rawProsjekt as unknown as ProsjektFull}
      pakkar={pakkar}
      pakkarVekt={pakkarVekt as Record<string, VektValidering>}
      kortTeljar={kortTeljar}
      prosjektVekt={(prosjektVektRaw as VektValidering | null) ?? null}
    />
  );
}
