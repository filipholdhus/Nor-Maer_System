import type { Metadata } from "next";
import "./globals.css";

// MERK: ingen next/font/google her. Skanne-appa (/scan) skal BERRE bruke
// system-fontar (designprinsipp 7). Admin får DM Sans/DM Mono i Sprint 3,
// scopa til (admin)-layouten — aldri globalt.
export const metadata: Metadata = {
  title: "Nor-Mær produksjonssystem",
  description: "Produksjonsstyring for Nor-Mær AS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nn">
      <body className="antialiased">{children}</body>
    </html>
  );
}
