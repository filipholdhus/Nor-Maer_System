"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { ADMIN_ROLLAR } from "@/lib/domene/typar";
import type { Rolle } from "@/lib/domene/typar";

type OK<T = void> = T extends void ? { ok: true } : { ok: true; data: T };
type Feil = { ok: false; feil: string };
type AR<T = void> = OK<T> | Feil;

function dbFeil(error: { code?: string; message: string }): Feil {
  if (error.code === "23505") return { ok: false, feil: "Nummeret er allereie i bruk." };
  if (error.code === "P0001") return { ok: false, feil: error.message };
  return { ok: false, feil: error.message };
}

async function hentBrukarMedRolle() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, brukarId: null, rolle: null };
  const { data: brukar } = await supabase
    .from("brukar")
    .select("id, rolle")
    .eq("auth_id", user.id)
    .single();
  return {
    supabase,
    brukarId: brukar?.id ?? null,
    rolle: (brukar?.rolle ?? null) as Rolle | null,
  };
}

function sjekkAdminRolle(
  brukarId: string | null,
  rolle: Rolle | null,
  krevde: Rolle[] = ["admin", "leiar"]
): Feil | null {
  if (!brukarId) return { ok: false, feil: "Ikkje innlogga." };
  if (!rolle || !krevde.includes(rolle))
    return { ok: false, feil: "Du har ikkje tilgang til denne operasjonen." };
  return null;
}

// ── Kunde ──────────────────────────────────────────────────────

export async function opprettKunde(input: {
  namn: string;
  kontakt_namn?: string;
  kontakt_epost?: string;
}): Promise<AR<{ id: string }>> {
  const { supabase, brukarId, rolle } = await hentBrukarMedRolle();
  const feil = sjekkAdminRolle(brukarId, rolle);
  if (feil) return feil;

  const { data, error } = await supabase
    .from("kunde")
    .insert({
      namn: input.namn,
      kontakt_namn: input.kontakt_namn || null,
      kontakt_epost: input.kontakt_epost || null,
    })
    .select("id")
    .single();
  if (error) return dbFeil(error);
  revalidatePath("/prosjekt");
  return { ok: true, data: { id: data.id } };
}

// ── Prosjekt ───────────────────────────────────────────────────

export async function opprettProsjekt(input: {
  prosjekt_nr: string;
  kunde_id: string;
  beskriving?: string;
  deadline?: string;
  total_vekt_kg?: number;
}): Promise<AR<{ id: string; prosjekt_nr: string }>> {
  const { supabase, brukarId, rolle } = await hentBrukarMedRolle();
  const feil = sjekkAdminRolle(brukarId, rolle);
  if (feil) return feil;

  const { data, error } = await supabase
    .from("prosjekt")
    .insert({
      prosjekt_nr: input.prosjekt_nr,
      kunde_id: input.kunde_id,
      beskriving: input.beskriving || null,
      deadline: input.deadline || null,
      total_vekt_kg: input.total_vekt_kg ?? null,
    })
    .select("id, prosjekt_nr")
    .single();
  if (error) return dbFeil(error);
  revalidatePath("/prosjekt");
  return { ok: true, data: { id: data.id, prosjekt_nr: data.prosjekt_nr } };
}

export async function oppdaterProsjekt(
  id: string,
  input: {
    beskriving?: string | null;
    deadline?: string | null;
    total_vekt_kg?: number | null;
    status?: string;
  }
): Promise<AR> {
  const { supabase, brukarId, rolle } = await hentBrukarMedRolle();
  const feil = sjekkAdminRolle(brukarId, rolle);
  if (feil) return feil;

  const { error } = await supabase.from("prosjekt").update(input).eq("id", id);
  if (error) return dbFeil(error);
  revalidatePath("/prosjekt");
  revalidatePath(`/prosjekt/${id}`);
  return { ok: true };
}

// ── Jobbpakke ─────────────────────────────────────────────────

export async function opprettJobbpakke(input: {
  prosjekt_id: string;
  pakke_nr: string;
  beskriving: string;
  rekkefoelge?: number;
  total_vekt_planlagt_kg?: number;
}): Promise<AR<{ id: string; pakke_nr: string }>> {
  const { supabase, brukarId, rolle } = await hentBrukarMedRolle();
  const feil = sjekkAdminRolle(brukarId, rolle);
  if (feil) return feil;

  const { data, error } = await supabase
    .from("jobbpakke")
    .insert({
      prosjekt_id: input.prosjekt_id,
      pakke_nr: input.pakke_nr,
      beskriving: input.beskriving,
      rekkefoelge: input.rekkefoelge ?? 0,
      total_vekt_planlagt_kg: input.total_vekt_planlagt_kg ?? null,
    })
    .select("id, pakke_nr")
    .single();
  if (error) return dbFeil(error);
  revalidatePath("/prosjekt");
  revalidatePath(`/prosjekt/${input.prosjekt_id}`);
  return { ok: true, data: { id: data.id, pakke_nr: data.pakke_nr } };
}

