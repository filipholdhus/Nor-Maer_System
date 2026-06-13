import { supabaseServer } from "@/lib/supabase/server";
import { DashboardKlient } from "./_components/DashboardKlient";

export type ProsjektInfo = {
  id: string;
  prosjekt_nr: string;
  beskriving: string | null;
  status: string;
};

export type ProsjektFramdrift = {
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

export type KanbanKort = {
  id: string;
  jobbkort_nr: string;
  beskriving: string;
  noverande_steg: string;
  noverande_status: string;
  rework_runde: number;
  fifo_nr: number;
  aktiv_brukar_id: string | null;
  steg_plan: string[];
  jobbpakke: { rekkefoelge: number; pakke_nr: string; prosjekt_id: string } | null;
};

export type FeedHending = {
  id: string;
  tidsstempel: string;
  hending: string;
  steg: string;
  kommentar: string | null;
  jobbkort: { jobbkort_nr: string } | null;
  brukar: { namn: string } | null;
};

export default async function DashboardSide() {
  const supabase = await supabaseServer();

  const [
    { data: rawProsjektar },
    { data: rawFramdrift },
    { data: rawKanban },
    { data: rawOpenAvvik },
    { data: rawFeed },
    { data: rawInnTider },
  ] = await Promise.all([
    supabase
      .from("prosjekt")
      .select("id, prosjekt_nr, beskriving, status")
      .eq("status", "aktiv")
      .order("prosjekt_nr"),

    supabase.from("prosjekt_framdrift").select("*"),

    supabase
      .from("jobbkort")
      .select(
        "id, jobbkort_nr, beskriving, noverande_steg, noverande_status, rework_runde, fifo_nr, aktiv_brukar_id, steg_plan, jobbpakke:jobbpakke_id(rekkefoelge, pakke_nr, prosjekt_id)"
      )
      .in("noverande_steg", ["kapp", "sveis", "kontroll", "admin_inspeksjon", "galv"])
      .order("fifo_nr"),

    supabase.from("avvik").select("jobbkort_id").eq("status", "open"),

    supabase
      .from("steg_logg")
      .select(
        "id, tidsstempel, hending, steg, kommentar, jobbkort:jobbkort_id(jobbkort_nr), brukar:brukar_id(namn)"
      )
      .neq("hending", "skann_avvist")
      .order("tidsstempel", { ascending: false })
      .limit(20),

    supabase
      .from("steg_logg")
      .select("jobbkort_id, steg, tidsstempel")
      .eq("hending", "skann_inn")
      .order("tidsstempel", { ascending: false })
      .limit(500),
  ]);

  // Inn_tid per jobbkort — berre der steg samsvarar med noverande_steg.
  // Hindrar feil ved rework der siste skann_inn kan vere for eit tidlegare steg.
  const kortSteg: Record<string, string> = {};
  for (const k of rawKanban ?? []) {
    const k2 = k as { id: string; noverande_steg: string };
    kortSteg[k2.id] = k2.noverande_steg;
  }

  const innTidPer: Record<string, string> = {};
  for (const r of rawInnTider ?? []) {
    const id = r.jobbkort_id as string;
    const steg = r.steg as string;
    if (id && r.tidsstempel && !innTidPer[id] && kortSteg[id] === steg) {
      innTidPer[id] = r.tidsstempel as string;
    }
  }

  const openAvvik = (rawOpenAvvik ?? []).map((a) => a.jobbkort_id as string);

  return (
    <DashboardKlient
      prosjektar={(rawProsjektar ?? []) as ProsjektInfo[]}
      framdrift={(rawFramdrift ?? []) as unknown as ProsjektFramdrift[]}
      kanban={(rawKanban ?? []) as unknown as KanbanKort[]}
      openAvvik={openAvvik}
      feed={(rawFeed ?? []) as unknown as FeedHending[]}
      innTidPer={innTidPer}
    />
  );
}
