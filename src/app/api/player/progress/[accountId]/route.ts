import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;

  try {
    const result = await query(
      `SELECT metric_name, metric_value, delta, period_start, created_at 
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
