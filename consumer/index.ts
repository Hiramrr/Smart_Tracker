import { Kafka, Consumer, EachMessagePayload } from "kafkajs";
import { Pool } from "pg";

type JsonRecord = Record<string, unknown>;

// ==========================================
// Configuración
// ==========================================
const KAFKA_BROKER = process.env.KAFKA_BROKER || "kafka:29092";
const KAFKA_TOPIC = process.env.KAFKA_TOPIC_API_CALLS || "api-calls";
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || "datalake-consumer";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL no está configurada");
}

// ==========================================
// Pool de PostgreSQL
// ==========================================
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
});

// ==========================================
// Kafka Consumer
// ==========================================
const kafka = new Kafka({
  clientId: "miyu-datalake-consumer",
  brokers: [KAFKA_BROKER],
  retry: {
    initialRetryTime: 100,
    retries: 10,
  },
});

const consumer: Consumer = kafka.consumer({
  groupId: KAFKA_GROUP_ID,
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
});

// ==========================================
// Graceful shutdown
// ==========================================
let isShuttingDown = false;

async function shutdown(signal: string) {
  console.log(`\n[Consumer] Señal ${signal} recibida. Cerrando gracefully...`);
  isShuttingDown = true;

  try {
    await consumer.disconnect();
    await pool.end();
    console.log("[Consumer] Desconectado correctamente");
    process.exit(0);
  } catch (error) {
    console.error("[Consumer] Error durante shutdown:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ==========================================
// Función principal
// ==========================================
async function run() {
  console.log("[Consumer] Iniciando consumer de Kafka...");
  console.log(`[Consumer] Broker: ${KAFKA_BROKER}`);
  console.log(`[Consumer] Topic: ${KAFKA_TOPIC}`);
  console.log(`[Consumer] Group ID: ${KAFKA_GROUP_ID}`);

  // Conectar a Kafka
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  console.log("[Consumer] Suscrito al topic. Esperando mensajes...");

  // Procesar mensajes
  await consumer.run({
    autoCommit: true,
    autoCommitInterval: 5000,
    eachMessage: async ({ partition, message }: EachMessagePayload) => {
      if (isShuttingDown) return;

      try {
        const value = message.value?.toString();
        if (!value) {
          console.warn("[Consumer] Mensaje vacío recibido");
          return;
        }

        const event = JSON.parse(value);
        console.log(`[Consumer] Procesando evento: ${event.action} (partition: ${partition}, offset: ${message.offset})`);

        await persistApiCall(event);

        console.log(`[Consumer] Evento persistido: ${event.id}`);
      } catch (error) {
        console.error("[Consumer] Error procesando mensaje:", error);
        // No lanzamos error para no detener el consumer
      }
    },
  });
}

// ==========================================
// Persistencia en PostgreSQL
// ==========================================
async function persistApiCall(event: ApiCallEvent) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Insertar en api_calls
    const apiCallResult = await client.query(
      `
      INSERT INTO api_calls (
        id, action, parameters, source_ip, user_agent,
        response_status, response_size, duration_ms,
        api_source, endpoint_url, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING
      RETURNING id
      `,
      [
        event.id,
        event.action,
        JSON.stringify(event.parameters),
        event.sourceIp || null,
        event.userAgent || null,
        event.responseStatus,
        event.responseSize,
        event.durationMs,
        event.apiSource,
        event.endpointUrl,
        event.timestamp,
      ]
    );

    // Si se insertó y hay datos de respuesta, guardar en api_responses
    if (apiCallResult.rowCount && apiCallResult.rowCount > 0 && event.responseBody) {
      await client.query(
        `
        INSERT INTO api_responses (api_call_id, response_body)
        VALUES ($1, $2)
        `,
        [event.id, JSON.stringify(event.responseBody)]
      );
    }

    // ==========================================
    // Extracción de datos interesantes (Data Engineering)
    // ==========================================
    if (event.responseStatus === 200 && event.responseBody) {
      const data = event.responseBody;

      // 1. Player Snapshots (Stats & Ranked)
      if (event.action === "stats" || event.action === "ranked-current" || event.action === "tracker-stats") {
        const accountId = event.parameters.accountId as string || data.accountId as string || data.account_id as string;
        const displayName = event.parameters.displayName as string || data.displayName as string || data.display_name as string;

        if (accountId || displayName) {
          console.log(`[Consumer] Extrayendo snapshot para: ${displayName || accountId}`);

          await client.query(
            `INSERT INTO player_snapshots (account_id, display_name, platform, stats, ranked_data)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              accountId || null,
              displayName || null,
              event.parameters.platform || "epic",
              event.action === "stats" || event.action === "tracker-stats" ? JSON.stringify(data) : null,
              event.action === "ranked-current" ? JSON.stringify(data) : null
            ]
          );
        }
      }

      // 2. Shop History
      if (event.action === "shop") {
        console.log("[Consumer] Extrayendo shop history");
        const payloadData = asRecord(data.data);
        const shopData = Object.keys(payloadData).length > 0 ? payloadData : data;
        const featured = asRecordArray(shopData.featured);
        const daily = asRecordArray(shopData.daily);
        const entries = asRecordArray(shopData.entries);
        const items = featured.length > 0 || daily.length > 0 ? [...featured, ...daily] : entries;
        const shopDate = dateOnly(shopData.date) || new Date().toISOString().slice(0, 10);

        await client.query(
          `INSERT INTO shop_history (shop_date, items_count, items_vbucks_total, shop_data)
           VALUES (CURRENT_DATE, $1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [
            items.length,
            items.reduce((acc: number, item: JsonRecord) => acc + (toNumber(item.price) || 0), 0),
            JSON.stringify(shopData)
          ]
        );

        await client.query(
          `INSERT INTO daily_shop_snapshots (shop_date, hash, entries_count, raw_json, source)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (shop_date, source)
           DO UPDATE SET
             hash = EXCLUDED.hash,
             entries_count = EXCLUDED.entries_count,
             raw_json = EXCLUDED.raw_json,
             captured_at = NOW()`,
          [shopDate, asString(shopData.hash), entries.length, JSON.stringify(shopData), event.apiSource || "fortnite-api"]
        );

        const shopCosmetics = extractShopCosmetics(entries, shopDate, event.apiSource || "fortnite-api");
        for (const shopCosmetic of shopCosmetics) {
          await client.query(
            `INSERT INTO cosmetics (
              cosmetic_id, name, description, type, rarity, series, set_name,
              introduced_chapter, introduced_season, added_at, image_icon,
              image_featured, gameplay_tags, variants, raw_json, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $11,
              $12, $13, $14, $15, NOW()
            )
            ON CONFLICT (cosmetic_id)
            DO UPDATE SET
              name = EXCLUDED.name,
              description = EXCLUDED.description,
              type = EXCLUDED.type,
              rarity = EXCLUDED.rarity,
              series = EXCLUDED.series,
              set_name = EXCLUDED.set_name,
              introduced_chapter = EXCLUDED.introduced_chapter,
              introduced_season = EXCLUDED.introduced_season,
              added_at = EXCLUDED.added_at,
              image_icon = EXCLUDED.image_icon,
              image_featured = EXCLUDED.image_featured,
              gameplay_tags = EXCLUDED.gameplay_tags,
              variants = EXCLUDED.variants,
              raw_json = EXCLUDED.raw_json,
              updated_at = NOW()`,
            [
              shopCosmetic.id,
              shopCosmetic.name,
              shopCosmetic.description,
              shopCosmetic.type,
              shopCosmetic.rarity,
              shopCosmetic.series,
              shopCosmetic.setName,
              shopCosmetic.introducedChapter,
              shopCosmetic.introducedSeason,
              shopCosmetic.addedAt,
              shopCosmetic.imageIcon,
              shopCosmetic.imageFeatured,
              JSON.stringify(shopCosmetic.gameplayTags),
              JSON.stringify(shopCosmetic.variants),
              JSON.stringify(shopCosmetic.raw),
            ]
          );

          await client.query(
            `INSERT INTO cosmetic_shop_appearances (
              cosmetic_id, shop_date, source, offer_id, regular_price, final_price,
              in_date, out_date, giftable, refundable, layout_id, tile_size, raw_entry
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11, $12, $13
            )
            ON CONFLICT (cosmetic_id, shop_date, source)
            DO UPDATE SET
              offer_id = EXCLUDED.offer_id,
              regular_price = EXCLUDED.regular_price,
              final_price = EXCLUDED.final_price,
              in_date = EXCLUDED.in_date,
              out_date = EXCLUDED.out_date,
              giftable = EXCLUDED.giftable,
              refundable = EXCLUDED.refundable,
              layout_id = EXCLUDED.layout_id,
              tile_size = EXCLUDED.tile_size,
              raw_entry = EXCLUDED.raw_entry,
              ingested_at = NOW()`,
            [
              shopCosmetic.id,
              shopDate,
              shopCosmetic.source,
              shopCosmetic.offerId,
              shopCosmetic.regularPrice,
              shopCosmetic.finalPrice,
              shopCosmetic.inDate,
              shopCosmetic.outDate,
              shopCosmetic.giftable,
              shopCosmetic.refundable,
              shopCosmetic.layoutId,
              shopCosmetic.tileSize,
              JSON.stringify(shopCosmetic.rawEntry),
            ]
          );
        }
        console.log(`[Consumer] Cosméticos de tienda normalizados: ${shopCosmetics.length}`);
      }

      // 3. Tournament placements
      if (event.action === "player-tournament-placements" || event.action === "tournament-player-stats") {
        const placements = extractTournamentPlacements(event, data);
        for (const placement of placements) {
          await client.query(
            `INSERT INTO player_tournament_placements (
              account_id, epic_username, event_id, event_window_id, placement,
              points, eliminations, assists, avg_placement, total_matches, tournament_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (account_id, event_window_id)
            DO UPDATE SET
              epic_username = EXCLUDED.epic_username,
              event_id = EXCLUDED.event_id,
              placement = EXCLUDED.placement,
              points = EXCLUDED.points,
              eliminations = EXCLUDED.eliminations,
              assists = EXCLUDED.assists,
              avg_placement = EXCLUDED.avg_placement,
              total_matches = EXCLUDED.total_matches,
              tournament_data = EXCLUDED.tournament_data,
              captured_at = NOW()`,
            [
              placement.accountId,
              placement.epicUsername,
              placement.eventId,
              placement.eventWindowId,
              placement.placement,
              placement.points,
              placement.eliminations,
              placement.assists,
              placement.avgPlacement,
              placement.totalMatches,
              JSON.stringify(placement.raw)
            ]
          );
        }
        console.log(`[Consumer] Placements de torneo guardados: ${placements.length}`);
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function dateOnly(value: unknown): string | null {
  const text = asString(value);
  return text ? text.slice(0, 10) : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value !== null && value >= 0) return value;
  }
  return null;
}

function fieldDisplayValue(value: unknown): string | null {
  const record = asRecord(value);
  return asString(record.displayValue) || asString(record.name) || asString(record.value);
}

type ShopCosmetic = {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  rarity: string | null;
  series: string | null;
  setName: string | null;
  introducedChapter: number | null;
  introducedSeason: number | null;
  addedAt: string | null;
  imageIcon: string | null;
  imageFeatured: string | null;
  gameplayTags: unknown[];
  variants: unknown[];
  raw: JsonRecord;
  source: string;
  offerId: string | null;
  regularPrice: number | null;
  finalPrice: number | null;
  inDate: string | null;
  outDate: string | null;
  giftable: boolean | null;
  refundable: boolean | null;
  layoutId: string | null;
  tileSize: string | null;
  rawEntry: JsonRecord;
};

function extractShopCosmetics(entries: JsonRecord[], shopDate: string, source: string): ShopCosmetic[] {
  const cosmetics: ShopCosmetic[] = [];
  for (const entry of entries) {
    const rawItems = [
      ...asRecordArray(entry.brItems),
      ...asRecordArray(entry.instruments),
      ...asRecordArray(entry.cars),
      ...asRecordArray(entry.tracks),
      ...asRecordArray(entry.legoKits),
    ];

    for (const raw of rawItems) {
      const id = asString(raw.id);
      const name = asString(raw.name);
      if (!id || !name) continue;

      const images = asRecord(raw.images);
      const introduction = asRecord(raw.introduction);
      cosmetics.push({
        id,
        name,
        description: asString(raw.description),
        type: fieldDisplayValue(raw.type),
        rarity: fieldDisplayValue(raw.rarity),
        series: fieldDisplayValue(raw.series),
        setName: fieldDisplayValue(raw.set),
        introducedChapter: toNumber(introduction.chapter),
        introducedSeason: toNumber(introduction.season) || toNumber(introduction.backendValue),
        addedAt: asString(raw.added),
        imageIcon: asString(images.icon) || asString(images.smallIcon) || asString(images.small),
        imageFeatured: asString(images.featured),
        gameplayTags: Array.isArray(raw.gameplayTags) ? raw.gameplayTags : [],
        variants: Array.isArray(raw.variants) ? raw.variants : [],
        raw,
        source,
        offerId: asString(entry.offerId),
        regularPrice: toNumber(entry.regularPrice),
        finalPrice: toNumber(entry.finalPrice),
        inDate: asString(entry.inDate) || `${shopDate}T00:00:00Z`,
        outDate: asString(entry.outDate),
        giftable: typeof entry.giftable === "boolean" ? entry.giftable : null,
        refundable: typeof entry.refundable === "boolean" ? entry.refundable : null,
        layoutId: asString(entry.layoutId),
        tileSize: asString(entry.tileSize),
        rawEntry: entry,
      });
    }
  }
  return cosmetics;
}

function extractTournamentPlacements(event: ApiCallEvent, data: Record<string, unknown>): TournamentPlacement[] {
  const accountId = String(event.parameters?.accountId || event.parameters?.epicIds || data.accountId || "");
  if (!accountId) return [];

  const normalizedPlacements = asRecordArray(data.placements);
  if (normalizedPlacements.length > 0) {
    return normalizedPlacements
      .filter((placement) => placement.eventWindowId)
      .map((placement) => ({
        accountId: String(placement.accountId || accountId),
        epicUsername: placement.epicUsername || null,
        eventId: typeof placement.eventId === "string" ? placement.eventId : null,
        eventWindowId: String(placement.eventWindowId),
        placement: toNumber(placement.placement),
        points: toNumber(placement.points),
        eliminations: toNumber(placement.eliminations),
        assists: toNumber(placement.assists),
        avgPlacement: toNumber(placement.avgPlacement),
        totalMatches: toNumber(placement.totalMatches),
        raw: placement.raw || placement,
      }));
  }

  const players = asRecordArray(data.players);
  const eventWindowId = String(event.parameters?.eventWindowId || "");
  if (!eventWindowId) return [];

  return players.map((record) => {
    return {
      accountId,
      epicUsername: record.epicUsername || record.displayName || null,
      eventId: String(event.parameters?.eventId || record.eventId || "") || null,
      eventWindowId,
      placement: firstNumber(record, ["placement", "rank", "eventRank", "pointsRank", "scoreRank", "totalPointsRank"]),
      points: firstNumber(record, ["points", "score", "totalPoints"]),
      eliminations: firstNumber(record, ["eliminations", "kills"]),
      assists: firstNumber(record, ["assists"]),
      avgPlacement: toNumber(record.avgPlacement),
      totalMatches: firstNumber(record, ["matches", "totalMatches"]),
      raw: record,
    };
  });
}

// ==========================================
// Types
// ==========================================
interface ApiCallEvent {
  id: string;
  action: string;
  parameters: Record<string, unknown>;
  sourceIp: string;
  userAgent: string;
  apiSource: string;
  endpointUrl: string;
  responseStatus: number;
  responseSize: number;
  durationMs: number;
  timestamp: string;
  responseBody?: Record<string, unknown>;
}

interface TournamentPlacement {
  accountId: string;
  epicUsername: unknown;
  eventId: string | null;
  eventWindowId: string;
  placement: number | null;
  points: number | null;
  eliminations: number | null;
  assists: number | null;
  avgPlacement: number | null;
  totalMatches: number | null;
  raw: unknown;
}

// ==========================================
// Iniciar
// ==========================================
run().catch((error) => {
  console.error("[Consumer] Error fatal:", error);
  process.exit(1);
});
