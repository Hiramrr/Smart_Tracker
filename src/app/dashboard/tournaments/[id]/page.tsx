"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface ScoringRewardTier {
  keyValue: number;
  multiplicative: boolean;
  pointsEarned: number;
}

interface ScoringRule {
  matchRule: string;
  rewardTiers: ScoringRewardTier[];
  trackedStat: string;
}

interface Payout {
  quantity: number;
  rewardMode: string;
  rewardType: string;
  value: string;
}

interface PayoutTableRank {
  payouts: Payout[];
  threshold: number;
}

interface PayoutTable {
  ranks: PayoutTableRank[];
  scoringType: string;
  scoreId?: string;
}

interface ScoreLocation {
  isMain: boolean;
  leaderboardEventId: string;
  leaderboardEventWindowId: string;
  payoutTables: PayoutTable[];
  scoringRules: ScoringRule[];
  scoringType: string;
  scoreId?: string;
}

interface EventWindow {
  additionalRequirements: unknown[];
  beginTime: string;
  endTime: string;
  eventWindowId: string;
  matchCap: number | null;
  metadata: Record<string, unknown>;
  playlistId: string | null;
  requireAllTokens: string[];
  requireAllTokensCaller: string[];
  requireAnyTokens: string[];
  requireAnyTokensCaller: string[];
  requireNoneTokensCaller: string[];
  round: number;
  scoreLocations: ScoreLocation[];
}

interface TournamentDisplayData {
  tournamentDisplayId?: string;
  backgroundLeftColor?: string;
  backgroundRightColor?: string;
  backgroundTextColor?: string;
  backgroundTitle?: string;
  baseColor?: string;
  detailsDescription?: string;
  flavorDescription?: string;
  highlightColor?: string;
  loadingScreenImage?: string;
  longFormatTitle?: string;
  playlistDescription?: string;
  playlistTileImage?: string;
  posterBackImage?: string;
  posterFadeColor?: string;
  posterFrontImage?: string;
  primaryColor?: string;
  roundNames?: string[];
  secondaryColor?: string;
  seriesPointLeaderboardName?: string;
  shadowColor?: string;
  squarePosterImage?: string;
  titleColor?: string;
  titleLine1?: string;
  titleLine2?: string;
  tournamentViewBackgroundImage?: string;
}

interface Tournament {
  displayData: TournamentDisplayData;
  eventGroup: string;
  eventId: string;
  eventWindows: EventWindow[];
  metadata: Record<string, unknown>;
  platforms: string[];
  regions: string[];
}

interface LeaderboardSessionHistoryEntry {
  endTime: string;
  sessionId: string;
  trackedStats: Record<string, number>;
}

interface LeaderboardPlayer {
  accountId: string;
  username: string | null;
  flagToken: string | null;
}

interface LeaderboardEntry {
  percentile: number;
  players: LeaderboardPlayer[];
  pointsEarned: number;
  rank: number;
  score: number;
  sessionHistory: LeaderboardSessionHistoryEntry[];
  teamId: string;
  unscoredSessions: string[];
}

interface LeaderboardData {
  success: boolean;
  leaderboard: {
    entries: LeaderboardEntry[];
    leaderboardEventId: string;
    leaderboardEventWindowId: string;
    page: number;
    totalPages: number;
    updatedAt: string;
  };
}

type TabType = "info" | "leaderboards" | "timeline";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffHours < 1) return "En menos de 1 hora";
  if (diffHours < 24) return `En ${diffHours}h`;
  if (diffDays === 1) return "Manana";
  if (diffDays < 7) return `En ${diffDays} dias`;
  return formatDate(dateStr);
}