export async function oppdaterJobbpakke(
  id: string,
  prosjektId: string,
  input: {
    beskriving?: string;
    rekkefoelge?: number;
    total_vekt_planlagt_kg?: number | null;
  }
): Promise<AR> {
  const { supabase, brukarId, rolle } = await hentBrukarMedRolle();
  const feil = sjekkAdminRolle(brukarId, rolle);
  if (feil) return feil;

  const { error } = await supabase.from("jobbpakke").update(input).eq("id", id);
  if (error) return dbFeil(error);
  revalidatePath("/prosjekt");
  revalidatePath(`/prosjekt/${prosjektId}`);
  revalidatePath(`/prosjekt/${prosjektId}/pakke/${id}`);
  return { ok: true };
}

// ── Jobbkort ──────────────────────────────────────────────────

export async function opprettJobbkort(input: {
  jobbpakke_id: string;
  beskriving: string;
  materiale?: string;
  dimensjon?: string;
  vekt_kg?: number;
  antal?: number;
  tegning_referanse?: string;
  steg_plan: string[];
}): Promise<AR<{ id: string; jobbkort_nr: string }>> {
  const { supabase, brukarId, rolle } = await hentBrukarMedRolle();
  const feil = sjekkAdminRolle(brukarId, rolle);
  if (feil) return feil;

  // Sjekk at pakka finst og finn prosjekt_id for revalidering
  const { data: pakke, error: pakkeErr } = await supabase
    .from("jobbpakke")
    .select("prosjekt_id")
    .eq("id", input.jobbpakke_id)
    .single();
  if (pakkeErr || !pakke) return { ok: false, feil: "Fann ikkje jobbpakka." };

  // Atomisk nummergenerering via Postgres-funksjon (0005)
  const { data, error } = await supabase.rpc("opprett_jobbkort", {
    p_jobbpakke_id: input.jobbpakke_id,
    p_beskriving: input.beskriving,
    p_materiale: input.materiale ?? null,
    p_dimensjon: input.dimensjon ?? null,
    p_vekt_kg: input.vekt_kg ?? null,
    p_antal: input.antal ?? 1,
    p_tegning_referanse: input.tegning_referanse ?? null,
    p_steg_plan: input.steg_plan,
  });

  if (error) return dbFeil(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, feil: "Jobbkortet vart ikkje oppretta." };

  revalidatePath("/prosjekt");
  revalidatePath(`/prosjekt/${pakke.prosjekt_id}`);
  revalidatePath(`/prosjekt/${pakke.prosjekt_id}/pakke/${input.jobbpakke_id}`);
  return { ok: true, data: { id: row.id, jobbkort_nr: row.jobbkort_nr } };
}

export async function oppdaterJobbkort(
  id: string,
  pakkeId: string,
  prosjektId: string,
  input: {
    beskriving?: string;
    materiale?: string | null;
    dimensjon?: string | null;
    vekt_kg?: number | null;
    antal?: number;
    tegning_referanse?: string | null;
    steg_plan?: string[];
  }
): Promise<AR> {
  const { supabase, brukarId, rolle } = await hentBrukarMedRolle();
  const feil = sjekkAdminRolle(brukarId, rolle);
  if (feil) return feil;

  const { error } = await supabase.from("jobbkort").update(input).eq("id", id);
  if (error) return dbFeil(error);
  revalidatePath("/prosjekt");
  revalidatePath(`/prosjekt/${prosjektId}`);
  revalidatePath(`/prosjekt/${prosjektId}/pakke/${pakkeId}`);
  return { ok: true };
}

// ── Slepp til produksjon ─────────────────────────────────────

export async function sleppJobbkort(jobbkortIds: string[]): Promise<AR> {
  if (jobbkortIds.length === 0) return { ok: false, feil: "Ingen kort valt." };

  const { supabase, brukarId, rolle } = await hentBrukarMedRolle();
  const feil = sjekkAdminRolle(brukarId, rolle);
  if (feil) return feil;

  const { error } = await supabase.from("steg_logg").insert(
    jobbkortIds.map((kortId) => ({
      jobbkort_id: kortId,
      steg: "planlagt",
      hending: "sleppt",
      brukar_id: brukarId!,
    }))
  );

  if (error) return dbFeil(error);
  revalidatePath("/prosjekt");
  return { ok: true };
}

// ── Tegning ───────────────────────────────────────────────────

export async function oppdaterTegningUrl(
  id: string,
  pakkeId: string,
  prosjektId: string,
  url: string
): Promise<AR> {
  const { supabase, brukarId, rolle } = await hentBrukarMedRolle();
  const feil = sjekkAdminRolle(brukarId, rolle);
  if (feil) return feil;

  const { error } = await supabase
    .from("jobbkort")
    .update({ tegning_pdf_url: url })
    .eq("id", id);
  if (error) return dbFeil(error);
  revalidatePath(`/prosjekt/${prosjektId}/pakke/${pakkeId}`);
  return { ok: true };
}

// ── Eksporter ADMIN_ROLLAR for server-action-intern bruk ──────
export type { AR };
export { ADMIN_ROLLAR };
