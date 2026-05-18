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

interface RankedData {
  success: boolean;
  rank: {
    rankingType: string;
    rankingTrackId: string;
    lastUpdatedAt?: string;
    currentDivision: { divisionName: string } | string | null;
    promotionProgress: number;
    currentPlayerRanking: number;
  } | null;
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
  const [activeTab, setActiveTab] = useState<"overview" | "modes" | "ranked">("overview");
  const initialSearchDone = useRef(false);

  const fetchStats = useCallback(async (accountId: string, displayName: string, timeframe: "season" | "lifetime") => {
    setLoadingMsg("obteniendo estadisticas...");
    setIsLoading(true);
    setStatsData(null);
    setRankedData(null);

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
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err).toLowerCase());
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

  const searchFromHistory = (displayName: string) => {
    setSearchInput(displayName);
    void handleSearch({ preventDefault: () => undefined } as React.FormEvent, displayName);
  };

  useEffect(() => {
    if (!initialPlayer || initialSearchDone.current) return;
    initialSearchDone.current = true;
    setSearchInput(initialDisplayName || initialPlayer);
    const timeout = window.setTimeout(() => {
      void handleSearch({ preventDefault: () => undefined } as React.FormEvent, initialPlayer, initialDisplayName);
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPlayer, initialDisplayName]);

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
                  <SegmentButton active={currentTimeframe === "season"} onClick={() => setTimeframe("season")}>
                    TEMP ACTUAL
                  </SegmentButton>
                  <SegmentButton active={currentTimeframe === "lifetime"} onClick={() => setTimeframe("lifetime")}>
                    TODAS LAS TEMP
                  </SegmentButton>
                </div>

                <div className="font-mono text-xs text-miyu-text-muted">
                  {statsData?.seasonLevels?.[0]?.level ? `[ nivel: ${statsData.seasonLevels[0].level} ] ` : ""}
                  [ {currentTimeframe === "season" ? "temporada actual" : "todas las temporadas"} ] [ {sourceLabel} ]
                </div>
              </div>

              <div className="mb-6 flex gap-8 border-b border-miyu-border">
                {(["overview", "modes", "ranked"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-t-md border-b-2 bg-miyu-btn px-4 py-3 text-xs font-bold uppercase tracking-wide transition-colors hover:bg-miyu-btn-hover ${
                      activeTab === tab
                        ? "border-miyu-text text-miyu-text"
                        : "border-transparent text-miyu-text-muted hover:text-miyu-text"
                    }`}
                  >
                    {tab === "overview" ? "General" : tab === "modes" ? "Modos" : "Ranked"}
                  </button>
                ))}
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
                    <button onClick={() => setShowRawJson((v) => !v)} className="rounded bg-miyu-btn px-2 py-1 font-mono text-xs text-miyu-text hover:bg-miyu-btn-hover">
                      [ver .json]
                    </button>
                  </div>

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

                  {showRawJson && (
                    <div className="mt-6 max-h-96 overflow-auto rounded-md border border-miyu-border bg-white/40 p-4">
                      <pre className="font-mono text-xs text-miyu-text-muted">
                        {JSON.stringify({ stats: statsData, ranked: rankedData }, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-miyu-border rounded-lg p-4">
                      <div className="text-xs text-miyu-text-muted font-mono mb-1">tipo de ranking</div>
                      <div className="text-sm font-bold text-miyu-text font-mono">{rankedData.rank.rankingType}</div>
                    </div>
                    <div className="border border-miyu-border rounded-lg p-4">
                      <div className="text-xs text-miyu-text-muted font-mono mb-1">track</div>
                      <div className="text-sm font-bold text-miyu-text font-mono break-all">{rankedData.rank.rankingTrackId}</div>
                    </div>
                  </div>

                  {rankedData.rank.lastUpdatedAt && (
                    <div className="text-xs text-miyu-text-muted font-mono">
                      ultima actualizacion: {new Date(rankedData.rank.lastUpdatedAt).toLocaleString("es-MX")}
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
  const rankName = rank.toLowerCase();
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
  const key = Object.keys(positions).find((name) => rankName.includes(name));
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
