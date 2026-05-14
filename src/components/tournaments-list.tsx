"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";

interface EventWindow {
  eventWindowId: string;
  beginTime: string;
  endTime: string;
  round: number;
  scoreLocations?: { leaderboardEventId: string; leaderboardEventWindowId: string; isMain: boolean }[];
}

interface Tournament {
  eventId: string;
  eventGroup: string;
  regions: string[];
  platforms: string[];
  displayData: {
    titleLine1: string;
    titleLine2: string;
    longFormatTitle: string;
    flavorDescription: string;
    posterBackImage: string;
    squarePosterImage: string;
    tournamentViewBackgroundImage: string;
    playlistTileImage: string;
    roundNames: string[];
  };
  eventWindows: EventWindow[];
}

type TournamentStatus = "past" | "upcoming" | "live";

function getTournamentStatus(tournament: Tournament): TournamentStatus {
  const now = new Date();
  const windows = tournament.eventWindows || [];
  if (windows.length === 0) return "past";
  const hasFuture = windows.some(w => new Date(w.beginTime) > now);
  const hasPast = windows.some(w => new Date(w.endTime) < now);
  const hasLive = windows.some(w => new Date(w.beginTime) <= now && new Date(w.endTime) >= now);
  if (hasLive) return "live";
  if (hasFuture && hasPast) return "live";
  if (hasFuture) return "upcoming";
  return "past";
}

function getNextEventWindow(tournament: Tournament): EventWindow | null {
  const now = new Date();
  return (tournament.eventWindows || [])
    .filter(w => new Date(w.beginTime) > now)
    .sort((a, b) => new Date(a.beginTime).getTime() - new Date(b.beginTime).getTime())[0] || null;
}

function getMostRecentTournamentTimestamp(tournament: Tournament): number {
  const windows = tournament.eventWindows || [];
  if (windows.length === 0) return 0;

  return Math.max(
    ...windows.map((window) =>
      Math.max(new Date(window.beginTime).getTime(), new Date(window.endTime).getTime())
    )
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffHours < 1) return "En <1h";
  if (diffHours < 24) return `En ${diffHours}h`;
  if (diffDays === 1) return "Manana";
  if (diffDays < 7) return `En ${diffDays}d`;
  return formatDate(dateStr);
}

function StatusDot({ status }: { status: TournamentStatus }) {
  const color = status === "live" ? "bg-red-400" : status === "upcoming" ? "bg-[#204E46]" : "bg-gray-400";
  return <span className={`w-1.5 h-1.5 rounded-full ${color} ${status === "live" ? "animate-pulse" : ""}`} />;
}

function TournamentImage({ tournament, className }: { tournament: Tournament; className?: string }) {
  const imageUrl = tournament.displayData?.squarePosterImage ||
    tournament.displayData?.playlistTileImage ||
    tournament.displayData?.posterBackImage;
  if (!imageUrl) return <div className={`bg-miyu-surface ${className}`} />;
  return <img src={imageUrl} alt="" className={`object-cover ${className}`} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />;
}

