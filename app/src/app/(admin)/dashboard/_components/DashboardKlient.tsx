"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { STEG_NAMN, HENDING } from "@/lib/domene/typar";
import type {
  FeedHending,
  KanbanKort,
  ProsjektFramdrift,
  ProsjektInfo,
} from "../page";
import { KortModal } from "./KortModal";

const KANBAN_STEG = [
  "kapp",
  "sveis",
  "kontroll",
  "admin_inspeksjon",
  "galv",
] as const;

const HENDING_TEKST: Record<string, string> = {
  [HENDING[0]]: "sleppte",         // sleppt
  [HENDING[1]]: "skanna inn",      // skann_inn
  [HENDING[2]]: "skanna ut",       // skann_ut
  [HENDING[3]]: "avvist skann",    // skann_avvist
  [HENDING[4]]: "sende tilbake",   // sendt_tilbake
  [HENDING[5]]: "godkjente",       // godkjent
  [HENDING[6]]: "sende til galv",  // sendt_galv
  [HENDING[7]]: "mottok frå galv", // motteke_galv
};

type Filter = { prosjektId: string | null; steg: string | null };

function formatTidISteg(innTid: string | undefined, no: number): string | null {
  if (!innTid) return null;
  const min = Math.floor((no - new Date(innTid).getTime()) / 60000);
  if (min < 1) return "< 1 min";
  if (min < 60) return `${min} min`;
  const t = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${t}t ${m}m` : `${t}t`;
}

function formatRelativTid(tidsstempel: string, no: number): string {
  const sek = (no - new Date(tidsstempel).getTime()) / 1000;
  if (sek < 60) return "Akkurat no";
  if (sek < 3600) return `${Math.floor(sek / 60)} min`;
  if (sek < 86400) return `${Math.floor(sek / 3600)} t`;
  return new Date(tidsstempel).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
  });
}

// ── Value stream bar ──────────────────────────────────────────────

const VS_FARGAR: Record<string, string> = {
  planlagt: "nm-vs-planlagt",
  kapp: "nm-vs-kapp",
  sveis: "nm-vs-sveis",
  kontroll: "nm-vs-kontroll",
  admin_inspeksjon: "nm-vs-admin",
  galv: "nm-vs-galv",
  ferdig: "nm-vs-ferdig",
};

function ValueStreamSone({
  prosjektar,
  framdrift,
  kanban,
  filter,
  setFilter,
}: {
  prosjektar: ProsjektInfo[];
  framdrift: ProsjektFramdrift[];
  kanban: KanbanKort[];
  filter: Filter;
  setFilter: (f: Filter) => void;
}) {
  const framdriftMap = useMemo(() => {
    const m: Record<string, ProsjektFramdrift> = {};
    for (const f of framdrift) m[f.prosjekt_id] = f;
    return m;
  }, [framdrift]);

  if (prosjektar.length === 0) return null;

  return (
    <div className="nm-vs-sone">
      <div
        style={{
          padding: "12px 24px 10px",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--nm-text-3)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          borderBottom: "1px solid var(--nm-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>Verdikjede</span>
        {(filter.prosjektId || filter.steg) && (
          <button
            type="button"
            className="nm-btn nm-btn-ghost nm-btn-sm"
            onClick={() => setFilter({ prosjektId: null, steg: null })}
          >
            Vis alle
          </button>
        )}
      </div>
      <div
        style={{
          padding: "10px 24px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {prosjektar.map((p) => {
          const fd = framdriftMap[p.id];
          if (!fd || fd.jobbkort_totalt === 0) return null;
          const total = fd.jobbkort_totalt;

          const stegCount: Record<string, number> = {
            kapp: 0,
            sveis: 0,
            kontroll: 0,
            admin_inspeksjon: 0,
            galv: 0,
          };
          for (const k of kanban) {
            if (
              k.jobbpakke?.prosjekt_id === p.id &&
              stegCount[k.noverande_steg] !== undefined
            ) {
              stegCount[k.noverande_steg]++;
            }
          }

          const segments: { steg: string; count: number }[] = [
            { steg: "planlagt", count: fd.ikkje_sleppt },
            { steg: "kapp", count: stegCount.kapp },
            { steg: "sveis", count: stegCount.sveis },
            { steg: "kontroll", count: stegCount.kontroll },
            { steg: "admin_inspeksjon", count: stegCount.admin_inspeksjon },
            { steg: "galv", count: fd.hos_galv },
            { steg: "ferdig", count: fd.ferdig },
          ].filter((s) => s.count > 0);

          const isAktivP = filter.prosjektId === p.id;

          return (
            <div key={p.id} className="nm-vs-rad">
              <div
                className="nm-vs-rad-label"
                style={{ opacity: filter.prosjektId && !isAktivP ? 0.4 : 1 }}
                onClick={() =>
                  setFilter({
                    prosjektId: isAktivP && !filter.steg ? null : p.id,
                    steg: isAktivP ? filter.steg : null,
                  })
                }
              >
                {p.prosjekt_nr}
              </div>
              <div className="nm-vs-bar" title={`${total} jobbkort totalt`}>
                {segments.map(({ steg, count }) => {
                  const isAktivSeg = isAktivP && filter.steg === steg;
                  const cls = VS_FARGAR[steg] ?? "";
                  return (
                    <div
                      key={steg}
                      className={`nm-vs-segment ${cls}${isAktivSeg ? " nm-vs-segment-aktiv" : ""}`}
                      style={{
                        flex: count,
                        opacity:
                          filter.steg &&
                          filter.prosjektId === p.id &&
                          filter.steg !== steg
                            ? 0.3
                            : filter.prosjektId && !isAktivP
                            ? 0.25
                            : 1,
                        cursor: "pointer",
                      }}
                      title={`${STEG_NAMN[steg as keyof typeof STEG_NAMN] ?? steg}: ${count}`}
                      onClick={() => {
                        if (steg === "planlagt" || steg === "ferdig") {
                          setFilter({
                            prosjektId: isAktivP ? null : p.id,
                            steg: null,
                          });
                        } else {
                          setFilter({
                            prosjektId:
                              isAktivP && filter.steg === steg ? null : p.id,
                            steg:
                              isAktivP && filter.steg === steg ? null : steg,
                          });
                        }
                      }}
                    />
                  );
                })}
              </div>
              <div
                className="nm-vs-rad-tal"
                style={{ opacity: filter.prosjektId && !isAktivP ? 0.4 : 1 }}
              >
                {total}
              </div>
            </div>
          );
        })}
      </div>

      {/* Forklaring */}
      <div
        style={{ padding: "0 24px 10px", display: "flex", gap: 16, flexWrap: "wrap" }}
      >
        {[
          { steg: "planlagt", label: "Ikkje sleppt" },
          { steg: "kapp", label: "Kapp" },
          { steg: "sveis", label: "Sveis" },
          { steg: "kontroll", label: "Kontroll" },
          { steg: "admin_inspeksjon", label: "Admin-insp." },
          { steg: "galv", label: "Galv" },
          { steg: "ferdig", label: "Ferdig" },
        ].map(({ steg, label }) => (
          <div
            key={steg}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 10,
              color: "var(--nm-text-3)",
            }}
          >
            <div
              className={`nm-vs-segment ${VS_FARGAR[steg] ?? ""}`}
              style={{ width: 16, height: 8, borderRadius: 2 }}
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Kanban ────────────────────────────────────────────────────────

function KanbanKortView({
  kort,
  hasAvvik,
  innTid,
  no,
  onClick,
}: {
  kort: KanbanKort;
  hasAvvik: boolean;
  innTid: string | undefined;
  no: number;
  onClick: () => void;
}) {
  const tidStr =
    kort.noverande_status === "paagaar" ? formatTidISteg(innTid, no) : null;

  return (
    <div
      className={`nm-kanban-kort${hasAvvik ? " nm-kanban-kort-avvik" : ""}${
        kort.noverande_status === "paagaar" ? " nm-kanban-kort-aktiv" : ""
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span
          className="font-nm-mono"
          style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.02em" }}
        >
          {kort.jobbkort_nr}
        </span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {kort.rework_runde > 0 && (
            <span
              className="nm-badge nm-badge-avvik"
              style={{ fontSize: 10, padding: "1px 5px" }}
              title={`Rework-runde ${kort.rework_runde}`}
            >
              R{kort.rework_runde}
            </span>
          )}
          {hasAvvik && (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--nm-avvik)",
                display: "inline-block",
              }}
              title="Ope avvik"
            />
          )}
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--nm-text-1)",
          lineHeight: 1.3,
          marginBottom: kort.jobbpakke ? 6 : 0,
        }}
      >
        {kort.beskriving}
      </div>
      {kort.jobbpakke && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            className="font-nm-mono"
            style={{ fontSize: 10, color: "var(--nm-text-3)" }}
          >
            {kort.jobbpakke.pakke_nr}
          </span>
          {tidStr && (
            <span
              style={{
                fontSize: 10,
                color: "var(--nm-paagaar)",
                background: "var(--nm-paagaar-bg)",
                padding: "1px 5px",
                borderRadius: 3,
              }}
            >
              {tidStr}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function KanbanKolonne({
  steg,
  kort,
  openAvvik,
  innTidPer,
  no,
  onKortKlikk,
}: {
  steg: string;
  kort: KanbanKort[];
  openAvvik: Set<string>;
  innTidPer: Record<string, string>;
  no: number;
  onKortKlikk: (id: string) => void;
}) {
  const sortedKort = useMemo(
    () =>
      [...kort]
        .filter((k) => k.noverande_steg === steg)
        .sort((a, b) => {
          const ra = a.jobbpakke?.rekkefoelge ?? 0;
          const rb = b.jobbpakke?.rekkefoelge ?? 0;
          if (ra !== rb) return ra - rb;
          return Number(a.fifo_nr) - Number(b.fifo_nr);
        }),
    [kort, steg]
  );

  return (
    <div className="nm-kanban-kolonne">
      <div className="nm-kanban-kolonne-header">
        <span>{STEG_NAMN[steg as keyof typeof STEG_NAMN] ?? steg}</span>
        <span className="nm-badge nm-badge-nøytral">{sortedKort.length}</span>
      </div>
      <div className="nm-kanban-kolonne-body">
        {sortedKort.map((k) => (
          <KanbanKortView
            key={k.id}
            kort={k}
            hasAvvik={openAvvik.has(k.id)}
            innTid={innTidPer[k.id]}
            no={no}
            onClick={() => onKortKlikk(k.id)}
          />
        ))}
        {sortedKort.length === 0 && (
          <div
            style={{
              padding: "16px 12px",
              fontSize: 12,
              color: "var(--nm-text-3)",
              textAlign: "center",
            }}
          >
            Tomt
          </div>
        )}
      </div>
    </div>
  );
}

// ── Activity feed ─────────────────────────────────────────────────

function FeedSone({
  feed,
  no,
  onKortKlikk,
}: {
  feed: FeedHending[];
  no: number;
  onKortKlikk: (nr: string) => void;
}) {
  return (
    <div className="nm-feed-sone">
      <div
        className="nm-kanban-kolonne-header"
        style={{ borderRadius: "var(--nm-r-lg) var(--nm-r-lg) 0 0" }}
      >
        <span>Aktivitet</span>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {feed.map((h) => (
          <div
            key={h.id}
            className="nm-feed-hending"
            onClick={() => h.jobbkort?.jobbkort_nr && onKortKlikk(h.jobbkort.jobbkort_nr)}
            style={{ cursor: h.jobbkort ? "pointer" : "default" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 2,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--nm-text-1)",
                }}
              >
                {h.brukar?.namn ?? "Ukjent"}
              </span>
              <span style={{ fontSize: 10, color: "var(--nm-text-3)" }}>
                {formatRelativTid(h.tidsstempel, no)}
              </span>
            </div>
            <div
              style={{ fontSize: 11, color: "var(--nm-text-2)", lineHeight: 1.4 }}
            >
              {HENDING_TEKST[h.hending] ?? h.hending}{" "}
              {h.jobbkort && (
                <span
                  className="font-nm-mono"
                  style={{ color: "var(--nm-text-1)" }}
                >
                  {h.jobbkort.jobbkort_nr}
                </span>
              )}
              {h.hending === "sendt_tilbake" && (
                <span style={{ color: "var(--nm-avvik)" }}> (rework)</span>
              )}
            </div>
          </div>
        ))}
        {feed.length === 0 && (
          <div
            style={{
              padding: 20,
              fontSize: 12,
              color: "var(--nm-text-3)",
              textAlign: "center",
            }}
          >
            Ingen aktivitet endå
          </div>
        )}
      </div>
    </div>
  );
}

// ── Hjelpefunksjon: bygg inn_tid-map med steg-matching ───────────

function byggInnTidMap(
  rawInnTider: { jobbkort_id: string; steg: string; tidsstempel: string }[],
  kortSteg: Record<string, string>
): Record<string, string> {
  const tidMap: Record<string, string> = {};
  for (const r of rawInnTider) {
    if (!tidMap[r.jobbkort_id] && kortSteg[r.jobbkort_id] === r.steg) {
      tidMap[r.jobbkort_id] = r.tidsstempel;
    }
  }
  return tidMap;
}

// ── Kanban-steg (konstant select-liste for spørring) ─────────────
const KANBAN_STEG_LIST = ["kapp", "sveis", "kontroll", "admin_inspeksjon", "galv"] as const;

// ── Main component ────────────────────────────────────────────────

export function DashboardKlient({
  prosjektar,
  framdrift: initialFramdrift,
  kanban: initialKanban,
  openAvvik: initialOpenAvvik,
  feed: initialFeed,
  innTidPer: initialInnTidPer,
}: {
  prosjektar: ProsjektInfo[];
  framdrift: ProsjektFramdrift[];
  kanban: KanbanKort[];
  openAvvik: string[];
  feed: FeedHending[];
  innTidPer: Record<string, string>;
}) {
  const [framdrift, setFramdrift] = useState<ProsjektFramdrift[]>(initialFramdrift);
  const [kanban, setKanban] = useState<KanbanKort[]>(initialKanban);
  const [openAvvik, setOpenAvvik] = useState<Set<string>>(
    new Set(initialOpenAvvik)
  );
  const [feed, setFeed] = useState<FeedHending[]>(initialFeed);
  const [innTidPer, setInnTidPer] = useState<Record<string, string>>(
    initialInnTidPer
  );
  const [no, setNo] = useState(() => Date.now());
  const [filter, setFilter] = useState<Filter>({
    prosjektId: null,
    steg: null,
  });
  const [apentKortId, setApentKortId] = useState<string | null>(null);

  const supabaseRef = useRef(supabaseBrowser());
  const kanbanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timer — oppdater kvar minutt
  useEffect(() => {
    const id = setInterval(() => setNo(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const refreshKanban = useCallback(async () => {
    const sb = supabaseRef.current;
    const [{ data: rawK }, { data: rawA }, { data: rawI }, { data: rawFd }] =
      await Promise.all([
        sb
          .from("jobbkort")
          .select(
            "id, jobbkort_nr, beskriving, noverande_steg, noverande_status, rework_runde, fifo_nr, aktiv_brukar_id, steg_plan, jobbpakke:jobbpakke_id(rekkefoelge, pakke_nr, prosjekt_id)"
          )
          .in("noverande_steg", [...KANBAN_STEG_LIST])
          .order("fifo_nr"),
        sb.from("avvik").select("jobbkort_id").eq("status", "open"),
        // Inkluder steg for korrekt inn_tid-matching ved rework
        sb
          .from("steg_logg")
          .select("jobbkort_id, steg, tidsstempel")
          .eq("hending", "skann_inn")
          .order("tidsstempel", { ascending: false })
          .limit(500),
        sb.from("prosjekt_framdrift").select("*"),
      ]);

    if (rawK) {
      const newKanban = rawK as unknown as KanbanKort[];
      setKanban(newKanban);

      if (rawI) {
        const kortSteg: Record<string, string> = {};
        for (const k of newKanban) kortSteg[k.id] = k.noverande_steg;
        setInnTidPer(
          byggInnTidMap(
            rawI as { jobbkort_id: string; steg: string; tidsstempel: string }[],
            kortSteg
          )
        );
      }
    }

    if (rawA)
      setOpenAvvik(new Set(rawA.map((a) => a.jobbkort_id as string)));
    if (rawFd)
      setFramdrift(rawFd as unknown as ProsjektFramdrift[]);

    setNo(Date.now());
  }, []);

  const refreshFeed = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("steg_logg")
      .select(
        "id, tidsstempel, hending, steg, kommentar, jobbkort:jobbkort_id(jobbkort_nr), brukar:brukar_id(namn)"
      )
      .neq("hending", "skann_avvist")
      .order("tidsstempel", { ascending: false })
      .limit(20);
    if (data) setFeed(data as unknown as FeedHending[]);
    setNo(Date.now());
  }, []);

  // Debounsa refreshane: fleire realtime-hendingar i same sekund
  // fører til berre éin oppdatering.
  const debouncedRefreshKanban = useCallback(() => {
    if (kanbanTimerRef.current) clearTimeout(kanbanTimerRef.current);
    kanbanTimerRef.current = setTimeout(refreshKanban, 250);
  }, [refreshKanban]);

  const debouncedRefreshFeed = useCallback(() => {
    if (feedTimerRef.current) clearTimeout(feedTimerRef.current);
    feedTimerRef.current = setTimeout(refreshFeed, 250);
  }, [refreshFeed]);

  // Realtime subscriptions
  useEffect(() => {
    const sb = supabaseRef.current;
    const channel = sb
      .channel("dashboard-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobbkort" },
        debouncedRefreshKanban
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "steg_logg" },
        () => {
          debouncedRefreshKanban();
          debouncedRefreshFeed();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "avvik" },
        debouncedRefreshKanban
      )
      .subscribe();

    return () => {
      if (kanbanTimerRef.current) clearTimeout(kanbanTimerRef.current);
      if (feedTimerRef.current) clearTimeout(feedTimerRef.current);
      sb.removeChannel(channel);
    };
  }, [debouncedRefreshKanban, debouncedRefreshFeed]);

  const filteredKanban = useMemo(() => {
    let cards = kanban;
    if (filter.prosjektId)
      cards = cards.filter(
        (k) => k.jobbpakke?.prosjekt_id === filter.prosjektId
      );
    if (filter.steg)
      cards = cards.filter((k) => k.noverande_steg === filter.steg);
    return cards;
  }, [kanban, filter]);

  const handleKortKlikk = useCallback(
    (id: string) => setApentKortId(id),
    []
  );

  return (
    <>
      <div className="nm-page-header">
        <h1 className="nm-page-title">Dashbord</h1>
        <span style={{ fontSize: 12, color: "var(--nm-text-3)" }}>
          {kanban.length} aktive jobbkort
        </span>
      </div>

      <ValueStreamSone
        prosjektar={prosjektar}
        framdrift={framdrift}
        kanban={kanban}
        filter={filter}
        setFilter={setFilter}
      />

      <div className="nm-dashboard-body">
        {/* Kanban */}
        <div className="nm-kanban-sone">
          {KANBAN_STEG.filter((s) => !filter.steg || filter.steg === s).map(
            (steg) => (
              <KanbanKolonne
                key={steg}
                steg={steg}
                kort={filteredKanban}
                openAvvik={openAvvik}
                innTidPer={innTidPer}
                no={no}
                onKortKlikk={handleKortKlikk}
              />
            )
          )}
        </div>

        {/* Feed */}
        <FeedSone
          feed={feed}
          no={no}
          onKortKlikk={(nr) => {
            const k = kanban.find((c) => c.jobbkort_nr === nr);
            if (k) setApentKortId(k.id);
          }}
        />
      </div>

      {apentKortId && (
        <KortModal
          kortId={apentKortId}
          onLukk={() => {
            setApentKortId(null);
            debouncedRefreshKanban();
          }}
        />
      )}
    </>
  );
}
