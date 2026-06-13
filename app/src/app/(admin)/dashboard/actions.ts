"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { ADMIN_ROLLAR } from "@/lib/domene/typar";
import type { Rolle } from "@/lib/domene/typar";

type AR<T = void> = T extends void
  ? { ok: true } | { ok: false; feil: string }
  : { ok: true; data: T } | { ok: false; feil: string };

function dbFeil(error: { code?: string; message: string }): { ok: false; feil: string } {
  if (error.code === "P0001") return { ok: false, feil: error.message };
  if (error.code === "23505") return { ok: false, feil: "Nummeret er allereie i bruk." };
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

export async function godkjennJobbkort(kortId: string): Promise<AR> {
  const { supabase, brukarId, rolle } = await hentBrukarMedRolle();
  if (!brukarId) return { ok: false, feil: "Ikkje innlogga." };
  if (!rolle || !ADMIN_ROLLAR.includes(rolle))
    return { ok: false, feil: "Berre admin, leiar eller kvalitet kan godkjenne." };

  const { error } = await supabase.from("steg_logg").insert({
    jobbkort_id: kortId,
    steg: "admin_inspeksjon",
    hending: "godkjent",
    brukar_id: brukarId,
  });

  if (error) return dbFeil(error);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function sendTilbake(
  kortId: string,
  fraaSteg: string,
  tilSteg: string,
  kommentar?: string
): Promise<AR> {
  const { supabase, brukarId, rolle } = await hentBrukarMedRolle();
  if (!brukarId) return { ok: false, feil: "Ikkje innlogga." };
  if (!rolle || !ADMIN_ROLLAR.includes(rolle))
    return { ok: false, feil: "Berre admin, leiar eller kvalitet kan sende tilbake." };

  const { error } = await supabase.from("steg_logg").insert({
    jobbkort_id: kortId,
    steg: fraaSteg,
    hending: "sendt_tilbake",
    sendt_tilbake_til_steg: tilSteg,
    brukar_id: brukarId,
    kommentar: kommentar || null,
  });

  if (error) return dbFeil(error);
  revalidatePath("/dashboard");
  return { ok: true };
}
