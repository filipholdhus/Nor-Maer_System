// Admin-skal: sidebar-navigasjon (Planlegging / Produksjon / Ressursar / Innstillingar)
// kjem i Sprint 3. Desktop-først, mørkt tema, DM Sans / DM Mono.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-neutral-950 text-neutral-100">{children}</div>;
}
