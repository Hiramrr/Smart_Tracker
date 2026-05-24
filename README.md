# Miyu Tracker - Proyecto Final de Ingeniería de Datos

Miyu Tracker es una solución de ingeniería de datos para analizar actividad competitiva y cosméticos de Fortnite. El sistema captura consultas a APIs externas, almacena datos crudos e históricos, procesa eventos en streaming, ejecuta transformaciones batch/ML y expone resultados en dashboards.

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
| Ingesta | API routes que consultan fuentes externas y registran eventos | `src/app/api/osirion/route.ts` |
| Streaming | Kafka + producer outbox + consumer | `producer/index.ts`, `consumer/index.ts` |
| Almacenamiento | PostgreSQL como data lake operacional | `sql/init.sql` |
| ETL streaming | Python consume Kafka y calcula progreso/torneos | `etl/transform.py` |
| Batch/ML | Random Forest para predicción de regreso de cosméticos | `etl/cosmetic_predictions.py` |
| Warehouse | Vistas dimensionales y marts analíticos | `v_dim_*`, `v_fact_*`, `v_mart_*` |
| Visualización | Dashboards de jugador, torneos, tienda y data lake | `/dashboard/*` |

## Mini Data Mart

La capa warehouse está implementada como vistas SQL sobre el data lake:

- Dimensiones: `v_dim_date`, `v_dim_api_action`, `v_dim_player`, `v_dim_cosmetic`.
- Hechos: `v_fact_api_calls`, `v_fact_shop_appearances`, `v_fact_player_progress`.
- Marts: `v_mart_api_reliability_daily`, `v_mart_shop_predictions`.

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

## Comandos

Configura variables:

```bash
cp .env.example .env.local
```

Levanta todo el stack:

```bash
docker-compose up --build
```

Servicios principales:

- App: `http://localhost:3000`
- Kafka UI: `http://localhost:8080`
- PostgreSQL: `localhost:5432`

Ejecuta predicciones batch después de tener historial de tienda:

```bash
docker-compose --profile batch run --rm cosmetic-predictor
```

Consulta el data lake:

```bash
curl http://localhost:3000/api/datalake/stats
```

Apaga y limpia volúmenes:

```bash
docker-compose down -v
```

Para desarrollo local sin Docker también existe el script `npm run cosmetic:predict`, pero el flujo recomendado para la entrega es usar Compose.

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

- Código fuente del proyecto.
- `docker-compose.yml`, Dockerfiles y scripts.
- SQL de esquema, data lake y warehouse.
- ETL Python y job batch/ML.
- Documentación técnica en Markdown: `DATA-ENGINEERING.md`, `ARCHITECTURE.md`, `README-DATA-ENGINEERING.md`.

Pendiente para entrega final:

- Exportar o adjuntar datasets/dumps de ejemplo.
- Generar PDF técnico con capturas.
- Grabar video de máximo 5 minutos.
