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
  const hasLive = windows.some(w => new Date(w.beginTime) <= now && new Date(w.endTime) >= now);
  if (hasLive) return "live";
  if (hasFuture) return "upcoming";
  return "past";
}

function getCurrentEventWindow(tournament: Tournament): EventWindow | null {
  const now = new Date();
  return (tournament.eventWindows || []).find(w => new Date(w.beginTime) <= now && new Date(w.endTime) >= now) || null;
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

function formatRelativeTime(dateStr: string, isEnd = false): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const prefix = isEnd ? "termina en" : "en";

  if (diffMins < 0) return `${isEnd ? "termino hace" : "inicio hace"} ${Math.abs(diffMins)}m`;
  if (diffMins < 60) return `${prefix} ${diffMins}m`;
  if (diffHours < 24) return `${prefix} ${diffHours}h`;
  if (diffDays === 1) return `${prefix} 1 dia`;
  if (diffDays < 7) return `${prefix} ${diffDays} dias`;
  return `${prefix} ${Math.round(diffDays / 7)} sem`;
}

function getTimeBadge(tournament: Tournament): { text: string; variant: "live" | "soon" | "later" } {
  const status = getTournamentStatus(tournament);
  const current = getCurrentEventWindow(tournament);
  const next = getNextEventWindow(tournament);

  if (status === "live" && current) {
    return { text: formatRelativeTime(current.endTime, true), variant: "live" };
  }
  if (next) {
    const diffHours = (new Date(next.beginTime).getTime() - Date.now()) / (1000 * 60 * 60);
    if (diffHours < 24) {
      return { text: formatRelativeTime(next.beginTime), variant: "soon" };
    }
    return { text: formatRelativeTime(next.beginTime), variant: "later" };
  }
  return { text: "Finalizado", variant: "later" };
}

function getSessionLabel(tournament: Tournament): string {
  const current = getCurrentEventWindow(tournament);
  const next = getNextEventWindow(tournament);
  const windows = tournament.eventWindows || [];

  if (current) {
    const idx = windows.indexOf(current);
    const roundName = tournament.displayData?.roundNames?.[idx] || `Session ${idx + 1}`;
    return `En curso: ${roundName}`;
  }
  if (next) {
    const idx = windows.indexOf(next);
    const roundName = tournament.displayData?.roundNames?.[idx] || `Session ${idx + 1}`;
    return `Proximo: ${roundName}`;
  }
  return "";
}

function getEventCount(tournament: Tournament): number {
  return (tournament.eventWindows || []).length;
}

function getTournamentImageSource(
  tournament: Tournament,
  imageType: "poster" | "square" | "background" | "playlist"
) {
  const sources = {
    poster: tournament.displayData?.posterBackImage,
    square: tournament.displayData?.squarePosterImage,
    background: tournament.displayData?.tournamentViewBackgroundImage,
    playlist: tournament.displayData?.playlistTileImage,
  };
  const preferredOrder =
    imageType === "poster"
      ? ["poster", "square", "playlist", "background"]
      : imageType === "square"
        ? ["square", "playlist", "poster", "background"]
        : imageType === "background"
          ? ["background", "playlist", "square", "poster"]
          : ["playlist", "square", "poster", "background"];

  for (const type of preferredOrder) {
    const url = sources[type as keyof typeof sources];
    if (url) return { type, url };
  }

  return null;
}

function TournamentImage({
  tournament,
  className,
  imageType = "poster",
}: {
  tournament: Tournament;
  className?: string;
  imageType?: "poster" | "square" | "background" | "playlist";
}) {
  const imageSource = getTournamentImageSource(tournament, imageType);

  if (!imageSource) return <div className={`bg-miyu-surface ${className}`} />;

  const localUrl = `/api/tournament-image?eventId=${encodeURIComponent(tournament.eventId)}&type=${imageSource.type}&url=${encodeURIComponent(imageSource.url)}`;

  return (
    <img
      src={localUrl}
      alt=""
      className={`object-cover ${className}`}
      loading="lazy"
      onError={(e) => {
        const image = e.target as HTMLImageElement;
        if (image.src !== imageSource.url) image.src = imageSource.url;
      }}
    />
  );
}

const REGIONS = ["ASIA", "BR", "EU", "ME", "NAC", "NAE", "NAW", "OCE", "ONSITE"];

function normalizeRegion(region: string) {
  const normalized = region.toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized === "NAEAST") return "NAE";
  if (normalized === "NAWEST") return "NAW";
  if (normalized === "NACENTRAL") return "NAC";
  return normalized;
}

