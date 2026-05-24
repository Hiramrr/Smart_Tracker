import { query } from "@/lib/db";

// ============================================================
// Constantes fiel al script Python: etl/lol_player_classifier.py
// ============================================================
const MODEL_NAME = "lol_player_kmeans_skill_classifier_v1";

const TIER_BASE: Record<string, number> = {
  IRON: 1,
  BRONZE: 2,
  SILVER: 3,
  GOLD: 4,
  PLATINUM: 5,
  EMERALD: 6,
  DIAMOND: 7,
  MASTER: 8,
  GRANDMASTER: 9,
  CHALLENGER: 10,
};

const DIVISION_VALUE: Record<string, number> = {
  IV: 0.15,
  III: 0.35,
  II: 0.65,
  I: 0.9,
};

const SCORE_TIERS: Array<[number, string]> = [
  [10.0, "CHALLENGER"],
  [9.0, "GRANDMASTER"],
  [8.0, "MASTER"],
  [7.9, "DIAMOND I"],
  [7.65, "DIAMOND II"],
  [7.35, "DIAMOND III"],
  [7.15, "DIAMOND IV"],
  [6.9, "EMERALD I"],
  [6.65, "EMERALD II"],
  [6.35, "EMERALD III"],
  [6.15, "EMERALD IV"],
  [5.9, "PLATINUM I"],
  [5.65, "PLATINUM II"],
  [5.35, "PLATINUM III"],
  [5.15, "PLATINUM IV"],
  [4.9, "GOLD I"],
  [4.65, "GOLD II"],
  [4.35, "GOLD III"],
  [4.15, "GOLD IV"],
  [3.9, "SILVER I"],
  [3.65, "SILVER II"],
  [3.35, "SILVER III"],
  [3.15, "SILVER IV"],
  [2.9, "BRONZE I"],
  [2.65, "BRONZE II"],
  [2.35, "BRONZE III"],
  [2.15, "BRONZE IV"],
];

const EASY_CHAMPIONS_BY_ROLE: Record<string, string[]> = {
  TOP: ["Garen", "Malphite", "Mordekaiser", "Dr. Mundo", "Sett"],
  JUNGLE: ["Warwick", "Amumu", "Nunu & Willump", "Vi", "Rammus"],
  MIDDLE: ["Annie", "Malzahar", "Lux", "Veigar", "Ahri"],
  BOTTOM: ["Ashe", "Miss Fortune", "Sivir", "Caitlyn", "Jinx"],
  UTILITY: ["Leona", "Nautilus", "Soraka", "Sona", "Lulu"],
  SUPPORT: ["Leona", "Nautilus", "Soraka", "Sona", "Lulu"],
};

// ============================================================
// Tipos
// ============================================================
interface MatchFeature {
  puuid: string;
  match_id: string;
  champion_name: string | null;
  role: string | null;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  gold_earned: number;
  cs: number;
  duration_minutes: number;
}

interface PlayerMetadata {
  puuid: string;
  game_name: string | null;
  tag_line: string | null;
  platform: string | null;
  ranked_data: unknown[];
  ranked_score: number;
  ranked_tier: string | null;
}

interface AggregatedRow {
  puuid: string;
  matches_analyzed: number;
  win_rate: number;
  avg_kda: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  avg_cs_per_min: number;
  avg_gold_per_min: number;
  main_role: string | null;
  main_champion: string | null;
  game_name: string | null;
  tag_line: string | null;
  platform: string | null;
  ranked_score: number;
  ranked_tier: string | null;
}

interface FocusArea {
  area: string;
  priority: string;
  metric: number;
  advice: string;
}

interface ChampionRec {
  champion: string;
  role: string;
  games: number;
  winRate: number | null;
  avgKda: number | null;
  reason: string;
}

