"use client";

import { useState, useCallback } from "react";

interface PlayerStats {
  accountId: string;
  displayName: string;
  kdRatio: string;
  winRate: string;
  totalKills: number;
  totalMatches: number;
  totalWins: number;
  totalMinutes: number;
  totalScore: number;
  top3: number;
  top5: number;
  top10: number;
  avgKills: string;
  hours: string;
  avgScore: number;
  rankLabel: string;
}

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

async function fetchPlayerStats(query: string): Promise<PlayerStats> {
  let accountId = query;
  let displayName = query;

  if (query.length !== 32 || !/^[0-9a-f]+$/i.test(query)) {
    const lookupRes = await fetch(`/api/osirion?action=lookup&displayName=${encodeURIComponent(query)}`);
    if (lookupRes.status === 404) throw new Error(`jugador "${query}" no encontrado`);
    if (!lookupRes.ok) throw new Error(`error en lookup: ${lookupRes.status}`);
    const lookupJson = await lookupRes.json();
    if (!lookupJson.success || !lookupJson.accountId) throw new Error(`no se resolvio el id para "${query}"`);
    accountId = lookupJson.accountId;
    displayName = lookupJson.displayName || query;
  }

  const statsRes = await fetch(`/api/osirion?action=stats&accountId=${encodeURIComponent(accountId)}&timeframe=season`);
  if (!statsRes.ok) throw new Error(`error en stats: ${statsRes.status}`);
  const statsJson: StatsData = await statsRes.json();
  if (!statsJson.groupedStats) throw new Error("osirion no devolvio estadisticas");
  const parsedStats: StatsData = { ...statsJson, success: true, source: "osirion" };

  const rankedRes = await fetch(`/api/osirion?action=ranked-current&accountId=${encodeURIComponent(accountId)}`);
  let rankedJson: RankedData = { success: false, rank: null };
  if (rankedRes.ok) {
    const rankedParsed = await rankedRes.json();
    if (rankedParsed?.success) rankedJson = rankedParsed;
  }

  let totalKills = 0;
  let totalMatches = 0;
  let totalWins = 0;
  let totalMinutes = 0;
  let totalScore = 0;
  let top3 = 0;
  let top5 = 0;
  let top10 = 0;

  const groupedStats = parsedStats.groupedStats || {};
  const methods = groupedStats.all ? ["all"] : Object.keys(groupedStats);

  for (const method of methods) {
    const modeData = groupedStats[method] || {};
    const modes = modeData.overall ? ["overall"] : Object.keys(modeData);

    for (const mode of modes) {
      const m = modeData[mode];
      if (!m) continue;
      totalKills += m.kills || 0;
      totalMatches += m.matchesplayed || 0;
      totalWins += m.placetop1 || 0;
      totalMinutes += m.minutesplayed || 0;
      totalScore += m.score || 0;
      top3 += m.placetop3 || 0;
      top5 += m.placetop5 || 0;
      top10 += m.placetop10 || 0;
    }
  }

  const kdRatio = totalMatches > 0 && totalMatches - totalWins > 0
    ? (totalKills / (totalMatches - totalWins)).toFixed(2)
    : "—";
  const winRate = totalMatches > 0
    ? ((totalWins / totalMatches) * 100).toFixed(1) + "%"
    : "0%";
  const avgKills = totalMatches > 0 ? (totalKills / totalMatches).toFixed(1) : "0";
  const hours = (totalMinutes / 60).toFixed(1);
  const avgScore = totalMatches > 0 ? Math.round(totalScore / totalMatches) : 0;

  return {
    accountId,
    displayName,
    kdRatio,
    winRate,
    totalKills,
    totalMatches,
    totalWins,
    totalMinutes,
    totalScore,
    top3,
    top5,
    top10,
    avgKills,
    hours,
    avgScore,
    rankLabel: formatCurrentRank(rankedJson.rank),
  };
}

