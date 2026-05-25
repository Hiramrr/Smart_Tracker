import { Pool } from "pg";

type ApiEvent = {
  action?: string;
  apiSource?: string;
  api_source?: string;
  responseStatus?: number;
  response_status?: number;
  responseSize?: number;
  response_size?: number;
  durationMs?: number;
  duration_ms?: number;
  timestamp?: string;
  createdAt?: string;
  created_at?: string;
};

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL no esta configurada");
}

const pool = new Pool({ connectionString: databaseUrl, max: 4 });

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stream_api_metrics_minute (
      window_start TIMESTAMP WITH TIME ZONE NOT NULL,
      action VARCHAR(100) NOT NULL,
      api_source VARCHAR(50) NOT NULL DEFAULT 'unknown',
      total_events INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      total_duration_ms BIGINT NOT NULL DEFAULT 0,
      total_response_size BIGINT NOT NULL DEFAULT 0,
      min_duration_ms INTEGER,
      max_duration_ms INTEGER,
      first_event_at TIMESTAMP WITH TIME ZONE,
      last_event_at TIMESTAMP WITH TIME ZONE,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      PRIMARY KEY (window_start, action, api_source)
    )
  `);
}

async function upsertMetric(event: ApiEvent) {
  const action = textValue(event.action, "unknown");
  const apiSource = textValue(event.apiSource ?? event.api_source, "unknown");
  const status = numberValue(event.responseStatus ?? event.response_status);
  const durationMs = numberValue(event.durationMs ?? event.duration_ms);
  const responseSize = numberValue(event.responseSize ?? event.response_size);
  const timestamp = textValue(
    event.timestamp ?? event.createdAt ?? event.created_at,
    new Date().toISOString(),
  );
  const successCount = status > 0 && status < 400 ? 1 : 0;
  const errorCount = status >= 400 ? 1 : 0;

  await pool.query(
    `
    INSERT INTO stream_api_metrics_minute (
      window_start, action, api_source, total_events, success_count, error_count,
      total_duration_ms, total_response_size, min_duration_ms, max_duration_ms,
      first_event_at, last_event_at
    ) VALUES (
      DATE_TRUNC('minute', $1::timestamptz), $2, $3, 1, $4, $5,
      $6, $7, $6, $6, $1::timestamptz, $1::timestamptz
    )
    ON CONFLICT (window_start, action, api_source)
    DO UPDATE SET
      total_events = stream_api_metrics_minute.total_events + 1,
      success_count = stream_api_metrics_minute.success_count + EXCLUDED.success_count,
      error_count = stream_api_metrics_minute.error_count + EXCLUDED.error_count,
      total_duration_ms = stream_api_metrics_minute.total_duration_ms + EXCLUDED.total_duration_ms,
      total_response_size = stream_api_metrics_minute.total_response_size + EXCLUDED.total_response_size,
      min_duration_ms = LEAST(COALESCE(stream_api_metrics_minute.min_duration_ms, EXCLUDED.min_duration_ms), EXCLUDED.min_duration_ms),
      max_duration_ms = GREATEST(COALESCE(stream_api_metrics_minute.max_duration_ms, EXCLUDED.max_duration_ms), EXCLUDED.max_duration_ms),
      first_event_at = LEAST(COALESCE(stream_api_metrics_minute.first_event_at, EXCLUDED.first_event_at), EXCLUDED.first_event_at),
      last_event_at = GREATEST(COALESCE(stream_api_metrics_minute.last_event_at, EXCLUDED.last_event_at), EXCLUDED.last_event_at),
      updated_at = NOW()
    `,
    [timestamp, action, apiSource, successCount, errorCount, durationMs, responseSize],
  );
}

async function main() {
  await ensureSchema();
  await pool.query("TRUNCATE stream_api_metrics_minute");

  const result = await pool.query<{ payload: ApiEvent }>(
    `SELECT payload FROM api_outbox ORDER BY created_at ASC`,
  );

  for (const row of result.rows) {
    await upsertMetric(row.payload);
  }

  console.log(`[KappaReplay] metricas reconstruidas desde api_outbox: ${result.rowCount}`);
}

main()
  .catch((error: unknown) => {
    console.error("[KappaReplay] Error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