export function TournamentsList() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeRegions, setActiveRegions] = useState<string[]>([]);
  const [quickAccessOpen, setQuickAccessOpen] = useState(true);
  const [upcomingOpen, setUpcomingOpen] = useState(true);

  const fetchTournaments = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const regionsToFetch = activeRegions.length > 0 ? activeRegions : [null];
      const responses = await Promise.all(
        regionsToFetch.map(async (region) => {
          const params = new URLSearchParams({ action: "tournaments", lang: "es", includeHistoricData: "true" });
          if (region) params.set("region", region);
          const res = await fetch(`/api/osirion?${params.toString()}`);
          return res.json();
        })
      );

      const merged = new Map<string, Tournament>();
      for (const data of responses) {
        if (!data.success) throw new Error(data.error || "Error al cargar torneos");
        for (const tournament of data.tournaments || []) {
          merged.set(tournament.eventId, tournament);
        }
      }

      setTournaments([...merged.values()]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar torneos");
    } finally {
      setLoading(false);
    }
  }, [activeRegions]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTournaments();
  }, [fetchTournaments]);

  const filteredTournaments = useMemo(() => {
    let result = tournaments;

    if (activeRegions.length > 0) {
      result = result.filter(t => {
        const tournamentRegions = t.regions.map(normalizeRegion);
        return activeRegions.some(region => tournamentRegions.includes(normalizeRegion(region)));
      });
    }

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
  }, [tournaments, activeRegions, search]);

  const liveAndUpcoming = useMemo(() => {
    return filteredTournaments.filter(t => {
      const s = getTournamentStatus(t);
      return s === "upcoming" || s === "live";
    }).sort((a, b) => {
      const aNext = getNextEventWindow(a);
      const bNext = getNextEventWindow(b);
      if (!aNext) return 1;
      if (!bNext) return -1;
      return new Date(aNext.beginTime).getTime() - new Date(bNext.beginTime).getTime();
    });
  }, [filteredTournaments]);

  const quickAccess = useMemo(() => liveAndUpcoming.slice(0, 5), [liveAndUpcoming]);
  const upcomingEvents = useMemo(() => liveAndUpcoming.slice(5), [liveAndUpcoming]);
  const pastEvents = useMemo(() => filteredTournaments.filter(t => getTournamentStatus(t) === "past"), [filteredTournaments]);

  const toggleRegion = (region: string) => {
    setActiveRegions(prev =>
      prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-miyu-text-muted border-t-miyu-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="text-red-400 text-sm">{error}</div>
        <button onClick={fetchTournaments} className="rounded-lg border border-miyu-text bg-miyu-btn px-4 py-2 text-xs font-bold text-miyu-text hover:bg-miyu-btn-hover">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-miyu-text-muted">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar torneo"
            className="w-full pl-10 pr-8 py-2.5 bg-miyu-surface border border-miyu-border rounded-xl text-sm text-miyu-text placeholder-miyu-text-muted/60 focus:outline-none focus:border-miyu-accent transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-miyu-btn p-1 text-miyu-text hover:bg-miyu-btn-hover">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {REGIONS.map(r => (
            <button
              key={r}
              onClick={() => toggleRegion(r)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                activeRegions.includes(r)
                  ? "border-miyu-text bg-miyu-btn text-miyu-text"
                  : "border-miyu-border bg-miyu-btn text-miyu-text hover:bg-miyu-btn-hover"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {activeRegions.length > 0 && (
          <button
            onClick={() => setActiveRegions([])}
            className="ml-auto rounded-lg border border-miyu-text bg-miyu-btn px-3 py-2 text-xs font-bold text-miyu-text hover:bg-miyu-btn-hover"
          >
            Todas las regiones
          </button>
        )}
      </div>

      {/* Quick Access */}
      {quickAccess.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setQuickAccessOpen(!quickAccessOpen)}
            className="flex items-center gap-2 rounded-lg bg-miyu-btn px-3 py-2 text-lg font-semibold text-miyu-text hover:bg-miyu-btn-hover transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 transition-transform ${quickAccessOpen ? "" : "-rotate-90"}`}><polyline points="6 9 12 15 18 9"/></svg>
            Acceso rapido
          </button>

          {quickAccessOpen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {quickAccess.map(t => {
                const badge = getTimeBadge(t);
                const sessionLabel = getSessionLabel(t);
                const title = t.displayData?.titleLine1 || t.displayData?.longFormatTitle || t.eventGroup;
                const subtitle = t.displayData?.titleLine2 || "";
                const eventCount = getEventCount(t);

                return (
                  <Link
                    key={t.eventId}
                    href={`/dashboard/tournaments/${t.eventId}`}
                    className="group relative aspect-[4/5] rounded-xl overflow-hidden block"
                  >
                    <TournamentImage tournament={t} className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-white ${
                        badge.variant === "live" ? "bg-red-500/90" :
                        badge.variant === "soon" ? "bg-amber-500/90" :
                        "bg-black/60 backdrop-blur-sm"
                      }`}>
                        {badge.text}
                      </span>
                      {eventCount > 1 && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold text-white bg-black/60 backdrop-blur-sm">
                          {eventCount} fechas
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <h3 className="text-sm font-bold text-white leading-tight line-clamp-2 drop-shadow-md">
                        {title}
                      </h3>
                      {subtitle && (
                        <p className="text-[11px] text-white/80 mt-0.5 line-clamp-1 drop-shadow">{subtitle}</p>
                      )}
                      {sessionLabel && (
                        <p className="text-[11px] text-white/70 mt-1 font-medium drop-shadow">{sessionLabel}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setUpcomingOpen(!upcomingOpen)}
            className="flex items-center gap-2 rounded-lg bg-miyu-btn px-3 py-2 text-lg font-semibold text-miyu-text hover:bg-miyu-btn-hover transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 transition-transform ${upcomingOpen ? "" : "-rotate-90"}`}><polyline points="6 9 12 15 18 9"/></svg>
            Proximos eventos
          </button>

          {upcomingOpen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {upcomingEvents.map(t => {
                const badge = getTimeBadge(t);
                const sessionLabel = getSessionLabel(t);
                const title = t.displayData?.titleLine1 || t.displayData?.longFormatTitle || t.eventGroup;
                const eventCount = getEventCount(t);

                return (
                  <Link
                    key={t.eventId}
                    href={`/dashboard/tournaments/${t.eventId}`}
                    className="group relative aspect-[4/5] rounded-xl overflow-hidden block"
                  >
                    <TournamentImage tournament={t} className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-white ${
                        badge.variant === "live" ? "bg-red-500/90" :
                        badge.variant === "soon" ? "bg-amber-500/90" :
                        "bg-black/60 backdrop-blur-sm"
                      }`}>
                        {badge.text}
                      </span>
                      {eventCount > 1 && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold text-white bg-black/60 backdrop-blur-sm">
                          {eventCount} fechas
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <h3 className="text-xs font-bold text-white leading-tight line-clamp-2 drop-shadow-md">
                        {title}
                      </h3>
                      {sessionLabel && (
                        <p className="text-[10px] text-white/70 mt-1 font-medium drop-shadow">{sessionLabel}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Past Events */}
      {pastEvents.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-miyu-text-muted">Eventos pasados</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {pastEvents.slice(0, 12).map(t => {
              const title = t.displayData?.titleLine1 || t.displayData?.longFormatTitle || t.eventGroup;
              const eventCount = getEventCount(t);

              return (
                <Link
                  key={t.eventId}
                  href={`/dashboard/tournaments/${t.eventId}`}
                  className="group relative aspect-[4/5] rounded-xl overflow-hidden block opacity-70 hover:opacity-100 transition-opacity"
                >
                  <TournamentImage tournament={t} className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  <div className="absolute top-2 left-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-white bg-gray-500/90">
                      Finalizado
                    </span>
                    {eventCount > 1 && (
                      <span className="ml-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-white bg-black/60 backdrop-blur-sm">
                        {eventCount} fechas
                      </span>
                    )}
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <h3 className="text-xs font-bold text-white leading-tight line-clamp-2 drop-shadow-md">
                      {title}
                    </h3>
                  </div>
                </Link>
              );
            })}
          </div>
          {pastEvents.length > 12 && (
            <p className="text-xs text-miyu-text-muted text-center">+{pastEvents.length - 12} eventos pasados mas</p>
          )}
        </div>
      )}

      {filteredTournaments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <div className="text-miyu-text-muted text-sm">No se encontraron torneos</div>
          <button onClick={() => { setSearch(""); setActiveRegions([]); }} className="rounded-lg border border-miyu-text bg-miyu-btn px-4 py-2 text-xs font-bold text-miyu-text hover:bg-miyu-btn-hover">Limpiar filtros</button>
        </div>
      )}
    </div>
  );
}
