"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

const ASCII_ART = `▒▒▒▒         ▒▒▒▒
 ▒▒▒▒▒▒▒░░░░░░▒▒▒▒
  ▒▒░░░▒▒▒░░▒▒▒░▒▒
  ▒▒▓▒▓▒░░░░▒▒▓█▓▒
 ▒░▒▓▓▓▒▒▒░░░▒▒▓▓▒▒
 ░▒▒░░░░░░▒▒▒▒▒▒▒▒▒
 ░░▒▒▒░░░▒▓▓▓▓▓▓▒▒▒
 ░░░▒░░░░░▒▓▓█▓▒▒▒▒
░░░░░░▒▒▒▒▒▓▓▓▓▓▓▓▒▒
░░░░░░░▒▒▓▓▓▓▓▓▓▓▓▓
░░░░░░▒▒▒▒▓▓▓▓▓▓▓`;

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

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "error desconocido";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readStatValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[%,$\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (isRecord(value)) {
    return readStatValue(value.value ?? value.displayValue ?? value.rank);
  }
  return undefined;
}

function assignStat(target: ModeStats, key: string, value: unknown) {
  const parsed = readStatValue(value);
  if (parsed === undefined) return;

  switch (key.toLowerCase()) {
    case "wins":
    case "top1":
    case "placetop1":
      target.placetop1 = parsed;
      break;
    case "top3":
    case "placetop3":
      target.placetop3 = parsed;
      break;
    case "top5":
    case "placetop5":
      target.placetop5 = parsed;
      break;
    case "top6":
    case "placetop6":
      target.placetop6 = parsed;
      break;
    case "top10":
    case "placetop10":
      target.placetop10 = parsed;
      break;
    case "top12":
    case "placetop12":
      target.placetop12 = parsed;
      break;
    case "top25":
    case "placetop25":
      target.placetop25 = parsed;
      break;
    case "kills":
      target.kills = parsed;
      break;
    case "matches":
    case "matchesplayed":
      target.matchesplayed = parsed;
      break;
    case "minutesplayed":
    case "minutesplayedtotal":
      target.minutesplayed = parsed;
      break;
    case "score":
      target.score = parsed;
      break;
  }
}

function normalizeInputName(input: string) {
  const normalized = input.toLowerCase().replace(/[-_\s]/g, "");
  if (normalized === "keyboardmouse" || normalized === "keyboardandmouse") return "keyboardmouse";
  if (normalized === "gamepad" || normalized === "controller") return "gamepad";
  if (normalized === "touch") return "touch";
  if (normalized === "all" || normalized === "overall") return "all";
  return input;
}

