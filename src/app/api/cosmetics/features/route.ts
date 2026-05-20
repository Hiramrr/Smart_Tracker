import { NextRequest, NextResponse } from "next/server";
import { getCosmeticFeatures } from "@/lib/fortnite-cosmetics";
import { query } from "@/lib/db";
import { ensureDatabaseInitialized } from "@/lib/init";

function parseLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 100;
  return Math.min(parsed, 1000);
}

export async function GET(req: NextRequest) {
  await ensureDatabaseInitialized();

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const cosmeticId = searchParams.get("id");

  try {
    if (cosmeticId) {
      const result = await query(
        `SELECT *
         FROM v_cosmetic_prediction_features
         WHERE cosmetic_id = $1`,
        [cosmeticId]
      );
      return NextResponse.json({ success: true, features: result.rows[0] || null });
    }

    const features = await getCosmeticFeatures(limit);
    return NextResponse.json({ success: true, features });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error consultando features";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
