import { redirect } from "next/navigation";
import { DM_Sans, DM_Mono } from "next/font/google";
import { supabaseServer } from "@/lib/supabase/server";
import { AdminSkal } from "@/components/admin/AdminSkal";
import { ADMIN_ROLLAR } from "@/lib/domene/typar";
import type { Rolle } from "@/lib/domene/typar";
import "./admin.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: brukar, error: brukarFeil } = await supabase
    .from("brukar")
    .select("id, namn, rolle")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (brukarFeil) {
    redirect("/login?feil=system");
  }

  if (!brukar || !ADMIN_ROLLAR.includes(brukar.rolle as Rolle)) {
    redirect("/login?feil=tilgang");
  }

  return (
    <div className={`admin-root ${dmSans.variable} ${dmMono.variable}`}>
      <AdminSkal
        brukarNamn={brukar.namn as string}
        brukarRolle={brukar.rolle as Rolle}
      >
        {children}
      </AdminSkal>
    </div>
  );
}
