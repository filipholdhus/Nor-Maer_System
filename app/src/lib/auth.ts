"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import { ADMIN_ROLLAR } from "./domene/typar";

export async function loggInn(formData: FormData) {
  const epostVerdi = formData.get("epost");
  const passordVerdi = formData.get("passord");

  if (
    typeof epostVerdi !== "string" ||
    typeof passordVerdi !== "string" ||
    !epostVerdi.trim() ||
    !passordVerdi
  ) {
    redirect("/login?feil=innlogging");
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: epostVerdi.trim(),
    password: passordVerdi,
  });

  if (error) {
    redirect("/login?feil=innlogging");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?feil=innlogging");
  }

  const { data: brukar, error: brukarFeil } = await supabase
    .from("brukar")
    .select("rolle")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (brukarFeil) {
    await supabase.auth.signOut();
    redirect("/login?feil=system");
  }

  if (!brukar || !ADMIN_ROLLAR.includes(brukar.rolle)) {
    await supabase.auth.signOut();
    redirect("/login?feil=tilgang");
  }

  redirect("/dashboard");
}

export async function loggUt() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
