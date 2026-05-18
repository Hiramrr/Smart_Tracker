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

    // Últimas llamadas
    const recentCallsResult = await query(
      `SELECT id, action, api_source, response_status, duration_ms, created_at
       FROM api_calls
       ORDER BY created_at DESC
       LIMIT 10`
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
        hourlyStats: hourlyResult.rows.map((row) => ({
          hour: row.hour,
          total: parseInt(row.total, 10),
          avgDuration: parseFloat(row.avg_duration).toFixed(2),
        })),
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