function normalizeModeName(mode: string) {
  const normalized = mode.toLowerCase().replace(/[-_\s]/g, "");
  if (normalized === "solo" || normalized === "p9") return "solo";
  if (normalized === "duo" || normalized === "duos" || normalized === "p2") return "duo";
  if (normalized === "trio" || normalized === "trios") return "trio";
  if (normalized === "squad" || normalized === "squads" || normalized === "p10") return "squad";
  if (normalized === "ltm" || normalized === "other") return "ltm";
  if (normalized === "overall" || normalized === "all") return "overall";
  return mode;
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

function parseTrackerStats(trackerData: unknown): StatsData {
  const root = isRecord(trackerData) ? trackerData : {};
  const data = isRecord(root.data) ? root.data : {};
  const segments = data.segments || root.segments || root.stats || [];
  const groupedStats: Record<string, Record<string, ModeStats>> = {};

  for (const rawSegment of Array.isArray(segments) ? segments : []) {
    if (!isRecord(rawSegment)) continue;
    const segment = rawSegment;
    const metadata = isRecord(rawSegment.metadata) ? rawSegment.metadata : {};
    const segmentKey = String(metadata.key || metadata.name || segment.type || "overall");
    const mode = normalizeModeName(String(metadata.mode || segmentKey));
    const method = normalizeInputName(String(metadata.input || metadata.inputType || "all"));
    const modeStats: ModeStats = {};

    if (Array.isArray(segment.entries)) {
      for (const entry of segment.entries) {
        if (isRecord(entry)) assignStat(modeStats, String(entry.key), entry.value);
      }
    } else {
      const stats = isRecord(segment.stats) ? segment.stats : {};
      for (const [key, value] of Object.entries(stats)) assignStat(modeStats, key, value);
    }

    if (Object.keys(modeStats).length === 0) continue;
    if (!groupedStats[method]) groupedStats[method] = {};
    groupedStats[method][mode] = modeStats;
  }

  return {
    success: true,
    groupedStats,
    seasonLevels: [],
    source: "tracker",
  };
}

function parseFortniteApiStats(apiData: unknown): StatsData {
  const root = isRecord(apiData) ? apiData : {};
  const data = isRecord(root.data) ? root.data : {};
  const statsByInput = isRecord(data.stats) ? data.stats : isRecord(root.stats) ? root.stats : {};
  const groupedStats: Record<string, Record<string, ModeStats>> = {};

  for (const [input, modes] of Object.entries(statsByInput)) {
    if (!isRecord(modes)) continue;
    const method = normalizeInputName(input);
    groupedStats[method] = {};

    for (const [modeName, rawStats] of Object.entries(modes)) {
      if (!isRecord(rawStats)) continue;
      const modeStats: ModeStats = {};
      for (const [key, value] of Object.entries(rawStats)) assignStat(modeStats, key, value);
      if (Object.keys(modeStats).length > 0) {
        groupedStats[method][normalizeModeName(modeName)] = modeStats;
      }
    }
  }

  return {
    success: true,
    groupedStats,
    seasonLevels: isRecord(data.battlePass) ? [{ level: readStatValue(data.battlePass.level) || 0 }] : [],
    source: "fortnite-api",
  };
}

export default function OsirionDashboard() {
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

  const fetchStats = useCallback(async (accountId: string, displayName: string, timeframe: "season" | "lifetime") => {
    setLoadingMsg("obteniendo estadisticas...");
    setIsLoading(true);
    setStatsData(null);
    setRankedData(null);

    try {
      if (timeframe === "lifetime") {
        let parsedStats: StatsData | null = null;

        const trackerRes = await fetch(`/api/osirion?action=tracker-stats&displayName=${encodeURIComponent(displayName)}`);
        if (trackerRes.ok) {
          const trackerJson = await trackerRes.json();
          if (trackerJson.success && trackerJson.data) {
            parsedStats = parseTrackerStats(trackerJson.data);
          }
        }

        if (!parsedStats || Object.keys(parsedStats.groupedStats || {}).length === 0) {
          const fortniteApiRes = await fetch(`/api/osirion?action=fortnite-api-stats&accountId=${encodeURIComponent(accountId)}&displayName=${encodeURIComponent(displayName)}&timeframe=lifetime`);
          if (fortniteApiRes.ok) {
            const fortniteApiJson = await fortniteApiRes.json();
            if (fortniteApiJson.success && fortniteApiJson.data) {
              parsedStats = parseFortniteApiStats(fortniteApiJson.data);
            }
          }
        }

        if (!parsedStats || Object.keys(parsedStats.groupedStats || {}).length === 0) {
          const statsRes = await fetch(`/api/osirion?action=stats&accountId=${accountId}&timeframe=lifetime`);
          if (!statsRes.ok) throw new Error(`error en stats lifetime: ${statsRes.status}`);
          const statsJson: StatsData = await statsRes.json();
          if (!statsJson.success) throw new Error("api devolvio error.");
          parsedStats = { ...statsJson, source: "osirion" };
        }

        setStatsData(parsedStats);
      } else {
        const statsRes = await fetch(`/api/osirion?action=stats&accountId=${accountId}&timeframe=season`);
        if (!statsRes.ok) throw new Error(`error en stats: ${statsRes.status}`);
        const statsJson: StatsData = await statsRes.json();
        if (!statsJson.success) throw new Error("api devolvio error.");
        setStatsData({ ...statsJson, source: "osirion" });
      }

      const rankedRes = await fetch(`/api/osirion?action=ranked-current&accountId=${accountId}`);
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

  const handleSearch = async (e: React.FormEvent, overrideQuery?: string) => {
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
      let displayName = query;

      if (query.length !== 32 || !/^[0-9a-f]+$/i.test(query)) {
        setLoadingMsg("resolviendo usuario...");
        const lookupRes = await fetch(`/api/osirion?action=lookup&displayName=${encodeURIComponent(query)}`);

        if (lookupRes.status === 404) throw new Error(`jugador "${query}" no encontrado.`);
        if (!lookupRes.ok) throw new Error(`error en lookup: ${lookupRes.status}`);

        const lookupJson = await lookupRes.json();
        if (!lookupJson.success || !lookupJson.accountId) throw new Error(`no se resolvio el id para "${query}".`);
        accountId = lookupJson.accountId;
        displayName = lookupJson.displayName || query;
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
    <div className="w-full max-w-5xl flex flex-col min-h-[calc(100vh-4rem)] mx-auto px-4 py-8">
      <div className="flex justify-between items-start">
        <div className="text-sm font-bold text-miyu-text-muted">[fortnite stats]</div>
        {currentDisplayName && (
          <div className="text-xs text-miyu-text-muted font-mono">
            jugador: <span className="text-miyu-text font-bold">{currentDisplayName}</span>
          </div>
        )}
      </div>

      <div className="mt-8 mb-8">
        <pre className="whitespace-pre text-sm text-miyu-text-muted leading-tight font-mono w-fit text-left mx-auto">
          {ASCII_ART}
        </pre>
      </div>

      <div className="relative">
        <form onSubmit={(e) => handleSearch(e)} className="border-2 border-miyu-text p-3 flex items-center gap-3 rounded-lg">
          <span className="text-miyu-text font-bold text-lg">$</span>
          <input
            id="searchInput"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onFocus={() => searchHistory.length > 0 && setShowHistory(true)}
            placeholder="buscar jugador epic... (/)"
            className="w-full bg-transparent text-miyu-text placeholder-miyu-text-muted/60 font-mono text-sm outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          {isLoading && (
            <div className="w-4 h-4 border-2 border-miyu-text-muted border-t-miyu-text rounded-full animate-spin" />
          )}
        </form>

        {showHistory && searchHistory.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-miyu-surface border-2 border-miyu-border rounded-lg shadow-lg z-10 overflow-hidden">
            <div className="flex justify-between items-center px-3 py-2 border-b border-miyu-border">
              <span className="text-xs text-miyu-text-muted font-mono">busquedas recientes</span>
              <button
                onClick={clearHistory}
                className="text-xs text-miyu-text-muted hover:text-red-500 transition-colors"
              >
                [limpiar]
              </button>
            </div>
            {searchHistory.map((h) => (
              <button
                key={h.accountId}
                onClick={() => {
                  searchFromHistory(h.displayName);
                }}
                className="w-full text-left px-3 py-2 hover:bg-miyu-accent-light transition-colors flex justify-between items-center"
              >
                <span className="text-sm font-mono text-miyu-text">{h.displayName}</span>
                <span className="text-xs text-miyu-text-muted">
                  {new Date(h.timestamp).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-600 text-xs font-mono">{errorMsg}</div>
        </div>
      )}
      {loadingMsg && (
        <div className="text-miyu-text-muted text-xs mt-3 animate-pulse font-mono">{loadingMsg}</div>
      )}

      {filteredStats && (
        <section className="flex-1 flex flex-col mt-8">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTimeframe("season")}
                className={`border-2 border-miyu-text px-3 py-1.5 cursor-pointer transition-colors text-xs rounded-md ${
                  currentTimeframe === "season"
                    ? "bg-miyu-text text-miyu-bg font-bold"
                    : "hover:bg-miyu-surface"
                }`}
              >
                temp actual
              </button>
              <button
                onClick={() => setTimeframe("lifetime")}
                className={`border-2 border-miyu-text px-3 py-1.5 cursor-pointer transition-colors text-xs rounded-md ${
                  currentTimeframe === "lifetime"
                    ? "bg-miyu-text text-miyu-bg font-bold"
                    : "hover:bg-miyu-surface"
                }`}
              >
                todas las temp
              </button>
            </div>

            <div className="flex items-center gap-4">
              {statsData?.seasonLevels && statsData.seasonLevels.length > 0 && (
                <span className="text-miyu-text-muted font-mono text-xs">
                  [nivel: {statsData.seasonLevels[0].level}]
                </span>
              )}
              <span className="text-miyu-text-muted font-mono text-xs">
                [{currentTimeframe === "season" ? "temporada" : "lifetime"} · {sourceLabel}]
              </span>
            </div>
          </div>

          <div className="flex gap-2 mb-6 border-b border-miyu-border">
            {(["overview", "modes", "ranked"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-xs font-mono transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? "border-miyu-text text-miyu-text font-bold"
                    : "border-transparent text-miyu-text-muted hover:text-miyu-text"
                }`}
              >
                {tab === "overview" ? "general" : tab === "modes" ? "modos" : "ranked"}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <>
              {(availableInputMethods.length > 1 || availableGameModes.length > 1) && (
                <div className="flex flex-wrap gap-4 mb-6 p-4 bg-miyu-surface border border-miyu-border rounded-lg">
                  {availableInputMethods.length > 1 && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-miyu-text-muted font-mono">metodo de entrada</label>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setSelectedInputMethod("all")}
                          className={`px-2 py-1 text-xs font-mono border rounded ${
                            selectedInputMethod === "all"
                              ? "bg-miyu-text text-miyu-bg"
                              : "border-miyu-border hover:bg-miyu-accent-light"
                          }`}
                        >
                          todos
                        </button>
                        {availableInputMethods.map((m) => (
                          <button
                            key={m}
                            onClick={() => setSelectedInputMethod(m)}
                            className={`px-2 py-1 text-xs font-mono border rounded ${
                              selectedInputMethod === m
                                ? "bg-miyu-text text-miyu-bg"
                                : "border-miyu-border hover:bg-miyu-accent-light"
                            }`}
                          >
                            {formatInputMethod(m)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {availableGameModes.length > 1 && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-miyu-text-muted font-mono">modo de juego</label>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setSelectedGameMode("all")}
                          className={`px-2 py-1 text-xs font-mono border rounded ${
                            selectedGameMode === "all"
                              ? "bg-miyu-text text-miyu-bg"
                              : "border-miyu-border hover:bg-miyu-accent-light"
                          }`}
                        >
                          todos
                        </button>
                        {availableGameModes.map((m) => (
                          <button
                            key={m}
                            onClick={() => setSelectedGameMode(m)}
                            className={`px-2 py-1 text-xs font-mono border rounded ${
                              selectedGameMode === m
                                ? "bg-miyu-text text-miyu-bg"
                                : "border-miyu-border hover:bg-miyu-accent-light"
                            }`}
                          >
                            {formatGameMode(m)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                <StatCard label="rango actual" value={filteredStats.rankLabel} highlight />
                <StatCard label="k/d ratio" value={filteredStats.kdRatio} />
                <StatCard label="win rate" value={filteredStats.winRate} />
                <StatCard label="victorias" value={filteredStats.totalWins} />
                <StatCard label="partidas" value={filteredStats.totalMatches} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <MiniStat label="kills promedio" value={filteredStats.avgKills} />
                <MiniStat label="score promedio" value={filteredStats.avgScore} />
                <MiniStat label="tiempo total" value={`${filteredStats.hours}h`} />
                <MiniStat label="score total" value={filteredStats.totalScore.toLocaleString()} />
              </div>

              <div className="border-t border-dashed border-miyu-border mb-6" />

              <div className="flex justify-between text-sm mb-4">
                <span className="text-miyu-text-muted font-mono text-xs">metricas detalladas</span>
                <button
                  onClick={() => setShowRawJson((v) => !v)}
                  className="cursor-pointer hover:bg-miyu-text hover:text-miyu-bg transition-colors border border-transparent hover:border-miyu-text px-2 py-0.5 rounded text-xs font-mono"
                >
                  [ver .json]
                </button>
              </div>

              <div className="flex flex-col">
                <DetailBox
                  title="Eliminaciones"
                  subtitle={`${filteredStats.avgKills} avg por partida`}
                  rightText={`${filteredStats.totalKills} totales`}
                  icon="swords"
                />
                <DetailBox
                  title="Tiempo Jugado"
                  subtitle={`${filteredStats.avgMinutes} min avg por partida`}
                  rightText={`${filteredStats.hours} horas`}
                  icon="clock"
                />
                <DetailBox
                  title="Top 3"
                  subtitle={`${filteredStats.totalMatches > 0 ? ((filteredStats.top3 / filteredStats.totalMatches) * 100).toFixed(1) : 0}% de las partidas`}
                  rightText={`${filteredStats.top3}`}
                  icon="top3"
                />
                <DetailBox
                  title="Top 5"
                  subtitle={`${filteredStats.totalMatches > 0 ? ((filteredStats.top5 / filteredStats.totalMatches) * 100).toFixed(1) : 0}% de las partidas`}
                  rightText={`${filteredStats.top5}`}
                  icon="top5"
                />
                <DetailBox
                  title="Top 10"
                  subtitle={`${filteredStats.totalMatches > 0 ? ((filteredStats.top10 / filteredStats.totalMatches) * 100).toFixed(1) : 0}% de las partidas`}
                  rightText={`${filteredStats.top10}`}
                  icon="top10"
                />
                <DetailBox
                  title="Puntuacion"
                  subtitle={`+${filteredStats.avgScore} xp avg`}
                  rightText={`${filteredStats.totalScore.toLocaleString()} pts`}
                  icon="star"
                />
              </div>

              {showRawJson && (
                <div className="mt-6">
                  <div className="border-2 border-miyu-text p-4 bg-miyu-surface overflow-x-auto rounded-lg max-h-96 overflow-y-auto">
                    <pre className="text-xs text-miyu-text-muted font-mono">
                      {JSON.stringify({ stats: statsData, ranked: rankedData }, null, 2)}
                    </pre>
                  </div>
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
                    <div className="text-3xl font-bold text-miyu-text font-mono mb-2">
                      {formatCurrentRank(rankedData.rank)}
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

      <div className="flex justify-between text-xs text-miyu-text-muted mt-12 pt-4 border-t border-miyu-border">
        <span>[fortnite]</span>
        <span>[⚙]</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`space-y-2 p-4 rounded-lg border ${highlight ? "border-miyu-text bg-miyu-surface" : "border-miyu-border"}`}>
      <div className={`font-bold text-xl leading-none font-mono ${highlight ? "text-miyu-text" : ""}`}>{value}</div>
      <div className="text-xs text-miyu-text-muted lowercase">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-3 bg-miyu-surface border border-miyu-border rounded-lg">
      <div className="text-xs text-miyu-text-muted mb-1">{label}</div>
      <div className="text-sm font-bold font-mono text-miyu-text">{value}</div>
    </div>
  );
}

function DetailBox({ title, subtitle, rightText, icon }: { title: string; subtitle: string; rightText: string; icon?: string }) {
  const iconSvg = (type?: string) => {
    switch (type) {
      case "swords":
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-miyu-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="9.5 6.5 21 18 21 21 18 21 6.5 9.5"/><line x1="11" y1="5" x2="5" y2="11"/><line x1="8" y1="8" x2="4" y2="4"/><line x1="5" y1="3" x2="3" y2="5"/></svg>
        );
      case "clock":
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-miyu-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        );
      case "top3":
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-miyu-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 9 7 12 7s5-3 7.5-3a2.5 2.5 0 0 1 0 5H18"/><path d="M18 9v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/><path d="M12 3v6"/></svg>
        );
      case "top5":
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-miyu-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        );
      case "top10":
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-miyu-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="8"/><rect x="14" y="6" width="3" height="12"/></svg>
        );
      case "star":
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-miyu-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="border-b border-miyu-border py-4 flex justify-between items-center text-sm hover:bg-miyu-surface transition-colors px-3 rounded">
      <div className="flex items-baseline gap-4">
        {icon && iconSvg(icon)}
        <div>
          <strong className="text-miyu-text uppercase text-xs tracking-wider font-mono">{title}</strong>
          <div className="text-xs text-miyu-text-muted/60 font-mono mt-0.5">{subtitle}</div>
        </div>
      </div>
      <div className="font-mono text-sm font-bold text-miyu-text">{rightText}</div>
    </div>
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
