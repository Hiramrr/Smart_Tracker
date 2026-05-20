import { Kafka, Producer, Message } from "kafkajs";
import { Pool } from "pg";

// ==========================================
// Configuración
// ==========================================
const KAFKA_BROKER = process.env.KAFKA_BROKER || "kafka:29092";
const _KAFKA_TOPIC = process.env.KAFKA_TOPIC_API_CALLS || "api-calls";
const DATABASE_URL = process.env.DATABASE_URL;
const POLL_INTERVAL = 2000; // 2 segundos

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
});

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

        for (const row of result.rows) {
          const message: Message = {
            key: row.event_key,
            value: JSON.stringify(row.payload),
          };

          // 2. Enviar a Kafka
          await producer.send({
            topic: row.topic,
            messages: [message],
          });

          // 3. Marcar como publicado
          await client.query(
            "UPDATE api_outbox SET published = TRUE, published_at = NOW() WHERE id = $1",
            [row.id]
          );
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
