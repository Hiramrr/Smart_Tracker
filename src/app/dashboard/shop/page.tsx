import { ShopView } from "@/components/shop-view";
import type { CosmeticPrediction } from "@/components/shop-view";
import { query } from "@/lib/db";
import { ensureDatabaseInitialized } from "@/lib/init";
import { getShopData } from "@/lib/shop";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const shop = await getShopData();
  let predictions: CosmeticPrediction[] = [];

  try {
    if (process.env.DATABASE_URL) {
      await ensureDatabaseInitialized();
      const result = await query(
        `SELECT
           m.cosmetic_key,
           m.name,
           m.type,
           m.rarity,
           m.image_icon,
           m.image_featured,
           m.appearances_count,
           m.days_since_last_seen,
           m.predicted_days_until_next,
           m.predicted_next_shop_date,
           m.confidence_score,
           f.avg_days_between_appearances,
           f.estimated_days_until_next_shop,
           f.stddev_days_between_appearances,
           f.avg_block_duration,
           f.max_block_duration
         FROM v_mart_shop_predictions m
         LEFT JOIN v_cosmetic_prediction_features f ON f.cosmetic_id = m.cosmetic_key
         WHERE m.predicted_next_shop_date IS NOT NULL
         ORDER BY m.prediction_created_at DESC NULLS LAST, m.confidence_score DESC NULLS LAST
         LIMIT 500`
      );

      predictions = result.rows.map((row) => ({
        cosmeticId: row.cosmetic_key,
        name: row.name,
        type: row.type,
        rarity: row.rarity,
        imageIcon: row.image_icon,
        imageFeatured: row.image_featured,
        appearancesCount: Number(row.appearances_count || 0),
        daysSinceLastSeen: Number(row.days_since_last_seen || 0),
        predictedDaysUntilNext: Number(row.predicted_days_until_next || 0),
        predictedNextShopDate: row.predicted_next_shop_date,
        confidenceScore: Number(row.confidence_score || 0),
        avgDaysBetweenAppearances: Number(row.avg_days_between_appearances || 0),
        estimatedDaysUntilNextShop: Number(row.estimated_days_until_next_shop || 0),
        stddevDaysBetweenAppearances: Number(row.stddev_days_between_appearances || 0),
        avgBlockDuration: Number(row.avg_block_duration || 0),
        maxBlockDuration: Number(row.max_block_duration || 0),
      }));
    }
  } catch (error) {
    console.warn("[Shop] Predicciones no disponibles:", error);
  }

  return <ShopView shop={shop} predictions={predictions} />;
}
