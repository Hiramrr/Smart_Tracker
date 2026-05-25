# Evidencias técnicas - Smart Tracker

Este documento mapea cada requisito de ingeniería de datos con su implementación concreta en el proyecto.

## Tabla de evidencias

| Requisito | Implementación en Smart Tracker | Archivos principales |
|---|---|---|
| Fuentes de datos | Fortnite API, Osirion API, Tracker.gg, Riot Games API y datos simulados (seed) | `src/app/api/`, `scripts/seed-data-engineering.ts` |
| Ingesta batch | Scripts de seed y procesos Python ETL | `scripts/seed-data-engineering.ts`, `etl/cosmetic_predictions.py`, `etl/lol_player_classifier.py` |
| Ingesta streaming | Kafka topic `api-calls` con patrón outbox | `producer/index.ts`, `consumer/index.ts` |
| Cola de mensajes | Apache Kafka (Confluent 7.6.0) | `docker-compose.yml` |
| Patrón de integración | Outbox pattern con trigger PostgreSQL | `sql/init.sql` (trigger `trg_api_call_to_outbox`) |
| Almacenamiento | PostgreSQL 16 | `docker-compose.yml`, `sql/init.sql` |
| Data lake operacional | Tablas crudas e históricas en PostgreSQL | `api_calls`, `player_snapshots`, `lol_player_snapshots`, `cosmetic_shop_appearances` |
| Data warehouse | Vistas dimensionales y tablas/marts analíticos | `v_dim_*`, `v_fact_*`, `v_mart_*` en `sql/init.sql` |
| Procesamiento batch | Predicción de cosméticos (RandomForest) y clasificación de jugadores (KMeans) | `etl/cosmetic_predictions.py`, `etl/lol_player_classifier.py` |
| Procesamiento tiempo real | Producer + consumer Kafka + tabla materializada | `producer/`, `consumer/`, `stream_api_metrics_minute` |
| Explotación analítica | Dashboards Next.js, consultas SQL y métricas en vistas | `src/app/dashboard/`, `sql/analytics_queries.sql` |
| Reprocesamiento | Script `stream:rebuild` para recalcular métricas desde histórico | `scripts/rebuild-stream-metrics.ts` |
| Dead Letter Queue | Tabla de eventos fallidos en streaming | `stream_dead_letters` en `sql/init.sql` |
| Datasets | Muestras exportables de datos utilizados y generados | `datasets/` |
| Scheduler batch | Ejecución periódica automática de jobs ML | `etl/batch_scheduler.py` |
| Monitoreo Kafka | Interfaz web Kafka UI | `docker-compose.yml` (servicio `kafka-ui`) |

## Arquitectura de datos

```text
Usuario / Dashboard
        |
        v
Next.js API Routes  ---> APIs externas: Osirion, Tracker.gg, Fortnite API, Riot Games
        |
        v
PostgreSQL api_calls          PostgreSQL cache/snapshots
        |
        v
Trigger Outbox: api_outbox
        |
        v
Producer Node.js ---> Kafka topic api-calls ---> Consumer Node.js
                                           |       |
                                           |       v
                                           |   Tablas historicas normalizadas
                                           v
                                      ETL Python
                                      pandas + scikit-learn
                                           |
                                           v
Data Lake + Mini Data Mart PostgreSQL ---> Dashboards Next.js
```

## Detalle del warehouse dimensional

### Dimensiones

| Vista | Descripción |
|---|---|
| `v_dim_date` | Dimensión temporal con año, mes, día, día de semana |
| `v_dim_api_action` | Dimensión de acciones API con dominio de negocio |
| `v_dim_player` | Dimensión de jugadores Fortnite con primer/último snapshot |
| `v_dim_cosmetic` | Dimensión de cosméticos con tipo, rareza, serie |

### Hechos

| Vista | Descripción |
|---|---|
| `v_fact_api_calls` | Hechos de llamadas API con métricas |
| `v_fact_shop_appearances` | Hechos de apariciones en tienda con precios |
| `v_fact_player_progress` | Hechos de progreso de jugadores con deltas |

### Marts

| Vista | Descripción |
|---|---|
| `v_mart_api_reliability_daily` | Confiabilidad diaria de APIs con tasa de error |
| `v_mart_shop_predictions` | Predicciones ML unidas con features de cosméticos |
| `v_mart_lol_player_classification` | Clasificación ML más reciente por jugador |

## Detalle del procesamiento batch/ML

### Predicción de cosméticos (`cosmetic_predictions.py`)

1. Lee apariciones históricas desde `cosmetic_shop_appearances`.
2. Construye features desde `v_cosmetic_prediction_features`.
3. Entrena un `RandomForestRegressor` con scikit-learn.
4. Guarda predicciones en `cosmetic_predictions`.
5. Resultados visibles en `v_mart_shop_predictions` y dashboards.

### Clasificación de jugadores LoL (`lol_player_classifier.py`)

1. Lee partidas crudas desde `lol_match_snapshots`.
2. Normaliza features por jugador con `v_lol_match_features`.
3. Calcula KDA, win rate, CS/min, oro/min, rol, campeón principal.
4. Clasifica con `KMeans` (datos suficientes) o reglas de score (pocos datos).
5. Guarda en `lol_player_classifications`.
6. Expuesto en `v_mart_lol_player_classification`.

## Flujo de streaming

1. La app inserta en `api_calls`.
2. El trigger `trg_api_call_to_outbox` crea un evento en `api_outbox`.
3. El producer lee eventos no publicados de `api_outbox` y los envía a Kafka.
4. El consumer lee del topic `api-calls` y actualiza `stream_api_metrics_minute`.
5. Eventos fallidos se envían a `stream_dead_letters` (DLQ).
6. El script `stream:rebuild` puede reconstruir métricas desde los datos almacenados.

## Scripts disponibles

| Script | Comando | Descripción |
|---|---|---|
| Seed datos | `npm run seed:data` | Inserta datos reproducibles |
| Predicción ML | `npm run cosmetic:predict` | Ejecuta RandomForest local |
| Clasificación ML | `npm run lol:classify` | Ejecuta KMeans local |
| Reconstruir streaming | `npm run stream:rebuild` | Reprocesa métricas históricas |
| Exportar datasets | `npm run datasets:export` | Genera CSVs desde PostgreSQL |
| Verificar esquema | `npm run schema:check` | Valida sincronización de esquema |
| Demo completa | `./scripts/demo.sh` | Ejecuta todo el flujo automatizado |
