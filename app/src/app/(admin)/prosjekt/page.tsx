import { supabaseServer } from "@/lib/supabase/server";
import { ProsjektSide } from "./_components/ProsjektSide";

export default async function ProsjektSidePage() {
  const supabase = await supabaseServer();

  const [{ data: rawProsjektar }, { data: framdrift }, { data: kundar }] =
    await Promise.all([
      supabase
        .from("prosjekt")
        .select(
          "id, prosjekt_nr, beskriving, deadline, status, total_vekt_kg, kunde:kunde_id(id, namn)"
        )
        .order("opprettet", { ascending: false }),
      supabase.from("prosjekt_framdrift").select("*"),
      supabase.from("kunde").select("id, namn").order("namn"),
    ]);

  return (
    <ProsjektSide
      prosjektar={(rawProsjektar ?? []) as unknown as ProsjektRad[]}
      framdrift={(framdrift ?? []) as unknown as Framdrift[]}
      kundar={(kundar ?? []) as { id: string; namn: string }[]}
    />
  );
}

export type ProsjektRad = {
  id: string;
  prosjekt_nr: string;
  beskriving: string | null;
  deadline: string | null;
  status: "tilbod" | "aktiv" | "levert" | "avlyst";
  total_vekt_kg: number | null;
  kunde: { id: string; namn: string } | null;
};

export type Framdrift = {
  prosjekt_id: string;
  prosjekt_nr: string;
  jobbkort_totalt: number;
  ikkje_sleppt: number;
  i_produksjon: number;
  hos_galv: number;
  ferdig: number;
  vekt_totalt_kg: number;
  vekt_ferdig_kg: number;
};