interface ClassificationResult {
  puuid: string;
  game_name: string | null;
  tag_line: string | null;
  platform: string | null;
  matches_analyzed: number;
  skill_label: string;
  skill_value: number;
  playstyle_label: string | null;
  main_role: string | null;
  main_champion: string | null;
  win_rate: number;
  avg_kda: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  avg_cs_per_min: number;
  avg_gold_per_min: number;
  ranked_score: number;
  ranked_tier: string | null;
  predicted_rank: string;
  predicted_rank_score: number;
  rank_prediction_confidence: string;
  rank_prediction_reasoning: string;
  focus_areas: FocusArea[];
  champion_recommendations: ChampionRec[];
  next_pick: ChampionRec;
  beginner_pick: ChampionRec;
  cluster_id: number | null;
  model_name: string;
  features: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// Helpers numéricos
// ============================================================
function toFloat(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================
// Lógica de clasificación (traducida desde Python)
// ============================================================
function mostCommon(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best: string | null = null;
  let maxCount = 0;
  for (const [k, c] of counts) {
    if (c > maxCount) {
      maxCount = c;
      best = k;
    }
  }
  return best;
}

function computeRankedScore(rankedRows: unknown[]): [number, string | null] {
  if (!Array.isArray(rankedRows) || rankedRows.length === 0) return [0.0, null];
  let bestScore = 0.0;
  let bestTier: string | null = null;
  for (const entry of rankedRows) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const tier = String(e.tier || "").toUpperCase();
    const rank = String(e.rank || "").toUpperCase();
    const lp = toFloat(e.leaguePoints);
    const score = (TIER_BASE[tier] || 0) + (DIVISION_VALUE[rank] || 0) + Math.min(lp, 100) / 1000;
    if (score > bestScore) {
      bestScore = score;
      bestTier = `${tier} ${rank}`.trim();
    }
  }
  return [bestScore, bestTier];
}

function heuristicSkill(row: AggregatedRow): [string, number] {
  const score =
    (row.win_rate / 100) * 2.2 +
    Math.min(row.avg_kda / 5, 1.5) +
    Math.min(row.avg_cs_per_min / 8, 1.2) +
    Math.min(row.avg_gold_per_min / 450, 1.1) +
    Math.min(row.ranked_score / 10, 1.0);
  if (score >= 5.2) return ["Competitivo", 2.0];
  if (score >= 3.5) return ["Intermedio", 1.0];
  return ["Casual", 0.0];
}

function playstyleLabel(row: AggregatedRow): string | null {
  if (row.avg_kills >= 10 && row.avg_kda >= 3) return "Carry agresivo";
  if (row.avg_cs_per_min >= 7) return "Farmeo / macro";
  if (row.avg_assists >= 12) return "Utilidad de equipo";
  if (row.avg_deaths >= 8) return "Riesgo alto";
  return "Balanceado";
}

function scoreToRank(score: number): string {
  if (score <= 0) return "Sin ranked";
  for (const [threshold, rank] of SCORE_TIERS) {
    if (score >= threshold) return rank;
  }
  return "IRON";
}

function rankPrediction(row: AggregatedRow): [string, number, string, string] {
  const baseScore = row.ranked_score;
  if (baseScore <= 0) {
    return [
      "Sin ranked",
      0.0,
      "baja",
      "No hay ranked base; juega algunas clasificatorias para proyectar un rango real.",
    ];
  }
  let delta = 0.0;
  if (row.win_rate >= 55) delta += 0.18;
  else if (row.win_rate < 48) delta -= 0.12;
  if (row.avg_kda >= 3.5) delta += 0.12;
  else if (row.avg_kda < 2.0) delta -= 0.10;
  if (row.avg_cs_per_min >= 6.5) delta += 0.10;
  else if (row.avg_cs_per_min < 4.5) delta -= 0.08;
  if (row.avg_deaths >= 7) delta -= 0.12;

  const confidence = row.matches_analyzed >= 20 ? "alta" : row.matches_analyzed >= 10 ? "media" : "baja";
  const projectedScore = clamp(0, 10, baseScore + delta);
  const predicted = scoreToRank(projectedScore);
  let reasoning: string;
  if (delta > 0.12) {
    reasoning =
      "Las señales recientes empujan por encima del rango actual: buen KDA, win rate o economia.";
  } else if (delta < -0.10) {
    reasoning =
      "Las señales recientes estan por debajo del rango actual; conviene estabilizar muertes y economia.";
  } else {
    reasoning =
      "La proyeccion conserva un rango cercano al actual porque las señales recientes estan equilibradas.";
  }
  return [predicted, projectedScore, confidence, reasoning];
}

function buildFocusAreas(row: AggregatedRow): FocusArea[] {
  const areas: FocusArea[] = [];
  if (row.avg_deaths >= 6.5) {
    areas.push({
      area: "Reducir muertes",
      priority: "alta",
      metric: round(row.avg_deaths, 2),
      advice: "Juega las primeras oleadas con menos all-in y evita pelear sin vision lateral.",
    });
  }
  if (row.avg_cs_per_min < 6) {
    areas.push({
      area: "Subir CS/min",
      priority: row.avg_cs_per_min < 5 ? "alta" : "media",
      metric: round(row.avg_cs_per_min, 2),
      advice: "Prioriza oleadas antes de rotar y practica last hit con tu campeon principal.",
    });
  }
  if (row.win_rate < 52) {
    areas.push({
      area: "Convertir ventaja en victoria",
      priority: "media",
      metric: round(row.win_rate, 2),
      advice: "Despues de ganar pelea, fuerza objetivos o placas en vez de perseguir kills.",
    });
  }
  if (row.avg_gold_per_min < 430) {
    areas.push({
      area: "Economia",
      priority: "media",
      metric: round(row.avg_gold_per_min, 2),
      advice: "Busca bases limpias y evita perder oleadas completas por recalls tardios.",
    });
  }
  return (
    areas.slice(0, 3) || [
      {
        area: "Consistencia",
        priority: "media",
        metric: round(row.avg_kda, 2),
        advice: "Mantén el pool reducido y repite el plan de partida que ya te da mejores resultados.",
      },
    ]
  );
}

interface ChampPerf {
  champion_name: string;
  role: string;
  games: number;
  win_rate: number;
  avg_kda: number;
  avg_cs_per_min: number;
}

function championStats(matches: MatchFeature[]): ChampPerf[] {
  if (matches.length === 0) return [];
  const byKey = new Map<
    string,
    {
      matchIds: Set<string>;
      wins: number;
      kdaSum: number;
      csPerMinSum: number;
      count: number;
    }
  >();
  for (const m of matches) {
    const key = `${m.champion_name || "UNKNOWN"}|||${m.role || "UNKNOWN"}`;
    const entry = byKey.get(key) || {
      matchIds: new Set<string>(),
      wins: 0,
      kdaSum: 0,
      csPerMinSum: 0,
      count: 0,
    };
    entry.matchIds.add(m.match_id);
    if (m.win) entry.wins++;
    const deathsSafe = m.deaths === 0 ? 1 : m.deaths;
    entry.kdaSum += (m.kills + m.assists) / deathsSafe;
    entry.csPerMinSum += m.cs / Math.max(m.duration_minutes, 1);
    entry.count++;
    byKey.set(key, entry);
  }
  const results: ChampPerf[] = [];
  for (const [key, entry] of byKey) {
    const [championName, role] = key.split("|||");
    results.push({
      champion_name: championName,
      role: role,
      games: entry.matchIds.size,
      win_rate: entry.wins / entry.count,
      avg_kda: entry.kdaSum / entry.count,
      avg_cs_per_min: entry.csPerMinSum / entry.count,
    });
  }
  return results;
}

function buildChampionRecommendations(
  row: AggregatedRow,
  champPerf: ChampPerf[]
): [ChampionRec[], ChampionRec, ChampionRec] {
  const recs: ChampionRec[] = [];
  const playerChamps = champPerf;
  if (playerChamps.length > 0) {
    const scored = playerChamps.map((c) => ({
      ...c,
      score:
        c.win_rate * 2.0 +
        Math.min(c.avg_kda / 5, 1.2) +
        Math.min(c.avg_cs_per_min / 8, 1.0) +
        Math.min(c.games / 5, 1.0),
    }));
    scored.sort((a, b) => b.score - a.score);
    for (const champ of scored.slice(0, 4)) {
      recs.push({
        champion: champ.champion_name,
        role: champ.role,
        games: champ.games,
        winRate: round(champ.win_rate * 100, 1),
        avgKda: round(champ.avg_kda, 2),
        reason: "Buen balance entre resultados recientes, KDA y comodidad.",
      });
    }
  }

  const mainRole = row.main_role || "BOTTOM";
  const easyPool = EASY_CHAMPIONS_BY_ROLE[mainRole] || EASY_CHAMPIONS_BY_ROLE["BOTTOM"];
  let beginner = recs.find((r) => easyPool.includes(r.champion)) || null;
  if (!beginner) {
    beginner = {
      champion: easyPool[0],
      role: mainRole,
      games: 0,
      winRate: null,
      avgKda: null,
      reason: "Pick simple para practicar fundamentos del rol sin exigir mecanicas complejas.",
    };
  }

  const nextPick: ChampionRec = recs[0] || {
    champion: row.main_champion || easyPool[0],
    role: mainRole,
    games: row.matches_analyzed,
    winRate: round(row.win_rate, 1),
    avgKda: round(row.avg_kda, 2),
    reason: "Recomendacion basada en campeon frecuente y estilo actual.",
  };

  return [recs, nextPick, beginner];
}

// ============================================================
// Agregación
// ============================================================
function aggregateFeatures(matches: MatchFeature[], metadata: PlayerMetadata): AggregatedRow {
  const matchIds = new Set(matches.map((m) => m.match_id));
  const n = matches.length;
  const wins = matches.filter((m) => m.win).length;

  let kdaSum = 0;
  let killsSum = 0;
  let deathsSum = 0;
  let assistsSum = 0;
  let csPerMinSum = 0;
  let goldPerMinSum = 0;

  for (const m of matches) {
    const deathsSafe = m.deaths === 0 ? 1 : m.deaths;
    kdaSum += (m.kills + m.assists) / deathsSafe;
    killsSum += m.kills;
    deathsSum += m.deaths;
    assistsSum += m.assists;
    csPerMinSum += m.cs / Math.max(m.duration_minutes, 1);
    goldPerMinSum += m.gold_earned / Math.max(m.duration_minutes, 1);
  }

  return {
    puuid: metadata.puuid,
    matches_analyzed: matchIds.size,
    win_rate: (wins / n) * 100,
    avg_kda: kdaSum / n,
    avg_kills: killsSum / n,
    avg_deaths: deathsSum / n,
    avg_assists: assistsSum / n,
    avg_cs_per_min: csPerMinSum / n,
    avg_gold_per_min: goldPerMinSum / n,
    main_role: mostCommon(matches.map((m) => m.role)),
    main_champion: mostCommon(matches.map((m) => m.champion_name)),
    game_name: metadata.game_name,
    tag_line: metadata.tag_line,
    platform: metadata.platform,
    ranked_score: metadata.ranked_score,
    ranked_tier: metadata.ranked_tier,
  };
}

function classifyPlayer(row: AggregatedRow): AggregatedRow & {
  skill_label: string;
  skill_value: number;
  playstyle_label: string | null;
  cluster_id: number | null;
} {
  const [skillLabel, skillValue] = heuristicSkill(row);
  return {
    ...row,
    skill_label: skillLabel,
    skill_value: skillValue,
    playstyle_label: playstyleLabel(row),
    cluster_id: null,
  };
}

function enrichPredictions(
  data: AggregatedRow & {
    skill_label: string;
    skill_value: number;
    playstyle_label: string | null;
    cluster_id: number | null;
  },
  matches: MatchFeature[]
): ClassificationResult {
  const [predictedRank, predictedRankScore, confidence, reasoning] = rankPrediction(data);
  const focus = buildFocusAreas(data);
  const perf = championStats(matches);
  const [recs, nextPick, beginner] = buildChampionRecommendations(data, perf);

  const features = {
    matches_analyzed: data.matches_analyzed,
    win_rate: round(data.win_rate, 4),
    avg_kda: round(data.avg_kda, 4),
    avg_cs_per_min: round(data.avg_cs_per_min, 4),
    avg_gold_per_min: round(data.avg_gold_per_min, 4),
    ranked_score: round(data.ranked_score, 4),
  };

  return {
    puuid: data.puuid,
    game_name: data.game_name,
    tag_line: data.tag_line,
    platform: data.platform,
    matches_analyzed: data.matches_analyzed,
    skill_label: data.skill_label,
    skill_value: data.skill_value,
    playstyle_label: data.playstyle_label,
    main_role: data.main_role,
    main_champion: data.main_champion,
    win_rate: round(data.win_rate, 4),
    avg_kda: round(data.avg_kda, 4),
    avg_kills: round(data.avg_kills, 4),
    avg_deaths: round(data.avg_deaths, 4),
    avg_assists: round(data.avg_assists, 4),
    avg_cs_per_min: round(data.avg_cs_per_min, 4),
    avg_gold_per_min: round(data.avg_gold_per_min, 4),
    ranked_score: round(data.ranked_score, 4),
    ranked_tier: data.ranked_tier,
    predicted_rank: predictedRank,
    predicted_rank_score: round(predictedRankScore, 4),
    rank_prediction_confidence: confidence,
    rank_prediction_reasoning: reasoning,
    focus_areas: focus,
    champion_recommendations: recs,
    next_pick: nextPick,
    beginner_pick: beginner,
    cluster_id: data.cluster_id,
    model_name: MODEL_NAME,
    features,
    created_at: new Date().toISOString(),
  };
}

// ============================================================
// Persistencia
// ============================================================
async function storeClassification(result: ClassificationResult): Promise<void> {
  await query(
    `INSERT INTO lol_player_classifications (
      puuid, game_name, tag_line, platform, matches_analyzed,
      skill_label, skill_value, playstyle_label, main_role, main_champion,
      win_rate, avg_kda, avg_kills, avg_deaths, avg_assists,
      avg_cs_per_min, avg_gold_per_min, ranked_score, ranked_tier,
      predicted_rank, predicted_rank_score, rank_prediction_confidence,
      rank_prediction_reasoning, focus_areas, champion_recommendations,
      next_pick, beginner_pick, cluster_id, model_name, features
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15,
      $16, $17, $18, $19,
      $20, $21, $22,
      $23, $24, $25,
      $26, $27, $28, $29, $30
    )`,
    [
      result.puuid,
      result.game_name,
      result.tag_line,
      result.platform,
      result.matches_analyzed,
      result.skill_label,
      result.skill_value,
      result.playstyle_label,
      result.main_role,
      result.main_champion,
      result.win_rate,
      result.avg_kda,
      result.avg_kills,
      result.avg_deaths,
      result.avg_assists,
      result.avg_cs_per_min,
      result.avg_gold_per_min,
      result.ranked_score,
      result.ranked_tier,
      result.predicted_rank,
      result.predicted_rank_score,
      result.rank_prediction_confidence,
      result.rank_prediction_reasoning,
      JSON.stringify(result.focus_areas),
      JSON.stringify(result.champion_recommendations),
      JSON.stringify(result.next_pick),
      JSON.stringify(result.beginner_pick),
      result.cluster_id,
      result.model_name,
      JSON.stringify(result.features),
    ]
  );
}

// ============================================================
// Util
// ============================================================
function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// ============================================================
// Export principal
// ============================================================
export async function classifyPlayerOnDemand(puuid: string): Promise<ClassificationResult | null> {
  // 1. Metadata
  const metaResult = await query(
    `SELECT puuid, game_name, tag_line, platform, ranked_data, mastery_data, captured_at
     FROM lol_player_snapshots
     WHERE puuid = $1
     ORDER BY captured_at DESC
     LIMIT 1`,
    [puuid]
  );
  if (metaResult.rows.length === 0) {
    console.warn(`[LoLClassifier] No se encontro snapshot para puuid=${puuid}`);
    return null;
  }
  const rawMeta = metaResult.rows[0];
  const rankedRows = Array.isArray(rawMeta.ranked_data) ? rawMeta.ranked_data : [];
  const [rankedScore, rankedTier] = computeRankedScore(rankedRows);
  const metadata: PlayerMetadata = {
    puuid: rawMeta.puuid,
    game_name: rawMeta.game_name ?? null,
    tag_line: rawMeta.tag_line ?? null,
    platform: rawMeta.platform ?? null,
    ranked_data: rankedRows,
    ranked_score: rankedScore,
    ranked_tier: rankedTier,
  };

  // 2. Partidas
  const matchResult = await query(
    `SELECT
       puuid,
       match_id,
       champion_name,
       COALESCE(NULLIF(team_position, ''), NULLIF(individual_position, ''), 'UNKNOWN') AS role,
       win,
       kills,
       deaths,
       assists,
       gold_earned,
       cs,
       GREATEST(game_duration_seconds / 60.0, 1.0) AS duration_minutes
     FROM v_lol_match_features
     WHERE puuid = $1 AND game_duration_seconds IS NOT NULL`,
    [puuid]
  );
  const matches: MatchFeature[] = matchResult.rows.map((r: Record<string, unknown>) => ({
    puuid: String(r.puuid),
    match_id: String(r.match_id),
    champion_name: r.champion_name ? String(r.champion_name) : null,
    role: r.role ? String(r.role) : null,
    win: Boolean(r.win),
    kills: toFloat(r.kills),
    deaths: toFloat(r.deaths),
    assists: toFloat(r.assists),
    gold_earned: toFloat(r.gold_earned),
    cs: toFloat(r.cs),
    duration_minutes: toFloat(r.duration_minutes),
  }));

  if (matches.length === 0) {
    console.warn(`[LoLClassifier] No hay partidas para puuid=${puuid}`);
    return null;
  }

  // 3. Agregar + clasificar + enriquecer
  const aggregated = aggregateFeatures(matches, metadata);
  const classified = classifyPlayer(aggregated);
  const enriched = enrichPredictions(classified, matches);

  // 4. Guardar
  await storeClassification(enriched);
  console.log(`[LoLClassifier] Clasificacion bajo demanda guardada para puuid=${puuid}`);

  return enriched;
}
