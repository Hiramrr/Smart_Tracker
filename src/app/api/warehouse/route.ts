import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDatabaseInitialized } from "@/lib/init";

function toInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toFloat(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyWarehouse() {
  return {
    dimensions: {
      dates: 0,
      apiActions: 0,
      players: 0,
      cosmetics: 0,
    },
    facts: {
      apiCalls: 0,
      shopAppearances: 0,
      playerProgress: 0,
    },
    marts: {
      reliabilityRows: 0,
      predictionRows: 0,
      streamWindows: 0,
      deadLetters: 0,
    },
    reliability: [],
    streamMetrics: [],
    apiActions: [],
    players: [],
    cosmetics: [],
    shopPredictions: [],
    playerProgress: [],
  };
}

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({
        success: true,
        degraded: true,
        error: "DATABASE_URL no esta configurada",
        warehouse: emptyWarehouse(),
      });
    }

    await ensureDatabaseInitialized();

    const counts = await query(
      `SELECT
         (SELECT COUNT(*) FROM v_dim_date) AS dim_dates,
         (SELECT COUNT(*) FROM v_dim_api_action) AS dim_api_actions,
         (SELECT COUNT(*) FROM v_dim_player) AS dim_players,
         (SELECT COUNT(*) FROM v_dim_cosmetic) AS dim_cosmetics,
         (SELECT COUNT(*) FROM v_fact_api_calls) AS fact_api_calls,
         (SELECT COUNT(*) FROM v_fact_shop_appearances) AS fact_shop_appearances,
         (SELECT COUNT(*) FROM v_fact_player_progress) AS fact_player_progress,
         (SELECT COUNT(*) FROM v_mart_api_reliability_daily) AS mart_reliability_rows,
         (SELECT COUNT(*) FROM v_mart_shop_predictions WHERE predicted_next_shop_date IS NOT NULL) AS mart_prediction_rows,
         (SELECT COUNT(*) FROM stream_api_metrics_minute) AS stream_windows,
         (SELECT COUNT(*) FROM stream_dead_letters) AS dead_letters`
    );

    const reliability = await query(
      `SELECT
         date_key,
         api_source,
         action,
         total_calls,
         avg_duration_ms,
         max_duration_ms,
         errors,
         error_rate_pct
       FROM v_mart_api_reliability_daily
       ORDER BY date_key DESC, total_calls DESC
       LIMIT 12`
    );

    const apiActions = await query(
      `SELECT
         action_key,
         action,
         api_source,
         business_domain
       FROM v_dim_api_action
       ORDER BY business_domain, action
       LIMIT 20`
    );

    const streamMetrics = await query(
      `SELECT
         window_start,
         action,
         api_source,
         total_events,
         success_count,
         error_count,
         error_rate_pct,
         avg_duration_ms,
         min_duration_ms,
         max_duration_ms,
         last_event_at
       FROM v_stream_api_metrics_latest
       LIMIT 12`
    );

    const players = await query(
      `SELECT
         player_key,
         display_name,
         platform,
         first_seen_at,
         last_seen_at,
         snapshot_count
       FROM v_dim_player
       ORDER BY last_seen_at DESC NULLS LAST
       LIMIT 10`
    );

    const cosmetics = await query(
      `SELECT
         cosmetic_key,
         name,
         type,
         rarity,
         series,
         introduced_chapter,
         introduced_season,
         updated_at
       FROM v_dim_cosmetic
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 10`
    );

    const shopPredictions = await query(
      `SELECT
         cosmetic_key,
         name,
         type,
         rarity,
         appearances_count,
         days_since_last_seen,
         predicted_days_until_next,
         predicted_next_shop_date,
         confidence_score,
         model_name
       FROM v_mart_shop_predictions
       WHERE predicted_next_shop_date IS NOT NULL
       ORDER BY confidence_score DESC NULLS LAST, predicted_next_shop_date ASC
       LIMIT 10`
    );

    const playerProgress = await query(
      `SELECT
         progress_key,
         player_key,
         date_key,
         metric_name,
         metric_value,
         delta,
         period_label,
         created_at
       FROM v_fact_player_progress
       ORDER BY created_at DESC
       LIMIT 10`
    );

    const row = counts.rows[0] || {};

    return NextResponse.json({
      success: true,
      warehouse: {
        dimensions: {
          dates: toInt(row.dim_dates),
          apiActions: toInt(row.dim_api_actions),
          players: toInt(row.dim_players),
          cosmetics: toInt(row.dim_cosmetics),
        },
        facts: {
          apiCalls: toInt(row.fact_api_calls),
          shopAppearances: toInt(row.fact_shop_appearances),
          playerProgress: toInt(row.fact_player_progress),
        },
        marts: {
          reliabilityRows: toInt(row.mart_reliability_rows),
          predictionRows: toInt(row.mart_prediction_rows),
          streamWindows: toInt(row.stream_windows),
          deadLetters: toInt(row.dead_letters),
        },
        reliability: reliability.rows.map((item) => ({
          dateKey: item.date_key,
          apiSource: item.api_source,
          action: item.action,
          totalCalls: toInt(item.total_calls),
          avgDurationMs: toFloat(item.avg_duration_ms),
          maxDurationMs: toInt(item.max_duration_ms),
          errors: toInt(item.errors),
          errorRatePct: toFloat(item.error_rate_pct),
        })),
        streamMetrics: streamMetrics.rows.map((item) => ({
          windowStart: item.window_start,
          action: item.action,
          apiSource: item.api_source,
          totalEvents: toInt(item.total_events),
          successCount: toInt(item.success_count),
          errorCount: toInt(item.error_count),
          errorRatePct: toFloat(item.error_rate_pct),
          avgDurationMs: toFloat(item.avg_duration_ms),
          minDurationMs: toInt(item.min_duration_ms),
          maxDurationMs: toInt(item.max_duration_ms),
          lastEventAt: item.last_event_at,
        })),
        apiActions: apiActions.rows,
        players: players.rows,
        cosmetics: cosmetics.rows,
        shopPredictions: shopPredictions.rows.map((item) => ({
          cosmeticKey: item.cosmetic_key,
          name: item.name,
          type: item.type,
          rarity: item.rarity,
          appearancesCount: toInt(item.appearances_count),
          daysSinceLastSeen: toInt(item.days_since_last_seen),
          predictedDaysUntilNext: toFloat(item.predicted_days_until_next),
          predictedNextShopDate: item.predicted_next_shop_date,
          confidenceScore: toFloat(item.confidence_score),
          modelName: item.model_name,
        })),
        playerProgress: playerProgress.rows.map((item) => ({
          progressKey: item.progress_key,
          playerKey: item.player_key,
          dateKey: item.date_key,
          metricName: item.metric_name,
          metricValue: toFloat(item.metric_value),
          delta: toFloat(item.delta),
          periodLabel: item.period_label,
          createdAt: item.created_at,
        })),
      },
    });
  } catch (error) {
    console.error("[Warehouse] Error:", error);
    const message = error instanceof Error ? error.message : "Error consultando warehouse";
    return NextResponse.json({
      success: true,
      degraded: true,
      error: message,
      warehouse: emptyWarehouse(),
    });
  }
}
