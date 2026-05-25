import { randomUUID } from "crypto";
import { Kafka } from "kafkajs";
import { Pool } from "pg";

type JsonRecord = Record<string, unknown>;

const databaseUrl = process.env.DATABASE_URL;
const kafkaBroker = process.env.KAFKA_BROKER || "localhost:9092";
const kafkaTopic = process.env.KAFKA_TOPIC_API_CALLS || "api-calls";
const shouldPublishKafka = process.env.SEED_PUBLISH_KAFKA !== "false";

if (!databaseUrl) {
  throw new Error("DATABASE_URL no esta configurada");
}

const pool = new Pool({ connectionString: databaseUrl, max: 6 });
const baseTime = new Date("2026-05-25T15:00:00.000Z");

function at(minutesAgo: number): string {
  return new Date(baseTime.getTime() - minutesAgo * 60_000).toISOString();
}

function apiEvent(
  id: string,
  action: string,
  apiSource: string,
  minutesAgo: number,
  responseStatus: number,
  durationMs: number,
  parameters: JsonRecord,
  responseBody: JsonRecord,
) {
  return {
    id,
    action,
    parameters,
    sourceIp: "127.0.0.1",
    userAgent: "miyu-seed/1.0",
    responseStatus,
    responseSize: JSON.stringify(responseBody).length,
    durationMs,
    apiSource,
    endpointUrl: `/seed/${action}`,
    responseBody,
    timestamp: at(minutesAgo),
  };
}

const events = [
  apiEvent(
    "11111111-1111-4111-8111-111111111111",
    "stats",
    "tracker-gg",
    9,
    200,
    143,
    { accountId: "seed-fn-001", displayName: "SeedStriker", platform: "epic" },
    {
      accountId: "seed-fn-001",
      displayName: "SeedStriker",
      stats: { kd: 2.18, winRate: 12.4, totalMatches: 184, kills: 802 },
      pastSeasons: [
        { seasonName: "C5S1", stats: { kd: 1.52, winRate: 8.1, totalMatches: 80 } },
        { seasonName: "C5S2", stats: { kd: 1.83, winRate: 10.5, totalMatches: 102 } },
        { seasonName: "C5S3", stats: { kd: 2.18, winRate: 12.4, totalMatches: 184 } },
      ],
    },
  ),
  apiEvent(
    "22222222-2222-4222-8222-222222222222",
    "shop",
    "fortnite-api",
    8,
    200,
    211,
    { date: "2026-05-25" },
    {
      data: {
        date: "2026-05-25",
        hash: "seed-shop-2026-05-25",
        entries: [
          {
            offerId: "seed-offer-001",
            regularPrice: 1500,
            finalPrice: 1200,
            inDate: "2026-05-25T00:00:00Z",
            outDate: "2026-05-26T00:00:00Z",
            brItems: [
              {
                id: "seed-skin-001",
                name: "Data Drift",
                description: "Seed cosmetic for warehouse tests",
                type: { displayValue: "Outfit" },
                rarity: { displayValue: "Epic" },
                series: { displayValue: "Miyu" },
                set: { displayValue: "Telemetry Set" },
                introduction: { chapter: 5, season: 3 },
                added: "2025-10-01T00:00:00Z",
                images: { icon: "https://example.com/data-drift.png" },
                gameplayTags: ["Seed"],
                variants: [],
              },
            ],
          },
        ],
      },
    },
  ),
  apiEvent(
    "33333333-3333-4333-8333-333333333333",
    "lol-overview",
    "riot",
    7,
    200,
    188,
    { gameName: "SeedMiyu", tagLine: "LAN", platformRoute: "la1" },
    { puuid: "seed-lol-puuid-001", gameName: "SeedMiyu", tagLine: "LAN" },
  ),
  apiEvent(
    "44444444-4444-4444-8444-444444444444",
    "fortnite-replay-parse",
    "fortnite-replay-parser",
    6,
    200,
    95,
    { matchCount: 3 },
    {
      player: { playerId: "seed-fn-001", displayName: "SeedStriker" },
      matches: [
        { replayId: "seed-rp-001", placement: 5, eliminations: 7 },
        { replayId: "seed-rp-002", placement: 2, eliminations: 11 },
        { replayId: "seed-rp-003", placement: 1, eliminations: 9 },
      ],
    },
  ),
  apiEvent(
    "55555555-5555-4555-8555-555555555555",
    "leaderboard",
    "osirion",
    5,
    503,
    406,
    { region: "NA-Central" },
    { error: "seed upstream unavailable" },
  ),
];

