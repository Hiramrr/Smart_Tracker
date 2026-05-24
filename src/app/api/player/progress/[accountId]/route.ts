import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDatabaseInitialized } from "@/lib/init";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;

  try {
    await ensureDatabaseInitialized();
    const result = await query(
      `SELECT
         metric_name,
         metric_value,
         delta,
         COALESCE(period_label, period_start::text) AS period_start,
         created_at
       FROM player_progress 
       WHERE account_id = $1 
       ORDER BY created_at DESC 
       LIMIT 100`,
      [accountId]
    );

    return NextResponse.json({
      success: true,
      progress: result.rows
    });
  } catch (error) {
    console.error("[Player Progress API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener el progreso del jugador" },
      { status: 500 }
    );
  }
}
