"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  BarChart3,
  Clock3,
  Search,
  ShoppingBag,
  Star,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface RankedMode {
  rankingType: string;
  rankingTrackId: string;
  lastUpdatedAt?: string | null;
  currentDivision: { divisionName: string; divisionGroupName?: string } | null;
  highestDivision: { divisionName: string; divisionGroupName?: string } | null;
  promotionProgress?: number;
  currentPlayerRanking?: number | null;
}

interface RankedData {
  success: boolean;
  rank: RankedMode | null;
  ranks?: RankedMode[];
}

interface ModeStats {
  kills?: number;
  matchesplayed?: number;
  placetop1?: number;
  minutesplayed?: number;
  score?: number;
  placetop5?: number;
  placetop12?: number;
  placetop6?: number;
  placetop3?: number;
  placetop2?: number;
  placetop10?: number;
  placetop25?: number;
}

interface StatsData {
  success: boolean;
  groupedStats?: Record<string, Record<string, ModeStats>>;
  seasonLevels?: { level: number }[];
  source?: "osirion" | "tracker" | "fortnite-api";
}

interface SearchHistory {
  accountId: string;
  displayName: string;
  timestamp: number;
}

interface TournamentPlacement {
  eventId?: string | null;
  eventWindowId?: string | null;
  epicUsername?: string | null;
  placement?: number | null;
  points?: number | null;
  eliminations?: number | null;
  assists?: number | null;
  avgPlacement?: number | null;
  totalMatches?: number | null;
  startTime?: number | string | null;
  endTime?: number | string | null;
  error?: string;
}

interface TournamentPlacementsData {
  success: boolean;
  tournamentsScanned?: number;
  placements?: TournamentPlacement[];
}

type InputMethod = "keyboardmouse" | "gamepad" | "touch" | string;
type GameMode = "p2" | "p10" | "p9" | string;
const CANONICAL_GAME_MODES = ["solo", "duo", "trio", "squad", "ltm"] as const;
const RANK_ICON_SPRITE = "/rank-icons/fortnite-ranked-symbols.png";

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "error desconocido";
}

function formatInputMethod(input: string) {
  if (input === "all") return "todas";
  if (input === "keyboardmouse") return "kbm";
  if (input === "gamepad") return "mando";
  return input;
}

function formatGameMode(mode: string) {
  if (mode === "overall") return "general";
  if (mode === "solo" || mode === "p9") return "solos";
  if (mode === "duo" || mode === "p2") return "duos";
  if (mode === "trio") return "trios";
  if (mode === "squad" || mode === "p10") return "squads";
  if (mode === "ltm" || mode === "other") return "ltm";
  return mode;
}

function getSummableModes(modeData: Record<string, ModeStats>) {
  return CANONICAL_GAME_MODES.filter((mode) => modeData[mode]);
}

function formatGameModeTitle(mode: string) {
  return formatGameMode(mode).toUpperCase();
}

function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("es-MX") : "—";
}

function formatPlacement(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `#${parsed.toLocaleString("es-MX")}` : "—";
}