async function seedApiCalls() {
  for (const event of events) {
    await pool.query(
      `INSERT INTO api_calls (
         id, action, parameters, source_ip, user_agent, response_status,
         response_size, duration_ms, api_source, endpoint_url, response_body, created_at
       ) VALUES ($1, $2, $3, NULLIF($4, '')::inet, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [
        event.id,
        event.action,
        JSON.stringify(event.parameters),
        event.sourceIp,
        event.userAgent,
        event.responseStatus,
        event.responseSize,
        event.durationMs,
        event.apiSource,
        event.endpointUrl,
        JSON.stringify(event.responseBody),
        event.timestamp,
      ],
    );
  }
}

async function seedShopHistory() {
  const cosmetics: Array<readonly [string, string, string, string, string]> = [
    ["seed-skin-001", "Data Drift", "Outfit", "Epic", "Miyu"],
    ["seed-pickaxe-001", "Pipeline Pick", "Pickaxe", "Rare", "Miyu"],
    ["seed-emote-001", "Batch Shuffle", "Emote", "Uncommon", "Miyu"],
  ];

  for (const [id, name, type, rarity, series] of cosmetics) {
    await pool.query(
      `INSERT INTO cosmetics (
         cosmetic_id, name, description, type, rarity, series, set_name,
         introduced_chapter, introduced_season, added_at, image_icon, gameplay_tags, variants, raw_json
       ) VALUES ($1, $2, $3, $4, $5, $6, 'Telemetry Set', 5, 3, $7, $8, '["Seed"]'::jsonb, '[]'::jsonb, $9)
       ON CONFLICT (cosmetic_id)
       DO UPDATE SET updated_at = NOW()`,
      [
        id,
        name,
        `${name} generated by seed`,
        type,
        rarity,
        series,
        "2025-10-01T00:00:00Z",
        `https://example.com/${id}.png`,
        JSON.stringify({ seed: true }),
      ],
    );
  }

  for (let day = 0; day < 36; day += 1) {
    const shopDate = new Date(Date.UTC(2026, 4, 25 - day)).toISOString().slice(0, 10);
    for (const [index, cosmetic] of cosmetics.entries()) {
      if ((day + index) % (index + 2) !== 0) continue;
      await pool.query(
        `INSERT INTO cosmetic_shop_appearances (
           cosmetic_id, shop_date, source, offer_id, regular_price, final_price, raw_entry
         ) VALUES ($1, $2, 'seed', $3, $4, $5, $6)
         ON CONFLICT (cosmetic_id, shop_date, source)
         DO UPDATE SET final_price = EXCLUDED.final_price, raw_entry = EXCLUDED.raw_entry`,
        [
          cosmetic[0],
          shopDate,
          `seed-offer-${cosmetic[0]}-${shopDate}`,
          1500 - index * 300,
          1200 - index * 250,
          JSON.stringify({ seed: true, shopDate }),
        ],
      );
    }
  }
}

