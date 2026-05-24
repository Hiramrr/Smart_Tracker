import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDatabaseInitialized } from "@/lib/init";
import { classifyPlayerOnDemand } from "@/lib/lol-classifier";

function toFloat(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapClassification(row: Record<string, unknown>) {
  return {
    puuid: row.puuid,
    gameName: row.game_name,
    tagLine: row.tag_line,
    platform: row.platform,
    matchesAnalyzed: toInt(row.matches_analyzed),
    skillLabel: row.skill_label,
    skillValue: toFloat(row.skill_value),
    playstyleLabel: row.playstyle_label,
    mainRole: row.main_role,
    mainChampion: row.main_champion,
    winRate: toFloat(row.win_rate),
    avgKda: toFloat(row.avg_kda),
    avgKills: toFloat(row.avg_kills),
    avgDeaths: toFloat(row.avg_deaths),
    avgAssists: toFloat(row.avg_assists),
    avgCsPerMin: toFloat(row.avg_cs_per_min),
    avgGoldPerMin: toFloat(row.avg_gold_per_min),
    rankedScore: toFloat(row.ranked_score),
    rankedTier: row.ranked_tier,
    predictedRank: row.predicted_rank,
    predictedRankScore: toFloat(row.predicted_rank_score),
    rankPredictionConfidence: row.rank_prediction_confidence,
    rankPredictionReasoning: row.rank_prediction_reasoning,
    focusAreas: row.focus_areas || [],
    championRecommendations: row.champion_recommendations || [],
    nextPick: row.next_pick || null,
    beginnerPick: row.beginner_pick || null,
    clusterId: row.cluster_id === null ? null : toInt(row.cluster_id),
    modelName: row.model_name,
    features: row.features,
    createdAt: row.created_at,
  };
}

export async function GET(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      success: true,
      degraded: true,
      error: "DATABASE_URL no esta configurada",
      classifications: [],
      classification: null,
    });
  }

  const { searchParams } = new URL(req.url);
  const puuid = searchParams.get("puuid");
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 10), 1), 50);

  try {
    await ensureDatabaseInitialized();

    if (puuid) {
      const result = await query(
        `SELECT *
         FROM v_mart_lol_player_classification
         WHERE puuid = $1
         LIMIT 1`,
        [puuid]
      );
      if (result.rows[0]) {
        return NextResponse.json({
          success: true,
          classification: mapClassification(result.rows[0]),
        });
      }

      // No existe clasificacion: generar bajo demanda
      const generated = await classifyPlayerOnDemand(puuid);
      if (generated) {
        return NextResponse.json({
          success: true,
          classification: mapClassification(generated as unknown as Record<string, unknown>),
          generated: true,
        });
      }

      return NextResponse.json({
        success: true,
        classification: null,
      });
    }

    const result = await query(
      `SELECT *
       FROM v_mart_lol_player_classification
       ORDER BY skill_value DESC, win_rate DESC NULLS LAST, avg_kda DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );

    return NextResponse.json({
      success: true,
      classifications: result.rows.map(mapClassification),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error consultando clasificaciones LoL";
    return NextResponse.json(
      { success: false, error: message, classifications: [], classification: null },
      { status: 500 }
    );
  }
}