function formatTournamentDate(value: number | string | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "fecha n/d";
  const millis = parsed > 10_000_000_000_000 ? parsed / 1000 : parsed;
  return new Date(millis).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getEventLabel(placement: TournamentPlacement) {
  const eventId = placement.eventId || "Torneo";
  return eventId
    .replace(/^epicgames_/i, "")
    .replace(/_/g, " ");
}

export default function OsirionDashboard({
  initialPlayer,
  initialDisplayName,
}: {
  initialPlayer?: string;
  initialDisplayName?: string;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingMsg, setLoadingMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [rankedData, setRankedData] = useState<RankedData | null>(null);
  const [tournamentData, setTournamentData] = useState<TournamentPlacementsData | null>(null);
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const [tournamentsError, setTournamentsError] = useState("");
  const [currentTimeframe, setCurrentTimeframe] = useState<"season" | "lifetime">("season");
  const [showRawJson, setShowRawJson] = useState(false);
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = window.localStorage.getItem("fortnite-search-history");
    if (!saved) return [];
    try {
      return JSON.parse(saved);
    } catch {
      return [];
    }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [selectedInputMethod, setSelectedInputMethod] = useState<InputMethod | "all">("all");
  const [selectedGameMode, setSelectedGameMode] = useState<GameMode | "all">("all");
  const [activeTab, setActiveTab] = useState<"overview" | "modes" | "ranked" | "tournaments" | "progreso">("overview");
  const [progressData, setProgressData] = useState<any[]>([]);
  const [rankedMode, setRankedMode] = useState<"br" | "reload">("br");

  const fetchStats = useCallback(async (accountId: string, displayName: string, timeframe: "season" | "lifetime") => {
    setLoadingMsg("obteniendo estadisticas...");
    setIsLoading(true);
    setStatsData(null);
    setRankedData(null);
    setTournamentData(null);
    setTournamentsError("");
    setTournamentsLoading(true);

    try {
      const statsRes = await fetch(`/api/osirion?action=stats&accountId=${encodeURIComponent(accountId)}&timeframe=${timeframe}`);
      if (!statsRes.ok) throw new Error(`error en stats ${timeframe}: ${statsRes.status}`);
      const statsJson: StatsData = await statsRes.json();
      if (!statsJson.groupedStats) throw new Error("osirion no devolvio estadisticas.");
      setStatsData({ ...statsJson, success: true, source: "osirion" });

      const rankedRes = await fetch(`/api/osirion?action=ranked-current&accountId=${encodeURIComponent(accountId)}`);
      let rankedJson: RankedData = { success: false, rank: null };
      if (rankedRes.ok) {
        const rankedParsed = await rankedRes.json();
        if (rankedParsed?.success) rankedJson = rankedParsed;
      }

      setRankedData(rankedJson);

      try {
        const tournamentRes = await fetch(`/api/osirion?action=player-tournament-placements&accountId=${encodeURIComponent(accountId)}&limit=12`);
        if (!tournamentRes.ok) throw new Error(`error en torneos: ${tournamentRes.status}`);
        const tournamentJson: TournamentPlacementsData = await tournamentRes.json();
        setTournamentData(tournamentJson);
      } catch (err) {
        console.warn("No se pudieron obtener los torneos del jugador:", err);
        setTournamentsError(getErrorMessage(err).toLowerCase());
        setTournamentData({ success: false, placements: [] });
      } finally {
        setTournamentsLoading(false);
      }

      // Fetch progress (ETL analysis — llama directo a fortnite-api.com)
      try {
        const progRes = await fetch(`/api/player/analysis/${encodeURIComponent(accountId)}`);
        if (progRes.ok) {
          const progJson = await progRes.json();
          if (progJson.success) setProgressData(progJson.progress);
        }
      } catch (err) {
        console.warn("No se pudo obtener el análisis ETL:", err);
      }
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err).toLowerCase());
      setTournamentsLoading(false);
    } finally {
      setIsLoading(false);
      setLoadingMsg("");
    }
  }, []);

  const handleSearch = async (e: React.FormEvent, overrideQuery?: string, overrideDisplayName?: string) => {
    e.preventDefault();
    const query = (overrideQuery || searchInput).trim();
    if (!query) return;

    setErrorMsg("");
    setLoadingMsg("");
    setIsLoading(true);
    setStatsData(null);
    setRankedData(null);
    setTournamentData(null);
    setTournamentsError("");
    setShowHistory(false);

    try {
      let accountId = query;
      let displayName = overrideDisplayName || query;

      if (query.length !== 32 || !/^[0-9a-f]+$/i.test(query)) {
        setLoadingMsg("resolviendo usuario...");
        const lookupRes = await fetch(`/api/osirion?action=lookup&displayName=${encodeURIComponent(query)}`);

        if (lookupRes.status === 404) throw new Error(`jugador "${query}" no encontrado.`);
        if (!lookupRes.ok) throw new Error(`error en lookup: ${lookupRes.status}`);

        const lookupJson = await lookupRes.json();
        if (!lookupJson.success || !lookupJson.accountId) throw new Error(`no se resolvio el id para "${query}".`);
        accountId = lookupJson.accountId;
        displayName = lookupJson.displayName || overrideDisplayName || query;
      }

      setCurrentAccountId(accountId);
      setCurrentDisplayName(displayName);

      const newHistory: SearchHistory = {
        accountId,
        displayName,
        timestamp: new Date().getTime(),
      };
      const updatedHistory = [newHistory, ...searchHistory.filter(h => h.accountId !== accountId)].slice(0, 10);
      setSearchHistory(updatedHistory);
      localStorage.setItem("fortnite-search-history", JSON.stringify(updatedHistory));

      await fetchStats(accountId, displayName, currentTimeframe);
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (message === "Failed to fetch") {
        setErrorMsg("error de red. asegurate de que el servidor este corriendo.");
      } else {
        setErrorMsg(message.toLowerCase());
      }
    } finally {
      setIsLoading(false);
      setLoadingMsg("");
    }
  };

  const handleSearchRef = useRef(handleSearch);
  handleSearchRef.current = handleSearch;

  const searchFromHistory = (displayName: string) => {
    setSearchInput(displayName);
    void handleSearch({ preventDefault: () => undefined } as React.FormEvent, displayName);
  };

  useEffect(() => {
    if (!initialPlayer || initialPlayer === currentAccountId) return;
    setSearchInput(initialDisplayName || initialPlayer);
    const timeout = window.setTimeout(() => {
      void handleSearchRef.current({ preventDefault: () => undefined } as React.FormEvent, initialPlayer, initialDisplayName);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [initialPlayer, initialDisplayName, currentAccountId]);

  const setTimeframe = async (tf: "season" | "lifetime") => {
    if (currentTimeframe === tf) return;
    if (!currentAccountId || !currentDisplayName) return;
    setCurrentTimeframe(tf);
    await fetchStats(currentAccountId, currentDisplayName, tf);
  };

  const clearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem("fortnite-search-history");
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        document.getElementById("searchInput")?.focus();
      }
      if (e.key === "Escape") {
        setShowHistory(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const availableInputMethods = useMemo(() => {
    if (!statsData?.groupedStats) return [];
    return Object.keys(statsData.groupedStats);
  }, [statsData]);

  const availableGameModes = useMemo(() => {
    if (!statsData?.groupedStats) return [];
    const methods = selectedInputMethod === "all"
      ? Object.keys(statsData.groupedStats)
      : [selectedInputMethod];
    const modes = new Set<string>();
    for (const method of methods) {
      for (const mode of getSummableModes(statsData.groupedStats[method] || {})) {
        modes.add(mode);
      }
    }
    return Array.from(modes);
  }, [statsData, selectedInputMethod]);

  const filteredStats = useMemo(() => {
    if (!statsData?.groupedStats) return null;

    let totalKills = 0;
    let totalMatches = 0;
    let totalWins = 0;
    let totalMinutes = 0;
    let totalScore = 0;
    let top5 = 0;
    let top12 = 0;
    let top3 = 0;
    let top6 = 0;
    let top10 = 0;
    let top25 = 0;
    let top2 = 0;

    const methods = selectedInputMethod === "all"
      ? (statsData.groupedStats.all ? ["all"] : Object.keys(statsData.groupedStats))
      : [selectedInputMethod];

    for (const method of methods) {
      const modeData = statsData.groupedStats[method] || {};
      const modes = selectedGameMode === "all"
        ? (modeData.overall ? ["overall"] : getSummableModes(modeData))
        : [selectedGameMode];

      for (const mode of modes) {
        const m = modeData[mode];
        if (!m) continue;
        totalKills += m.kills || 0;
        totalMatches += m.matchesplayed || 0;
        totalWins += m.placetop1 || 0;
        totalMinutes += m.minutesplayed || 0;
        totalScore += m.score || 0;
        top5 += m.placetop5 || 0;
        top12 += m.placetop12 || 0;
        top3 += m.placetop3 || 0;
        top6 += m.placetop6 || 0;
        top10 += m.placetop10 || 0;
        top25 += m.placetop25 || 0;
        top2 += m.placetop2 || 0;
      }
    }

    const rankLabel = formatCurrentRank(rankedData?.rank || null);
    const kdRatio = totalMatches > 0 && totalMatches - totalWins > 0
      ? (totalKills / (totalMatches - totalWins)).toFixed(2)
      : "—";
    const winRate = totalMatches > 0
      ? ((totalWins / totalMatches) * 100).toFixed(1) + "%"
      : "0%";
    const avgKills = totalMatches > 0 ? (totalKills / totalMatches).toFixed(1) : "0";
    const hours = (totalMinutes / 60).toFixed(1);
    const avgScore = totalMatches > 0 ? Math.round(totalScore / totalMatches) : 0;
    const avgMinutes = totalMatches > 0 ? (totalMinutes / totalMatches).toFixed(1) : "0";

    return {
      rankLabel,
      kdRatio,
      winRate,
      totalKills,
      totalMatches,
      totalWins,
      totalMinutes,
      totalScore,
      top5,
      top12,
      top3,
      top6,
      top10,
      top25,
      top2,
      avgKills,
      hours,
      avgScore,
      avgMinutes,
    };
  }, [statsData, rankedData, selectedInputMethod, selectedGameMode]);

  const modeBreakdown = useMemo(() => {
    if (!statsData?.groupedStats) return [];

    const breakdown: Array<{
      method: string;
      mode: string;
      stats: ModeStats;
    }> = [];

    for (const [method, modes] of Object.entries(statsData.groupedStats)) {
      for (const [mode, stats] of Object.entries(modes)) {
        if (!CANONICAL_GAME_MODES.includes(mode as (typeof CANONICAL_GAME_MODES)[number])) {
          continue;
        }
        breakdown.push({ method, mode, stats });
      }
    }

    return breakdown;
  }, [statsData]);

  const tournamentPlacements = useMemo(() => {
    return (tournamentData?.placements || [])
      .filter((placement) => !placement.error)
      .sort((a, b) => {
        const endA = Number(a.endTime || a.startTime || 0);
        const endB = Number(b.endTime || b.startTime || 0);
        return endB - endA;
      });
  }, [tournamentData]);

  const tournamentSummary = useMemo(() => {
    const rankedPlacements = tournamentPlacements
      .map((placement) => Number(placement.placement))
      .filter((placement) => Number.isFinite(placement) && placement > 0);

    const points = tournamentPlacements
      .map((placement) => Number(placement.points))
      .filter((value) => Number.isFinite(value));

    return {
      events: tournamentPlacements.length,
      best: rankedPlacements.length ? Math.min(...rankedPlacements) : null,
      average: rankedPlacements.length
        ? Math.round(rankedPlacements.reduce((sum, placement) => sum + placement, 0) / rankedPlacements.length)
        : null,
      top100: rankedPlacements.filter((placement) => placement <= 100).length,
      top1000: rankedPlacements.filter((placement) => placement <= 1000).length,
      avgPoints: points.length
        ? Math.round(points.reduce((sum, value) => sum + value, 0) / points.length)
        : null,
    };
  }, [tournamentPlacements]);

  const sourceLabel = statsData?.source === "tracker"
    ? "fortnite tracker"
    : statsData?.source === "fortnite-api"
      ? "fortnite-api"
      : "osirion";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-miyu-border bg-miyu-bg/90 backdrop-blur">
        <div className="flex h-[74px] items-center justify-between gap-4 px-5 lg:px-8">
          <LinklessMobileNav />
          <form onSubmit={(e) => handleSearch(e)} className="relative w-full max-w-[390px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-miyu-text" />
            <input
              id="searchInput"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onFocus={() => searchHistory.length > 0 && setShowHistory(true)}
              placeholder="Buscar jugador..."
              className="h-11 w-full rounded-md border border-miyu-border bg-white/35 px-11 pr-12 text-sm text-miyu-text outline-none transition-colors placeholder:text-miyu-text-muted focus:border-miyu-text"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded border border-miyu-border bg-miyu-btn text-miyu-text transition-colors hover:bg-miyu-btn-hover"
              aria-label="Buscar jugador"
            >
              <Search className="h-4 w-4" />
            </button>
            {showHistory && searchHistory.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-md border border-miyu-border bg-miyu-surface shadow-lg">
                <div className="flex items-center justify-between border-b border-miyu-border px-3 py-2">
                  <span className="font-mono text-xs text-miyu-text-muted">busquedas recientes</span>
                  <button type="button" onClick={clearHistory} className="rounded bg-miyu-btn px-2 py-1 font-mono text-xs text-miyu-text hover:bg-miyu-btn-hover">
                    limpiar
                  </button>
                </div>
                {searchHistory.map((h) => (
                  <button
                    type="button"
                    key={h.accountId}
                    onClick={() => searchFromHistory(h.displayName)}
                    className="flex w-full items-center justify-between bg-miyu-btn px-3 py-2 text-left hover:bg-miyu-btn-hover"
                  >
                    <span className="font-mono text-sm text-miyu-text">{h.displayName}</span>
                    <span className="text-xs text-miyu-text-muted">{new Date(h.timestamp).toLocaleDateString("es-MX")}</span>
                  </button>
                ))}
              </div>
            )}
          </form>

          {currentDisplayName && (
            <div className="hidden items-center gap-2 text-sm font-medium text-miyu-text sm:flex">
              <span className="h-2 w-2 rounded-full bg-black dark:bg-miyu-accent" />
              <span>{currentDisplayName}</span>
            </div>
          )}
        </div>
      </header>

      <section className="px-5 py-6 lg:px-8">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-5 rounded-md border border-miyu-border bg-white/25 px-5 py-4">
            <div className="flex items-center gap-4 font-mono text-sm">
              <span>$</span>
              <span>{currentDisplayName || "Sin jugador seleccionado"}</span>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 font-mono text-xs text-red-600">
              {errorMsg}
            </div>
          )}
          {loadingMsg && (
            <div className="mb-4 font-mono text-xs text-miyu-text-muted animate-pulse">{loadingMsg}</div>
          )}

          {!filteredStats && !isLoading && (
            <div className="rounded-md border border-miyu-border bg-white/20 p-5">
              <h1 className="text-base font-bold tracking-tight">Busca un jugador</h1>
              <p className="mt-1 text-sm text-miyu-text-muted">
                Escribe un Epic ID o accountId para consultar estadisticas desde Osirion.
              </p>
            </div>
          )}

          {filteredStats && (
            <section>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-3">
                  <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>VISTA GENERAL</TabButton>
                  <TabButton active={activeTab === "modes"} onClick={() => setActiveTab("modes")}>POR MODOS</TabButton>
                  <TabButton active={activeTab === "ranked"} onClick={() => setActiveTab("ranked")}>RANKED</TabButton>
                  <TabButton active={activeTab === "tournaments"} onClick={() => setActiveTab("tournaments")}>TORNEOS</TabButton>
                  <TabButton active={activeTab === "progreso"} onClick={() => setActiveTab("progreso")}>MEJORA (ETL)</TabButton>
                </div>

                <div className="flex flex-wrap gap-3">
                  <SegmentButton active={currentTimeframe === "season"} onClick={() => setTimeframe("season")}>
                    TEMP ACTUAL
                  </SegmentButton>
                  <SegmentButton active={currentTimeframe === "lifetime"} onClick={() => setTimeframe("lifetime")}>
                    TODAS LAS TEMP
                  </SegmentButton>
                </div>
              </div>

              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="font-mono text-xs text-miyu-text-muted">
                  {statsData?.seasonLevels?.[0]?.level ? `[ nivel: ${statsData.seasonLevels[0].level} ] ` : ""}
                  [ {currentTimeframe === "season" ? "temporada actual" : "todas las temporadas"} ] [ {sourceLabel} ]
                </div>
              </div>

              {activeTab === "overview" && (
                <>
                  <div className="mb-5 grid rounded-md border border-miyu-border bg-white/20 lg:grid-cols-2">
                    <FilterGroup title="Metodo de entrada">
                      <SegmentButton active={selectedInputMethod === "all"} small onClick={() => setSelectedInputMethod("all")}>TODOS</SegmentButton>
                      {availableInputMethods.map((m) => (
                        <SegmentButton key={m} active={selectedInputMethod === m} small onClick={() => setSelectedInputMethod(m)}>
                          {formatInputMethod(m).toUpperCase()}
                        </SegmentButton>
                      ))}
                    </FilterGroup>
                    <FilterGroup title="Modo de juego">
                      <SegmentButton active={selectedGameMode === "all"} small onClick={() => setSelectedGameMode("all")}>TODOS</SegmentButton>
                      {availableGameModes.map((m) => (
                        <SegmentButton key={m} active={selectedGameMode === m} small onClick={() => setSelectedGameMode(m)}>
                          {formatGameMode(m).toUpperCase()}
                        </SegmentButton>
                      ))}
                    </FilterGroup>
                  </div>

                  <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <StatCard
                      label="Rango actual"
                      value={filteredStats.rankLabel.toUpperCase()}
                      icon={<RankIcon rank={filteredStats.rankLabel} size={46} />}
                      highlight
                    />
                    <StatCard label="K/D Ratio" value={filteredStats.kdRatio} />
                    <StatCard label="Win Rate" value={filteredStats.winRate} />
                    <StatCard label="Victorias" value={filteredStats.totalWins} />
                    <StatCard label="Partidas" value={filteredStats.totalMatches} />
                  </div>

                  <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MiniStat label="Kills promedio" value={filteredStats.avgKills} />
                    <MiniStat label="Score promedio" value={filteredStats.avgScore} />
                    <MiniStat label="Tiempo total" value={`${filteredStats.hours}h`} />
                    <MiniStat label="Score total" value={filteredStats.totalScore.toLocaleString("es-MX")} />
                  </div>

                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-mono text-sm font-bold uppercase tracking-wide">Metricas detalladas</h2>
                    <button
                      onClick={() => setShowRawJson((v) => !v)}
                      className="rounded bg-miyu-btn px-2 py-1 font-mono text-[10px] text-miyu-text hover:bg-miyu-btn-hover border border-miyu-border transition-colors"
                    >
                      {showRawJson ? "[ ocultar .json ]" : "[ ver .json ]"}
                    </button>
                  </div>

                  {showRawJson && (
                    <div className="mb-6 overflow-hidden rounded-md border border-miyu-border bg-black/80 p-4 font-mono text-[10px] text-emerald-400">
                      <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap">
                        {JSON.stringify(statsData, null, 2)}
                      </pre>
                    </div>
                  )}

                  <div className="grid gap-4 xl:grid-cols-2">
                    <DetailPanel>
                      <DetailBox title="Eliminaciones" subtitle={`${filteredStats.avgKills} avg por partida`} rightText={`${filteredStats.totalKills.toLocaleString("es-MX")} totales`} icon="target" />
                      <DetailBox title="Tiempo jugado" subtitle={`${filteredStats.avgMinutes} min avg por partida`} rightText={`${filteredStats.hours}h totales`} icon="clock" />
                      <DetailBox title="Top 3" subtitle={`${filteredStats.totalMatches > 0 ? ((filteredStats.top3 / filteredStats.totalMatches) * 100).toFixed(1) : 0}% de las partidas`} rightText={`${filteredStats.top3} totales`} icon="top3" />
                    </DetailPanel>
                    <DetailPanel>
                      <DetailBox title="Top 5" subtitle={`${filteredStats.totalMatches > 0 ? ((filteredStats.top5 / filteredStats.totalMatches) * 100).toFixed(1) : 0}% de las partidas`} rightText={`${filteredStats.top5} totales`} icon="top5" />
                      <DetailBox title="Top 10" subtitle={`${filteredStats.totalMatches > 0 ? ((filteredStats.top10 / filteredStats.totalMatches) * 100).toFixed(1) : 0}% de las partidas`} rightText={`${filteredStats.top10} totales`} icon="top10" />
                      <DetailBox title="Puntuacion" subtitle={`+${filteredStats.avgScore} xp avg`} rightText={`${filteredStats.totalScore.toLocaleString("es-MX")} pts totales`} icon="star" />
                    </DetailPanel>
                  </div>
                </>
              )}

          {activeTab === "tournaments" && (
            <div className="space-y-5">
              <div className="rounded-md border border-miyu-border bg-white/20 p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-mono text-lg font-bold uppercase tracking-tight">Torneos jugados</h3>
                    <p className="mt-1 text-sm text-miyu-text-muted">
                      Placements detectados por ventana de torneo usando Osirion.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-miyu-border bg-white/35 px-3 py-2 font-mono text-xs text-miyu-text-muted">
                    <Trophy className="h-4 w-4 text-miyu-text" />
                    {tournamentsLoading ? "cargando..." : `${tournamentSummary.events} resultados`}
                  </div>
                </div>

                {tournamentsError && (
                  <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 font-mono text-xs text-amber-700">
                    {tournamentsError}
                  </div>
                )}

                <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  <MiniStat label="Eventos" value={tournamentsLoading ? "..." : tournamentSummary.events} />
                  <MiniStat label="Mejor top" value={tournamentsLoading ? "..." : formatPlacement(tournamentSummary.best)} />
                  <MiniStat label="Promedio" value={tournamentsLoading ? "..." : formatPlacement(tournamentSummary.average)} />
                  <MiniStat label="Top 100" value={tournamentsLoading ? "..." : tournamentSummary.top100} />
                  <MiniStat label="Top 1000" value={tournamentsLoading ? "..." : tournamentSummary.top1000} />
                </div>

                {tournamentsLoading ? (
                  <div className="rounded-md border border-miyu-border bg-white/20 px-4 py-8 text-center font-mono text-xs uppercase tracking-widest text-miyu-text-muted animate-pulse">
                    Buscando historial competitivo...
                  </div>
                ) : tournamentPlacements.length > 0 ? (
                  <div className="overflow-hidden rounded-md border border-miyu-border">
                    <div className="grid grid-cols-[minmax(220px,1.6fr)_90px_90px_100px_110px] gap-3 border-b border-miyu-border bg-white/30 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-miyu-text-muted max-lg:hidden">
                      <span>Torneo</span>
                      <span>Top</span>
                      <span>Puntos</span>
                      <span>Kills</span>
                      <span>Fecha</span>
                    </div>
                    <div className="divide-y divide-miyu-border">
                      {tournamentPlacements.map((placement, index) => (
                        <div
                          key={`${placement.eventWindowId || placement.eventId || "tournament"}-${index}`}
                          className="grid gap-3 bg-white/10 px-4 py-4 hover:bg-white/25 lg:grid-cols-[minmax(220px,1.6fr)_90px_90px_100px_110px] lg:items-center"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-mono text-sm font-bold text-miyu-text">
                              {getEventLabel(placement)}
                            </div>
                            <div className="mt-1 truncate font-mono text-[10px] text-miyu-text-muted">
                              {placement.eventWindowId || "sin ventana"}
                            </div>
                          </div>
                          <TournamentCell label="Top" value={formatPlacement(placement.placement)} strong />
                          <TournamentCell label="Puntos" value={formatNumber(placement.points)} />
                          <TournamentCell label="Kills" value={formatNumber(placement.eliminations)} />
                          <TournamentCell label="Fecha" value={formatTournamentDate(placement.endTime || placement.startTime)} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-miyu-border bg-white/20 px-4 py-10 text-center">
                    <div className="font-mono text-sm text-miyu-text">sin torneos encontrados</div>
                    <div className="mt-2 text-xs text-miyu-text-muted">
                      No hay placements disponibles para este jugador en las ventanas consultadas.
                    </div>
                  </div>
                )}

                {tournamentSummary.avgPoints !== null && (
                  <div className="mt-4 font-mono text-xs text-miyu-text-muted">
                    promedio de puntos por torneo: <span className="font-bold text-miyu-text">{formatNumber(tournamentSummary.avgPoints)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "progreso" && (
            <div className="space-y-6">
               <div className="rounded-md border border-miyu-border bg-white/20 p-6">
                 <h3 className="text-lg font-bold mb-4 font-mono uppercase tracking-tighter">Análisis de Rendimiento</h3>
                 <p className="text-sm text-miyu-text-muted mb-8 max-w-2xl">
                   Análisis detallado usando datos de fortnite-api.com. Desglose por modo de juego, clasificación competitiva y predicción de tendencia.
                 </p>

                 {progressData.length > 0 ? (
                   <div className="space-y-6">
                      {/* ── Row 1: Classification + Predictions ── */}
                      <div className="grid gap-4 md:grid-cols-3">
                         {/* Skill Category — 6 tiers */}
                         {(() => {
                           const skillItem = progressData.find((m: any) => m.metric_name === 'skill_category');
                           if (!skillItem) return null;
                           const val = parseFloat(skillItem.metric_value);
                           const tier = skillItem.period_start || '';
                           const tiers: Record<number, { label: string; color: string; icon: string }> = {
                             0: { label: 'PRINCIPIANTE', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: '🌱' },
                             1: { label: 'CASUAL', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: '🎮' },
                             2: { label: 'INTERMEDIO', color: 'text-cyan-700 bg-cyan-50 border-cyan-200', icon: '⚡' },
                             3: { label: 'AVANZADO', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: '🔥' },
                             4: { label: 'COMPETITIVO', color: 'text-purple-700 bg-purple-50 border-purple-200', icon: '💎' },
                             5: { label: 'ELITE / PRO', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: '🏆' },
                           };
                           const t = tiers[val] || tiers[0];
                           return (
                             <div className={`p-4 rounded-xl border ${t.color} md:col-span-1`}>
                               <div className="flex items-center justify-between mb-2">
                                 <p className="text-[10px] uppercase font-bold tracking-widest opacity-70">Clasificación</p>
                                 {tier && <span className="text-xs font-bold font-mono opacity-60">Tier {tier}</span>}
                               </div>
                               <p className="text-lg font-bold font-mono flex items-center gap-2">
                                 <span>{t.icon}</span> {t.label}
                               </p>
                             </div>
                           );
                         })()}

                         {/* Predicted KD */}
                         {(() => {
                           const predKd = progressData.find((m: any) => m.metric_name === 'predicted_kd_next');
                           if (!predKd) return null;
                           return (
                             <div className="p-4 rounded-xl border border-miyu-border bg-white/40">
                               <p className="text-[10px] uppercase font-bold mb-2 tracking-widest text-miyu-text-muted">K/D Predicho</p>
                               <p className="text-lg font-bold font-mono text-miyu-text">
                                 {parseFloat(predKd.metric_value).toFixed(2)}
                               </p>
                               <p className={`text-[10px] font-bold font-mono mt-1 ${parseFloat(predKd.delta) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                 {parseFloat(predKd.delta) >= 0 ? '↑' : '↓'} {parseFloat(predKd.delta) >= 0 ? 'positiva' : 'negativa'}
                               </p>
                             </div>
                           );
                         })()}

                         {/* Predicted WR */}
                         {(() => {
                           const predWr = progressData.find((m: any) => m.metric_name === 'predicted_wr_next');
                           if (!predWr) return null;
                           return (
                             <div className="p-4 rounded-xl border border-miyu-border bg-white/40">
                               <p className="text-[10px] uppercase font-bold mb-2 tracking-widest text-miyu-text-muted">Win Rate Predicho</p>
                               <p className="text-lg font-bold font-mono text-miyu-text">
                                 {parseFloat(predWr.metric_value).toFixed(1)}%
                               </p>
                               <p className={`text-[10px] font-bold font-mono mt-1 ${parseFloat(predWr.delta) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                 {parseFloat(predWr.delta) >= 0 ? '↑' : '↓'} {parseFloat(predWr.delta) >= 0 ? 'positiva' : 'negativa'}
                               </p>
                             </div>
                           );
                         })()}
                      </div>

                      {/* ── Row 2: Per-Mode Bar Charts (KD + WR) ── */}
                      <div className="grid gap-6 md:grid-cols-2">
                         <div className="bg-white/40 border border-miyu-border rounded-xl p-6">
                            <h4 className="text-xs font-bold text-miyu-accent uppercase mb-4 tracking-widest">K/D por Modo de Juego</h4>
                            <div className="h-[220px]">
                               <ResponsiveContainer width="100%" height="100%">
                                  <ReBarChart data={progressData.filter((m: any) => m.metric_name === 'kd_season')} barGap={2}>
                                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dfd8cc" />
                                     <XAxis dataKey="period_start" fontSize={8} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={50} />
                                     <YAxis fontSize={9} tickLine={false} axisLine={false} domain={[0, 'auto']} />
                                     <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px', border: '1px solid #dfd8cc' }} />
                                     <Bar dataKey="metric_value" name="K/D" fill="#8d72dc" radius={[4, 4, 0, 0]} />
                                  </ReBarChart>
                               </ResponsiveContainer>
                            </div>
                         </div>

                         <div className="bg-white/40 border border-miyu-border rounded-xl p-6">
                            <h4 className="text-xs font-bold text-miyu-accent uppercase mb-4 tracking-widest">Win Rate por Modo de Juego</h4>
                            <div className="h-[220px]">
                               <ResponsiveContainer width="100%" height="100%">
                                  <ReBarChart data={progressData.filter((m: any) => m.metric_name === 'win_rate_season')} barGap={2}>
                                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dfd8cc" />
                                     <XAxis dataKey="period_start" fontSize={8} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={50} />
                                     <YAxis fontSize={9} tickLine={false} axisLine={false} domain={[0, 'auto']} />
                                     <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px', border: '1px solid #dfd8cc' }} />
                                     <Bar dataKey="metric_value" name="Win Rate %" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                  </ReBarChart>
                               </ResponsiveContainer>
                            </div>
                         </div>
                      </div>

                      {/* ── Row 3: Mode Detail Table ── */}
                      {(() => {
                        const details = progressData.filter((m: any) => m.metric_name === 'mode_detail');
                        if (!details.length) return null;
                        return (
                          <div className="bg-white/40 border border-miyu-border rounded-xl p-6">
                             <h4 className="text-xs font-bold text-miyu-accent uppercase mb-4 tracking-widest">Desglose Detallado por Modo</h4>
                             <div className="overflow-x-auto">
                                <table className="w-full text-xs font-mono">
                                   <thead>
                                      <tr className="border-b border-miyu-border text-left text-miyu-text-muted uppercase tracking-wider">
                                         <th className="py-2 pr-3">Modo</th>
                                         <th className="py-2 pr-3 text-right">K/D</th>
                                         <th className="py-2 pr-3 text-right">Win Rate</th>
                                         <th className="py-2 pr-3 text-right">Kills</th>
                                         <th className="py-2 pr-3 text-right">Wins</th>
                                         <th className="py-2 pr-3 text-right">Partidas</th>
                                         <th className="py-2 text-right">K/Partida</th>
                                      </tr>
                                   </thead>
                                   <tbody>
                                      {details.map((d: any, i: number) => (
                                        <tr key={i} className={`border-b border-miyu-border/30 ${d.period_start?.includes('Overall') ? 'font-bold bg-miyu-accent/5' : ''}`}>
                                           <td className="py-2.5 pr-3 text-miyu-text">{d.period_start}</td>
                                           <td className="py-2.5 pr-3 text-right font-bold">{parseFloat(d.metric_value).toFixed(2)}</td>
                                           <td className="py-2.5 pr-3 text-right">{parseFloat(d.delta).toFixed(1)}%</td>
                                           <td className="py-2.5 pr-3 text-right">{(d._extra?.kills || 0).toLocaleString()}</td>
                                           <td className="py-2.5 pr-3 text-right">{(d._extra?.wins || 0).toLocaleString()}</td>
                                           <td className="py-2.5 pr-3 text-right">{(d._extra?.matches || 0).toLocaleString()}</td>
                                           <td className="py-2.5 text-right">{(d._extra?.killsPerMatch || 0).toFixed(1)}</td>
                                        </tr>
                                      ))}
                                   </tbody>
                                </table>
                             </div>
                          </div>
                        );
                      })()}

                      {/* ── Row 4: Historical Snapshots (if any) ── */}
                      {(() => {
                        const snapshotKd = progressData.filter((m: any) => m.metric_name === 'snapshot_kd');
                        const snapshotWr = progressData.filter((m: any) => m.metric_name === 'snapshot_wr');
                        if (snapshotKd.length < 2) return null;
                        return (
                          <div className="grid gap-6 md:grid-cols-2">
                             <div className="bg-white/40 border border-miyu-border rounded-xl p-6">
                                <h4 className="text-xs font-bold text-miyu-accent uppercase mb-4 tracking-widest">Evolución K/D (Historial)</h4>
                                <div className="h-[180px]">
                                   <ResponsiveContainer width="100%" height="100%">
                                      <AreaChart data={snapshotKd}>
                                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dfd8cc" />
                                         <Area type="monotone" dataKey="metric_value" stroke="#8d72dc" fill="#8d72dc" fillOpacity={0.1} strokeWidth={2} />
                                         <XAxis dataKey="period_start" fontSize={9} tickLine={false} axisLine={false} />
                                         <YAxis fontSize={9} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                                         <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px', border: '1px solid #dfd8cc' }} />
                                      </AreaChart>
                                   </ResponsiveContainer>
                                </div>
                             </div>
                             <div className="bg-white/40 border border-miyu-border rounded-xl p-6">
                                <h4 className="text-xs font-bold text-miyu-accent uppercase mb-4 tracking-widest">Evolución Win Rate (Historial)</h4>
                                <div className="h-[180px]">
                                   <ResponsiveContainer width="100%" height="100%">
                                      <AreaChart data={snapshotWr}>
                                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dfd8cc" />
                                         <Area type="monotone" dataKey="metric_value" stroke="#22c55e" fill="#22c55e" fillOpacity={0.08} strokeWidth={2} />
                                         <XAxis dataKey="period_start" fontSize={9} tickLine={false} axisLine={false} />
                                         <YAxis fontSize={9} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                                         <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px', border: '1px solid #dfd8cc' }} />
                                      </AreaChart>
                                   </ResponsiveContainer>
                                </div>
                             </div>
                          </div>
                        );
                      })()}

                      {/* ── Row 5: Ranked History + Rank Prediction ── */}
                      {(() => {
                        const rankedBR = progressData.filter((m: any) => m.metric_name === 'ranked_history');
                        const rankedReload = progressData.filter((m: any) => m.metric_name === 'ranked_history_reload');
                        const ranked = rankedMode === 'br' ? rankedBR : rankedReload;
                        const rankPred = progressData.find((m: any) => m.metric_name === 'predicted_rank');
                        if (!rankedBR.length && !rankedReload.length) return null;

                        const RANK_LABELS: Record<number, string> = { 1: "Bronce", 2: "Plata", 3: "Oro", 4: "Platino", 5: "Diamante", 6: "Elite", 7: "Campeón", 8: "Unreal" };

                        return (
                          <div className="space-y-4">
                             {/* Toggle BR / Reload */}
                             <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setRankedMode('br')}
                                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${rankedMode === 'br' ? 'bg-miyu-accent text-white' : 'bg-white/40 border border-miyu-border text-miyu-text-muted hover:bg-white/60'}`}
                                >Battle Royale</button>
                                <button
                                  onClick={() => setRankedMode('reload')}
                                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${rankedMode === 'reload' ? 'bg-miyu-accent text-white' : 'bg-white/40 border border-miyu-border text-miyu-text-muted hover:bg-white/60'}`}
                                >Reload</button>
                             </div>

                             {ranked.length > 0 ? (
                               <div className="grid gap-4 md:grid-cols-3">
                                  {/* Ranked chart */}
                                  <div className="bg-white/40 border border-miyu-border rounded-xl p-6 md:col-span-2">
                                     <h4 className="text-xs font-bold text-miyu-accent uppercase mb-4 tracking-widest">
                                       Progresión de Rango — {rankedMode === 'br' ? 'Battle Royale' : 'Reload'}
                                     </h4>
                                     <div className="h-[220px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                           <ReBarChart data={ranked}>
                                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dfd8cc" />
                                              <XAxis dataKey="period_start" fontSize={9} tickLine={false} axisLine={false} />
                                              <YAxis fontSize={9} tickLine={false} axisLine={false} domain={[0, 8]} tickFormatter={(v: number) => RANK_LABELS[v] || ""} />
                                              <Tooltip
                                                contentStyle={{ fontSize: '10px', borderRadius: '8px', border: '1px solid #dfd8cc' }}
                                                formatter={(value: any, _name: any, props: any) => {
                                                  const d = props.payload;
                                                  return [`${d._extra?.highestRank || RANK_LABELS[value as number] || value}${d._extra?.globalRanking ? ` (#${d._extra.globalRanking})` : ''}`, 'Rango Más Alto'];
                                                }}
                                              />
                                              <Bar dataKey="metric_value" name="Rango" radius={[4, 4, 0, 0]}
                                                fill={rankedMode === 'br' ? '#8d72dc' : '#e67e22'}
                                              />
                                           </ReBarChart>
                                        </ResponsiveContainer>
                                     </div>
                                     {/* Rank legend */}
                                     <div className="flex flex-wrap gap-2 mt-3">
                                        {ranked.map((r: any, i: number) => (
                                          <span key={i} className="text-[9px] font-mono px-2 py-0.5 rounded border border-miyu-border/50 bg-white/60">
                                            {r.period_start}: <span className="font-bold">{r._extra?.highestRank || r._extra?.currentRank}</span>
                                            {r._extra?.globalRanking ? ` #${r._extra.globalRanking}` : ''}
                                          </span>
                                        ))}
                                     </div>
                                  </div>

                                  {/* Rank prediction + summary */}
                                  <div className="space-y-4">
                                     {rankPred && rankedMode === 'br' && (
                                       <div className="p-4 rounded-xl border border-purple-200 bg-purple-50">
                                          <p className="text-[10px] uppercase font-bold mb-2 tracking-widest text-purple-600">Rango Predicho (Próx. Temp)</p>
                                          <p className="text-xl font-bold font-mono text-purple-800">{rankPred.period_start}</p>
                                          <div className="mt-2 flex items-center gap-1.5">
                                             <span className={`inline-block w-1.5 h-1.5 rounded-full ${rankPred._extra?.confidence === 'alta' ? 'bg-emerald-500' : rankPred._extra?.confidence === 'media' ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                                             <span className="text-[10px] font-mono text-purple-600">Confianza: {rankPred._extra?.confidence}</span>
                                          </div>
                                          <p className="text-[10px] text-purple-700 mt-2 leading-relaxed">{rankPred._extra?.reasoning}</p>
                                       </div>
                                     )}
                                     <div className="p-4 rounded-xl border border-miyu-border bg-white/40">
                                        <p className="text-[10px] uppercase font-bold mb-1 tracking-widest text-miyu-text-muted">Temporadas Registradas</p>
                                        <p className="text-2xl font-bold font-mono">{ranked.length}</p>
                                        <p className="text-[10px] text-miyu-text-muted mt-1">
                                          Último: <span className="font-bold">{ranked[ranked.length - 1]._extra?.highestRank || ranked[ranked.length - 1]._extra?.currentRank}</span>
                                        </p>
                                     </div>
                                  </div>
                               </div>
                             ) : (
                               <div className="p-6 rounded-xl border border-miyu-border/50 bg-white/20 text-center">
                                  <p className="text-xs text-miyu-text-muted font-mono">No hay datos de ranked {rankedMode === 'br' ? 'Battle Royale' : 'Reload'} para este jugador.</p>
                               </div>
                             )}
                          </div>
                        );
                      })()}
                   </div>
                 ) : (
                   <div className="flex flex-col items-center justify-center py-20 text-center">
                      <Clock3 className="w-12 h-12 text-miyu-border mb-4" />
                      <p className="text-miyu-text-muted text-sm font-mono uppercase tracking-widest">Cargando análisis...</p>
                      <p className="text-xs text-miyu-text-muted mt-2 max-w-xs">
                        Busca un jugador para obtener su análisis de rendimiento detallado.
                      </p>
                   </div>
                 )}
               </div>
            </div>
          )}

          {activeTab === "modes" && (
            <div className="space-y-4">
              <div className="text-xs text-miyu-text-muted font-mono mb-4">
                {modeBreakdown.length} combinaciones de modo/metodo encontradas
              </div>
              {modeBreakdown.map(({ method, mode, stats }) => {
                const kills = stats.kills || 0;
                const matches = stats.matchesplayed || 0;
                const wins = stats.placetop1 || 0;
                const kd = matches > 0 && matches - wins > 0
                  ? (kills / (matches - wins)).toFixed(2)
                  : "—";
                const wr = matches > 0
                  ? ((wins / matches) * 100).toFixed(1) + "%"
                  : "0%";

                return (
                  <div
                    key={`${method}-${mode}`}
                    className="border border-miyu-border rounded-lg p-4 hover:bg-miyu-surface transition-colors"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-bold text-sm text-miyu-text font-mono uppercase">
                          {formatGameModeTitle(mode)}
                        </div>
                        <div className="text-xs text-miyu-text-muted font-mono">
                          {formatInputMethod(method)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-miyu-text font-mono">{kills}</div>
                        <div className="text-xs text-miyu-text-muted">kills</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-xs">
                      <div>
                        <div className="text-miyu-text-muted">partidas</div>
                        <div className="font-bold font-mono">{matches}</div>
                      </div>
                      <div>
                        <div className="text-miyu-text-muted">victorias</div>
                        <div className="font-bold font-mono">{wins}</div>
                      </div>
                      <div>
                        <div className="text-miyu-text-muted">k/d</div>
                        <div className="font-bold font-mono">{kd}</div>
                      </div>
                      <div>
                        <div className="text-miyu-text-muted">win rate</div>
                        <div className="font-bold font-mono">{wr}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <div className="text-miyu-text-muted">top 5</div>
                        <div className="font-bold font-mono">{stats.placetop5 || 0}</div>
                      </div>
                      <div>
                        <div className="text-miyu-text-muted">top 10</div>
                        <div className="font-bold font-mono">{stats.placetop10 || 0}</div>
                      </div>
                      <div>
                        <div className="text-miyu-text-muted">score</div>
                        <div className="font-bold font-mono">{stats.score || 0}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "ranked" && (
            <div className="space-y-6">
              {rankedData?.rank ? (
                <>
                  <div className="border-2 border-miyu-text rounded-lg p-6 bg-miyu-surface">
                    <div className="text-xs text-miyu-text-muted font-mono mb-2">rango actual</div>
                    <div className="mb-2 flex items-center gap-4">
                      <RankIcon rank={formatCurrentRank(rankedData.rank)} size={58} />
                      <div className="text-3xl font-bold text-miyu-text font-mono">
                        {formatCurrentRank(rankedData.rank)}
                      </div>
                    </div>
                    <div className="text-xs text-miyu-text-muted font-mono">
                      {rankedData.rank.rankingType}
                    </div>
                    {rankedData.rank.promotionProgress !== undefined && Number.isInteger(rankedData.rank.promotionProgress) && (
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-miyu-text-muted mb-1">
                          <span>progreso de promocion</span>
                          <span>{rankedData.rank.promotionProgress}%</span>
                        </div>
                        <div className="w-full bg-miyu-border rounded-full h-2">
                          <div
                            className="bg-miyu-accent h-2 rounded-full transition-all"
                            style={{ width: `${rankedData.rank.promotionProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {rankedData.ranks && rankedData.ranks.length > 0 && (
                    <div>
                      <div className="mb-3 font-mono text-sm font-bold uppercase tracking-wide">Historial de rangos</div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {rankedData.ranks.map((mode) => {
                          const currentName = mode.currentDivision?.divisionName || "Sin rango";
                          const highestName = mode.highestDivision?.divisionName || "Sin rango";
                          const isCurrent = mode.rankingType === rankedData.rank?.rankingType;
                          return (
                            <div
                              key={mode.rankingType}
                              className={`rounded-lg border p-4 transition-colors ${isCurrent ? "border-miyu-text bg-miyu-surface" : "border-miyu-border bg-white/20 hover:bg-miyu-surface"}`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-mono text-xs font-bold uppercase text-miyu-text">{mode.rankingType}</span>
                                {isCurrent && <span className="rounded bg-miyu-text px-2 py-0.5 font-mono text-[10px] text-white">ACTUAL</span>}
                              </div>
                              <div className="flex items-center gap-3 mb-3">
                                <RankIcon rank={currentName} size={32} />
                                <div>
                                  <div className="font-mono text-sm font-bold text-miyu-text">{currentName}</div>
                                  <div className="font-mono text-[10px] text-miyu-text-muted">actual</div>
                                </div>
                              </div>
                              <div className="border-t border-miyu-border pt-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-[10px] text-miyu-text-muted">maximo alcanzado</span>
                                  <span className="font-mono text-xs font-bold text-miyu-text">{highestName}</span>
                                </div>
                                {mode.promotionProgress !== undefined && Number.isInteger(mode.promotionProgress) && (
                                  <div className="mt-2">
                                    <div className="flex justify-between font-mono text-[10px] text-miyu-text-muted mb-0.5">
                                      <span>progreso</span>
                                      <span>{mode.promotionProgress}%</span>
                                    </div>
                                    <div className="w-full bg-miyu-border rounded-full h-1.5">
                                      <div
                                        className="bg-miyu-accent h-1.5 rounded-full transition-all"
                                        style={{ width: `${mode.promotionProgress}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 border border-miyu-border rounded-lg">
                  <div className="text-miyu-text-muted font-mono text-sm">sin datos de ranked</div>
                  <div className="text-xs text-miyu-text-muted mt-2">el jugador no ha participado en ranked esta temporada</div>
                </div>
              )}
            </div>
          )}

          <div className="flex-1" />
        </section>
      )}
        </div>
      </section>

    </div>
  );
}

function LinklessMobileNav() {
  const items = [
    { href: "/dashboard/player", label: "Personas", icon: Users },
    { href: "/dashboard/compare", label: "Comparar", icon: BarChart3 },
    { href: "/dashboard/tournaments", label: "Torneos", icon: Trophy },
    { href: "/dashboard/shop", label: "Tienda", icon: ShoppingBag },
  ];

  return (
    <nav className="flex items-center gap-1 lg:hidden" aria-label="Dashboard movil">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-miyu-border bg-white/25 text-miyu-text"
            aria-label={item.label}
          >
            <Icon className="h-4 w-4" />
          </Link>
        );
      })}
    </nav>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-1 pb-4 font-mono text-sm font-bold transition-all ${
        active
          ? "border-miyu-text text-miyu-text"
          : "border-transparent text-miyu-text-muted hover:border-miyu-border hover:text-miyu-text"
      }`}
    >
      {children}
    </button>
  );
}

function SegmentButton({
  active,
  children,
  onClick,
  small = false,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border font-mono text-xs font-bold transition-colors ${
        small ? "px-4 py-2" : "px-5 py-2.5"
      } ${
        active
          ? "border-miyu-text bg-miyu-btn text-miyu-text"
          : "border-miyu-border bg-miyu-btn text-miyu-text hover:bg-miyu-btn-hover"
      }`}
    >
      {children}
    </button>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-miyu-border p-4 lg:border-b-0 lg:border-r last:lg:border-r-0">
      <p className="mb-3 font-mono text-xs uppercase tracking-wide text-miyu-text-muted">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function DetailPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-miyu-border bg-white/20">
      {children}
    </div>
  );
}

function RankIcon({ rank, size = 40 }: { rank: string; size?: number }) {
  const positions: Record<string, { row: number; col: number; label: string }> = {
    bronze: { row: 1, col: 0, label: "Bronze" },
    silver: { row: 1, col: 1, label: "Silver" },
    gold: { row: 1, col: 2, label: "Gold" },
    platinum: { row: 1, col: 3, label: "Platinum" },
    diamond: { row: 2, col: 0, label: "Diamond" },
    elite: { row: 0, col: 1, label: "Elite" },
    champion: { row: 0, col: 2, label: "Champion" },
    unreal: { row: 0, col: 3, label: "Unreal" },
  };
  const key = getRankIconKey(rank);
  if (!key) return null;

  const icon = positions[key];

  return (
    <span
      className="inline-block shrink-0 bg-no-repeat"
      role="img"
      aria-label={`Rango ${icon.label}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${RANK_ICON_SPRITE})`,
        backgroundSize: `${size * 4}px ${size * 5}px`,
        backgroundPosition: `-${icon.col * size}px -${icon.row * size}px`,
      }}
    />
  );
}

function getRankIconKey(rank: string) {
  const aliases: Record<string, string> = {
    bronze: "bronze",
    bronce: "bronze",
    silver: "silver",
    plata: "silver",
    gold: "gold",
    oro: "gold",
    platinum: "platinum",
    platino: "platinum",
    diamond: "diamond",
    diamante: "diamond",
    elite: "elite",
    champion: "champion",
    campeon: "champion",
    as: "champion",
    ace: "champion",
    unreal: "unreal",
  };
  const rankName = normalizeRankName(rank);
  const tokens = rankName.split(/[^a-z0-9]+/).filter(Boolean);
  const tokenMatch = tokens.map((token) => aliases[token]).find(Boolean);
  if (tokenMatch) return tokenMatch;

  return Object.entries(aliases).find(([alias]) => alias.length > 2 && rankName.includes(alias))?.[1] || null;
}

function normalizeRankName(rank: string) {
  return rank
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function ProgressCircle({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: any = {
    emerald: "text-emerald-600 bg-emerald-50",
    blue: "text-blue-600 bg-blue-50",
    purple: "text-miyu-accent bg-miyu-accent-light",
  };
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-mono text-miyu-text-muted">{label}</span>
      <span className={`px-2 py-1 rounded-full text-xs font-bold font-mono ${colorMap[color] || colorMap.purple}`}>
        {value}
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  icon,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className={`min-h-[78px] rounded-md border bg-white/20 p-5 ${highlight ? "border-miyu-border" : "border-miyu-border"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-2xl font-bold leading-none text-miyu-text">{value}</div>
        {icon}
      </div>
      <div className="mt-2 font-mono text-xs uppercase tracking-wide text-miyu-text-muted">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-miyu-border bg-white/20 p-5">
      <div className="mb-2 font-mono text-xs uppercase tracking-wide text-miyu-text-muted">{label}</div>
      <div className="font-mono text-lg font-bold text-miyu-text">{value}</div>
    </div>
  );
}

function TournamentCell({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 lg:block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-miyu-text-muted lg:hidden">{label}</span>
      <span className={`font-mono text-sm ${strong ? "font-bold text-miyu-text" : "font-medium text-miyu-text"}`}>
        {value}
      </span>
    </div>
  );
}

function DetailBox({ title, subtitle, rightText, icon }: { title: string; subtitle: string; rightText: string; icon?: string }) {
  const iconSvg = (type?: string) => {
    switch (type) {
      case "target":
        return <Target className="h-6 w-6 text-miyu-text" />;
      case "clock":
        return <Clock3 className="h-6 w-6 text-miyu-text" />;
      case "top3":
        return <Trophy className="h-6 w-6 text-miyu-text" />;
      case "top5":
        return <MedalIcon />;
      case "top10":
        return <BarChart3 className="h-6 w-6 text-miyu-text" />;
      case "star":
        return <Star className="h-6 w-6 text-miyu-text" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 border-b border-miyu-border px-5 py-4 text-sm last:border-b-0">
      <div className="flex items-center gap-5">
        {icon && iconSvg(icon)}
        <div>
          <strong className="font-mono text-sm uppercase tracking-wide text-miyu-text">{title}</strong>
          <div className="mt-1 font-mono text-xs text-miyu-text-muted">{subtitle}</div>
        </div>
      </div>
      <div className="text-right font-mono text-sm font-bold text-miyu-text">{rightText}</div>
    </div>
  );
}

function MedalIcon() {
  return (
    <svg className="h-6 w-6 text-miyu-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="5" />
      <path d="M8.5 12.5 7 22l5-3 5 3-1.5-9.5" />
    </svg>
  );
}

function formatCurrentRank(rank: RankedData["rank"] | undefined) {
  if (!rank) return "sin rank";

  const division = rank.currentDivision;
  if (!division) return "sin rank";

  const divisionName = typeof division === "string" ? division : division.divisionName;
  if (!divisionName) return "sin rank";

  if (divisionName.toLowerCase() === "unreal" && Number.isInteger(rank.currentPlayerRanking)) {
    return `unreal #${rank.currentPlayerRanking}`;
  }
  if (rank.promotionProgress !== undefined && Number.isInteger(rank.promotionProgress)) {
    return `${divisionName} (${rank.promotionProgress}%)`;
  }
  return divisionName;
}
