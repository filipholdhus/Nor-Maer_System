// Skanne-app: PWA, mobil-først, BERRE system-fontar (verkstad-wifi er upåliteleg).
// Stasjonsval i localStorage, offline-kø i IndexedDB — alt anna bur i Supabase.
export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-neutral-950 text-neutral-100"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      {children}
    </div>
  );
}
