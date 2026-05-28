import { Kafka, Producer, Message, Partitioners } from "kafkajs";
import { Pool, type PoolClient } from "pg";

// ==========================================
// Configuración
// ==========================================
const KAFKA_BROKER = process.env.KAFKA_BROKER || "kafka:29092";
const _KAFKA_TOPIC = process.env.KAFKA_TOPIC_API_CALLS || "api-calls";
const DATABASE_URL = process.env.DATABASE_URL;
const POLL_INTERVAL = 2000; // 2 segundos
const MAX_KAFKA_MESSAGE_BYTES = Number(process.env.KAFKA_MAX_MESSAGE_BYTES || 900_000);
const MAX_DEAD_LETTER_VALUE_BYTES = 20_000;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL no está configurada");
}

// ==========================================
// Pool de PostgreSQL
// ==========================================
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
});

// ==========================================
// Kafka Producer
// ==========================================
const kafka = new Kafka({
  clientId: "miyu-outbox-producer",
  brokers: [KAFKA_BROKER],
});

const producer: Producer = kafka.producer({
  allowAutoTopicCreation: true,
  createPartitioner: Partitioners.LegacyPartitioner,
});

type OutboxRow = {
  id: string | number;
  topic: string;
  event_key: string | null;
  payload: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(value: string) {
  return Buffer.byteLength(value, "utf8");
}

function trimForStorage(value: string) {
  if (byteLength(value) <= MAX_DEAD_LETTER_VALUE_BYTES) {
    return value;
  }

  return `${value.slice(0, MAX_DEAD_LETTER_VALUE_BYTES)}... [truncated]`;
}

function withoutLargeResponseBody(payload: unknown, reason: string) {
  if (!isRecord(payload) || !("responseBody" in payload)) {
    return payload;
  }

  return {
    ...payload,
    responseBody: null,
    responseBodyTruncated: true,
    responseBodyTruncatedReason: reason,
  };
}

function buildKafkaMessage(row: OutboxRow): { message: Message; serializedPayload: string; size: number } {
  let payload = row.payload;
  let serializedPayload = JSON.stringify(payload);
  let size = byteLength(serializedPayload);

  if (size > MAX_KAFKA_MESSAGE_BYTES) {
    payload = withoutLargeResponseBody(payload, `payload excedia ${MAX_KAFKA_MESSAGE_BYTES} bytes`);
    serializedPayload = JSON.stringify(payload);
    size = byteLength(serializedPayload);
  }

  return {
    message: {
      key: row.event_key || undefined,
      value: serializedPayload,
    },
    serializedPayload,
    size,
  };
}

async function persistDeadLetter(client: PoolClient, row: OutboxRow, rawValue: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await client.query(
    `INSERT INTO stream_dead_letters (
       topic, partition_id, offset_value, message_key, raw_value, error_message
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.topic, null, String(row.id), row.event_key, trimForStorage(rawValue), message]
  );
}

async function markPublished(client: PoolClient, id: string | number) {
  await client.query(
    "UPDATE api_outbox SET published = TRUE, published_at = NOW() WHERE id = $1",
    [id]
  );
}

function isMessageTooLarge(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  return error.type === "MESSAGE_TOO_LARGE" || String(error.message || "").includes("larger than the max message size");
}

// ==========================================
// Graceful shutdown
// ==========================================
let isShuttingDown = false;

async function shutdown(signal: string) {
  console.log(`\n[Producer] Señal ${signal} recibida. Cerrando...`);
  isShuttingDown = true;
  await producer.disconnect();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ==========================================
// Función principal (Polling Loop)
// ==========================================
async function run() {
  console.log("[Producer] Iniciando productor Outbox...");
  
  await producer.connect();
  console.log("[Producer] Conectado a Kafka");

  while (!isShuttingDown) {
    const client = await pool.connect();
    try {
      // 1. Buscar eventos no publicados
      const result = await client.query(
        `SELECT id, topic, event_key, payload 
         FROM api_outbox 
         WHERE published = FALSE 
         ORDER BY created_at ASC 
         LIMIT 50`
      );

      if (result.rows.length > 0) {
        console.log(`[Producer] Procesando ${result.rows.length} eventos...`);

        for (const row of result.rows as OutboxRow[]) {
          const { message, serializedPayload, size } = buildKafkaMessage(row);

          if (size > MAX_KAFKA_MESSAGE_BYTES) {
            await persistDeadLetter(
              client,
              row,
              serializedPayload,
              new Error(`Payload demasiado grande para Kafka despues de recortar responseBody: ${size} bytes`)
            );
            await markPublished(client, row.id);
            console.warn(`[Producer] Evento ${row.id} enviado a DLQ por tamano (${size} bytes).`);
            continue;
          }

          // 2. Enviar a Kafka
          try {
            await producer.send({
              topic: row.topic,
              messages: [message],
            });
          } catch (error) {
            if (isMessageTooLarge(error)) {
              await persistDeadLetter(client, row, serializedPayload, error);
              await markPublished(client, row.id);
              console.warn(`[Producer] Evento ${row.id} enviado a DLQ por rechazo de tamano de Kafka.`);
              continue;
            }

            throw error;
          }

          // 3. Marcar como publicado
          await markPublished(client, row.id);
        }
        console.log(`[Producer] ${result.rows.length} eventos publicados correctamente.`);
      }
    } catch (error) {
      console.error("[Producer] Error en el loop de procesamiento:", error);
    } finally {
      client.release();
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

run().catch((error) => {
  console.error("[Producer] Error fatal:", error);
  process.exit(1);
});