export default function PlayerCompare() {
  const [search1, setSearch1] = useState("");
  const [search2, setSearch2] = useState("");
  const [player1, setPlayer1] = useState<PlayerStats | null>(null);
  const [player2, setPlayer2] = useState<PlayerStats | null>(null);
  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [error1, setError1] = useState("");
  const [error2, setError2] = useState("");

  const handleSearch = useCallback(async (playerNum: 1 | 2) => {
    const query = playerNum === 1 ? search1 : search2;
    if (!query.trim()) return;

    if (playerNum === 1) {
      setLoading1(true);
      setError1("");
    } else {
      setLoading2(true);
      setError2("");
    }

    try {
      const stats = await fetchPlayerStats(query.trim());
      if (playerNum === 1) {
        setPlayer1(stats);
      } else {
        setPlayer2(stats);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "error desconocido";
      if (playerNum === 1) {
        setError1(message.toLowerCase());
      } else {
        setError2(message.toLowerCase());
      }
    } finally {
      if (playerNum === 1) {
        setLoading1(false);
      } else {
        setLoading2(false);
      }
    }
  }, [search1, search2]);

  const handleCompare = useCallback(async () => {
    if (search1.trim()) await handleSearch(1);
    if (search2.trim()) await handleSearch(2);
  }, [search1, search2, handleSearch]);

  const getBetterValue = (stat: string, val1: number | string, val2: number | string) => {
    const num1 = typeof val1 === "number" ? val1 : parseFloat(String(val1));
    const num2 = typeof val2 === "number" ? val2 : parseFloat(String(val2));
    if (isNaN(num1) && isNaN(num2)) return "equal";
    if (isNaN(num1)) return "player2";
    if (isNaN(num2)) return "player1";
    if (num1 > num2) return "player1";
    if (num2 > num1) return "player2";
    return "equal";
  };

  return (
    <div className="w-full max-w-5xl flex flex-col min-h-[calc(100vh-4rem)] mx-auto px-4 py-8">
      <div className="text-sm font-bold text-miyu-text-muted">[comparar jugadores]</div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="relative">
          <div className="text-xs text-miyu-text-muted font-mono mb-2">jugador 1</div>
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(1); }} className="border-2 border-miyu-text p-3 flex items-center gap-3 rounded-lg">
            <span className="text-miyu-text font-bold text-lg">$</span>
            <input
              type="text"
              value={search1}
              onChange={(e) => setSearch1(e.target.value)}
              placeholder="buscar jugador..."
              className="w-full bg-transparent text-miyu-text placeholder-miyu-text-muted/60 font-mono text-sm outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            {loading1 && (
              <div className="w-4 h-4 border-2 border-miyu-text-muted border-t-miyu-text rounded-full animate-spin" />
            )}
          </form>
          {error1 && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
              <div className="text-red-600 text-xs font-mono">{error1}</div>
            </div>
          )}
        </div>

        <div className="relative">
          <div className="text-xs text-miyu-text-muted font-mono mb-2">jugador 2</div>
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(2); }} className="border-2 border-miyu-text p-3 flex items-center gap-3 rounded-lg">
            <span className="text-miyu-text font-bold text-lg">$</span>
            <input
              type="text"
              value={search2}
              onChange={(e) => setSearch2(e.target.value)}
              placeholder="buscar jugador..."
              className="w-full bg-transparent text-miyu-text placeholder-miyu-text-muted/60 font-mono text-sm outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            {loading2 && (
              <div className="w-4 h-4 border-2 border-miyu-text-muted border-t-miyu-text rounded-full animate-spin" />
            )}
          </form>
          {error2 && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
              <div className="text-red-600 text-xs font-mono">{error2}</div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={handleCompare}
          disabled={loading1 || loading2}
          className="border-2 border-miyu-text bg-miyu-btn px-6 py-2 cursor-pointer transition-colors text-sm font-bold rounded-lg text-miyu-text hover:bg-miyu-btn-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          comparar
        </button>
      </div>

      {player1 && player2 && (
        <section className="flex-1 flex flex-col mt-8">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <div className="text-xs text-miyu-text-muted font-mono">metrica</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-miyu-text font-mono">{player1.displayName}</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-miyu-text font-mono">{player2.displayName}</div>
            </div>
          </div>

          <div className="border border-miyu-border rounded-lg overflow-hidden">
            <CompareRow
              label="rango"
              val1={player1.rankLabel}
              val2={player2.rankLabel}
              isText
            />
            <CompareRow
              label="k/d ratio"
              val1={player1.kdRatio}
              val2={player2.kdRatio}
              better={getBetterValue("kd", player1.kdRatio, player2.kdRatio)}
            />
            <CompareRow
              label="win rate"
              val1={player1.winRate}
              val2={player2.winRate}
              better={getBetterValue("wr", player1.winRate, player2.winRate)}
            />
            <CompareRow
              label="victorias"
              val1={player1.totalWins}
              val2={player2.totalWins}
              better={getBetterValue("wins", player1.totalWins, player2.totalWins)}
            />
            <CompareRow
              label="partidas"
              val1={player1.totalMatches}
              val2={player2.totalMatches}
              better={getBetterValue("matches", player1.totalMatches, player2.totalMatches)}
            />
            <CompareRow
              label="kills totales"
              val1={player1.totalKills}
              val2={player2.totalKills}
              better={getBetterValue("kills", player1.totalKills, player2.totalKills)}
            />
            <CompareRow
              label="kills promedio"
              val1={player1.avgKills}
              val2={player2.avgKills}
              better={getBetterValue("avgKills", player1.avgKills, player2.avgKills)}
            />
            <CompareRow
              label="score promedio"
              val1={player1.avgScore}
              val2={player2.avgScore}
              better={getBetterValue("avgScore", player1.avgScore, player2.avgScore)}
            />
            <CompareRow
              label="score total"
              val1={player1.totalScore.toLocaleString()}
              val2={player2.totalScore.toLocaleString()}
              better={getBetterValue("totalScore", player1.totalScore, player2.totalScore)}
            />
            <CompareRow
              label="tiempo jugado"
              val1={`${player1.hours}h`}
              val2={`${player2.hours}h`}
              better={getBetterValue("hours", player1.hours, player2.hours)}
            />
            <CompareRow
              label="top 3"
              val1={player1.top3}
              val2={player2.top3}
              better={getBetterValue("top3", player1.top3, player2.top3)}
            />
            <CompareRow
              label="top 5"
              val1={player1.top5}
              val2={player2.top5}
              better={getBetterValue("top5", player1.top5, player2.top5)}
            />
            <CompareRow
              label="top 10"
              val1={player1.top10}
              val2={player2.top10}
              better={getBetterValue("top10", player1.top10, player2.top10)}
            />
          </div>
        </section>
      )}

      <div className="flex justify-between text-xs text-miyu-text-muted mt-12 pt-4 border-t border-miyu-border">
        <span>[comparador]</span>
        <span>[⚙]</span>
      </div>
    </div>
  );
}

function CompareRow({
  label,
  val1,
  val2,
  better,
  isText,
}: {
  label: string;
  val1: string | number;
  val2: string | number;
  better?: "player1" | "player2" | "equal";
  isText?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 px-4 py-3 border-b border-miyu-border last:border-b-0 hover:bg-miyu-surface transition-colors">
      <div className="text-xs text-miyu-text-muted font-mono flex items-center">{label}</div>
      <div className={`text-center font-mono text-sm font-bold ${better === "player1" && !isText ? "text-miyu-accent" : "text-miyu-text"}`}>
        {val1}
      </div>
      <div className={`text-center font-mono text-sm font-bold ${better === "player2" && !isText ? "text-miyu-accent" : "text-miyu-text"}`}>
        {val2}
      </div>
    </div>
  );
}
