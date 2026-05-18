import { Kafka, Producer, Message } from "kafkajs";

const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const KAFKA_TOPIC = process.env.KAFKA_TOPIC_API_CALLS || "api-calls";

let producer: Producer | null = null;

/**
 * Inicializa el productor de Kafka
 */
export async function getProducer(): Promise<Producer> {
  if (producer) return producer;

  const kafka = new Kafka({
    clientId: "miyu-tracker-producer",
    brokers: [KAFKA_BROKER],
    retry: {
      initialRetryTime: 100,
      retries: 5,
    },
  });

  producer = kafka.producer({
    allowAutoTopicCreation: true,
    transactionalId: "miyu-producer",
    maxInFlightRequests: 1,
  });

  await producer.connect();
  console.log("[Kafka] Productor conectado exitosamente");

  return producer;
}

/**
 * Publica un evento de llamada API en Kafka
 */
export async function publishApiCall(event: ApiCallEvent): Promise<void> {
  try {
    const prod = await getProducer();

    // No incluir responseBody en Kafka para evitar mensajes muy grandes
    const { responseBody, ...kafkaEvent } = event;

    const message: Message = {
      key: event.action,
      value: JSON.stringify(kafkaEvent),
      timestamp: Date.now().toString(),
    };

    // Verificar tamaño del mensaje (límite de Kafka por defecto: 1MB)
    const messageSize = Buffer.byteLength(message.value || "", "utf8");
    if (messageSize > 900000) {
      console.warn(`[Kafka] Mensaje muy grande (${messageSize} bytes), truncando...`);
      const truncatedEvent = {
        ...kafkaEvent,
        parameters: { truncated: true },
      };
      message.value = JSON.stringify(truncatedEvent);
    }

    await prod.send({
      topic: KAFKA_TOPIC,
      messages: [message],
    });

    console.log(`[Kafka] Evento publicado: ${event.action} (${messageSize} bytes)`);
  } catch (error) {
    console.error("[Kafka] Error publicando evento:", error);
    // No lanzamos error para no afectar la respuesta API
  }
}

/**
 * Cierra el productor de Kafka
 */
export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
    console.log("[Kafka] Productor desconectado");
  }
}

/**
 * Interface para eventos de llamada API
 */
export interface ApiCallEvent {
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
