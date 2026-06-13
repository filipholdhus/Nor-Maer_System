"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { loggUt } from "@/lib/auth";
import { ROLLE_NAMN } from "@/lib/domene/typar";
import type { Rolle } from "@/lib/domene/typar";

interface Props {
  brukarNamn: string;
  brukarRolle: Rolle;
  children: React.ReactNode;
}

// ── Inline SVG icons (no icon library dependency) ─────────────────

function IkonMappe() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IkonGrid() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function IkonAdvarsel() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IkonBrukarar() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IkonEske() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function IkonTannhjul() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ── Navigation structure ──────────────────────────────────────────

function IkonMeny() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function IkonLukk() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface NavSeksjon {
  tittel: string;
  items: NavItem[];
}

const NAVIGASJON: NavSeksjon[] = [
  {
    tittel: "Planlegging",
    items: [{ href: "/prosjekt", label: "Prosjekt", icon: <IkonMappe /> }],
  },
  {
    tittel: "Produksjon",
    items: [
      { href: "/dashboard", label: "Dashbord", icon: <IkonGrid /> },
      { href: "/avvik", label: "Avvik", icon: <IkonAdvarsel /> },
    ],
  },
  {
    tittel: "Ressursar",
    items: [
      { href: "/brukarar", label: "Brukarar", icon: <IkonBrukarar /> },
      { href: "/smadeler", label: "Smådeler", icon: <IkonEske /> },
    ],
  },
  {
    tittel: "Innstillingar",
    items: [
      {
        href: "/innstillingar",
        label: "Innstillingar",
        icon: <IkonTannhjul />,
      },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────

export function AdminSkal({ brukarNamn, brukarRolle, children }: Props) {
  const pathname = usePathname();
  const [menyOpen, setMenyOpen] = useState(false);

  return (
    <div
      className="nm-admin-skal"
      style={{ background: "var(--nm-bg)" }}
    >
      <header className="nm-mobil-toppfelt">
        <button
          type="button"
          className="nm-mobil-menyknapp"
          onClick={() => setMenyOpen(true)}
          aria-label="Opne meny"
          aria-expanded={menyOpen}
        >
          <IkonMeny />
        </button>
        <div className="nm-mobil-merke">
          <div className="nm-merkeikon">NM</div>
          <span>Nor-Mær</span>
        </div>
        <span className="nm-mobil-brukar">{brukarNamn}</span>
      </header>

      {menyOpen && (
        <button
          type="button"
          className="nm-meny-bakgrunn"
          onClick={() => setMenyOpen(false)}
          aria-label="Lukk meny"
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <nav
        className={`nm-sidebar ${menyOpen ? "nm-sidebar-open" : ""}`}
        style={{
          width: "var(--nm-sidebar-w)",
          background: "var(--nm-surface-1)",
          borderRight: "1px solid var(--nm-border)",
        }}
      >
        {/* Brand */}
        <div
          className="flex items-center gap-2.5 px-4 h-11 shrink-0"
          style={{ borderBottom: "1px solid var(--nm-border)" }}
        >
          <div
            className="flex items-center justify-center shrink-0 rounded font-bold text-white"
            style={{
              width: 20,
              height: 20,
              fontSize: 10,
              background: "var(--nm-accent)",
              borderRadius: "var(--nm-r-sm)",
            }}
          >
            NM
          </div>
          <span
            className="text-sm font-semibold tracking-tight"
            style={{ color: "var(--nm-text-1)" }}
          >
            Nor-Mær
          </span>
          <button
            type="button"
            className="nm-sidebar-lukk"
            onClick={() => setMenyOpen(false)}
            aria-label="Lukk meny"
          >
            <IkonLukk />
          </button>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-2">
          {NAVIGASJON.map((seksjon) => (
            <div key={seksjon.tittel} className="mb-3">
              <div
                className="px-3.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--nm-text-3)" }}
              >
                {seksjon.tittel}
              </div>
              {seksjon.items.map((item) => {
                const aktiv =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nm-nav-item ${aktiv ? "nm-nav-aktiv" : ""}`}
                    onClick={() => setMenyOpen(false)}
                  >
                    <span className="nm-nav-icon shrink-0">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* User + logout */}
        <div
          className="px-3 py-3 shrink-0"
          style={{ borderTop: "1px solid var(--nm-border)" }}
        >
          <div className="mb-2 px-1">
            <p
              className="text-[13px] font-medium truncate leading-snug"
              style={{ color: "var(--nm-text-1)" }}
            >
              {brukarNamn}
            </p>
            <p
              className="text-[11px] leading-snug"
              style={{ color: "var(--nm-text-3)" }}
            >
              {ROLLE_NAMN[brukarRolle]}
            </p>
          </div>
          <form action={loggUt}>
            <button
              type="submit"
              className="text-[12px] px-2 py-1 rounded transition-colors hover:text-[color:var(--nm-text-2)]"
              style={{
                color: "var(--nm-text-3)",
                borderRadius: "var(--nm-r-sm)",
              }}
            >
              Logg ut
            </button>
          </form>
        </div>
      </nav>

      {/* ── Main content ────────────────────────────────────────── */}
      <main
        className="nm-admin-innhald"
        style={{ background: "var(--nm-bg)" }}
      >
        {children}
      </main>
    </div>
  );
}
