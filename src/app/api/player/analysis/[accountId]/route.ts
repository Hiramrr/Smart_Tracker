import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const OSIRION_BASE = "https://fnapi.osirion.gg/v1";
const FORTNITE_API_BASE = "https://fortnite-api.com/v2";
const OSIRION_API_KEY = process.env.OSIRION_API_KEY;
const FORTNITE_API_KEY = process.env.FORTNITE_API_KEY;

/**
 * Análisis completo de un jugador:
 * 1. fortnite-api.com → stats por modo (solo/duo/squad) para season + lifetime
 * 2. Osirion /ranked/account-ranks → rangos históricos por temporada
 * 3. Osirion /stats/account → stats con timeframe season + lifetime
 * 4. Osirion tournaments → historial competitivo real (placements, puntos)
 * 5. Clasificación competitiva 6 niveles
 * 5. Predicción de rango de próxima temporada
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;
  if (!accountId) {
    return NextResponse.json({ success: false, error: "accountId requerido" }, { status: 400 });
  }

  try {
    // ═══════════════════════════════════════════
    // 1. Fetch paralelo de todas las fuentes
    // ═══════════════════════════════════════════
    const [
      fnapiSeason,
      fnapiLifetime,
      osirionRanks,
      osirionStatsSeason,
      osirionStatsLifetime,
      tournamentHistory,
    ] = await Promise.all([
      fetchFortniteApi(accountId, "season"),
      fetchFortniteApi(accountId, "lifetime"),
      fetchOsirionRanks(accountId),
      fetchOsirionStats(accountId, "season"),
      fetchOsirionStats(accountId, "lifetime"),
      fetchTournamentHistory(accountId),
    ]);

    const playerName =
      fnapiSeason?.data?.account?.name ||
      fnapiLifetime?.data?.account?.name ||
      osirionStatsLifetime?.displayName ||
      osirionStatsSeason?.displayName ||
      accountId;

    // ═══════════════════════════════════════════
    // 2. Extraer datos
    // ═══════════════════════════════════════════
    const seasonModes = extractModeBreakdown(fnapiSeason);
    const lifetimeModes = extractModeBreakdown(fnapiLifetime);
    const overallSeason = extractOverall(fnapiSeason) || extractOsirionOverall(osirionStatsSeason);
    const overallLifetime = extractOverall(fnapiLifetime) || extractOsirionOverall(osirionStatsLifetime);

    // Rangos históricos por temporada — separados por modo
    const rankedHistoryBR = parseRankedHistory(osirionRanks, "br");
    const rankedHistoryReload = parseRankedHistory(osirionRanks, "reload");

    // Osirion stats detalladas (pueden tener data que fortnite-api no tiene)
    const osirionSeasonStats = extractOsirionModes(osirionStatsSeason);
    const osirionLifetimeStats = extractOsirionModes(osirionStatsLifetime);

    // ═══════════════════════════════════════════
    // 3. Guardar snapshot + obtener historial
    // ═══════════════════════════════════════════
    let snapshots: SnapshotRecord[] = [];
    let savedSnapshot = false;
    try {
      if (overallLifetime) {
        await saveSnapshot(accountId, overallLifetime, overallSeason);
        savedSnapshot = true;
      }
      snapshots = await getSnapshots(accountId);
    } catch (dbErr) {
      console.warn("[Analysis] DB no disponible:", dbErr);
    }

    // ═══════════════════════════════════════════
    // 4. Clasificación + Predicción
    // ═══════════════════════════════════════════
    const storedTournamentProfile = await getStoredTournamentProfile(accountId).catch((dbErr) => {
      console.warn("[Analysis] No se pudo leer historial competitivo local:", dbErr);
      return null;
    });
    const tournamentProfile = mergeTournamentProfiles(
      summarizeTournamentPlacements(tournamentHistory.placements),
      storedTournamentProfile
    );
    const classification = classifyStrict(overallLifetime, overallSeason, rankedHistoryBR, tournamentProfile);
    const prediction = predictTrend(snapshots);
    const rankPrediction = predictNextRank(rankedHistoryBR);

    // ═══════════════════════════════════════════
    // 5. Construir respuesta rica
    // ═══════════════════════════════════════════
    const progress = buildRichProgress({
      seasonModes,
      lifetimeModes,
      osirionSeasonStats,
      osirionLifetimeStats,
      overallSeason,
      overallLifetime,
      rankedHistoryBR,
      rankedHistoryReload,
      tournamentProfile,
      tournamentPlacements: tournamentHistory.placements,
      snapshots,
      classification,
      prediction,
      rankPrediction,
    });

    return NextResponse.json({
      success: true,
      playerName,
      progress,
      classification,
      prediction,
      rankPrediction,
      tournamentProfile,
      tournamentPlacementsScanned: tournamentHistory.scanned,
      rankedSeasons: rankedHistoryBR.length,
      snapshotsCount: snapshots.length,
      savedSnapshot,
    });
  } catch (error) {
    console.error("[Analysis] Error:", error);
    return NextResponse.json({ success: false, error: "Error al analizar datos" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

interface ModeStats {
  mode: string;
  kills: number;
  wins: number;
  matches: number;
  kd: number;
  winRate: number;
  killsPerMatch: number;
  score: number;
  scorePerMatch: number;
  minutesPlayed: number;
  deaths: number;
  playersOutlived: number;
}

interface RankedSeason {
  trackId: string;
  seasonLabel: string;
  rankingType: string;
  currentRank: string;
  highestRank: string;
  progress: number;
  globalRanking: number | null;
  rankValue: number; // numérico para gráficas
  highestRankValue: number;
}

interface SnapshotRecord {
  kd: number;
  win_rate: number;
  matches: number;
  kills: number;
  score_per_match: number;
  created_at: string;
}

interface ProgressItem {
  metric_name: string;
  metric_value: number;
  delta: number;
  period_start: string | null;
  created_at: string;
  _extra?: unknown;
}

interface TournamentPlacement {
  accountId: string;
  epicUsername: string | null;
  eventId: string | null;
  eventWindowId: string;
  placement: number | null;
  points: number | null;
  eliminations: number | null;
  assists: number | null;
  avgPlacement: number | null;
  totalMatches: number | null;
  eventLabel: string | null;
  endTime: number | null;
}

interface TournamentProfile {
  events: number;
  bestPlacement: number | null;
  avgPlacement: number | null;
  top10: number;
  top25: number;
  top100: number;
  top500: number;
  top1000: number;
  avgPoints: number | null;
  avgEliminations: number | null;
  competitiveScore: number;
}

// ═══════════════════════════════════════════
// Fetch helpers
// ═══════════════════════════════════════════

async function fetchFortniteApi(accountId: string, timeWindow: "season" | "lifetime") {
  if (!FORTNITE_API_KEY) return null;
  try {
    const url = `${FORTNITE_API_BASE}/stats/br/v2/${encodeURIComponent(accountId)}?timeWindow=${timeWindow}&image=none`;
    const res = await fetch(url, { headers: { Authorization: FORTNITE_API_KEY } });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

function osirionHeaders(): HeadersInit {
  return OSIRION_API_KEY ? { Authorization: `Bearer ${OSIRION_API_KEY}` } : {};
}

async function fetchOsirionRanks(accountId: string) {
  try {
    const url = `${OSIRION_BASE}/ranked/account-ranks?accountId=${encodeURIComponent(accountId)}&lang=es`;
    const res = await fetch(url, { headers: osirionHeaders() });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

async function fetchOsirionStats(accountId: string, timeframe: "season" | "lifetime") {
  try {
    const url = `${OSIRION_BASE}/stats/account?accountId=${encodeURIComponent(accountId)}&timeframe=${timeframe}`;
    const res = await fetch(url, { headers: osirionHeaders() });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

async function fetchTournamentHistory(accountId: string): Promise<{ placements: TournamentPlacement[]; scanned: number }> {
  try {
    const tournaments = await fetchPlayerTournamentWindows(accountId);
    const maxWindows = Math.min(tournaments.length, 80);
    const placements = await mapLimit(tournaments.slice(0, maxWindows), 6, async (tournament) => {
      const eventWindowId = asText(tournament.eventWindowId);
      if (!eventWindowId) return null;

      const params = new URLSearchParams({
        eventWindowId,
        epicIds: accountId,
        include: "points,eliminations,assists,avgPlacement",
        includeRanks: "true",
        includeTeam: "false",
        orderBy: "points",
        orderByDescending: "true",
        fromIndex: "0",
        limit: "10",
      });
      const eventId = asText(tournament.eventId);
      if (eventId) params.set("eventId", eventId);

      const res = await fetch(`${OSIRION_BASE}/tournaments/stats?${params.toString()}`, { headers: osirionHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      const players = getPlayers(data);
      const player = players.find((candidate) => {
        const epicId = asText(candidate.epicId) || asText(candidate.accountId);
        return epicId?.toLowerCase() === accountId.toLowerCase();
      }) || players[0];
      return player ? normalizeTournamentPlacement(player, tournament, accountId) : null;
    });

    return { placements: placements.filter((p): p is TournamentPlacement => Boolean(p)), scanned: maxWindows };
  } catch (error) {
    console.warn("[Analysis] No se pudo obtener historial de torneos:", error);
    return { placements: [], scanned: 0 };
  }
}

async function fetchPlayerTournamentWindows(accountId: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const limit = 50;

  for (let fromIndex = 0; fromIndex < 200; fromIndex += limit) {
    const params = new URLSearchParams({
      epicIds: accountId,
      includeHistoricData: "true",
      fromIndex: String(fromIndex),
      limit: String(limit),
      lang: "es",
    });
    const res = await fetch(`${OSIRION_BASE}/tournaments?${params.toString()}`, { headers: osirionHeaders() });
    if (!res.ok) break;
    const data = await res.json();
    const page = getTournaments(data);
    if (page.length === 0) break;

    for (const tournament of page) {
      const eventWindowId = asText(tournament.eventWindowId);
      if (!eventWindowId || seen.has(eventWindowId)) continue;
      seen.add(eventWindowId);
      all.push(tournament);
    }
    if (page.length < limit) break;
  }

  return all.sort((a, b) => (toNumber(b.endTime) || 0) - (toNumber(a.endTime) || 0));
}

async function mapLimit<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

function getTournaments(data: unknown): Record<string, unknown>[] {
  const record = asRecord(data);
  return asRecordArray(record.tournaments || record.events || data);
}

function getPlayers(data: unknown): Record<string, unknown>[] {
  const record = asRecord(data);
  return asRecordArray(record.players || record.stats || record.results || record.leaderboard || data);
}

function normalizeTournamentPlacement(
  player: Record<string, unknown>,
  tournament: Record<string, unknown>,
  accountId: string
): TournamentPlacement {
  return {
    accountId,
    epicUsername: asText(player.epicUsername) || asText(player.displayName) || asText(player.name),
    eventId: asText(tournament.eventId) || asText(player.eventId),
    eventWindowId: asText(tournament.eventWindowId) || asText(player.eventWindowId) || "unknown",
    placement: firstNumber(player, ["placement", "rank", "eventRank", "pointsRank", "scoreRank", "totalPointsRank", "sessionRank"]),
    points: firstNumber(player, ["points", "score", "totalPoints"]),
    eliminations: firstNumber(player, ["eliminations", "kills"]),
    assists: firstNumber(player, ["assists"]),
    avgPlacement: toNumber(player.avgPlacement),
    totalMatches: firstNumber(player, ["matches", "totalMatches"]) ?? toNumber(tournament.totalMatches),
    eventLabel: asText(tournament.eventName) || asText(tournament.name) || asText(tournament.eventWindowId),
    endTime: toNumber(tournament.endTime),
  };
}

async function getStoredTournamentProfile(accountId: string): Promise<TournamentProfile | null> {
  const result = await query(
    `SELECT placement, points, eliminations, total_matches
     FROM player_tournament_placements
     WHERE account_id = $1 AND placement IS NOT NULL
     ORDER BY captured_at DESC
     LIMIT 200`,
    [accountId]
  );
  const placements: TournamentPlacement[] = result.rows.map((row: Record<string, unknown>) => ({
    accountId,
    epicUsername: null,
    eventId: null,
    eventWindowId: "stored",
    placement: toNumber(row.placement),
    points: toNumber(row.points),
    eliminations: toNumber(row.eliminations),
    assists: null,
    avgPlacement: null,
    totalMatches: toNumber(row.total_matches),
    eventLabel: null,
    endTime: null,
  }));
  return placements.length > 0 ? summarizeTournamentPlacements(placements) : null;
}

function summarizeTournamentPlacements(placements: TournamentPlacement[]): TournamentProfile {
  const ranks = placements.map((p) => p.placement).filter((rank): rank is number => typeof rank === "number" && rank > 0);
  const points = placements.map((p) => p.points).filter((value): value is number => typeof value === "number");
  const eliminations = placements.map((p) => p.eliminations).filter((value): value is number => typeof value === "number");

  if (ranks.length === 0) {
    return {
      events: 0, bestPlacement: null, avgPlacement: null,
      top10: 0, top25: 0, top100: 0, top500: 0, top1000: 0,
      avgPoints: null, avgEliminations: null, competitiveScore: 0,
    };
  }

  const top10 = ranks.filter((rank) => rank <= 10).length;
  const top25 = ranks.filter((rank) => rank <= 25).length;
  const top100 = ranks.filter((rank) => rank <= 100).length;
  const top500 = ranks.filter((rank) => rank <= 500).length;
  const top1000 = ranks.filter((rank) => rank <= 1000).length;
  const placementPower = ranks.reduce((sum, rank) => sum + (100 / Math.log10(Math.max(rank, 2))), 0) / ranks.length;
  const consistencyBonus = top10 * 24 + top25 * 14 + top100 * 7 + top500 * 2.5 + Math.min(ranks.length, 60) * 0.55;
  const competitiveScore = Math.round(Math.min(100, placementPower + consistencyBonus) * 100) / 100;

  return {
    events: ranks.length,
    bestPlacement: Math.min(...ranks),
    avgPlacement: average(ranks),
    top10,
    top25,
    top100,
    top500,
    top1000,
    avgPoints: points.length > 0 ? average(points) : null,
    avgEliminations: eliminations.length > 0 ? average(eliminations) : null,
    competitiveScore,
  };
}

function mergeTournamentProfiles(primary: TournamentProfile, fallback: TournamentProfile | null): TournamentProfile {
  if (!fallback || fallback.events === 0) return primary;
  if (primary.events === 0) return fallback;
  return {
    events: Math.max(primary.events, fallback.events),
    bestPlacement: minNullable(primary.bestPlacement, fallback.bestPlacement),
    avgPlacement: minNullable(primary.avgPlacement, fallback.avgPlacement),
    top10: Math.max(primary.top10, fallback.top10),
    top25: Math.max(primary.top25, fallback.top25),
    top100: Math.max(primary.top100, fallback.top100),
    top500: Math.max(primary.top500, fallback.top500),
    top1000: Math.max(primary.top1000, fallback.top1000),
    avgPoints: maxNullable(primary.avgPoints, fallback.avgPoints),
    avgEliminations: maxNullable(primary.avgEliminations, fallback.avgEliminations),
    competitiveScore: Math.max(primary.competitiveScore, fallback.competitiveScore),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value !== null && value >= 0) return value;
  }
  return null;
}

function average(values: number[]): number {
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function minNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

// ═══════════════════════════════════════════
// Extract: fortnite-api.com
// ═══════════════════════════════════════════

function extractModeBreakdown(apiRes: unknown): ModeStats[] {
  const stats = asRecord(asRecord(asRecord(apiRes).data).stats);
  if (Object.keys(stats).length === 0) return [];
  const results: ModeStats[] = [];
  const inputSource = asRecord(stats.all || stats.keyboardMouse || stats.gamepad || stats.touch);
  if (Object.keys(inputSource).length === 0) return [];

  for (const mode of ["solo", "duo", "trio", "squad", "ltm"]) {
    const m = asRecord(inputSource[mode]);
    const matches = toNumber(m.matches) || 0;
    if (matches === 0) continue;
    results.push({
      mode, kills: toNumber(m.kills) || 0, wins: toNumber(m.wins) || 0, matches,
      kd: toNumber(m.kd) || 0, winRate: toNumber(m.winRate) || 0, killsPerMatch: toNumber(m.killsPerMatch) || 0,
      score: toNumber(m.score) || 0, scorePerMatch: toNumber(m.scorePerMatch) || 0,
      minutesPlayed: toNumber(m.minutesPlayed) || 0, deaths: toNumber(m.deaths) || 0,
      playersOutlived: toNumber(m.playersOutlived) || 0,
    });
  }
  return results;
}

function extractOverall(apiRes: unknown): ModeStats | null {
  const stats = asRecord(asRecord(asRecord(apiRes).data).stats);
  const source = asRecord(stats.all || stats.keyboardMouse || stats.gamepad || stats.touch);
  const o = asRecord(source.overall);
  const matches = toNumber(o.matches) || 0;
  if (matches === 0) return null;
  return {
    mode: "overall", kills: toNumber(o.kills) || 0, wins: toNumber(o.wins) || 0, matches,
    kd: toNumber(o.kd) || 0, winRate: toNumber(o.winRate) || 0, killsPerMatch: toNumber(o.killsPerMatch) || 0,
    score: toNumber(o.score) || 0, scorePerMatch: toNumber(o.scorePerMatch) || 0,
    minutesPlayed: toNumber(o.minutesPlayed) || 0, deaths: toNumber(o.deaths) || 0,
    playersOutlived: toNumber(o.playersOutlived) || 0,
  };
}

// ═══════════════════════════════════════════
// Extract: Osirion stats
// ═══════════════════════════════════════════

function extractOsirionOverall(apiRes: unknown): ModeStats | null {
  if (!apiRes) return null;
  // Osirion stats: puede tener groupedStats o stats directamente
  const apiRecord = asRecord(apiRes);
  const stats = asRecord(apiRecord.groupedStats || apiRecord.stats || apiRecord);
  
  // Intentar extraer overall
  let totalKills = 0, totalMatches = 0, totalWins = 0, totalScore = 0, totalMinutes = 0;
  
  if (stats.all || stats.overall) {
    const o = asRecord(stats.all || stats.overall);
    const matches = toNumber(o.matchesPlayed) || toNumber(o.matches) || 0;
    const wins = toNumber(o.wins) || 0;
    return {
      mode: "overall", kills: toNumber(o.kills) || 0, wins, matches,
      kd: toNumber(o.kd) || 0, winRate: toNumber(o.winRate) || (wins && matches ? (wins / matches * 100) : 0),
      killsPerMatch: toNumber(o.killsPerMatch) || toNumber(o.killsPerMin) || 0, score: toNumber(o.score) || 0,
      scorePerMatch: toNumber(o.scorePerMatch) || 0, minutesPlayed: toNumber(o.minutesPlayed) || 0,
      deaths: toNumber(o.deaths) || 0, playersOutlived: toNumber(o.playersOutlived) || 0,
    };
  }

  // Si hay stats por modo, combinar
  for (const key of ["solo", "duo", "trio", "squad"]) {
    const m = asRecord(stats[key]);
    if (Object.keys(m).length > 0) {
      totalKills += toNumber(m.kills) || 0;
      totalMatches += toNumber(m.matchesPlayed) || toNumber(m.matches) || 0;
      totalWins += toNumber(m.wins) || 0;
      totalScore += toNumber(m.score) || 0;
      totalMinutes += toNumber(m.minutesPlayed) || 0;
    }
  }

  if (totalMatches === 0) return null;
  const deaths = totalMatches - totalWins;
  return {
    mode: "overall", kills: totalKills, wins: totalWins, matches: totalMatches,
    kd: deaths > 0 ? totalKills / deaths : 0,
    winRate: totalMatches > 0 ? (totalWins / totalMatches) * 100 : 0,
    killsPerMatch: totalMatches > 0 ? totalKills / totalMatches : 0,
    score: totalScore, scorePerMatch: totalMatches > 0 ? totalScore / totalMatches : 0,
    minutesPlayed: totalMinutes, deaths, playersOutlived: 0,
  };
}

function extractOsirionModes(apiRes: unknown): ModeStats[] {
  if (!apiRes) return [];
  const apiRecord = asRecord(apiRes);
  const stats = asRecord(apiRecord.groupedStats || apiRecord.stats || apiRecord);
  const results: ModeStats[] = [];

  for (const mode of ["solo", "duo", "trio", "squad"]) {
    const m = asRecord(stats[mode]);
    if (Object.keys(m).length === 0) continue;
    const matches = toNumber(m.matchesPlayed) || toNumber(m.matches) || 0;
    if (matches === 0) continue;
    const wins = toNumber(m.wins) || 0;
    const kills = toNumber(m.kills) || 0;
    const deaths = matches - wins;
    results.push({
      mode, kills, wins, matches,
      kd: toNumber(m.kd) || (deaths > 0 ? kills / deaths : 0),
      winRate: toNumber(m.winRate) || (matches > 0 ? (wins / matches) * 100 : 0),
      killsPerMatch: toNumber(m.killsPerMatch) || (matches > 0 ? kills / matches : 0),
      score: toNumber(m.score) || 0, scorePerMatch: toNumber(m.scorePerMatch) || 0,
      minutesPlayed: toNumber(m.minutesPlayed) || 0, deaths, playersOutlived: toNumber(m.playersOutlived) || 0,
    });
  }
  return results;
}

// ═══════════════════════════════════════════
// Parse: Ranked History
// ═══════════════════════════════════════════

const RANK_VALUES: Record<string, number> = {
  "bronze": 1, "bronce": 1,
  "silver": 2, "plata": 2,
  "gold": 3, "oro": 3,
  "platinum": 4, "platino": 4,
  "diamond": 5, "diamante": 5,
  "elite": 6, "élite": 6,
  "champion": 7, "campeón": 7, "as": 7, "ace": 7,
  "unreal": 8,
};

function rankNameToValue(name: string): number {
  if (!name) return 0;
  const lower = name.toLowerCase().trim();
  // Check exact match first
  if (RANK_VALUES[lower] !== undefined) return RANK_VALUES[lower];
  // Check partial match
  for (const [key, val] of Object.entries(RANK_VALUES)) {
    if (lower.includes(key)) return val;
  }
  return 0;
}

function parseRankedHistory(ranksData: unknown, modeCategory: "br" | "reload"): RankedSeason[] {
  if (!ranksData) return [];
  
  const ranksRecord = asRecord(ranksData);
  const modes = asRecordArray(ranksRecord.modes || ranksData);

  if (modes.length === 0) return [];

  // Definir qué rankingTypes aceptamos para cada categoría y su prioridad
  const CATEGORY_MAP: Record<string, string[]> = {
    "br": ["ranked-br-combined", "ranked-br", "br"],
    "reload": ["ranked-blastberry-combined", "ranked-blastberry", "blastberry"]
  };

  const allowedTypes = CATEGORY_MAP[modeCategory] || [];
  
  // Agrupar por trackId para quedarnos con el mejor rankingType disponible por temporada
  const byTrack = new Map<string, Record<string, unknown>>();

  for (const mode of modes) {
    if (!mode) continue;
    const rankingType = asText(mode.rankingType) || "";
    
    // Verificar si el tipo pertenece a la categoría buscada
    const typeIndex = allowedTypes.indexOf(rankingType);
    if (typeIndex === -1) continue;

    const trackId = asText(mode.rankingTrackId) || asText(mode.trackId) || "unknown";
    
    // Si ya tenemos este track, solo sobrescribir si el nuevo tiene mayor prioridad (menor índice en allowedTypes)
    const existing = byTrack.get(trackId);
    const existingRankingType = existing ? asText(existing.rankingType) || "" : "";
    if (!existing || typeIndex < allowedTypes.indexOf(existingRankingType)) {
      const currentDiv = mode.currentDivision;
      const highestDiv = mode.highestDivision;
      const currentDivRecord = asRecord(currentDiv);
      const highestDivRecord = asRecord(highestDiv);
      const currentName = typeof currentDiv === "string" ? currentDiv
        : asText(currentDivRecord.divisionName) || asText(currentDivRecord.name) || "";
      const highestName = typeof highestDiv === "string" ? highestDiv
        : asText(highestDivRecord.divisionName) || asText(highestDivRecord.name) || "";

      if (!currentName && !highestName) continue;

      byTrack.set(trackId, {
        ...mode,
        currentName,
        highestName,
        priority: typeIndex
      });
    }
  }

  const results: RankedSeason[] = Array.from(byTrack.values()).map(m => {
      const trackId = asText(m.rankingTrackId) || asText(m.trackId) || "unknown";
      const currentName = asText(m.currentName) || "";
      const highestName = asText(m.highestName) || "";
    return {
      trackId,
      seasonLabel: formatTrackId(trackId),
      rankingType: asText(m.rankingType) || "",
      currentRank: currentName,
      highestRank: highestName || currentName,
      progress: toNumber(m.promotionProgress) || 0,
      globalRanking: toNumber(m.currentPlayerRanking),
      rankValue: rankNameToValue(currentName),
      highestRankValue: rankNameToValue(highestName || currentName),
    };
  });

  // Ordenar numéricamente por el número extraído del trackId, o por el ID mismo si no hay números
  return results.sort((a, b) => {
    const matchA = a.trackId.match(/(\d+)/);
    const matchB = b.trackId.match(/(\d+)/);
    
    if (matchA && matchB) {
      return parseInt(matchA[1]) - parseInt(matchB[1]);
    }
    return a.trackId.localeCompare(b.trackId);
  });
}

function formatTrackId(trackId: string): string {
  // Caso especial: códigos de track conocidos
  if (trackId.toLowerCase() === "l3ague") return "Actual";
  
  const match = trackId.match(/(\d+)/);
  if (!match) {
    // Si no hay números, limpiar el ID para que sea legible
    return trackId
      .replace(/ranked[-_]?br[-_]?/i, "")
      .replace(/combined/i, "")
      .replace(/blastberry/i, "Reload ")
      .trim() || trackId;
  }
  
  const num = parseInt(match[1]);
  // Si el número es muy grande (ej: 31), probablemente es la temporada de Fortnite
  if (num > 20) return `Temp. ${num}`;
  
  // Si es pequeño (0, 1, 2), mapear a temporadas de Ranked (Ranked empezó en T0)
  return `Temp. ${num + 1}`;
}

// ═══════════════════════════════════════════
// DB: Snapshots
// ═══════════════════════════════════════════

async function saveSnapshot(accountId: string, lifetime: ModeStats, season: ModeStats | null) {
  const last = await query(
    `SELECT kd, matches FROM player_analysis_snapshots WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [accountId]
  );
  if (last.rows[0] && parseFloat(last.rows[0].matches) === lifetime.matches) return;

  await query(
    `INSERT INTO player_analysis_snapshots
     (account_id, kd, win_rate, matches, kills, score_per_match, season_kd, season_win_rate, season_matches)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [accountId, lifetime.kd, lifetime.winRate, lifetime.matches, lifetime.kills,
     lifetime.scorePerMatch, season?.kd || 0, season?.winRate || 0, season?.matches || 0]
  );
}

async function getSnapshots(accountId: string): Promise<SnapshotRecord[]> {
  const result = await query(
    `SELECT kd, win_rate, matches, kills, score_per_match, created_at 
     FROM player_analysis_snapshots WHERE account_id = $1 ORDER BY created_at ASC LIMIT 200`,
    [accountId]
  );
  return result.rows.map((r: Record<string, unknown>) => ({
    kd: toNumber(r.kd) || 0,
    win_rate: toNumber(r.win_rate) || 0,
    matches: toNumber(r.matches) || 0,
    kills: toNumber(r.kills) || 0,
    score_per_match: toNumber(r.score_per_match) || 0,
    created_at: asText(r.created_at) || new Date(r.created_at as string | number | Date).toISOString(),
  }));
}

// ═══════════════════════════════════════════
// Clasificación estricta (6 niveles)
// Considera KD, WR, y rango ranked actual
// ═══════════════════════════════════════════

function classifyStrict(
  lifetime: ModeStats | null,
  season: ModeStats | null,
  rankedHistory: RankedSeason[],
  tournamentProfile: TournamentProfile
): { level: string; value: number; description: string; tier: string } {
  const kd = season?.kd || lifetime?.kd || 0;
  const wr = season?.winRate || lifetime?.winRate || 0;
  const kpm = season?.killsPerMatch || lifetime?.killsPerMatch || 0;

  // Factor de rango ranked (si tiene historial)
  const latestRank = rankedHistory.length > 0 ? rankedHistory[rankedHistory.length - 1] : null;
  const bestRankValue = rankedHistory.reduce((best, rank) => Math.max(best, rank.highestRankValue, rank.rankValue), 0);
  const rankBonus = Math.max(latestRank?.rankValue || 0, bestRankValue);
  const globalRanking = latestRank?.globalRanking || null;
  const best = tournamentProfile.bestPlacement;
  const score = tournamentProfile.competitiveScore;

  // El historial competitivo manda sobre KD/WR públicos. Es normal que pros
  // tengan stats agregadas menos limpias por scrims, cuentas antiguas o modos mixtos.
  if (
    score >= 88 ||
    (best !== null && best <= 10) ||
    tournamentProfile.top25 >= 2 ||
    tournamentProfile.top100 >= 5 ||
    (rankBonus >= 8 && globalRanking !== null && globalRanking > 0 && globalRanking <= 1000)
  ) {
    return {
      level: "Elite / Pro",
      value: 5,
      tier: "S",
      description: `Historial competitivo: mejor #${best ?? "N/D"}, top100 x${tournamentProfile.top100}, score ${score.toFixed(1)}`,
    };
  }
  if (
    score >= 66 ||
    (best !== null && best <= 100) ||
    tournamentProfile.top500 >= 4 ||
    (rankBonus >= 8 && kd >= 2.5) ||
    (globalRanking !== null && globalRanking > 0 && globalRanking <= 5000)
  ) {
    return {
      level: "Competitivo",
      value: 4,
      tier: "A",
      description: `Competitivo: mejor #${best ?? "N/D"}, eventos ${tournamentProfile.events}, KD ${kd.toFixed(2)}`,
    };
  }

  // Fallback por stats/ranked cuando todavía no hay torneos suficientes.
  // Elite/Pro: KD ≥8 Y WR ≥35% Y ranked Unreal (o equivalente)
  // Competitivo: KD ≥4 Y WR ≥18% Y ranked Champion+
  // Avanzado: KD ≥2 Y WR ≥7% Y ranked Diamond+
  // Intermedio: KD ≥1 Y WR ≥2.5%
  // Casual: KD ≥0.5
  // Principiante: KD < 0.5

  if (rankBonus >= 8 && kd >= 3 && wr >= 10) {
    return { level: "Competitivo", value: 4, tier: "A", description: `Rango Unreal + KD ${kd.toFixed(2)}, WR ${wr.toFixed(1)}%` };
  }
  if (kd >= 8 && wr >= 35 && rankBonus >= 8) {
    return { level: "Elite / Pro", value: 5, tier: "S", description: `KD ${kd.toFixed(2)}, WR ${wr.toFixed(1)}%, Rango: ${latestRank?.currentRank || "Unreal"}` };
  }
  if (kd >= 8 && wr >= 30) {
    return { level: "Elite / Pro", value: 5, tier: "S", description: `KD ${kd.toFixed(2)}, WR ${wr.toFixed(1)}%` };
  }
  if (kd >= 4 && wr >= 18 && rankBonus >= 7) {
    return { level: "Competitivo", value: 4, tier: "A", description: `KD ${kd.toFixed(2)}, WR ${wr.toFixed(1)}%, Rango: ${latestRank?.currentRank || "Champion"}` };
  }
  if (kd >= 4 && wr >= 15) {
    return { level: "Competitivo", value: 4, tier: "A", description: `KD ${kd.toFixed(2)}, WR ${wr.toFixed(1)}%` };
  }
  if ((kd >= 2 && wr >= 7) || (score >= 36 && tournamentProfile.top1000 >= 2) || (rankBonus >= 6 && kpm >= 2)) {
    const rankLabel = latestRank ? `, Rango: ${latestRank.currentRank}` : "";
    const tournamentLabel = tournamentProfile.events > 0 ? `, mejor #${best}` : "";
    return { level: "Avanzado", value: 3, tier: "B", description: `KD ${kd.toFixed(2)}, WR ${wr.toFixed(1)}%${rankLabel}${tournamentLabel}` };
  }
  if (kd >= 1 && wr >= 2.5) {
    return { level: "Intermedio", value: 2, tier: "C", description: `KD ${kd.toFixed(2)}, WR ${wr.toFixed(1)}%` };
  }
  if (kd >= 0.5) {
    return { level: "Casual", value: 1, tier: "D", description: `KD ${kd.toFixed(2)}, WR ${wr.toFixed(1)}%` };
  }
  return { level: "Principiante", value: 0, tier: "E", description: `KD ${kd.toFixed(2)}, WR ${wr.toFixed(1)}%` };
}

// ═══════════════════════════════════════════
// Predicción de stats
// ═══════════════════════════════════════════

function predictTrend(snapshots: SnapshotRecord[]) {
  if (snapshots.length < 2) {
    return { predictedKd: null, predictedWr: null, trend: "neutral", kdSlope: 0, wrSlope: 0 };
  }
  const n = snapshots.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const kdSlope = linSlope(x, snapshots.map(s => s.kd));
  const wrSlope = linSlope(x, snapshots.map(s => s.win_rate));
  const predictedKd = Math.max(0, snapshots[n - 1].kd + kdSlope);
  const predictedWr = Math.max(0, Math.min(100, snapshots[n - 1].win_rate + wrSlope));
  let trend = "stable";
  if (kdSlope > 0.02 && wrSlope > 0.05) trend = "up";
  else if (kdSlope < -0.02 && wrSlope < -0.05) trend = "down";
  else if (kdSlope > 0.01 || wrSlope > 0.02) trend = "slightly_up";
  else if (kdSlope < -0.01 || wrSlope < -0.02) trend = "slightly_down";
  return { predictedKd, predictedWr, trend, kdSlope, wrSlope };
}

// ═══════════════════════════════════════════
// Predicción de RANGO de próxima temporada
// ═══════════════════════════════════════════

function predictNextRank(history: RankedSeason[]): {
  predictedRank: string | null;
  predictedRankValue: number | null;
  confidence: string;
  reasoning: string;
} {
  if (history.length < 2) {
    return { predictedRank: null, predictedRankValue: null, confidence: "low", reasoning: "Insuficientes temporadas" };
  }

  const values = history.map(h => h.highestRankValue || h.rankValue);
  const n = values.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const slope = linSlope(x, values);

  // Predecir siguiente valor
  const nextVal = Math.round(Math.max(1, Math.min(8, values[n - 1] + slope)));
  
  const rankNames: Record<number, string> = {
    1: "Bronce", 2: "Plata", 3: "Oro", 4: "Platino",
    5: "Diamante", 6: "Elite", 7: "Campeón", 8: "Unreal",
  };

  // Confianza basada en consistencia
  const variance = values.reduce((acc, v) => acc + Math.pow(v - (values.reduce((a, b) => a + b, 0) / n), 2), 0) / n;
  const confidence = variance < 1 ? "alta" : variance < 3 ? "media" : "baja";

  // Razonamiento
  let reasoning = "";
  if (slope > 0.3) reasoning = `Tendencia ascendente: +${slope.toFixed(1)} rangos por temporada`;
  else if (slope < -0.3) reasoning = `Tendencia descendente: ${slope.toFixed(1)} rangos por temporada`;
  else reasoning = `Rango estable en las últimas ${n} temporadas`;

  const current = rankNames[values[n - 1]] || "Desconocido";
  const predicted = rankNames[nextVal] || "Desconocido";
  if (current !== predicted) {
    reasoning += `. De ${current} → ${predicted}`;
  }

  return { predictedRank: predicted, predictedRankValue: nextVal, confidence, reasoning };
}

function linSlope(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const sx = x.reduce((a, b) => a + b, 0);
  const sy = y.reduce((a, b) => a + b, 0);
  const sxy = x.reduce((a, xi, i) => a + xi * y[i], 0);
  const sx2 = x.reduce((a, xi) => a + xi * xi, 0);
  const d = n * sx2 - sx * sx;
  return d === 0 ? 0 : (n * sxy - sx * sy) / d;
}

// ═══════════════════════════════════════════
// Build rich response for frontend
// ═══════════════════════════════════════════

function buildRichProgress(opts: {
  seasonModes: ModeStats[];
  lifetimeModes: ModeStats[];
  osirionSeasonStats: ModeStats[];
  osirionLifetimeStats: ModeStats[];
  overallSeason: ModeStats | null;
  overallLifetime: ModeStats | null;
  rankedHistoryBR: RankedSeason[];
  rankedHistoryReload: RankedSeason[];
  tournamentProfile: TournamentProfile;
  tournamentPlacements: TournamentPlacement[];
  snapshots: SnapshotRecord[];
  classification: { level: string; value: number; tier: string; description: string };
  prediction: { predictedKd: number | null; predictedWr: number | null; trend: string };
  rankPrediction: { predictedRank: string | null; predictedRankValue: number | null; confidence: string; reasoning: string };
}) {
  const progress: ProgressItem[] = [];

  // Merge mode data: preferir fortnite-api, fallback a osirion
  const effectiveSeasonModes = opts.seasonModes.length > 0 ? opts.seasonModes : opts.osirionSeasonStats;
  const effectiveLifetimeModes = opts.lifetimeModes.length > 0 ? opts.lifetimeModes : opts.osirionLifetimeStats;

  // ── KD por modo (para bar charts) ──
  for (const m of effectiveSeasonModes) {
    progress.push({ metric_name: "kd_season", metric_value: m.kd, delta: 0, period_start: `${fmtMode(m.mode)} (Temp)`, created_at: new Date().toISOString() });
  }
  for (const m of effectiveLifetimeModes) {
    progress.push({ metric_name: "kd_season", metric_value: m.kd, delta: 0, period_start: `${fmtMode(m.mode)} (Total)`, created_at: new Date().toISOString() });
  }

  // ── WR por modo (para bar charts) ──
  for (const m of effectiveSeasonModes) {
    progress.push({ metric_name: "win_rate_season", metric_value: m.winRate, delta: 0, period_start: `${fmtMode(m.mode)} (Temp)`, created_at: new Date().toISOString() });
  }
  for (const m of effectiveLifetimeModes) {
    progress.push({ metric_name: "win_rate_season", metric_value: m.winRate, delta: 0, period_start: `${fmtMode(m.mode)} (Total)`, created_at: new Date().toISOString() });
  }

  // ── Mode detail table ──
  const allDetails = [
    ...(opts.overallSeason ? [{ ...opts.overallSeason, mode: "Overall (Temp)" }] : []),
    ...(opts.overallLifetime ? [{ ...opts.overallLifetime, mode: "Overall (Total)" }] : []),
    ...effectiveSeasonModes.map(m => ({ ...m, mode: `${fmtMode(m.mode)} (Temp)` })),
    ...effectiveLifetimeModes.map(m => ({ ...m, mode: `${fmtMode(m.mode)} (Total)` })),
  ];
  for (const m of allDetails) {
    progress.push({
      metric_name: "mode_detail", metric_value: m.kd, delta: m.winRate,
      period_start: m.mode, created_at: new Date().toISOString(),
      _extra: { kills: m.kills, wins: m.wins, matches: m.matches, killsPerMatch: m.killsPerMatch, scorePerMatch: m.scorePerMatch, minutesPlayed: m.minutesPlayed },
    });
  }

  // ── Ranked history BR (para gráfica de evolución de rango) ──
  for (const r of opts.rankedHistoryBR) {
    progress.push({
      metric_name: "ranked_history", metric_value: r.highestRankValue, delta: r.rankValue,
      period_start: r.seasonLabel, created_at: new Date().toISOString(),
      _extra: { currentRank: r.currentRank, highestRank: r.highestRank, progress: r.progress, globalRanking: r.globalRanking, trackId: r.trackId },
    });
  }

  // ── Ranked history Reload (separado) ──
  for (const r of opts.rankedHistoryReload) {
    progress.push({
      metric_name: "ranked_history_reload", metric_value: r.highestRankValue, delta: r.rankValue,
      period_start: r.seasonLabel, created_at: new Date().toISOString(),
      _extra: { currentRank: r.currentRank, highestRank: r.highestRank, progress: r.progress, globalRanking: r.globalRanking, trackId: r.trackId },
    });
  }

  // ── Snapshot history (para line charts de evolución) ──
  let prevKd = 0, prevWr = 0;
  for (const s of opts.snapshots) {
    const lbl = new Date(s.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
    progress.push({ metric_name: "snapshot_kd", metric_value: s.kd, delta: s.kd - prevKd, period_start: lbl, created_at: s.created_at });
    progress.push({ metric_name: "snapshot_wr", metric_value: s.win_rate, delta: s.win_rate - prevWr, period_start: lbl, created_at: s.created_at });
    prevKd = s.kd; prevWr = s.win_rate;
  }

  // ── Classification ──
  progress.push({ metric_name: "skill_category", metric_value: opts.classification.value, delta: 0, period_start: opts.classification.tier, created_at: new Date().toISOString(), _extra: { description: opts.classification.description } });

  // ── Competitive tournament profile ──
  const tp = opts.tournamentProfile;
  if (tp.events > 0) {
    progress.push({ metric_name: "tournament_profile_score", metric_value: tp.competitiveScore, delta: 0, period_start: "Historial competitivo", created_at: new Date().toISOString(), _extra: tp });
    progress.push({ metric_name: "tournament_events_count", metric_value: tp.events, delta: 0, period_start: "Eventos", created_at: new Date().toISOString() });
    if (tp.bestPlacement !== null) {
      progress.push({ metric_name: "tournament_best_placement", metric_value: tp.bestPlacement, delta: 0, period_start: "Mejor placement", created_at: new Date().toISOString() });
    }
    progress.push({ metric_name: "tournament_top_100_count", metric_value: tp.top100, delta: 0, period_start: "Top 100", created_at: new Date().toISOString() });
  }

  for (const placement of opts.tournamentPlacements.slice(0, 30)) {
    if (placement.placement === null) continue;
    progress.push({
      metric_name: "tournament_placement",
      metric_value: placement.placement,
      delta: placement.points || 0,
      period_start: placement.eventLabel || placement.eventWindowId,
      created_at: new Date().toISOString(),
      _extra: {
        eventId: placement.eventId,
        eventWindowId: placement.eventWindowId,
        points: placement.points,
        eliminations: placement.eliminations,
        avgPlacement: placement.avgPlacement,
        totalMatches: placement.totalMatches,
      },
    });
  }

  // ── Predictions: stats ──
  if (opts.prediction.predictedKd !== null) {
    const lastKd = opts.snapshots.length > 0 ? opts.snapshots[opts.snapshots.length - 1].kd : (opts.overallLifetime?.kd || 0);
    progress.push({ metric_name: "predicted_kd_next", metric_value: opts.prediction.predictedKd, delta: opts.prediction.predictedKd - lastKd, period_start: null, created_at: new Date().toISOString() });
  }
  if (opts.prediction.predictedWr !== null) {
    const lastWr = opts.snapshots.length > 0 ? opts.snapshots[opts.snapshots.length - 1].win_rate : (opts.overallLifetime?.winRate || 0);
    progress.push({ metric_name: "predicted_wr_next", metric_value: opts.prediction.predictedWr, delta: opts.prediction.predictedWr - lastWr, period_start: null, created_at: new Date().toISOString() });
  }

  // ── Prediction: rank ──
  if (opts.rankPrediction.predictedRank) {
    progress.push({
      metric_name: "predicted_rank",
      metric_value: opts.rankPrediction.predictedRankValue || 0,
      delta: 0, period_start: opts.rankPrediction.predictedRank,
      created_at: new Date().toISOString(),
      _extra: { confidence: opts.rankPrediction.confidence, reasoning: opts.rankPrediction.reasoning },
    });
  }

  // ── Trend direction ──
  const trendMap: Record<string, number> = { down: -2, slightly_down: -1, stable: 0, neutral: 0, slightly_up: 1, up: 2 };
  progress.push({ metric_name: "trend_direction", metric_value: trendMap[opts.prediction.trend] || 0, delta: 0, period_start: null, created_at: new Date().toISOString() });

  return progress;
}

function fmtMode(mode: string): string {
  return { solo: "Solo", duo: "Duo", trio: "Trio", squad: "Squad", ltm: "LTM" }[mode] || mode;
}
