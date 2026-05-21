import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDatabaseInitialized } from "@/lib/init";

export async function GET() {
  await ensureDatabaseInitialized();

  try {
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
          dailySnapshots: parseInt(dailyShopSnapshotsCountResult.rows[0].total, 10)
        },
        cache: {
          entries: parseInt(cacheEntriesCountResult.rows[0].total, 10),
          staleEntries: parseInt(staleCacheEntriesCountResult.rows[0].total, 10),
          snapshots: parseInt(cacheSnapshotsCountResult.rows[0].total, 10)
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
    return NextResponse.json(
      { success: false, error: "Error al obtener estadísticas del data lake" },
      { status: 500 }
    );
  }
}
