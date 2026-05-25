# Miyu Tracker - Proyecto Final de Ingeniería de Datos

Miyu Tracker es una solución de ingeniería de datos para analizar actividad competitiva y cosméticos de Fortnite, además de perfiles competitivos de League of Legends. El sistema captura consultas a APIs externas, almacena datos crudos e históricos, procesa eventos en streaming, ejecuta transformaciones batch/ML y expone resultados en dashboards.

## Problema

Las estadísticas de jugadores, torneos y tienda cambian constantemente. Consultarlas solo desde una app web no permite responder preguntas históricas como:

- ¿Cuántas llamadas se hicieron por fuente y con qué latencia?
- ¿Qué jugadores o torneos tienen snapshots históricos?
- ¿Qué cosméticos aparecen con mayor frecuencia en tienda?
- ¿Cuándo podría regresar un cosmético según su historial?

Por eso el proyecto implementa una arquitectura de datos con ingesta, almacenamiento histórico, streaming, ETL, data mart y visualización.

## Arquitectura

```text
Usuario / Dashboard
        |
        v
Next.js API Routes  ---> APIs externas: Osirion, Tracker.gg, Fortnite API
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

La arquitectura combina procesamiento histórico y procesamiento continuo. El patrón outbox evita perder eventos entre la escritura en PostgreSQL y Kafka.

## Componentes

| Capa | Implementación | Archivos principales |
| --- | --- | --- |
| App y API | Next.js 16, React 19 | `src/app`, `src/components` |
| Ingesta | API routes que consultan fuentes externas y registran eventos | `src/app/api/osirion/route.ts`, `src/app/api/lol/route.ts` |
| Streaming | Kafka + producer outbox + consumer | `producer/index.ts`, `consumer/index.ts` |
| Almacenamiento | PostgreSQL como data lake operacional | `sql/init.sql` |
| ETL streaming | Python consume Kafka y calcula progreso/torneos | `etl/transform.py` |
| Batch/ML | Random Forest para cosméticos y KMeans para clasificación LoL | `etl/cosmetic_predictions.py`, `etl/lol_player_classifier.py` |
| Warehouse | Vistas dimensionales y marts analíticos | `v_dim_*`, `v_fact_*`, `v_mart_*` |
| Visualización | Dashboards de jugador, torneos, tienda y data lake | `/dashboard/*` |

## Mini Data Mart

La capa warehouse está implementada como vistas SQL sobre el data lake:

- Dimensiones: `v_dim_date`, `v_dim_api_action`, `v_dim_player`, `v_dim_cosmetic`.
- Hechos: `v_fact_api_calls`, `v_fact_shop_appearances`, `v_fact_player_progress`.
- Marts: `v_mart_api_reliability_daily`, `v_mart_shop_predictions`, `v_mart_lol_player_classification`.

Estas vistas separan el almacenamiento crudo de la consulta analítica. El dashboard `/dashboard/warehouse` consume estas vistas para mostrar conteos de dimensiones, hechos, confiabilidad diaria, dimensiones y predicciones.

## Batch/ML

El job batch `cosmetic-predictor` ejecuta `etl/cosmetic_predictions.py`. El modelo:

1. Lee apariciones históricas desde `cosmetic_shop_appearances`.
2. Construye features desde `v_cosmetic_prediction_features`.
3. Entrena un `RandomForestRegressor`.
4. Guarda resultados en `cosmetic_predictions`.
5. Expone resultados en `v_mart_shop_predictions`.

Las predicciones se ven en:

- `/dashboard/datalake`: sección "Predicciones de Tienda".
- `/dashboard/warehouse`: mart dimensional completo.
- `/dashboard/shop`: bloque "modelo batch / ml" y tarjetas de artículos cuando hay coincidencia por `cosmetic_id`.

El job batch `lol-classifier` ejecuta `etl/lol_player_classifier.py`. El modelo:

1. Lee partidas crudas desde `lol_match_snapshots`.
2. Normaliza features por jugador en `v_lol_match_features`.
3. Agrega KDA, win rate, CS/min, oro/min, rol, campeón principal y señal ranked.
4. Clasifica jugadores con `KMeans` cuando hay suficientes jugadores y usa una regla de score como fallback para pocos datos.
5. Guarda resultados en `lol_player_classifications`.
6. Expone la última clasificación por jugador en `v_mart_lol_player_classification`.

## Enfoque de arquitectura Kappa

Smart Tracker utiliza un enfoque inspirado en arquitectura Kappa, donde los eventos generados por la aplicación se manejan como una fuente principal de datos para procesamiento continuo y reprocesamiento histórico.

El flujo inicia cuando la aplicación consulta fuentes externas como Fortnite API, Osirion o Tracker.gg. Cada interacción genera un evento que se registra en una tabla tipo outbox (`api_outbox`). Posteriormente, un producer publica esos eventos en Kafka dentro del topic `api-calls`. Un consumer procesa continuamente los eventos y los persiste en PostgreSQL, generando tablas históricas y estructuras analíticas.

A diferencia de una arquitectura Lambda tradicional, donde existen caminos separados para batch y streaming, el sistema busca que los eventos sean la base común para:

1. Procesamiento en tiempo real (consumer Kafka → `stream_api_metrics_minute`).
2. Persistencia histórica (tablas crudas y snapshots).
3. Reprocesamiento de métricas (`npm run stream:rebuild`).
4. Alimentación de vistas analíticas y procesos batch/ML.

El script `stream:rebuild` permite reconstruir métricas a partir de los datos almacenados, lo que representa el componente de reprocesamiento histórico dentro del enfoque Kappa.

## Comandos

Configura variables:

```bash
cp .env.example .env.local
```

Levanta todo el stack:

```bash
docker-compose up --build
```

Los datos de PostgreSQL, Kafka y Zookeeper se guardan en volúmenes Docker nombrados (`postgres_data`, `kafka_data`, `zookeeper_data`, `zookeeper_log`), por lo que se conservan al detener el stack con `docker-compose down`.

Servicios principales:

- App: `http://localhost:3000`
- Kafka UI: `http://localhost:8080`
- PostgreSQL: `localhost:5432`

Ejecuta predicciones batch después de tener historial de tienda:

```bash
docker-compose --profile batch run --rm cosmetic-predictor
```

Ejecuta clasificación batch de League of Legends después de consultar jugadores:

```bash
docker-compose --profile batch run --rm lol-classifier
```

Consulta el data lake:

```bash
curl http://localhost:3000/api/datalake/stats
```

Apaga y limpia volúmenes:

```bash
docker-compose down -v
```

Usa `docker-compose down -v` solo cuando quieras borrar el historial almacenado y reiniciar el data lake desde cero.

Exportar datasets generados desde la base de datos:

```bash
npm run datasets:export
```

Ejecutar demo completa automatizada:

```bash
./scripts/demo.sh
```

Consultar métricas analíticas directamente:

```bash
psql postgres://miyu:miyu_secret@localhost:5432/miyu_datalake -f sql/analytics_queries.sql
```

Para desarrollo local sin Docker también existen `npm run cosmetic:predict` y `npm run lol:classify`, pero el flujo recomendado para la entrega es usar Compose.

## Demo Sugerida Para Video

1. Mostrar la app en `http://localhost:3000`.
2. Abrir `/dashboard/player` y consultar un jugador.
3. Abrir Kafka UI y enseñar el topic `api-calls`.
4. Abrir `/dashboard/datalake` y mostrar eventos, salud de ingesta y Kafka.
5. Abrir `/dashboard/warehouse` y mostrar dimensiones, hechos, marts y predicciones.
6. Abrir `/dashboard/shop` y mostrar la integración del modelo batch/ML.
7. Cerrar explicando decisiones: PostgreSQL para histórico, Kafka para streaming, outbox para resiliencia y vistas dimensionales para análisis.

## Evidencia Para Entrega

Archivos incluidos:

- Código fuente completo del proyecto.
- `docker-compose.yml`, Dockerfiles y scripts de automatización.
- SQL de esquema, data lake, warehouse y consultas analíticas (`sql/analytics_queries.sql`).
- ETL Python y jobs batch/ML (RandomForest y KMeans).
- Datasets de ejemplo en `datasets/` (NDJSON + CSV).
- Script de exportación de datasets (`scripts/export-datasets.ts`).
- Script de demo automatizada (`scripts/demo.sh`).
- Guía técnica de demo (`DEMO.md`).
- Tabla de evidencias técnicas (`TECHNICAL_EVIDENCE.md`).
- Documentación técnica: `DATA-ENGINEERING.md`, `ARCHITECTURE.md`, `README-DATA-ENGINEERING.md`.