function StatusBadge({ status }: { status: "past" | "upcoming" | "live" }) {
  const config = {
    past: { label: "Pasado", bg: "bg-gray-500/10", text: "text-gray-400", border: "border-gray-500/20" },
    upcoming: { label: "Proximo", bg: "bg-[#204E46]/10", text: "text-[#204E46]", border: "border-[#204E46]/20" },
    live: { label: "En vivo", bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
  };
  const { label, bg, text, border } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${bg} ${text} ${border}`}>
      <span className={`w-2 h-2 rounded-full ${status === "live" ? "bg-red-400 animate-pulse" : status === "upcoming" ? "bg-[#204E46]" : "bg-gray-400"}`} />
      {label}
    </span>
  );
}

function getTournamentStatus(tournament: Tournament): "past" | "upcoming" | "live" {
  const now = new Date();
  const windows = tournament.eventWindows || [];
  if (windows.length === 0) return "past";
  const hasFutureWindow = windows.some(w => new Date(w.beginTime) > now);
  const hasLiveWindow = windows.some(w => new Date(w.beginTime) <= now && new Date(w.endTime) >= now);
  if (hasLiveWindow) return "live";
  if (hasFutureWindow) return "upcoming";
  return "past";
}

function TournamentImage({ tournament, className }: { tournament: Tournament; className?: string }) {
  const imageUrl = tournament.displayData?.squarePosterImage ||
    tournament.displayData?.playlistTileImage ||
    tournament.displayData?.posterBackImage;
  if (!imageUrl) return <div className={`bg-miyu-surface ${className}`} />;
  const localUrl = `/api/tournament-image?eventId=${encodeURIComponent(tournament.eventId)}&type=square&url=${encodeURIComponent(imageUrl)}`;
  return (
    <img
      src={localUrl}
      alt=""
      className={`object-cover ${className}`}
      onError={(e) => {
        const image = e.target as HTMLImageElement;
        if (image.src !== imageUrl) image.src = imageUrl;
        else image.style.display = "none";
      }}
    />
  );
}

const COUNTRY_CODES: Record<string, string> = {
  argentina: "AR",
  australia: "AU",
  austria: "AT",
  belgium: "BE",
  brazil: "BR",
  canada: "CA",
  chile: "CL",
  china: "CN",
  colombia: "CO",
  denmark: "DK",
  england: "GB",
  finland: "FI",
  france: "FR",
  germany: "DE",
  ireland: "IE",
  italy: "IT",
  japan: "JP",
  korea: "KR",
  mexico: "MX",
  netherlands: "NL",
  newzealand: "NZ",
  norway: "NO",
  peru: "PE",
  poland: "PL",
  portugal: "PT",
  russia: "RU",
  southkorea: "KR",
  spain: "ES",
  sweden: "SE",
  switzerland: "CH",
  turkey: "TR",
  uk: "GB",
  ukraine: "UA",
  unitedkingdom: "GB",
  unitedstates: "US",
  usa: "US",
};

function flagTokenToCountryCode(flagToken: string | null) {
  if (!flagToken) return null;
  const key = flagToken
    .replace(/^GroupIdentity_GeoIdentity_/i, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return COUNTRY_CODES[key] || null;
}

function countryCodeToEmoji(countryCode: string | null) {
  if (!countryCode || countryCode.length !== 2) return null;
  return countryCode
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function playerLabel(player: LeaderboardEntry["players"][number]) {
  const flag = countryCodeToEmoji(flagTokenToCountryCode(player.flagToken));
  return `${flag ? `${flag} ` : ""}${player.username || player.accountId.slice(0, 8)}`;
}

function playerProfileHref(player: LeaderboardEntry["players"][number]) {
  const params = new URLSearchParams({ player: player.accountId });
  if (player.username) params.set("displayName", player.username);
  return `/dashboard/player?${params.toString()}`;
}

function formatPrize(quantity: number, value: string) {
  if (value === "USD") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(quantity);
  }
  return `${quantity.toLocaleString("es-MX")} ${value}`;
}

function formatScoringRule(rule: ScoringRule) {
  const label = formatStatLabel(rule.trackedStat);
  const tiers = rule.rewardTiers || [];
  if (tiers.length === 0) return `${label}: sin reglas publicadas`;
  const first = tiers[0];
  const suffix = first.multiplicative ? "por vez" : "pts";
  if (rule.trackedStat === "TEAM_ELIMS_STAT_INDEX") return `${label}: ${first.pointsEarned} pt ${suffix}`;
  if (rule.trackedStat === "PLACEMENT_STAT_INDEX") return `${label}: top ${first.keyValue}+ gana ${first.pointsEarned} pt`;
  return `${label}: ${tiers.length} niveles`;
}

function formatScoringRuleDetailed(rule: ScoringRule): string {
  const tiers = rule.rewardTiers || [];
  if (tiers.length === 0) return rule.trackedStat;
  const first = tiers[0];
  const suffix = first.multiplicative ? "x" : "pts";
  return `${rule.trackedStat}: ${first.pointsEarned}${suffix} cada ${first.keyValue}`;
}

function getRequirements(window: EventWindow): string[] {
  const reqs: string[] = [];
  if (window.matchCap !== null && window.matchCap !== undefined) {
    reqs.push(`Max ${window.matchCap} partidas`);
  }
  if (window.playlistId) {
    reqs.push(`Playlist: ${window.playlistId}`);
  }
  if (window.requireAllTokens.length > 0) {
    reqs.push(`Requiere: ${window.requireAllTokens.join(", ")}`);
  }
  if (window.requireAnyTokens.length > 0) {
    reqs.push(`Cualquiera de: ${window.requireAnyTokens.join(", ")}`);
  }
  if (window.requireNoneTokensCaller.length > 0) {
    reqs.push(`Excluye: ${window.requireNoneTokensCaller.join(", ")}`);
  }
  if (window.additionalRequirements.length > 0) {
    reqs.push(`Reqs adicionales: ${JSON.stringify(window.additionalRequirements)}`);
  }
  return reqs;
}

function getMainScoreLocation(tournament: Tournament) {
  return tournament.eventWindows
    .flatMap((window) => window.scoreLocations)
    .find((location) => location.isMain) || tournament.eventWindows.flatMap((window) => window.scoreLocations)[0];
}

function getScoreLocation(window: EventWindow): ScoreLocation | undefined {
  return window.scoreLocations.find((s) => s.isMain) || window.scoreLocations[0];
}

const TOURNAMENT_REGIONS = ["ASIA", "BR", "EU", "ME", "NAC", "NAE", "NAW", "OCE", "ONSITE"];

function getTrackedStat(stats: Record<string, number>, ...keys: string[]) {
  for (const key of keys) {
    if (typeof stats[key] === "number") return stats[key];
  }
  return undefined;
}

function getEntryMatches(entry: LeaderboardEntry) {
  return entry.sessionHistory.reduce((total, session) => {
    return total + (getTrackedStat(session.trackedStats, "MATCH_PLAYED_STAT", "matchesplayed") || 0);
  }, 0);
}

function getEntryWins(entry: LeaderboardEntry) {
  return entry.sessionHistory.reduce((total, session) => {
    return total + (getTrackedStat(session.trackedStats, "VICTORY_ROYALE_STAT", "placetop1") || 0);
  }, 0);
}

function getEntryAvgPlacement(entry: LeaderboardEntry): number | null {
  const placements = entry.sessionHistory
    .map((s) => getTrackedStat(s.trackedStats, "PLACEMENT_STAT_INDEX", "placetop1"))
    .filter((p): p is number => typeof p === "number");
  if (placements.length === 0) return null;
  return Math.round(placements.reduce((a, b) => a + b, 0) / placements.length);
}

function getEntryTotalElims(entry: LeaderboardEntry) {
  return entry.sessionHistory.reduce((total, session) => {
    return total + (getTrackedStat(session.trackedStats, "TEAM_ELIMS_STAT_INDEX", "kills", "eliminations") || 0);
  }, 0);
}

function getPreferredStatKeys(entry: LeaderboardEntry | undefined) {
  const stats = entry?.sessionHistory[0]?.trackedStats;
  if (!stats) return [];

  const preferred = [
    "TEAM_ELIMS_STAT_INDEX",
    "PLACEMENT_STAT_INDEX",
    "TIME_ALIVE_STAT",
    "PLACEMENT_TIEBREAKER_STAT",
    "MATCH_PLAYED_STAT",
    "VICTORY_ROYALE_STAT",
  ];

  return preferred.filter((key) => key in stats).slice(0, 3);
}

function getAllTrackedStatKeys(entry: LeaderboardEntry | undefined): string[] {
  if (!entry || entry.sessionHistory.length === 0) return [];
  const keys = new Set<string>();
  for (const session of entry.sessionHistory) {
    for (const key of Object.keys(session.trackedStats)) {
      keys.add(key);
    }
  }
  return Array.from(keys);
}

function formatStatValue(key: string, value: number): string {
  if (key === "TIME_ALIVE_STAT" && typeof value === "number") {
    const mins = Math.round(value / 60);
    return `${mins}m`;
  }
  if (key === "PLACEMENT_STAT_INDEX" && typeof value === "number") {
    return `Top ${value}`;
  }
  return String(value);
}

function formatStatLabel(key: string) {
  switch (key) {
    case "TEAM_ELIMS_STAT_INDEX":
      return "Elims";
    case "PLACEMENT_STAT_INDEX":
      return "Placement";
    case "TIME_ALIVE_STAT":
      return "Alive";
    case "PLACEMENT_TIEBREAKER_STAT":
      return "Tiebreak";
    case "MATCH_PLAYED_STAT":
      return "Matches";
    case "VICTORY_ROYALE_STAT":
      return "Wins";
    case "ACCURACY_STAT":
      return "Accuracy";
    case "ASSISTS_STAT":
      return "Assists";
    case "DAMAGE_DEALT_STAT":
      return "Dmg dealt";
    case "DAMAGE_TAKEN_STAT":
      return "Dmg taken";
    case "DAMAGE_TO_PLAYERS_STAT":
      return "Dmg players";
    case "HEADSHOTS_STAT":
      return "Headshots";
    case "REVIVES_STAT":
      return "Revives";
    default:
      return key.replace(/_STAT(_INDEX)?$/i, "").replace(/_/g, " ").toLowerCase();
  }
}

function LeaderboardPanel({ leaderboardEventId, leaderboardEventWindowId, roundName }: { leaderboardEventId: string; leaderboardEventWindowId: string; roundName: string }) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [searchPlayer, setSearchPlayer] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<LeaderboardEntry | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/osirion?action=leaderboard&leaderboardEventId=${encodeURIComponent(leaderboardEventId)}&leaderboardEventWindowId=${encodeURIComponent(leaderboardEventWindowId)}&page=${page}`);
      const data = await res.json();
      if (data.success && data.leaderboard) setLeaderboard(data as LeaderboardData);
      else setError(data.error || "Error al cargar leaderboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar leaderboard");
    } finally {
      setLoading(false);
    }
  }, [leaderboardEventId, leaderboardEventWindowId, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLeaderboard();
  }, [fetchLeaderboard]);

  const filteredEntries = useMemo(() => {
    if (!leaderboard?.leaderboard?.entries) return [];
    if (!searchPlayer.trim()) return leaderboard.leaderboard.entries;
    const q = searchPlayer.toLowerCase();
    return leaderboard.leaderboard.entries.filter(e =>
      e.players.some(p => (p.username || "").toLowerCase().includes(q))
    );
  }, [leaderboard, searchPlayer]);

  const firstEntry = filteredEntries[0];
  const statKeys = getPreferredStatKeys(firstEntry);

  if (loading) return <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-miyu-text-muted border-t-miyu-text rounded-full animate-spin" /></div>;
  if (error) return <div className="text-center py-12 text-miyu-text-muted text-sm">{error}</div>;
  if (!leaderboard?.leaderboard?.entries?.length) return <div className="text-center py-12 text-miyu-text-muted text-sm">Sin datos de leaderboard</div>;

  const { totalPages, updatedAt } = leaderboard.leaderboard;

  return (
    <div className="flex gap-6">
      {/* Main leaderboard table */}
      <div className="flex-1 min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-sm font-bold text-miyu-text">{roundName}</h2>
          <span className="font-mono text-xs text-miyu-text-muted">
            Actualizado: {updatedAt ? formatDate(updatedAt) : "N/D"}
          </span>
        </div>

        {/* Search and controls */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchPlayer}
              onChange={(e) => setSearchPlayer(e.target.value)}
              placeholder="Buscar jugador"
              className="w-full px-3 py-2 bg-miyu-surface border border-miyu-border rounded-lg text-sm text-miyu-text placeholder-miyu-text-muted/60 focus:outline-none focus:border-miyu-text"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-miyu-text-muted">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-2 border border-miyu-text bg-miyu-btn text-miyu-text rounded-lg disabled:opacity-30 hover:bg-miyu-btn-hover transition-colors">
              Anterior
            </button>
            <span className="font-mono">Pagina {page + 1} de {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-2 border border-miyu-text bg-miyu-btn text-miyu-text rounded-lg disabled:opacity-30 hover:bg-miyu-btn-hover transition-colors">
              Siguiente
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-miyu-surface border border-miyu-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-miyu-border bg-miyu-bg">
                  <th className="text-left py-3 px-4 text-miyu-text-muted font-mono text-xs w-12">#</th>
                  <th className="text-left py-3 px-4 text-miyu-text-muted font-mono text-xs">Team</th>
                  <th className="text-right py-3 px-4 text-miyu-text-muted font-mono text-xs">Points</th>
                  <th className="text-right py-3 px-4 text-miyu-text-muted font-mono text-xs">%</th>
                  <th className="text-right py-3 px-4 text-miyu-text-muted font-mono text-xs">Matches</th>
                  <th className="text-right py-3 px-4 text-miyu-text-muted font-mono text-xs">Wins</th>
                  {statKeys.slice(0, 3).map(key => (
                    <th key={key} className="text-right py-3 px-4 text-miyu-text-muted font-mono text-xs capitalize">{formatStatLabel(key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const lastSession = entry.sessionHistory[entry.sessionHistory.length - 1];
                  const stats = lastSession?.trackedStats || {};
                  const isSelected = selectedEntry?.teamId === entry.teamId;
                  const matchesPlayed = getEntryMatches(entry);
                  const wins = getEntryWins(entry);

                  return (
                    <tr
                      key={entry.teamId}
                      onClick={() => setSelectedEntry(isSelected ? null : entry)}
                      className={`border-b border-miyu-border/50 cursor-pointer transition-colors ${
                        isSelected ? "bg-miyu-btn/50" : "hover:bg-miyu-bg"
                      } ${entry.rank === 1 ? "bg-yellow-500/5" : ""}`}
                    >
                      <td className="py-3 px-4 font-mono">
                        {entry.rank <= 3 ? (
                          <span className={entry.rank === 1 ? "text-yellow-500 font-bold" : entry.rank === 2 ? "text-gray-400" : "text-orange-500"}>
                            {entry.rank}
                          </span>
                        ) : (
                          <span className="text-miyu-text-muted">{entry.rank}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-miyu-text font-medium">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {entry.players.map((player, index) => (
                            <span key={player.accountId} className="inline-flex items-center gap-2">
                              {index > 0 && <span className="text-miyu-text-muted">+</span>}
                              <Link
                                href={playerProfileHref(player)}
                                onClick={(event) => event.stopPropagation()}
                                className="rounded bg-miyu-btn px-2 py-1 text-miyu-text underline-offset-2 hover:bg-miyu-btn-hover hover:underline"
                              >
                                {playerLabel(player)}
                              </Link>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-miyu-text">{entry.pointsEarned}</td>
                      <td className="py-3 px-4 text-right font-mono text-miyu-text-muted">{entry.percentile.toFixed(1)}%</td>
                      <td className="py-3 px-4 text-right font-mono text-miyu-text-muted">{matchesPlayed || "—"}</td>
                      <td className="py-3 px-4 text-right font-mono text-miyu-text-muted">
                        {wins || "—"}
                      </td>
                      {statKeys.slice(0, 3).map(key => (
                        <td key={key} className="py-3 px-4 text-right font-mono text-miyu-text-muted">{stats[key] ?? "—"}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-4 py-2 border border-miyu-text bg-miyu-btn text-miyu-text rounded-lg text-sm disabled:opacity-30 hover:bg-miyu-btn-hover transition-colors">
            Pagina anterior
          </button>
          <span className="text-sm text-miyu-text-muted font-mono">Pagina {page + 1} de {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-4 py-2 border border-miyu-text bg-miyu-btn text-miyu-text rounded-lg text-sm disabled:opacity-30 hover:bg-miyu-btn-hover transition-colors">
            Pagina siguiente
          </button>
        </div>
      </div>

      {/* Side panel - selected entry details */}
      {selectedEntry && (
        <div className="w-80 flex-shrink-0">
          <div className="bg-miyu-surface border border-miyu-border rounded-xl p-4 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="text-center mb-4">
              <div className="text-2xl font-bold text-miyu-text font-mono">#{selectedEntry.rank}</div>
              <div className="text-xs text-miyu-text-muted font-mono">Percentil: {selectedEntry.percentile.toFixed(2)}%</div>
            </div>

            <div className="space-y-2 mb-4">
              {selectedEntry.players.map((p) => (
                <div key={p.accountId} className="flex items-center gap-2 text-sm">
                  {countryCodeToEmoji(flagTokenToCountryCode(p.flagToken)) && (
                    <span className="text-lg" title={p.flagToken || undefined}>{countryCodeToEmoji(flagTokenToCountryCode(p.flagToken))}</span>
                  )}
                  <Link
                    href={playerProfileHref(p)}
                    className="rounded bg-miyu-btn px-2 py-1 text-miyu-text font-medium underline-offset-2 hover:bg-miyu-btn-hover hover:underline"
                  >
                    {p.username || p.accountId.slice(0, 8)}
                  </Link>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
              <div>
                <div className="text-lg font-bold text-miyu-text font-mono">{selectedEntry.pointsEarned}</div>
                <div className="text-xs text-miyu-text-muted">Points</div>
              </div>
              <div>
                <div className="text-lg font-bold text-miyu-text font-mono">{getEntryMatches(selectedEntry)}</div>
                <div className="text-xs text-miyu-text-muted">Matches</div>
              </div>
              <div>
                <div className="text-lg font-bold text-miyu-text font-mono">{getEntryWins(selectedEntry)}</div>
                <div className="text-xs text-miyu-text-muted">Wins</div>
              </div>
            </div>

            {getEntryAvgPlacement(selectedEntry) !== null && (
              <div className="mb-3 rounded-lg border border-miyu-border bg-white/10 p-2 text-center">
                <div className="text-xs text-miyu-text-muted">Promedio de placement</div>
                <div className="text-sm font-bold text-miyu-text font-mono">Top {getEntryAvgPlacement(selectedEntry)}</div>
              </div>
            )}

            {selectedEntry.unscoredSessions.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
                <div className="text-[10px] text-amber-600 font-bold uppercase mb-1">Sesiones sin puntos</div>
                <div className="text-xs text-miyu-text-muted">{selectedEntry.unscoredSessions.length} sesion(es) no contaron para el puntaje</div>
              </div>
            )}

            <div className="text-xs font-bold text-miyu-text-muted font-mono uppercase mb-2">Sesiones ({selectedEntry.sessionHistory.length})</div>
            {selectedEntry.sessionHistory.map((session, i) => {
              const stats = session.trackedStats;
              const allKeys = Object.keys(stats);
              return (
                <div key={session.sessionId} className="border border-miyu-border rounded-lg p-3 mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-miyu-text-muted">Match #{i + 1}</span>
                    <span className="text-[10px] text-miyu-text-muted">{new Date(session.endTime).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                    {allKeys.slice(0, 6).map((key) => (
                      <div key={key}>
                        <span className="text-miyu-text-muted">{formatStatLabel(key)}:</span>
                        <span className="text-miyu-text ml-1 font-mono">{formatStatValue(key, stats[key])}</span>
                      </div>
                    ))}
                  </div>
                  {allKeys.length > 6 && (
                    <div className="text-[10px] text-miyu-text-muted mt-1">+{allKeys.length - 6} stats mas</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TournamentDetailPage() {
  const params = useParams();
  const tournamentId = params.id as string;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("info");
  const [selectedRound, setSelectedRound] = useState<EventWindow | null>(null);

  useEffect(() => {
    async function fetchTournament() {
      setLoading(true);
      try {
        const fetchTournamentSet = async (region?: string) => {
          const params = new URLSearchParams({ action: "tournaments", lang: "es", includeHistoricData: "true" });
          if (region) params.set("region", region);
          const res = await fetch(`/api/osirion?${params.toString()}`);
          const data = await res.json();
          if (!data.success) throw new Error(data.error || "Error al cargar torneo");
          return data.tournaments as Tournament[];
        };

        let found = (await fetchTournamentSet()).find((t) => t.eventId === tournamentId);
        if (!found) {
          for (const region of TOURNAMENT_REGIONS) {
            found = (await fetchTournamentSet(region)).find((t) => t.eventId === tournamentId);
            if (found) break;
          }
        }

        if (!found) {
          setError("Torneo no encontrado");
          return;
        }

        setTournament(found);
        const now = new Date();
        const roundsWithLeaderboard = found.eventWindows.filter((w) => w.scoreLocations.length > 0);
        const preferredRound =
          roundsWithLeaderboard.find((w) => new Date(w.beginTime) <= now && new Date(w.endTime) >= now) ||
          roundsWithLeaderboard.find((w) => new Date(w.beginTime) > now) ||
          roundsWithLeaderboard[0] ||
          null;
        setSelectedRound(preferredRound);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error al cargar torneo");
      } finally {
        setLoading(false);
      }
    }
    fetchTournament();
  }, [tournamentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-miyu-text-muted border-t-miyu-text rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-red-400 text-sm">{error || "Torneo no encontrado"}</div>
        <Link href="/dashboard/tournaments" className="text-xs text-[#204E46] hover:underline">
          ← Volver a torneos
        </Link>
      </div>
    );
  }

  const status = getTournamentStatus(tournament);
  const title = tournament.displayData?.titleLine1 || tournament.displayData?.longFormatTitle || tournament.eventGroup;
  const subtitle = tournament.displayData?.titleLine2 || "";
  const description = tournament.displayData?.flavorDescription || tournament.displayData?.playlistDescription || "";
  const imageUrl = tournament.displayData?.tournamentViewBackgroundImage || tournament.displayData?.posterBackImage;

  const mainScoreLocation = selectedRound?.scoreLocations?.find(s => s.isMain) || selectedRound?.scoreLocations?.[0];
  const tournamentMainScoreLocation = getMainScoreLocation(tournament);
  const leaderboardRounds = tournament.eventWindows.filter((w) => (w.scoreLocations?.length ?? 0) > 0);
  const firstRound = tournament.eventWindows.reduce<EventWindow | null>((earliest, window) => {
    if (!earliest) return window;
    return new Date(window.beginTime) < new Date(earliest.beginTime) ? window : earliest;
  }, null);
  const lastRound = tournament.eventWindows.reduce<EventWindow | null>((latest, window) => {
    if (!latest) return window;
    return new Date(window.endTime) > new Date(latest.endTime) ? window : latest;
  }, null);
  const prizeRows = tournamentMainScoreLocation?.payoutTables.flatMap((table) => table.ranks) || [];
  const topPrize = prizeRows[0]?.payouts[0];
  const scoringRules = tournamentMainScoreLocation?.scoringRules || [];

  const tabs: { key: TabType; label: string }[] = [
    { key: "info", label: "Resumen" },
    { key: "leaderboards", label: "Leaderboard" },
    { key: "timeline", label: "Calendario" },
  ];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/dashboard/tournaments" className="inline-flex items-center gap-2 text-sm text-miyu-text-muted hover:text-miyu-text transition-colors">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Torneos
      </Link>

      {/* Header */}
      <div className="relative">
        {imageUrl && (
          <div className="relative h-48 sm:h-64 overflow-hidden rounded-xl">
            <TournamentImage tournament={tournament} className="w-full h-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-miyu-bg via-miyu-bg/70 to-transparent" />
          </div>
        )}
        <div className={`${imageUrl ? "mt-[-80px] relative" : ""}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-miyu-text">{title}</h1>
              {subtitle && <p className="text-sm text-miyu-text-muted mt-1">{subtitle}</p>}
            </div>
            <StatusBadge status={status} />
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mt-3">
            {tournament.regions.map(r => (
              <span key={r} className="px-2.5 py-1 rounded-lg text-xs bg-miyu-surface border border-miyu-border text-miyu-text-muted">{r}</span>
            ))}
            {tournament.platforms.length > 0 && (
              <span className="px-2.5 py-1 rounded-lg text-xs bg-miyu-surface border border-miyu-border text-miyu-text-muted">
                {tournament.platforms.join(", ")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-miyu-surface border border-miyu-border rounded-xl p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "bg-miyu-btn text-miyu-text border border-miyu-text"
                : "bg-miyu-btn text-miyu-text hover:bg-miyu-btn-hover"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "info" && (
        <div className="space-y-6">
          {description && (
            <div className="bg-miyu-surface border border-miyu-border rounded-xl p-6">
              <p className="text-sm text-miyu-text-muted leading-relaxed">{description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-miyu-surface border border-miyu-border rounded-xl p-4">
              <div className="text-xs text-miyu-text-muted mb-1">Rondas</div>
              <div className="text-2xl font-bold font-mono text-miyu-text">{tournament.eventWindows?.length || 0}</div>
            </div>
            <div className="bg-miyu-surface border border-miyu-border rounded-xl p-4">
              <div className="text-xs text-miyu-text-muted mb-1">Leaderboards</div>
              <div className="text-2xl font-bold font-mono text-miyu-text">{leaderboardRounds.length}</div>
            </div>
            <div className="bg-miyu-surface border border-miyu-border rounded-xl p-4">
              <div className="text-xs text-miyu-text-muted mb-1">Premio top</div>
              <div className="text-2xl font-bold font-mono text-miyu-text">{topPrize ? formatPrize(topPrize.quantity, topPrize.value) : "N/D"}</div>
            </div>
            <div className="bg-miyu-surface border border-miyu-border rounded-xl p-4">
              <div className="text-xs text-miyu-text-muted mb-1">Estado</div>
              <div className="text-2xl font-bold font-mono text-miyu-text capitalize">{status}</div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="bg-miyu-surface border border-miyu-border rounded-xl p-5">
              <h3 className="text-sm font-bold text-miyu-text mb-4 font-mono">DATOS CLAVE</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4 border-b border-miyu-border pb-2">
                  <span className="text-miyu-text-muted">Inicio</span>
                  <span className="text-right font-mono text-miyu-text">{firstRound ? formatDate(firstRound.beginTime) : "N/D"}</span>
                </div>
                <div className="flex justify-between gap-4 border-b border-miyu-border pb-2">
                  <span className="text-miyu-text-muted">Cierre</span>
                  <span className="text-right font-mono text-miyu-text">{lastRound ? formatDate(lastRound.endTime) : "N/D"}</span>
                </div>
                <div className="flex justify-between gap-4 border-b border-miyu-border pb-2">
                  <span className="text-miyu-text-muted">Regiones</span>
                  <span className="text-right font-mono text-miyu-text">{tournament.regions.join(", ") || "N/D"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-miyu-text-muted">Plataformas</span>
                  <span className="text-right font-mono text-miyu-text">{tournament.platforms.join(", ") || "Todas"}</span>
                </div>
              </div>
            </div>

            <div className="bg-miyu-surface border border-miyu-border rounded-xl p-5">
              <h3 className="text-sm font-bold text-miyu-text mb-4 font-mono">PUNTUACION</h3>
              {scoringRules.length > 0 ? (
                <div className="space-y-2">
                  {scoringRules.slice(0, 5).map((rule) => (
                    <div key={rule.trackedStat} className="rounded-lg border border-miyu-border bg-miyu-bg/50 px-3 py-2 text-sm text-miyu-text">
                      {formatScoringRule(rule)}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-miyu-text-muted">Este torneo no publica reglas de puntuacion en la API.</p>
              )}
            </div>
          </div>

          {/* Rounds */}
          <div className="bg-miyu-surface border border-miyu-border rounded-xl p-6">
            <h3 className="text-sm font-bold text-miyu-text mb-4 font-mono">RONDAS</h3>
            <div className="space-y-3">
              {tournament.eventWindows?.map((w) => {
                const isPast = new Date(w.endTime) < new Date();
                const isLive = new Date(w.beginTime) <= new Date() && new Date(w.endTime) >= new Date();
                const roundName = tournament.displayData?.roundNames?.[w.round - 1] || `Round ${w.round}`;
                const hasLeaderboard = w.scoreLocations.length > 0;
                const reqs = getRequirements(w);
                const scoreLoc = getScoreLocation(w);
                const roundScoringRules = scoreLoc?.scoringRules || [];

                return (
                  <div
                    key={w.eventWindowId}
                    className={`rounded-lg border p-4 transition-colors ${
                      isLive ? "border-red-500/30 bg-red-500/5" :
                      isPast ? "border-miyu-border/50" :
                      "border-miyu-border"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          isLive ? "bg-red-500 text-white" :
                          isPast ? "bg-miyu-text-muted/20 text-miyu-text-muted" :
                          "bg-miyu-btn text-miyu-text border border-miyu-text"
                        }`}>
                          {w.round}
                        </span>
                        <div>
                          <div className="text-sm text-miyu-text font-medium">{roundName}</div>
                          <div className="text-xs text-miyu-text-muted">{formatDate(w.beginTime)} - {formatDate(w.endTime)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isLive && <StatusBadge status="live" />}
                        {isPast && <span className="text-xs text-miyu-text-muted">Finalizada</span>}
                        {!isLive && !isPast && <span className="text-xs text-miyu-text">{formatRelativeTime(w.beginTime)}</span>}
                        {hasLeaderboard && (
                          <button
                            onClick={() => { setSelectedRound(w); setActiveTab("leaderboards"); }}
                            className="rounded-lg border border-miyu-text bg-miyu-btn px-3 py-1.5 text-xs font-bold text-miyu-text hover:bg-miyu-btn-hover"
                          >
                            Ver leaderboard
                          </button>
                        )}
                      </div>
                    </div>

                    {reqs.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {reqs.map((req, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-miyu-bg border border-miyu-border text-[10px] text-miyu-text-muted font-mono">
                            {req}
                          </span>
                        ))}
                      </div>
                    )}

                    {roundScoringRules.length > 0 && (
                      <div className="mt-2 text-xs text-miyu-text-muted">
                        {roundScoringRules.slice(0, 2).map((r) => formatScoringRule(r)).join(" | ")}
                        {roundScoringRules.length > 2 && ` (+${roundScoringRules.length - 2} mas)`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Metadata */}
          {Object.keys(tournament.metadata).length > 0 && (
            <div className="bg-miyu-surface border border-miyu-border rounded-xl p-4">
              <h3 className="text-xs font-bold text-miyu-text-muted mb-2 font-mono uppercase">Metadata</h3>
              <pre className="text-[10px] text-miyu-text-muted font-mono overflow-x-auto">{JSON.stringify(tournament.metadata, null, 2)}</pre>
            </div>
          )}

          {/* Event ID */}
          <div className="bg-miyu-surface border border-miyu-border rounded-xl p-4">
            <div className="text-xs text-miyu-text-muted font-mono">Event ID: {tournament.eventId}</div>
            <div className="text-xs text-miyu-text-muted font-mono mt-1">Event Group: {tournament.eventGroup}</div>
            {tournament.displayData?.tournamentDisplayId && (
              <div className="text-xs text-miyu-text-muted font-mono mt-1">Display ID: {tournament.displayData.tournamentDisplayId}</div>
            )}
          </div>
        </div>
      )}

      {activeTab === "leaderboards" && (
        <div className="space-y-4">
          {/* Round selector */}
          <div className="flex flex-wrap gap-2">
            {tournament.eventWindows?.filter(w => w.scoreLocations.length > 0).map(w => {
              const roundName = tournament.displayData?.roundNames?.[w.round - 1] || `Round ${w.round}`;
              const isSelected = selectedRound?.eventWindowId === w.eventWindowId;
              return (
                <button
                  key={w.eventWindowId}
                  onClick={() => setSelectedRound(w)}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                    isSelected
                      ? "bg-miyu-btn text-miyu-text border-miyu-text"
                      : "bg-miyu-btn text-miyu-text border-miyu-border hover:bg-miyu-btn-hover"
                  }`}
                >
                  {roundName}
                </button>
              );
            })}
          </div>

          {selectedRound && mainScoreLocation ? (
            <LeaderboardPanel
              leaderboardEventId={mainScoreLocation.leaderboardEventId}
              leaderboardEventWindowId={mainScoreLocation.leaderboardEventWindowId}
              roundName={tournament.displayData?.roundNames?.[selectedRound.round - 1] || `Round ${selectedRound.round}`}
            />
          ) : selectedRound ? (
            <div className="text-center py-12 text-miyu-text-muted text-sm">No hay leaderboard para esta ronda</div>
          ) : (
            <div className="text-center py-12 text-miyu-text-muted text-sm">Selecciona una ronda para ver el leaderboard</div>
          )}
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="bg-miyu-surface border border-miyu-border rounded-xl p-6">
            <h3 className="text-sm font-bold text-miyu-text mb-4 font-mono">CALENDARIO</h3>
            <div className="space-y-4">
              {tournament.eventWindows?.sort((a, b) => new Date(a.beginTime).getTime() - new Date(b.beginTime).getTime()).map((w, i) => {
                const isPast = new Date(w.endTime) < new Date();
                const isLive = new Date(w.beginTime) <= new Date() && new Date(w.endTime) >= new Date();
                const roundName = tournament.displayData?.roundNames?.[w.round - 1] || `Round ${w.round}`;

                return (
                  <div key={w.eventWindowId} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${isLive ? "bg-red-500" : isPast ? "bg-miyu-text-muted" : "bg-miyu-btn border border-miyu-text"}`} />
                      {i < (tournament.eventWindows?.length || 0) - 1 && <div className="w-px h-full bg-miyu-border mt-1" />}
                    </div>
                    <div className="pb-4">
                      <div className="text-sm text-miyu-text font-medium">{roundName}</div>
                      <div className="text-xs text-miyu-text-muted">{formatDate(w.beginTime)} - {formatDate(w.endTime)}</div>
                      {isLive && <span className="text-xs text-red-400">En vivo ahora</span>}
                      {isPast && <span className="text-xs text-miyu-text-muted">Finalizada</span>}
                      {!isLive && !isPast && <span className="text-xs text-miyu-text">{formatRelativeTime(w.beginTime)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-miyu-surface border border-miyu-border rounded-xl p-6">
            <h3 className="text-sm font-bold text-miyu-text mb-4 font-mono">PREMIOS</h3>
            {prizeRows.length > 0 ? (
              <div className="space-y-2">
                {prizeRows.slice(0, 8).map((rank) => {
                  const payout = rank.payouts[0];
                  return (
                    <div key={rank.threshold} className="flex items-center justify-between rounded-lg border border-miyu-border px-3 py-2 text-sm">
                      <span className="font-mono text-miyu-text">Top {rank.threshold}</span>
                      <span className="font-mono font-bold text-miyu-text">
                        {payout ? formatPrize(payout.quantity, payout.value) : "N/D"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-miyu-text-muted">Sin premios publicados en la API.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
