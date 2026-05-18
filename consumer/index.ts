import { Kafka, Consumer, EachMessagePayload } from "kafkajs";
import { Pool } from "pg";

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
    eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
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

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

// ==========================================
// Iniciar
// ==========================================
run().catch((error) => {
  console.error("[Consumer] Error fatal:", error);
  process.exit(1);
});
