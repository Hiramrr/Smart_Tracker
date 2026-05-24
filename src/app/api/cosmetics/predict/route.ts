import { NextRequest, NextResponse } from "next/server";
import {
  fetchCosmeticBySearch,
  ingestSingleCosmetic,
} from "@/lib/fortnite-cosmetics";
import { query } from "@/lib/db";
import { ensureDatabaseInitialized } from "@/lib/init";

export async function GET(req: NextRequest) {
  await ensureDatabaseInitialized();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || undefined;
  const name = searchParams.get("name") || undefined;

  if (!id && !name) {
    return NextResponse.json(
      { success: false, error: "id o name es requerido" },
      { status: 400 }
    );
  }

  try {
    // 1. Buscar en API externa
    const cosmetic = await fetchCosmeticBySearch({ id, name });

    // 2. Ingestar historial en BD local
    await ingestSingleCosmetic({ id, name });

    // 3. Buscar features y predicción local
    const featuresResult = await query(
      `SELECT *
       FROM v_cosmetic_prediction_features
       WHERE cosmetic_id = $1`,
      [cosmetic.id]
    );
    const features = featuresResult.rows[0] || null;

    const predictionResult = await query(
      `SELECT predicted_days_until_next, predicted_next_shop_date, confidence_score
       FROM v_mart_shop_predictions
       WHERE cosmetic_key = $1
         AND predicted_next_shop_date IS NOT NULL`,
      [cosmetic.id]
    );
    let prediction = predictionResult.rows[0] || null;

    // 4. Si no hay predicción batch pero hay features suficientes, calcular quick prediction
    if (!prediction && features && features.appearances_count >= 3 && features.avg_days_between_appearances) {
      const daysSinceLastSeen = Number(features.days_since_last_seen || 0);
      const avgGap = Number(features.avg_days_between_appearances);
      const appearancesCount = Number(features.appearances_count || 0);

      const predictedDays = Math.max(0, Math.round(avgGap - daysSinceLastSeen));
      const predictedDate = new Date();
      predictedDate.setDate(predictedDate.getDate() + predictedDays);

      const confidence = Math.min(
        1.0,
        Math.log1p(appearancesCount) / Math.log1p(60)
      );

      prediction = {
        predicted_days_until_next: predictedDays,
        predicted_next_shop_date: predictedDate.toISOString().slice(0, 10),
        confidence_score: confidence,
      };
    }

    return NextResponse.json({
      success: true,
      cosmetic,
      features,
      prediction,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error consultando cosmetico";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