export function TournamentsList() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("all");
  const [region, setRegion] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ action: "tournaments", lang: "es", includeHistoricData: "true" });
      if (region) params.set("region", region);
      const res = await fetch(`/api/osirion?${params.toString()}`);
      const data = await res.json();
      if (data.success && data.tournaments) setTournaments(data.tournaments);
      else setError(data.error || "Error al cargar torneos");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [region]);

  useEffect(() => { fetchTournaments(); }, [fetchTournaments]);

  const filteredTournaments = useMemo(() => {
    let result = tournaments;
    if (filter === "upcoming") result = result.filter(t => { const s = getTournamentStatus(t); return s === "upcoming" || s === "live"; });
    else if (filter === "past") result = result.filter(t => getTournamentStatus(t) === "past");
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t => {
        const title = (t.displayData?.titleLine1 || t.displayData?.longFormatTitle || t.eventGroup).toLowerCase();
        return title.includes(q) || (t.displayData?.titleLine2 || "").toLowerCase().includes(q);
      });
    }

    return [...result].sort((a, b) => {
      return getMostRecentTournamentTimestamp(b) - getMostRecentTournamentTimestamp(a);
    });
  }, [tournaments, filter, search]);

  const upcomingCount = tournaments.filter(t => { const s = getTournamentStatus(t); return s === "upcoming" || s === "live"; }).length;
  const pastCount = tournaments.filter(t => getTournamentStatus(t) === "past").length;
  const regions = ["", "NAE", "NAC", "NAW", "EU", "BR", "OCE", "ASIA", "ME"];

  const groupedByDay = useMemo(() => {
    if (filter !== "all" || search) return null;
    const groups: Record<string, Tournament[]> = {};
    tournaments.filter(t => { const s = getTournamentStatus(t); return s === "upcoming" || s === "live"; })
      .sort((a, b) => {
        const aN = getNextEventWindow(a);
        const bN = getNextEventWindow(b);
        if (!aN) return 1; if (!bN) return -1;
        return new Date(aN.beginTime).getTime() - new Date(bN.beginTime).getTime();
      })
      .forEach(t => {
        const next = getNextEventWindow(t);
        if (next) {
          const label = formatRelativeTime(next.beginTime);
          if (!groups[label]) groups[label] = [];
          groups[label].push(t);
        }
      });
    return Object.entries(groups).slice(0, 4);
  }, [tournaments, filter, search]);

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-miyu-text-muted border-t-miyu-text rounded-full animate-spin" /></div>;
  if (error) return <div className="flex flex-col items-center justify-center py-16 gap-3"><div className="text-red-400 text-sm">{error}</div><button onClick={fetchTournaments} className="text-xs text-[#204E46] hover:underline">Reintentar</button></div>;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <svg viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-miyu-text-muted">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar torneos..."
            className="w-full pl-10 pr-8 py-2 bg-miyu-surface border border-miyu-border rounded-lg text-sm text-miyu-text placeholder-miyu-text-muted/60 focus:outline-none focus:border-[#204E46] transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-miyu-text-muted hover:text-miyu-text">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>

        <div className="flex border border-miyu-border rounded-lg overflow-hidden">
          {[
            { key: "all" as const, label: "Todos", count: tournaments.length },
            { key: "upcoming" as const, label: "Proximos", count: upcomingCount },
            { key: "past" as const, label: "Pasados", count: pastCount },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${filter === f.key ? "bg-miyu-text text-miyu-bg" : "text-miyu-text-muted hover:text-miyu-text"}`}>
              {f.label} <span className="opacity-50">({f.count})</span>
            </button>
          ))}
        </div>

        <select value={region} onChange={(e) => setRegion(e.target.value)} className="bg-miyu-surface border border-miyu-border rounded-lg px-3 py-1.5 text-xs text-miyu-text focus:outline-none focus:border-[#204E46]">
          <option value="">Todas las regiones</option>
          {regions.filter(r => r).map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <div className="flex border border-miyu-border rounded-lg overflow-hidden ml-auto">
          <button onClick={() => setViewMode("grid")} className={`p-1.5 ${viewMode === "grid" ? "bg-miyu-surface text-miyu-text" : "text-miyu-text-muted"}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
          </button>
          <button onClick={() => setViewMode("list")} className={`p-1.5 ${viewMode === "list" ? "bg-miyu-surface text-miyu-text" : "text-miyu-text-muted"}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>

      {/* Quick access - grouped by day */}
      {groupedByDay && groupedByDay.length > 0 && (
        <div className="space-y-4">
          {groupedByDay.map(([day, tours]) => (
            <div key={day}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-miyu-text-muted bg-miyu-surface px-2 py-0.5 rounded font-mono">{day}</span>
                <span className="text-xs text-miyu-text-muted">{tours.length} evento{(tours.length) !== 1 ? "s" : ""}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {tours.slice(0, 5).map(t => {
                  const title = t.displayData?.titleLine1 || t.displayData?.longFormatTitle || t.eventGroup;
                  const status = getTournamentStatus(t);
                  return (
                    <Link key={t.eventId} href={`/dashboard/tournaments/${t.eventId}`} className="bg-miyu-surface border border-miyu-border rounded-lg p-3 hover:border-[#204E46]/30 transition-colors group block">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <StatusDot status={status} />
                        <span className="text-xs text-miyu-text-muted truncate">{title}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-miyu-text-muted">
                        {t.regions.slice(0, 2).map(r => <span key={r} className="opacity-60">{r}</span>)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main grid/list */}
      {filteredTournaments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <div className="text-miyu-text-muted text-sm">No se encontraron torneos</div>
          <button onClick={() => { setSearch(""); setFilter("all"); setRegion(""); }} className="text-xs text-[#204E46] hover:underline">Limpiar filtros</button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredTournaments.map(t => {
            const status = getTournamentStatus(t);
            const next = getNextEventWindow(t);
            const title = t.displayData?.titleLine1 || t.displayData?.longFormatTitle || t.eventGroup;
            return (
              <Link key={t.eventId} href={`/dashboard/tournaments/${t.eventId}`} className="bg-miyu-surface border border-miyu-border rounded-xl overflow-hidden hover:shadow-[0_4px_16px_rgba(32,78,70,0.1)] hover:-translate-y-0.5 transition-all group block">
                <div className="relative h-24 overflow-hidden">
                  <TournamentImage tournament={t} className="w-full h-full group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-miyu-surface to-transparent" />
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <StatusDot status={status} />
                    <h3 className="font-semibold text-sm text-miyu-text truncate">{title}</h3>
                  </div>
                  <div className="flex items-center justify-between text-xs text-miyu-text-muted">
                    <span>{t.regions.slice(0, 2).join(", ")}</span>
                    {status === "upcoming" && next && <span className="text-[#204E46]">{formatRelativeTime(next.beginTime)}</span>}
                    {status === "live" && next && <span className="text-red-400">{formatRelativeTime(next.beginTime)}</span>}
                    {status === "past" && <span>Finalizado</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredTournaments.map(t => {
            const status = getTournamentStatus(t);
            const next = getNextEventWindow(t);
            const title = t.displayData?.titleLine1 || t.displayData?.longFormatTitle || t.eventGroup;
            return (
              <Link key={t.eventId} href={`/dashboard/tournaments/${t.eventId}`} className="flex items-center gap-3 p-3 bg-miyu-surface border border-miyu-border rounded-lg hover:border-[#204E46]/30 transition-colors group">
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                  <TournamentImage tournament={t} className="w-full h-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusDot status={status} />
                    <h3 className="font-semibold text-sm text-miyu-text truncate">{title}</h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-miyu-text-muted mt-0.5">
                    <span>{t.regions.join(", ")}</span>
                    <span>{t.eventWindows?.length || 0} ronda{(t.eventWindows?.length || 0) !== 1 ? "s" : ""}</span>
                    {status === "upcoming" && next && <span className="text-[#204E46]">{formatRelativeTime(next.beginTime)}</span>}
                    {status === "past" && <span>Finalizado</span>}
                  </div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-miyu-text-muted group-hover:text-miyu-text transition-colors flex-shrink-0"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
