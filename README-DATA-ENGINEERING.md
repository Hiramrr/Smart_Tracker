# 🎮 Miyu Tracker - Arquitectura de Ingeniería de Datos

Este documento describe la arquitectura de datos implementada para la clase de Ingeniería de Datos.

## 📐 Arquitectura General

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│  Kafka Topic    │────▶│   PostgreSQL    │
│  (API Routes)   │     │  "api-calls"    │     │   Data Lake     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
       │                         ▲                        │
       │                         │                        │
       ▼                         │                        ▼
┌─────────────────┐              │              ┌─────────────────┐
│  APIs Externas  │              │              │   Kafka Consumer│
│ (Osirion, etc)  │              │              │  (Persistencia) │
└─────────────────┘              │              └─────────────────┘
                                 │
                         ┌───────┴───────┐
                         │   Kafka UI    │
                         │  (Monitoreo)  │
                         └───────────────┘
```

## 🐳 Servicios Docker

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| `app` | `3000` | Aplicación Next.js (Miyu Tracker) |
| `postgres` | `5432` | PostgreSQL - Data Lake |
| `zookeeper` | `2181` | Zookeeper (gestión de cluster Kafka) |
| `kafka` | `9092` / `29092` | Broker de mensajes Kafka |
| `kafka-ui` | `8080` | Interfaz web para monitorear Kafka |
| `consumer` | - | Consumer que persiste datos en PostgreSQL |

## 🚀 Iniciar el Proyecto

### Requisitos
- Docker Desktop
- Docker Compose

### Comandos

```bash
# Construir e iniciar todos los servicios
docker-compose up --build

# Iniciar en segundo plano
docker-compose up -d --build

# Ver logs
docker-compose logs -f

# Detener conservando datos persistidos
docker-compose down

# Detener y eliminar volúmenes persistentes
docker-compose down -v
```

PostgreSQL, Kafka y Zookeeper usan volúmenes Docker nombrados para conservar el data lake, topics, offsets y metadatos del cluster entre reinicios. `docker-compose down -v` elimina esos volúmenes y debe usarse solo para reiniciar el entorno desde cero.

## 📊 Flujo de Datos

### 1. Producer (Next.js API)
- Cada vez que se hace una consulta a las APIs externas, se publica un evento en Kafka
- El evento incluye: acción, parámetros, tiempo de respuesta, status HTTP, tamaño de respuesta

### 2. Kafka Topic (`api-calls`)
- Almacena temporalmente los eventos
- Permite desacoplar la API de la persistencia
- Soporta múltiples consumers

### 3. Consumer (Node.js)
- Lee mensajes del topic `api-calls`
- Persiste los datos en PostgreSQL
- Soporta reintentos y manejo de errores

### 4. PostgreSQL (Data Lake)
- Tablas principales:
  - `api_calls`: Registro de cada consulta API
  - `api_responses`: Respuestas completas (opcional)
  - `player_snapshots`: Estadísticas de jugadores
  - `shop_history`: Historial de la tienda

## 📈 Consultar Estadísticas

Endpoint disponible para ver las métricas del data lake:

```
GET http://localhost:3000/api/datalake/stats
```

## 🔍 Monitoreo

### Kafka UI
Accede a `http://localhost:8080` para:
- Ver topics y mensajes
- Monitorear consumers y lag
- Ver métricas del cluster

### PostgreSQL
```bash
# Conectarse al contenedor
docker exec -it miyu-postgres psql -U miyu -d miyu_datalake

# Consultas útiles
SELECT * FROM api_calls ORDER BY created_at DESC LIMIT 10;
SELECT action, COUNT(*) FROM api_calls GROUP BY action;
SELECT * FROM v_api_calls_hourly LIMIT 24;
```

## 🏗️ Estructura de Carpetas

```
.
├── docker-compose.yml          # Orquestación de servicios
├── Dockerfile                  # Imagen de la app Next.js
├── consumer/
│   ├── Dockerfile             # Imagen del consumer
│   └── index.ts               # Código del consumer Kafka
├── sql/
│   └── init.sql               # Esquema de la base de datos
├── src/
│   ├── lib/
│   │   ├── db.ts              # Cliente PostgreSQL
│   │   └── kafka.ts           # Productor Kafka
│   └── app/
│       └── api/
│           ├── osirion/       # API con integración Kafka
│           └── datalake/      # Endpoints de estadísticas
└── .env.example               # Variables de entorno
```

## 🎓 Conceptos de Ingeniería de Datos Aplicados

1. **Data Lake**: PostgreSQL almacena datos en bruto para análisis histórico
2. **Event Streaming**: Kafka como capa de mensajería entre servicios
3. **Desacoplamiento**: La API no depende directamente de la base de datos
4. **Observabilidad**: Métricas de latencia, throughput y errores
5. **Tolerancia a fallos**: Reintentos y graceful shutdown en el consumer
6. **Scalabilidad**: Posible agregar múltiples consumers o particiones

## 📝 Notas para la Clase

- Los datos se acumulan en el data lake para análisis posterior
- Se pueden crear dashboards con las vistas `v_api_calls_hourly` y `v_api_calls_daily`
- El consumer puede extenderse para procesamiento en tiempo real (ej: detección de anomalías)
