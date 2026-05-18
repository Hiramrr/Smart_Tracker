# Miyu Tracker - Arquitectura de Ingeniería de Datos

> Proyecto para la clase de Ingeniería de Datos - Implementación de Data Lake con Kafka y PostgreSQL

---

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura](#arquitectura)
3. [Stack Tecnológico](#stack-tecnológico)
4. [Servicios Docker](#servicios-docker)
5. [Flujo de Datos](#flujo-de-datos)
6. [Esquema del Data Lake](#esquema-del-data-lake)
7. [Endpoints](#endpoints)
8. [Guía de Uso](#guía-de-uso)
9. [Monitoreo](#monitoreo)
10. [Patrón Cache-Aside](#patrón-cache-aside)
11. [Conceptos de Ingeniería de Datos Aplicados](#conceptos-de-ingeniería-de-datos-aplicados)
12. [Estructura del Proyecto](#estructura-del-proyecto)
13. [Troubleshooting](#troubleshooting)

---

## Visión General

Miyu Tracker es una aplicación web que consulta APIs externas de Fortnite (Osirion, Tracker.gg, Fortnite API) para obtener estadísticas de jugadores, torneos, rankings y la tienda del juego.

Para la clase de Ingeniería de Datos, se implementó una arquitectura completa de procesamiento de datos que:

- **Captura** cada consulta API como un evento
- **Streamnea** los eventos mediante Apache Kafka
- **Persiste** los datos en PostgreSQL como un Data Lake
- **Provee** vistas analíticas para consultas históricas

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ARQUITECTURA MIYU TRACKER                          │
└─────────────────────────────────────────────────────────────────────────────┘

     Usuario
        │
        ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js     │     │  Apache Kafka   │     │   PostgreSQL    │
│   (App)       │────▶│  Topic:         │────▶│   Data Lake     │
│  Puerto 3000  │     │  "api-calls"    │     │  Puerto 5432    │
└───────┬───────┘     └─────────────────┘     └─────────────────┘
        │
        │ Consulta
        ▼
┌─────────────────┐
│  APIs Externas  │
│ - Osirion       │
│ - Tracker.gg    │
│ - Fortnite API  │
└─────────────────┘

┌─────────────────┐
│   Kafka Consumer│
│  (Persistencia) │
│  - Lee Kafka    │
│  - Escribe PG   │
└─────────────────┘

┌─────────────────┐
│    Kafka UI     │
│  (Monitoreo)    │
│  Puerto 8080    │
└─────────────────┘
```

### Patrón Arquitectónico

Se utiliza el patrón **Event-Driven Architecture** con **CQRS** (Command Query Responsibility Segregation) implícito:

- **Producer (Next.js)**: Genera eventos de dominio (consultas API)
- **Message Broker (Kafka)**: Desacopla la producción del consumo
- **Consumer (Node.js)**: Procesa y persiste eventos
- **Data Store (PostgreSQL)**: Almacena datos históricos para análisis

---

## Stack Tecnológico

| Capa | Tecnología | Versión | Propósito |
|------|-----------|---------|-----------|
| Frontend | Next.js | 16.2.4 | Aplicación web React |
| Backend API | Next.js API Routes | - | Endpoints REST |
| Message Broker | Apache Kafka | 7.6.0 (Confluent) | Streaming de eventos |
| Coordination | Apache Zookeeper | 7.6.0 | Gestión de cluster Kafka |
| Data Lake | PostgreSQL | 16 | Almacenamiento histórico |
| Consumer | Node.js + KafkaJS | 20 LTS | Procesamiento de eventos |
| Observabilidad | Kafka UI | Latest | Dashboard de monitoreo |
| Containerización | Docker + Docker Compose | - | Orquestación de servicios |

---

## Servicios Docker

El archivo `docker-compose.yml` define 6 servicios:

### 1. PostgreSQL (`miyu-postgres`)

```yaml
Servicio: postgres
Imagen: postgres:16-alpine
Puerto: 5432
Volumen: postgres_data
Inicialización: sql/init.sql
```

**Base de datos**: `miyu_datalake`  
**Usuario**: `miyu`  
**Contraseña**: `miyu_secret`

### 2. Zookeeper (`miyu-zookeeper`)

```yaml
Servicio: zookeeper
Imagen: confluentinc/cp-zookeeper:7.6.0
Puerto: 2181
```

Requerido por Kafka para coordinación de brokers y elección de líder.

### 3. Kafka (`miyu-kafka`)

```yaml
Servicio: kafka
Imagen: confluentinc/cp-kafka:7.6.0
Puertos: 9092 (host), 29092 (internal)
Topic: api-calls (auto-created)
```

Configuración de listeners:
- `PLAINTEXT_HOST://localhost:9092` - Acceso desde el host
- `PLAINTEXT://kafka:29092` - Acceso interno entre contenedores

### 4. Kafka UI (`miyu-kafka-ui`)

```yaml
Servicio: kafka-ui
Imagen: provectuslabs/kafka-ui:latest
Puerto: 8080
```

Interfaz web para monitorear topics, consumers, métricas y mensajes.

### 5. Next.js App (`miyu-app`)

```yaml
Servicio: app
Build: Dockerfile (multi-stage)
Puerto: 3000
Dependencias: postgres, kafka
```

Variables de entorno:
- `TRACKER_API_KEY`
- `FORTNITE_API_KEY`
- `DATABASE_URL`
- `KAFKA_BROKER`
- `KAFKA_TOPIC_API_CALLS`

### 6. Kafka Consumer (`miyu-consumer`)

```yaml
Servicio: consumer
Build: consumer/Dockerfile
Dependencias: postgres, kafka
```

Variables de entorno:
- `DATABASE_URL`
- `KAFKA_BROKER`
- `KAFKA_TOPIC_API_CALLS`
- `KAFKA_GROUP_ID`

---

## Flujo de Datos

### Paso 1: Solicitud del Usuario

El usuario realiza una consulta desde la UI, por ejemplo:

```
GET /api/osirion?action=stats&accountId=abc123
```

### Paso 2: API Route Procesa la Solicitud

El archivo `src/app/api/osirion/route.ts`:

1. Valida parámetros
2. Construye la URL de la API externa
3. Realiza la petición HTTP
4. **Publica un evento en Kafka** con los metadatos de la llamada

```typescript
// Evento enviado a Kafka
{
  id: "uuid-v4",
  action: "stats",
  parameters: { accountId: "abc123" },
  sourceIp: "192.168.1.1",
  userAgent: "Mozilla/5.0...",
  apiSource: "osirion",
  endpointUrl: "https://fnapi.osirion.gg/v1/stats/account?accountId=abc123",
  responseStatus: 200,
  responseSize: 15420,
  durationMs: 245,
  timestamp: "2026-05-17T12:00:00Z"
}
```

### Paso 3: Kafka Recibe el Evento

El evento se almacena en el topic `api-calls` con:
- **Key**: `stats` (acción)
- **Value**: JSON del evento
- **Timestamp**: Epoch milliseconds

### Paso 4: Consumer Lee el Evento

El servicio `consumer/index.ts`:

1. Se suscribe al topic `api-calls`
2. Recibe el mensaje
3. Parsea el JSON
4. Inserta los datos en PostgreSQL

### Paso 5: Persistencia en PostgreSQL

```sql
INSERT INTO api_calls (
  id, action, parameters, source_ip, user_agent,
  response_status, response_size, duration_ms,
  api_source, endpoint_url, created_at
) VALUES (...)
```

### Diagrama de Secuencia

```
Usuario    Next.js    API Externa    Kafka    Consumer    PostgreSQL
  │          │            │            │          │            │
  │─────────▶│            │            │          │            │
  │          │───────────▶│            │          │            │
  │          │◀───────────│            │          │            │
  │          │───────────────────────▶│          │            │
  │          │            │            │─────────▶│            │
  │          │            │            │          │───────────▶│
  │          │            │            │          │◀───────────│
  │◀─────────│            │            │          │            │
```

---

## Esquema del Data Lake

### Tablas Principales

#### `api_calls`

Registro de cada consulta realizada a las APIs externas.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | Identificador único del evento |
| `action` | VARCHAR(100) | Acción realizada (lookup, stats, shop, etc.) |
| `parameters` | JSONB | Parámetros de la consulta |
| `source_ip` | INET | IP del cliente |
| `user_agent` | TEXT | User-Agent del navegador |
| `response_status` | INTEGER | Código HTTP de respuesta |
| `response_size` | INTEGER | Tamaño de la respuesta en bytes |
| `duration_ms` | INTEGER | Tiempo de respuesta en milisegundos |
| `api_source` | VARCHAR(50) | Fuente de la API (osirion, tracker-gg, fortnite-api) |
| `endpoint_url` | TEXT | URL completa consultada |
| `created_at` | TIMESTAMP | Fecha y hora del evento |

**Índices**:
- `idx_api_calls_action` - Para filtrar por acción
- `idx_api_calls_created_at` - Para consultas temporales
- `idx_api_calls_api_source` - Para filtrar por fuente
- `idx_api_calls_response_status` - Para análisis de errores
- `idx_api_calls_time_action` - Índice compuesto para series temporales

#### `api_responses`

Almacena las respuestas completas de las APIs (opcional).

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | Identificador único |
| `api_call_id` | UUID | FK a `api_calls.id` |
| `response_body` | JSONB | Respuesta completa de la API |
| `created_at` | TIMESTAMP | Fecha de almacenamiento |

#### `player_snapshots`

Guarda snapshots de estadísticas de jugadores para análisis histórico.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | Identificador único |
| `account_id` | VARCHAR(255) | ID de cuenta del jugador |
| `display_name` | VARCHAR(255) | Nombre visible |
| `platform` | VARCHAR(50) | Plataforma (epic, psn, xbl) |
| `stats` | JSONB | Estadísticas completas |
| `ranked_data` | JSONB | Datos de ranked |
| `captured_at` | TIMESTAMP | Fecha de captura |

#### `shop_history`

Historial de la tienda de Fortnite.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | UUID | Identificador único |
| `shop_date` | DATE | Fecha de la tienda |
| `items_count` | INTEGER | Cantidad de items |
| `items_vbucks_total` | INTEGER | Costo total en V-Bucks |
| `shop_data` | JSONB | Datos completos de la tienda |
| `captured_at` | TIMESTAMP | Fecha de captura |

### Vistas Analíticas

#### `v_api_calls_hourly`

```sql
SELECT 
    DATE_TRUNC('hour', created_at) AS hour,
    action,
    api_source,
    COUNT(*) AS total_calls,
    AVG(duration_ms) AS avg_duration_ms,
    SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) AS error_count
FROM api_calls
GROUP BY DATE_TRUNC('hour', created_at), action, api_source
```

Métricas agregadas por hora.

#### `v_api_calls_daily`

```sql
SELECT 
    DATE(created_at) AS day,
    action,
    COUNT(*) AS total_calls,
    AVG(duration_ms) AS avg_duration_ms,
    MAX(duration_ms) AS max_duration_ms,
    SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) AS error_count
FROM api_calls
GROUP BY DATE(created_at), action
```

Métricas agregadas por día.

---

## Endpoints

### APIs de Fortnite

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/osirion?action=lookup&displayName={name}` | GET | Buscar cuenta por nombre |
| `/api/osirion?action=stats&accountId={id}` | GET | Estadísticas de cuenta |
| `/api/osirion?action=tracker-stats&displayName={name}` | GET | Stats desde Tracker.gg |
| `/api/osirion?action=fortnite-api-stats&accountId={id}` | GET | Stats desde Fortnite API |
| `/api/osirion?action=ranked-current&accountId={id}` | GET | Rank actual |
| `/api/osirion?action=tournaments` | GET | Lista de torneos |
| `/api/osirion?action=leaderboard&leaderboardEventId={id}&leaderboardEventWindowId={wid}` | GET | Leaderboard |
| `/api/osirion?action=shop` | GET | Tienda actual |

### Data Lake

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/datalake/stats` | GET | Estadísticas del data lake |

Respuesta de `/api/datalake/stats`:

```json
{
  "success": true,
  "stats": {
    "totalCalls": 1523,
    "todayCalls": 45,
    "callsByAction": [
      { "action": "stats", "total": "523", "avg_duration": "245.32" },
      { "action": "lookup", "total": "312", "avg_duration": "120.50" }
    ],
    "callsBySource": [
      { "api_source": "osirion", "total": "835" },
      { "api_source": "fortnite-api", "total": "688" }
    ],
    "errors": [
      { "response_status": "404", "total": "12" },
      { "response_status": "500", "total": "3" }
    ],
    "recentCalls": [...],
    "hourlyStats": [...]
  }
}
```

---

## Guía de Uso

### Prerrequisitos

- Docker Desktop instalado
- Docker Compose disponible
- Mínimo 4GB de RAM disponibles

### Instalación

1. **Clonar o navegar al proyecto**:

```bash
cd miyu-tracker
```

2. **Configurar variables de entorno**:

```bash
cp .env.example .env
```

El archivo `.env` incluye:
- `TRACKER_API_KEY` - API key de Tracker.gg
- `FORTNITE_API_KEY` - API key de Fortnite API
- Credenciales de PostgreSQL
- Configuración de Kafka

3. **Instalar dependencias locales** (para desarrollo):

```bash
npm install
```

4. **Iniciar todos los servicios**:

```bash
docker-compose up --build
```

Para ejecutar en segundo plano:

```bash
docker-compose up -d --build
```

### Verificación

Después de iniciar, verificar que todos los servicios estén saludables:

```bash
docker-compose ps
```

Servicios esperados:
- `miyu-postgres` - healthy
- `miyu-zookeeper` - running
- `miyu-kafka` - healthy
- `miyu-kafka-ui` - running
- `miyu-app` - running
- `miyu-consumer` - running

### Acceso a Servicios

| Servicio | URL | Descripción |
|----------|-----|-------------|
| Aplicación | http://localhost:3000 | Miyu Tracker Web |
| Kafka UI | http://localhost:8080 | Dashboard de Kafka |
| PostgreSQL | localhost:5432 | Base de datos |

### Comandos Útiles

```bash
# Ver logs de todos los servicios
docker-compose logs -f

# Ver logs de un servicio específico
docker-compose logs -f app
docker-compose logs -f consumer
docker-compose logs -f kafka

# Detener servicios
docker-compose down

# Detener y eliminar volúmenes (datos)
docker-compose down -v

# Reconstruir un servicio específico
docker-compose up -d --build app

# Escalar el consumer (si se configuran particiones)
docker-compose up -d --scale consumer=3
```

### Consultas PostgreSQL Útiles

```bash
# Conectarse al contenedor
docker exec -it miyu-postgres psql -U miyu -d miyu_datalake
```

```sql
-- Total de llamadas
SELECT COUNT(*) FROM api_calls;

-- Llamadas de hoy
SELECT COUNT(*) FROM api_calls WHERE DATE(created_at) = CURRENT_DATE;

-- Top 5 acciones más consultadas
SELECT action, COUNT(*) as total
FROM api_calls
GROUP BY action
ORDER BY total DESC
LIMIT 5;

-- Promedio de latencia por acción
SELECT action, AVG(duration_ms) as avg_ms, MAX(duration_ms) as max_ms
FROM api_calls
GROUP BY action;

-- Errores (status >= 400)
SELECT response_status, COUNT(*) as total
FROM api_calls
WHERE response_status >= 400
GROUP BY response_status;

-- Últimas 10 llamadas
SELECT action, api_source, response_status, duration_ms, created_at
FROM api_calls
ORDER BY created_at DESC
LIMIT 10;

-- Usar vista analítica: métricas por hora
SELECT * FROM v_api_calls_hourly LIMIT 24;

-- Usar vista analítica: métricas diarias
SELECT * FROM v_api_calls_daily LIMIT 7;
```

---

## Monitoreo

### Kafka UI

Accede a `http://localhost:8080` para visualizar:

- **Topics**: Listado de topics, particiones, réplicas
- **Messages**: Navegar mensajes del topic `api-calls`
- **Consumers**: Estado del consumer group, lag por partición
- **Brokers**: Métricas de los brokers Kafka

### Métricas Importantes

#### Consumer Lag

Indica cuántos mensajes están pendientes de procesar:

```bash
# Ver lag desde CLI
docker exec miyu-kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:29092 \
  --group datalake-consumer \
  --describe
```

Lag alto indica que el consumer no puede procesar al ritmo de producción.

#### Throughput

```sql
-- Llamadas por minuto (última hora)
SELECT 
    DATE_TRUNC('minute', created_at) as minute,
    COUNT(*) as calls_per_minute
FROM api_calls
WHERE created_at >= NOW() - INTERVAL '1 hour'
GROUP BY minute
ORDER BY minute;
```

### Health Checks

Cada servicio tiene configurado health checks:

- **PostgreSQL**: `pg_isready`
- **Kafka**: `kafka-broker-api-versions`
- **App y Consumer**: Dependen de postgres y kafka healthy

---

## Patrón Cache-Aside

El proyecto implementa el patrón **Cache-Aside** (o Lazy Loading) para reducir la cantidad de llamadas a las APIs externas y mejorar la latencia de respuesta.

### ¿Cómo funciona?

Cuando un usuario solicita datos (ej: estadísticas de un jugador), el sistema sigue este flujo:

```
Usuario ──▶ API Route ──▶ ¿Cache válido en PostgreSQL?
                              │
                    Sí ◄──────┴──────► No
                    │                     │
                    ▼                     ▼
              Devolver cache        Consultar API externa
              (cached: true)              │
                                          ▼
                                    Guardar en cache
                                    (TTL según acción)
                                          │
                                          ▼
                                    Devolver datos
                                    (cached: false)
```

### TTL (Time To Live) por Acción

| Acción | TTL | Rationale |
|--------|-----|-----------|
| `lookup` | 24 horas | Datos de cuenta son estables |
| `stats` | 1 hora | Estadísticas cambian con frecuencia |
| `tracker-stats` | 1 hora | Estadísticas cambian con frecuencia |
| `fortnite-api-stats` | 1 hora | Estadísticas cambian con frecuencia |
| `ranked-current` | 15 minutos | Rank cambia rápidamente |
| `shop` | 1 hora | Tienda cambia cada 24h |
| `tournaments` | 6 horas | Torneos no cambian constantemente |
| `leaderboard` | 30 minutos | Leaderboards son dinámicos |

### Tabla de Cache

La tabla `api_cache` almacena las respuestas en formato JSONB:

```sql
CREATE TABLE api_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key VARCHAR(500) NOT NULL,
    action VARCHAR(100) NOT NULL,
    data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_cache UNIQUE (cache_key, action)
);
```

**Índices**:
- `idx_api_cache_key_action` - Búsqueda rápida por clave y acción
- `idx_api_cache_expires` - Limpieza eficiente de registros expirados

### Identificación de Cache

Cada consulta se identifica por una `cache_key` generada a partir de la acción y sus parámetros ordenados:

```
stats:accountId=abc123&timeframe=season
lookup:displayName=Miyu
ranked-current:accountId=abc123
```

### Respuesta del API

Las respuestas incluyen un campo `cached` para indicar si provienen del cache:

```json
// Desde cache
{
  "success": true,
  "cached": true,
  "data": { ... }
}

// Desde API externa
{
  "success": true,
  "cached": false,
  "data": { ... }
}
```

### Beneficios

1. **Menor latencia**: Respuestas desde PostgreSQL son ~10-50ms vs ~200-500ms de la API externa
2. **Reducción de costos**: Menos llamadas a APIs con límites de rate
3. **Resiliencia**: Si la API externa cae, los datos cacheados siguen disponibles
4. **Análisis histórico**: El Data Lake mantiene históricos mientras el cache sirve datos recientes

### Limpieza de Cache

Los registros expirados se pueden limpiar periódicamente:

```sql
-- Eliminar registros expirados
DELETE FROM api_cache WHERE expires_at <= NOW();
```

---

## Conceptos de Ingeniería de Datos Aplicados

### 1. Data Lake

PostgreSQL funciona como un **Data Lake** estructurado donde se almacenan:

- Datos en bruto (raw data) de cada consulta API
- Respuestas completas en formato JSONB
- Metadatos de ejecución (tiempos, IPs, status)

Esto permite análisis retrospectivos, debugging y generación de métricas.

### 2. Event Streaming

Apache Kafka actúa como el **sistema de mensajería** que desacopla:

- **Producers**: La API web no necesita esperar la escritura en base de datos
- **Consumers**: Pueden procesar a su propio ritmo, reiniciarse sin perder datos
- **Topics**: El topic `api-calls` es el log inmutable de eventos

### 3. Desacoplamiento

La arquitectura desacopla tres responsabilidades:

| Componente | Responsabilidad |
|------------|----------------|
| Next.js API | Servir datos al usuario |
| Kafka | Transporte de eventos |
| Consumer | Persistencia y procesamiento |

Si PostgreSQL cae, la API sigue funcionando (los eventos se acumulan en Kafka).

### 4. Observabilidad

Se capturan métricas de **Golden Signals**:

- **Latency**: `duration_ms` por endpoint
- **Traffic**: `COUNT(*)` por período
- **Errors**: `response_status >= 400`
- **Saturation**: Consumer lag en Kafka

### 5. Tolerancia a Fallos

- **Reintentos**: KafkaJS configura reintentos automáticos
- **Graceful Shutdown**: Consumer cierra conexiones al recibir SIGTERM
- **Commits**: Consumer hace commit solo después de persistir en PG
- **Idempotencia**: `ON CONFLICT (id) DO NOTHING` evita duplicados

### 6. Escalabilidad Horizontal

La arquitectura soporta escalado:

- **Particiones Kafka**: Agregar particiones al topic permite múltiples consumers
- **Consumer Groups**: Múltiples instancias del consumer dividen el trabajo
- **Replicación**: PostgreSQL puede configurarse en modo primary-replica

### 7. Procesamiento por Lotes

El consumer utiliza commits automáticos cada 5 segundos, permitiendo:

- Procesamiento en lote (batch processing)
- Mayor throughput
- Menor carga en la base de datos

---

## Estructura del Proyecto

```
miyu-tracker/
├── docker-compose.yml          # Orquestación de 6 servicios
├── Dockerfile                  # Multi-stage build para Next.js
├── .env.example                # Variables de entorno de ejemplo
├── .env.local                  # Variables locales (no commitear)
├── package.json                # Dependencias Node.js
├── package-lock.json           # Lock file de dependencias
├── tsconfig.json               # Configuración TypeScript
├── next.config.ts              # Configuración Next.js
├── sql/
│   └── init.sql                # Esquema del Data Lake
├── consumer/
│   ├── Dockerfile              # Imagen del servicio consumer
│   └── index.ts                # Código del consumer Kafka
├── src/
│   ├── lib/
│   │   ├── db.ts               # Cliente PostgreSQL (Pool)
│   │   └── kafka.ts            # Productor Kafka
│   ├── app/
│   │   ├── api/
│   │   │   ├── osirion/
│   │   │   │   └── route.ts    # API con integración Kafka
│   │   │   └── datalake/
│   │   │       └── stats/
│   │   │           └── route.ts # Endpoint de estadísticas
│   │   └── ...                 # Páginas de la app
│   └── components/             # Componentes React
├── public/                     # Assets estáticos
└── README-DATA-ENGINEERING.md  # Este documento
```

---

## Troubleshooting

### Error: `npm ci` falla por lock file desincronizado

**Síntoma**:
```
npm error `npm ci` can only install packages when your package.json
and package-lock.json or npm-shrinkwrap.json are in sync.
```

**Solución**:
```bash
npm install
# O si prefieres actualizar solo el lock file:
npm install --package-lock-only
```

### Error: Kafka no responde

**Síntoma**: El consumer no puede conectarse a Kafka.

**Verificación**:
```bash
docker-compose logs kafka
```

**Solución**:
- Verificar que Zookeeper esté saludable primero
- Esperar 10-15 segundos después de iniciar Zookeeper
- Reiniciar Kafka: `docker-compose restart kafka`

### Error: PostgreSQL connection refused

**Síntoma**: La app o consumer no pueden conectarse a PostgreSQL.

**Verificación**:
```bash
docker-compose logs postgres
docker exec miyu-postgres pg_isready -U miyu
```

**Solución**:
- Verificar que el contenedor esté en estado `healthy`
- Verificar la variable `DATABASE_URL`
- Reiniciar: `docker-compose restart postgres`

### Error: Consumer no procesa mensajes

**Síntoma**: El topic tiene mensajes pero no se persisten en PostgreSQL.

**Verificación**:
```bash
# Ver si el consumer está suscrito
docker-compose logs consumer

# Ver mensajes en Kafka
docker exec miyu-kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:29092 \
  --topic api-calls \
  --from-beginning \
  --max-messages 10
```

**Solución**:
- Verificar logs del consumer: `docker-compose logs -f consumer`
- Verificar conexión a PostgreSQL desde el consumer
- Reiniciar el consumer: `docker-compose restart consumer`

### Alto Consumer Lag

**Síntoma**: Kafka UI muestra lag creciente.

**Causas**:
- Consumer lento procesando mensajes
- PostgreSQL con alta latencia de escritura
- Pocos consumers para muchas particiones

**Soluciones**:
- Escala horizontal: aumentar instancias del consumer
- Optimizar queries de inserción en PostgreSQL
- Aumentar `autoCommitInterval` para commits menos frecuentes

### La app no guarda eventos en Kafka

**Verificación**:
- Revisar logs de la app: `docker-compose logs -f app`
- Verificar `KAFKA_BROKER` apunta a `kafka:29092`
- Verificar que Kafka esté accesible desde el contenedor de la app

---

## Extensiones Futuras

Posibles mejoras para el proyecto:

1. **Agregación en Tiempo Real**: Usar Kafka Streams o Flink para agregaciones en ventanas de tiempo
2. **Data Warehouse**: Exportar datos a BigQuery, Redshift o Snowflake para análisis masivo
3. **Machine Learning**: Entrenar modelos con datos históricos de jugadores
4. **Alertas**: Detección de anomalías en tiempo real (latencia inusual, spikes de errores)
5. **Dashboard**: Crear un panel con Grafana conectado a PostgreSQL
6. **Data Quality**: Validar schema de mensajes con JSON Schema o Avro
7. **CDC (Change Data Capture)**: Capturar cambios en PostgreSQL y replicarlos
8. **Batch Processing**: Jobs programados con Airflow para procesamiento diario

---

## Referencias

- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [KafkaJS - Modern Apache Kafka client for Node.js](https://kafka.js.org/)
- [PostgreSQL JSONB](https://www.postgresql.org/docs/current/datatype-json.html)
- [Docker Compose](https://docs.docker.com/compose/)
- [Confluent Platform](https://docs.confluent.io/platform/current/overview.html)
