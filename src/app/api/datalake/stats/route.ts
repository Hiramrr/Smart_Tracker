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

function emptyStats() {
  return {
    totalCalls: 0,
    todayCalls: 0,
    callsByAction: [],
    callsBySource: [],
    errors: [],
    recentCalls: [],
    hourlyStats: [],
    snapshots: { total: 0, recent: [] },
    shop: {
      totalEntries: 0,
      cosmetics: 0,
      cosmeticAppearances: 0,
      dailySnapshots: 0,
      predictions: 0,
      latestPredictions: [],
    },
    cache: { entries: 0, staleEntries: 0, snapshots: 0 },
    warehouse: {
      dimensions: { dates: 0, apiActions: 0, players: 0, cosmetics: 0 },
      facts: { apiCalls: 0, shopAppearances: 0, playerProgress: 0 },
      reliability: [],
      streamMetrics: [],
      deadLetters: 0,
    },
    progress: { recent: [] },
  };
}

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({
        success: true,
        degraded: true,
        error: "DATABASE_URL no está configurada",
        stats: emptyStats(),
      });
    }

    await ensureDatabaseInitialized();

    // Estadísticas generales
    const totalCallsResult = await query("SELECT COUNT(*) as total FROM api_calls");
    const totalCalls = parseInt(totalCallsResult.rows[0].total, 10);

    const todayCallsResult = await query(
      "SELECT COUNT(*) as total FROM api_calls WHERE DATE(created_at) = CURRENT_DATE"
    );
    const todayCalls = parseInt(todayCallsResult.rows[0].total, 10);

    // Llamadas por acción
    const callsByActionResult = await query(
      `SELECT action, COUNT(*) as total, AVG(duration_ms) as avg_duration
       FROM api_calls
       GROUP BY action
       ORDER BY total DESC`
    );

    // Llamadas por fuente de API
    const callsBySourceResult = await query(
      `SELECT api_source, COUNT(*) as total
       FROM api_calls
       GROUP BY api_source
       ORDER BY total DESC`
    );

    // Errores
    const errorsResult = await query(
      `SELECT response_status, COUNT(*) as total
       FROM api_calls
       WHERE response_status >= 400
       GROUP BY response_status
       ORDER BY total DESC`
    );

    // Últimas llamadas con parámetros
    const recentCallsResult = await query(
      `SELECT id, action, api_source, response_status, duration_ms, created_at, parameters
       FROM api_calls
       ORDER BY created_at DESC
       LIMIT 10`
    );

    // Estadísticas de Snapshots
    const snapshotsCountResult = await query("SELECT COUNT(*) as total FROM player_snapshots");
    const recentSnapshotsResult = await query(
      "SELECT id, display_name, platform, captured_at FROM player_snapshots ORDER BY captured_at DESC LIMIT 5"
    );

    // Estadísticas de Tienda
    const shopHistoryCountResult = await query("SELECT COUNT(*) as total FROM shop_history");
    const cosmeticsCountResult = await query("SELECT COUNT(*) as total FROM cosmetics");
    const cosmeticAppearancesCountResult = await query("SELECT COUNT(*) as total FROM cosmetic_shop_appearances");
    const dailyShopSnapshotsCountResult = await query("SELECT COUNT(*) as total FROM daily_shop_snapshots");
    const cacheEntriesCountResult = await query("SELECT COUNT(*) as total FROM api_cache");
    const staleCacheEntriesCountResult = await query("SELECT COUNT(*) as total FROM api_cache WHERE expires_at <= NOW()");
    const cacheSnapshotsCountResult = await query("SELECT COUNT(*) as total FROM api_cache_snapshots");
    const predictionCountResult = await query("SELECT COUNT(*) as total FROM cosmetic_predictions");
    const latestPredictionsResult = await query(
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
         model_name,
         prediction_created_at
       FROM v_mart_shop_predictions
       WHERE predicted_next_shop_date IS NOT NULL
       ORDER BY confidence_score DESC NULLS LAST, predicted_next_shop_date ASC
       LIMIT 6`
    );

    const warehouseCountsResult = await query(
      `SELECT
         (SELECT COUNT(*) FROM v_dim_date) AS dim_dates,
         (SELECT COUNT(*) FROM v_dim_api_action) AS dim_api_actions,
         (SELECT COUNT(*) FROM v_dim_player) AS dim_players,
         (SELECT COUNT(*) FROM v_dim_cosmetic) AS dim_cosmetics,
         (SELECT COUNT(*) FROM v_fact_api_calls) AS fact_api_calls,
         (SELECT COUNT(*) FROM v_fact_shop_appearances) AS fact_shop_appearances,
         (SELECT COUNT(*) FROM v_fact_player_progress) AS fact_player_progress,
         (SELECT COUNT(*) FROM stream_dead_letters) AS dead_letters`
    );

    const reliabilityResult = await query(
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
       LIMIT 8`
    );

    const streamMetricsResult = await query(
      `SELECT
         window_start,
         action,
         api_source,
         total_events,
         success_count,
         error_count,
         error_rate_pct,
         avg_duration_ms
       FROM v_stream_api_metrics_latest
       LIMIT 8`
    );

    // Estadísticas por hora (últimas 24 horas)
    const hourlyResult = await query(
      `SELECT DATE_TRUNC('hour', created_at) as hour,
              COUNT(*) as total,
              AVG(duration_ms) as avg_duration
       FROM api_calls
       WHERE created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY DATE_TRUNC('hour', created_at)
       ORDER BY hour DESC`
    );

    return NextResponse.json({
      success: true,
      stats: {
        totalCalls,
        todayCalls,
        callsByAction: callsByActionResult.rows,
        callsBySource: callsBySourceResult.rows,
        errors: errorsResult.rows,
        recentCalls: recentCallsResult.rows,
        hourlyStats: hourlyResult.rows.map((row: { hour: string; total: string; avg_duration: string }) => ({
          hour: row.hour,
          total: parseInt(row.total, 10),
          avgDuration: parseFloat(row.avg_duration).toFixed(2),
        })),
        snapshots: {
          total: parseInt(snapshotsCountResult.rows[0].total, 10),
          recent: recentSnapshotsResult.rows
        },
        shop: {
          totalEntries: parseInt(shopHistoryCountResult.rows[0].total, 10),
          cosmetics: parseInt(cosmeticsCountResult.rows[0].total, 10),
          cosmeticAppearances: parseInt(cosmeticAppearancesCountResult.rows[0].total, 10),
          dailySnapshots: parseInt(dailyShopSnapshotsCountResult.rows[0].total, 10),
          predictions: parseInt(predictionCountResult.rows[0].total, 10),
          latestPredictions: latestPredictionsResult.rows.map((row) => ({
            cosmeticKey: row.cosmetic_key,
            name: row.name,
            type: row.type,
            rarity: row.rarity,
            appearancesCount: toInt(row.appearances_count),
            daysSinceLastSeen: toInt(row.days_since_last_seen),
            predictedDaysUntilNext: toFloat(row.predicted_days_until_next),
            predictedNextShopDate: row.predicted_next_shop_date,
            confidenceScore: toFloat(row.confidence_score),
            modelName: row.model_name,
            predictionCreatedAt: row.prediction_created_at,
          }))
        },
        cache: {
          entries: parseInt(cacheEntriesCountResult.rows[0].total, 10),
          staleEntries: parseInt(staleCacheEntriesCountResult.rows[0].total, 10),
          snapshots: parseInt(cacheSnapshotsCountResult.rows[0].total, 10)
        },
        warehouse: {
          dimensions: {
            dates: toInt(warehouseCountsResult.rows[0].dim_dates),
            apiActions: toInt(warehouseCountsResult.rows[0].dim_api_actions),
            players: toInt(warehouseCountsResult.rows[0].dim_players),
            cosmetics: toInt(warehouseCountsResult.rows[0].dim_cosmetics),
          },
          facts: {
            apiCalls: toInt(warehouseCountsResult.rows[0].fact_api_calls),
            shopAppearances: toInt(warehouseCountsResult.rows[0].fact_shop_appearances),
            playerProgress: toInt(warehouseCountsResult.rows[0].fact_player_progress),
          },
          reliability: reliabilityResult.rows.map((row) => ({
            dateKey: row.date_key,
            apiSource: row.api_source,
            action: row.action,
            totalCalls: toInt(row.total_calls),
            avgDurationMs: toFloat(row.avg_duration_ms),
            maxDurationMs: toInt(row.max_duration_ms),
            errors: toInt(row.errors),
            errorRatePct: toFloat(row.error_rate_pct),
          })),
          streamMetrics: streamMetricsResult.rows.map((row) => ({
            windowStart: row.window_start,
            apiSource: row.api_source,
            action: row.action,
            totalEvents: toInt(row.total_events),
            successCount: toInt(row.success_count),
            errorCount: toInt(row.error_count),
            errorRatePct: toFloat(row.error_rate_pct),
            avgDurationMs: toFloat(row.avg_duration_ms),
          })),
          deadLetters: toInt(warehouseCountsResult.rows[0].dead_letters),
        },
        progress: {
          recent: await (async () => {
            try {
              return (await query("SELECT * FROM player_progress ORDER BY created_at DESC LIMIT 5")).rows;
            } catch (e) {
              console.warn("Table player_progress might not exist yet:", e);
              return [];
            }
          })()
        }
      },
    });
  } catch (error) {
    console.error("[Datalake Stats] Error:", error);
    const message = error instanceof Error ? error.message : "Error al obtener estadísticas del data lake";
    return NextResponse.json({
      success: true,
      degraded: true,
      error: message,
      stats: emptyStats(),
    });
  }
}