async function seedPlayerAndLol() {
  await pool.query(
    `INSERT INTO player_snapshots (account_id, display_name, platform, stats, ranked_data, captured_at)
     VALUES ($1, $2, 'epic', $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [
      "seed-fn-001",
      "SeedStriker",
      JSON.stringify({ kd: 2.18, winRate: 12.4, totalMatches: 184 }),
      JSON.stringify({ rank: "Elite", progress: 62 }),
      at(9),
    ],
  );

  for (const [metric, value] of [
    ["kd", 2.18],
    ["win_rate", 12.4],
    ["matches", 184],
    ["skill_category", 2],
  ] as const) {
    await pool.query(
      `INSERT INTO player_progress (account_id, metric_name, metric_value, delta, period_label, created_at)
       VALUES ('seed-fn-001', $1, $2, 0, 'seed', $3)`,
      [metric, value, at(4)],
    );
  }

  await pool.query(
    `INSERT INTO lol_player_snapshots (
       puuid, game_name, tag_line, platform, regional_route, summoner_id,
       summoner_level, profile_icon_id, ranked_data, mastery_data, analysis, raw_json, captured_at
     ) VALUES ($1, 'SeedMiyu', 'LAN', 'la1', 'americas', 'seed-summoner-001', 88, 29, $2, $3, $4, $5, $6)`,
    [
      "seed-lol-puuid-001",
      JSON.stringify([{ tier: "GOLD", rank: "II", leaguePoints: 44 }]),
      JSON.stringify([{ championId: 22, championLevel: 6 }]),
      JSON.stringify({ seed: true }),
      JSON.stringify({ seed: true }),
      at(7),
    ],
  );

  for (let index = 0; index < 6; index += 1) {
    const win = index % 2 === 0;
    const match = {
      metadata: { matchId: `SEED_LA1_${index}` },
      info: {
        gameDuration: 1800 + index * 40,
        queueId: 420,
        participants: [
          {
            puuid: "seed-lol-puuid-001",
            championName: index % 2 === 0 ? "Ashe" : "Jinx",
            championId: index % 2 === 0 ? 22 : 222,
            teamPosition: "BOTTOM",
            individualPosition: "BOTTOM",
            win,
            kills: 8 + index,
            deaths: 3 + (index % 3),
            assists: 7 + index,
            goldEarned: 12400 + index * 500,
            totalMinionsKilled: 190 + index * 8,
            neutralMinionsKilled: 4,
          },
        ],
      },
    };
    await pool.query(
      `INSERT INTO lol_match_snapshots (match_id, puuid, game_creation, game_duration, queue_id, raw_json)
       VALUES ($1, 'seed-lol-puuid-001', $2, $3, 420, $4)
       ON CONFLICT (match_id, puuid)
       DO UPDATE SET raw_json = EXCLUDED.raw_json, captured_at = NOW()`,
      [
        `SEED_LA1_${index}`,
        at(60 - index * 3),
        1800 + index * 40,
        JSON.stringify(match),
      ],
    );
  }
}

async function seedStreamMetrics() {
  await pool.query("TRUNCATE stream_api_metrics_minute");
  for (const event of events) {
    await pool.query(
      `INSERT INTO stream_api_metrics_minute (
         window_start, action, api_source, total_events, success_count, error_count,
         total_duration_ms, total_response_size, min_duration_ms, max_duration_ms,
         first_event_at, last_event_at
       ) VALUES (
         DATE_TRUNC('minute', $1::timestamptz), $2, $3, 1, $4::integer, $5::integer, $6::bigint, $7::bigint, $6::integer, $6::integer, $1::timestamptz, $1::timestamptz
       )
       ON CONFLICT (window_start, action, api_source)
       DO UPDATE SET
         total_events = stream_api_metrics_minute.total_events + 1,
         success_count = stream_api_metrics_minute.success_count + EXCLUDED.success_count,
         error_count = stream_api_metrics_minute.error_count + EXCLUDED.error_count,
         total_duration_ms = stream_api_metrics_minute.total_duration_ms + EXCLUDED.total_duration_ms,
         total_response_size = stream_api_metrics_minute.total_response_size + EXCLUDED.total_response_size,
         min_duration_ms = LEAST(stream_api_metrics_minute.min_duration_ms, EXCLUDED.min_duration_ms),
         max_duration_ms = GREATEST(stream_api_metrics_minute.max_duration_ms, EXCLUDED.max_duration_ms),
         first_event_at = LEAST(stream_api_metrics_minute.first_event_at, EXCLUDED.first_event_at),
         last_event_at = GREATEST(stream_api_metrics_minute.last_event_at, EXCLUDED.last_event_at),
         updated_at = NOW()`,
      [
        event.timestamp,
        event.action,
        event.apiSource,
        event.responseStatus < 400 ? 1 : 0,
        event.responseStatus >= 400 ? 1 : 0,
        event.durationMs,
        event.responseSize,
      ],
    );
  }
}

async function publishKafkaEvents() {
  if (!shouldPublishKafka) return;

  const kafka = new Kafka({ clientId: "miyu-seed", brokers: [kafkaBroker] });
  const producer = kafka.producer({ allowAutoTopicCreation: true });
  try {
    await producer.connect();
    await producer.send({
      topic: kafkaTopic,
      messages: events.map((event) => ({
        key: event.action,
        value: JSON.stringify({ ...event, id: randomUUID() }),
      })),
    });
    console.log(`[Seed] eventos Kafka publicados en ${kafkaTopic}: ${events.length}`);
  } catch (error) {
    console.warn("[Seed] Kafka no disponible; se dejo seed en PostgreSQL/outbox:", error);
  } finally {
    await producer.disconnect().catch(() => undefined);
  }
}

async function main() {
  await seedApiCalls();
  await seedShopHistory();
  await seedPlayerAndLol();
  await seedStreamMetrics();
  await publishKafkaEvents();
  console.log("[Seed] dataset reproducible cargado correctamente.");
}

main()
  .catch((error: unknown) => {
    console.error("[Seed] Error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
