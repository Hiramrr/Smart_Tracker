"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface EventWindow {
  eventWindowId: string;
  beginTime: string;
  endTime: string;
  round: number;
  scoreLocations?: ScoreLocation[];
}

interface ScoreLocation {
  leaderboardEventId: string;
  leaderboardEventWindowId: string;
  isMain: boolean;
  scoringRules?: ScoringRule[];
}

interface ScoringRule {
  trackedStat: string;
  matchRule: string;
  rewardTiers?: { keyValue: string; pointsEarned: number; multiplicative: boolean }[];
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
    playlistDescription: string;
    primaryColor: string;
    secondaryColor: string;
    posterBackImage: string;
    squarePosterImage: string;
    tournamentViewBackgroundImage: string;
    playlistTileImage: string;
    roundNames: string[];
  };
  eventWindows: EventWindow[];
}

interface LeaderboardEntry {
  teamId: string;
  players: { accountId: string; username: string | null; flagToken: string | null }[];
  pointsEarned: number;
  score: number;
  rank: number;
  percentile: number;
  sessionHistory?: { sessionId: string; endTime: string; trackedStats: Record<string, number> }[];
}

interface LeaderboardData {
  success: boolean;
  leaderboard: {
    leaderboardEventId: string;
    leaderboardEventWindowId: string;
    page: number;
    totalPages: number;
    updatedAt: string;
    entries: LeaderboardEntry[];
  };
}

type TabType = "info" | "leaderboards" | "team" | "player" | "event" | "timeline";

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
  const hasPastWindow = windows.some(w => new Date(w.endTime) < now);
  const hasLiveWindow = windows.some(w => new Date(w.beginTime) <= now && new Date(w.endTime) >= now);
  if (hasLiveWindow) return "live";
  if (hasFutureWindow && hasPastWindow) return "live";
  if (hasFutureWindow) return "upcoming";
  return "past";
}

function TournamentImage({ tournament, className }: { tournament: Tournament; className?: string }) {
  const imageUrl = tournament.displayData?.squarePosterImage ||
    tournament.displayData?.playlistTileImage ||
    tournament.displayData?.posterBackImage;
  if (!imageUrl) return <div className={`bg-miyu-surface ${className}`} />;
  return <img src={imageUrl} alt="" className={`object-cover ${className}`} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />;
}

function getTrackedStat(stats: Record<string, number>, ...keys: string[]) {
  for (const key of keys) {
    if (typeof stats[key] === "number") return stats[key];
  }
  return undefined;
}

function getEntryMatches(entry: LeaderboardEntry) {
  return entry.sessionHistory?.reduce((total, session) => {
    return total + (getTrackedStat(session.trackedStats, "MATCH_PLAYED_STAT", "matchesplayed") || 0);
  }, 0) || 0;
}

function getEntryWins(entry: LeaderboardEntry) {
  return entry.sessionHistory?.reduce((total, session) => {
    return total + (getTrackedStat(session.trackedStats, "VICTORY_ROYALE_STAT", "placetop1") || 0);
  }, 0) || 0;
}

