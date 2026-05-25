import { Client } from "pg";
import fs from "fs";
import path from "path";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://miyu:miyu_secret@localhost:5432/miyu_datalake";

const client = new Client({ connectionString: DATABASE_URL });

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const text = String(value).replace(/"/g, '""');
    return `"${text}"`;
  };
  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escape(row[header])).join(",")
    ),
  ].join("\n");
}

async function exportQuery(filename: string, query: string): Promise<void> {
  const result = await client.query(query);
  const outputPath = path.join(process.cwd(), "datasets", filename);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, toCsv(result.rows), "utf-8");
  console.log(`Exportado: ${outputPath} (${result.rowCount} filas)`);
}

async function main(): Promise<void> {
  await client.connect();
  console.log("Conectado a PostgreSQL. Exportando datasets...\n");

  await exportQuery(
    "sample_api_calls.csv",
    `SELECT
       id, action, api_source, response_status, duration_ms,
       response_size, endpoint_url, created_at
     FROM api_calls
     ORDER BY created_at DESC
     LIMIT 100`
  );

  await exportQuery(
    "sample_shop_appearances.csv",
    `SELECT
       a.cosmetic_id, c.name, c.type, c.rarity,
       a.shop_date, a.source, a.regular_price, a.final_price,
       a.ingested_at
     FROM cosmetic_shop_appearances a
     JOIN cosmetics c ON c.cosmetic_id = a.cosmetic_id
     ORDER BY a.shop_date DESC
     LIMIT 100`
  );

  await exportQuery(
    "sample_player_snapshots.csv",
    `SELECT
       account_id, display_name, platform,
       stats->>'kd' AS kd,
       stats->>'winRate' AS win_rate,
       stats->>'totalMatches' AS total_matches,
       stats->>'kills' AS kills,
       ranked_data->>'rank' AS rank,
       ranked_data->>'progress' AS rank_progress,
       captured_at
     FROM player_snapshots
     ORDER BY captured_at DESC
     LIMIT 100`
  );

  await exportQuery(
    "sample_lol_player_snapshots.csv",
    `SELECT
       puuid, game_name, tag_line, platform,
       summoner_level,
       ranked_data->0->>'tier' AS ranked_tier,
       ranked_data->0->>'rank' AS ranked_rank,
       (ranked_data->0->>'leaguePoints')::text AS ranked_lp,
       mastery_data->0->>'championId' AS top_champion_id,
       (mastery_data->0->>'championLevel')::text AS champion_level,
       captured_at
     FROM lol_player_snapshots
     ORDER BY captured_at DESC
     LIMIT 100`
  );

  await exportQuery(
    "sample_predictions.csv",
    `SELECT
       cp.cosmetic_id, c.name, c.type, c.rarity,
       cp.predicted_days_until_next, cp.predicted_next_shop_date,
       cp.confidence_score, cp.model_name,
       cp.created_at
     FROM cosmetic_predictions cp
     JOIN cosmetics c ON c.cosmetic_id = cp.cosmetic_id
     ORDER BY cp.created_at DESC
     LIMIT 100`
  );

  await client.end();
  console.log("\nExportación completada.");
}

main().catch(async (error) => {
  console.error("Error exportando datasets:", error);
  await client.end();
  process.exit(1);
});