function getPreferredStatKeys(entry: LeaderboardEntry | undefined) {
  const stats = entry?.sessionHistory?.[0]?.trackedStats;
  if (!stats) return [];

  const preferred = [
    "TEAM_ELIMS_STAT_INDEX",
    "PLACEMENT_STAT_INDEX",
    "TIME_ALIVE_STAT",
    "PLACEMENT_TIEBREAKER_STAT",
  ];

  return preferred.filter((key) => key in stats).slice(0, 2);
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
    default:
      return key;
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

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

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
        {/* Search and controls */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchPlayer}
              onChange={(e) => setSearchPlayer(e.target.value)}
              placeholder="Search for a player"
              className="w-full px-3 py-2 bg-miyu-surface border border-miyu-border rounded-lg text-sm text-miyu-text placeholder-miyu-text-muted/60 focus:outline-none focus:border-[#204E46]"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-miyu-text-muted">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-2 border border-miyu-border rounded-lg disabled:opacity-30 hover:bg-miyu-surface transition-colors">
              ← Previous
            </button>
            <span className="font-mono">Page {page + 1} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-2 border border-miyu-border rounded-lg disabled:opacity-30 hover:bg-miyu-surface transition-colors">
              Next →
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
                  <th className="text-right py-3 px-4 text-miyu-text-muted font-mono text-xs">Matches</th>
                  <th className="text-right py-3 px-4 text-miyu-text-muted font-mono text-xs">Wins</th>
                  {statKeys.slice(0, 2).map(key => (
                    <th key={key} className="text-right py-3 px-4 text-miyu-text-muted font-mono text-xs capitalize">{formatStatLabel(key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const playerNames = entry.players.map(p => p.username || p.accountId.slice(0, 8)).join(" + ");
                  const lastSession = entry.sessionHistory?.[entry.sessionHistory.length - 1];
                  const stats = lastSession?.trackedStats || {};
                  const isSelected = selectedEntry?.teamId === entry.teamId;
                  const matchesPlayed = getEntryMatches(entry);
                  const wins = getEntryWins(entry);

                  return (
                    <tr
                      key={entry.teamId}
                      onClick={() => setSelectedEntry(isSelected ? null : entry)}
                      className={`border-b border-miyu-border/50 cursor-pointer transition-colors ${
                        isSelected ? "bg-[#204E46]/10" : "hover:bg-miyu-bg"
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
                      <td className="py-3 px-4 text-miyu-text font-medium">{playerNames}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-miyu-text">{entry.pointsEarned}</td>
                      <td className="py-3 px-4 text-right font-mono text-miyu-text-muted">{matchesPlayed || "—"}</td>
                      <td className="py-3 px-4 text-right font-mono text-miyu-text-muted">
                        {wins || "—"}
                      </td>
                      {statKeys.slice(0, 2).map(key => (
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
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-4 py-2 border border-miyu-border rounded-lg text-sm disabled:opacity-30 hover:bg-miyu-surface transition-colors">
            ← Previous Page
          </button>
          <span className="text-sm text-miyu-text-muted font-mono">Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-4 py-2 border border-miyu-border rounded-lg text-sm disabled:opacity-30 hover:bg-miyu-surface transition-colors">
            Next Page →
          </button>
        </div>
      </div>

      {/* Side panel - selected entry details */}
      {selectedEntry && (
        <div className="w-72 flex-shrink-0">
          <div className="bg-miyu-surface border border-miyu-border rounded-xl p-4 sticky top-4">
            <div className="text-center mb-4">
              <div className="text-2xl font-bold text-miyu-text font-mono">#{selectedEntry.rank}</div>
            </div>

            <div className="space-y-2 mb-4">
              {selectedEntry.players.map((p, i) => (
                <div key={p.accountId} className="flex items-center gap-2 text-sm">
                  {p.flagToken && (
                    <span className="text-lg">{p.flagToken}</span>
                  )}
                  <span className="text-miyu-text font-medium">{p.username || p.accountId.slice(0, 8)}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
              <div>
                <div className="text-lg font-bold text-miyu-text font-mono">{selectedEntry.pointsEarned}</div>
                <div className="text-xs text-miyu-text-muted">Points</div>
              </div>
              <div>
                <div className="text-lg font-bold text-miyu-text font-mono">{getEntryMatches(selectedEntry) || 0}</div>
                <div className="text-xs text-miyu-text-muted">Matches</div>
              </div>
              <div>
                <div className="text-lg font-bold text-miyu-text font-mono">
                  {getEntryWins(selectedEntry) || 0}
                </div>
                <div className="text-xs text-miyu-text-muted">Wins</div>
              </div>
            </div>

            {selectedEntry.sessionHistory?.map((session, i) => {
              const stats = session.trackedStats;
              return (
                <div key={session.sessionId} className="border border-miyu-border rounded-lg p-3 mb-2">
                  <div className="text-xs text-miyu-text-muted mb-2">Match #{i + 1}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-miyu-text-muted">Placement:</span>
                      <span className="text-miyu-text ml-1 font-mono">
                        {getTrackedStat(stats, "PLACEMENT_STAT_INDEX", "placetop1") !== undefined
                          ? `Top ${getTrackedStat(stats, "PLACEMENT_STAT_INDEX", "placetop1")}`
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-miyu-text-muted">Elims:</span>
                      <span className="text-miyu-text ml-1 font-mono">{getTrackedStat(stats, "TEAM_ELIMS_STAT_INDEX", "kills", "eliminations") ?? "—"}</span>
                    </div>
                  </div>
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
  const router = useRouter();
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
        const res = await fetch(`/api/osirion?action=tournaments&lang=es&includeHistoricData=true`);
        const data = await res.json();
        if (data.success && data.tournaments) {
          const found = data.tournaments.find((t: Tournament) => t.eventId === tournamentId);
          if (found) setTournament(found);
          else setError("Torneo no encontrado");
        } else {
          setError(data.error || "Error al cargar torneo");
        }
      } catch (err: any) {
        setError(err.message);
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
  const allScoreLocations = tournament.eventWindows.flatMap(w => w.scoreLocations || []);

  const tabs: { key: TabType; label: string }[] = [
    { key: "info", label: "Event Info" },
    { key: "leaderboards", label: "Leaderboards" },
    { key: "team", label: "Team Stats" },
    { key: "player", label: "Player Stats" },
    { key: "event", label: "Event Stats" },
    { key: "timeline", label: "Timeline" },
  ];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/dashboard/tournaments" className="inline-flex items-center gap-2 text-sm text-miyu-text-muted hover:text-miyu-text transition-colors">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Tournaments
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
                ? "bg-[#204E46] text-white"
                : "text-miyu-text-muted hover:text-miyu-text"
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

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-miyu-surface border border-miyu-border rounded-xl p-4">
              <div className="text-xs text-miyu-text-muted mb-1">Total Rounds</div>
              <div className="text-2xl font-bold font-mono text-miyu-text">{tournament.eventWindows?.length || 0}</div>
            </div>
            <div className="bg-miyu-surface border border-miyu-border rounded-xl p-4">
              <div className="text-xs text-miyu-text-muted mb-1">Regions</div>
              <div className="text-2xl font-bold font-mono text-miyu-text">{tournament.regions.length}</div>
            </div>
            <div className="bg-miyu-surface border border-miyu-border rounded-xl p-4">
              <div className="text-xs text-miyu-text-muted mb-1">Platforms</div>
              <div className="text-2xl font-bold font-mono text-miyu-text">{tournament.platforms.length || "All"}</div>
            </div>
            <div className="bg-miyu-surface border border-miyu-border rounded-xl p-4">
              <div className="text-xs text-miyu-text-muted mb-1">Status</div>
              <div className="text-2xl font-bold font-mono text-miyu-text capitalize">{status}</div>
            </div>
          </div>

          {/* Rounds */}
          <div className="bg-miyu-surface border border-miyu-border rounded-xl p-6">
            <h3 className="text-sm font-bold text-miyu-text mb-4 font-mono">ROUNDS</h3>
            <div className="space-y-2">
              {tournament.eventWindows?.map((w) => {
                const isPast = new Date(w.endTime) < new Date();
                const isLive = new Date(w.beginTime) <= new Date() && new Date(w.endTime) >= new Date();
                const roundName = tournament.displayData?.roundNames?.[w.round - 1] || `Round ${w.round}`;
                const hasLeaderboard = (w.scoreLocations?.length ?? 0) > 0;

                return (
                  <div
                    key={w.eventWindowId}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      isLive ? "border-red-500/30 bg-red-500/5" :
                      isPast ? "border-miyu-border/50" :
                      "border-miyu-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        isLive ? "bg-red-500 text-white" :
                        isPast ? "bg-miyu-text-muted/20 text-miyu-text-muted" :
                        "bg-[#204E46] text-white"
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
                      {isPast && <span className="text-xs text-miyu-text-muted">Completed</span>}
                      {!isLive && !isPast && <span className="text-xs text-[#204E46]">{formatRelativeTime(w.beginTime)}</span>}
                      {hasLeaderboard && (
                        <button
                          onClick={() => { setSelectedRound(w); setActiveTab("leaderboards"); }}
                          className="text-xs text-[#204E46] hover:underline font-mono"
                        >
                          View Leaderboard →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Event ID */}
          <div className="bg-miyu-surface border border-miyu-border rounded-xl p-4">
            <div className="text-xs text-miyu-text-muted font-mono">Event ID: {tournament.eventId}</div>
          </div>
        </div>
      )}

      {activeTab === "leaderboards" && (
        <div className="space-y-4">
          {/* Round selector */}
          <div className="flex flex-wrap gap-2">
            {tournament.eventWindows?.filter(w => (w.scoreLocations?.length ?? 0) > 0).map(w => {
              const roundName = tournament.displayData?.roundNames?.[w.round - 1] || `Round ${w.round}`;
              const isSelected = selectedRound?.eventWindowId === w.eventWindowId;
              return (
                <button
                  key={w.eventWindowId}
                  onClick={() => setSelectedRound(w)}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                    isSelected
                      ? "bg-[#204E46] text-white border-[#204E46]"
                      : "bg-miyu-surface text-miyu-text-muted border-miyu-border hover:border-[#204E46]/30"
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
            <div className="text-center py-12 text-miyu-text-muted text-sm">No leaderboard available for this round</div>
          ) : (
            <div className="text-center py-12 text-miyu-text-muted text-sm">Select a round to view leaderboard</div>
          )}
        </div>
      )}

      {activeTab === "team" && (
        <div className="bg-miyu-surface border border-miyu-border rounded-xl p-8 text-center">
          <div className="text-miyu-text-muted text-sm">Team Stats - Coming soon</div>
        </div>
      )}

      {activeTab === "player" && (
        <div className="bg-miyu-surface border border-miyu-border rounded-xl p-8 text-center">
          <div className="text-miyu-text-muted text-sm">Player Stats - Coming soon</div>
        </div>
      )}

      {activeTab === "event" && (
        <div className="bg-miyu-surface border border-miyu-border rounded-xl p-8 text-center">
          <div className="text-miyu-text-muted text-sm">Event Stats - Coming soon</div>
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="bg-miyu-surface border border-miyu-border rounded-xl p-6">
          <h3 className="text-sm font-bold text-miyu-text mb-4 font-mono">TIMELINE</h3>
          <div className="space-y-4">
            {tournament.eventWindows?.sort((a, b) => new Date(a.beginTime).getTime() - new Date(b.beginTime).getTime()).map((w, i) => {
              const isPast = new Date(w.endTime) < new Date();
              const isLive = new Date(w.beginTime) <= new Date() && new Date(w.endTime) >= new Date();
              const roundName = tournament.displayData?.roundNames?.[w.round - 1] || `Round ${w.round}`;

              return (
                <div key={w.eventWindowId} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full ${isLive ? "bg-red-500" : isPast ? "bg-miyu-text-muted" : "bg-[#204E46]"}`} />
                    {i < (tournament.eventWindows?.length || 0) - 1 && <div className="w-px h-full bg-miyu-border mt-1" />}
                  </div>
                  <div className="pb-4">
                    <div className="text-sm text-miyu-text font-medium">{roundName}</div>
                    <div className="text-xs text-miyu-text-muted">{formatDate(w.beginTime)}</div>
                    {isLive && <span className="text-xs text-red-400">Live now</span>}
                    {isPast && <span className="text-xs text-miyu-text-muted">Completed</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
