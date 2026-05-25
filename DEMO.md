# Demo local de Smart Tracker

Guía técnica para ejecutar y evaluar el proyecto completo de forma local.

## Requisitos

- Docker y Docker Compose
- Node.js 20+
- npm

## 1. Levantar servicios

```bash
docker-compose up --build
```

Servicios principales:

| Servicio | URL |
|---|---|
| App web | http://localhost:3000 |
| Kafka UI | http://localhost:8080 |
| PostgreSQL | localhost:5432 |

## 2. Poblar datos de prueba

```bash
docker-compose --profile seed run --rm seed-data
```

Este comando genera datos reproducibles para probar el flujo completo de ingeniería de datos: llamadas API, cosméticos, apariciones en tienda, snapshots de jugadores Fortnite y LoL, partidas LoL y métricas de streaming.

## 3. Verificar eventos en Kafka

Abrir Kafka UI:

```
http://localhost:8080
```

Buscar el topic `api-calls`. Ahí se publican los eventos del patrón outbox que el producer lee de PostgreSQL y envía a Kafka.

## 4. Ejecutar procesos batch

### Predicción de cosméticos (RandomForest)

```bash
docker-compose --profile batch run --rm cosmetic-predictor
```

El modelo lee apariciones históricas desde `cosmetic_shop_appearances`, construye features, entrena un `RandomForestRegressor` y guarda predicciones en `cosmetic_predictions`.

### Clasificación de jugadores LoL (KMeans)

```bash
docker-compose --profile batch run --rm lol-classifier
```

El modelo lee partidas desde `lol_match_snapshots`, normaliza features por jugador, clasifica con `KMeans` y guarda resultados en `lol_player_classifications`.

## 5. Exportar datasets generados

```bash
npm run datasets:export
```

Los archivos CSV se generan en la carpeta `datasets/` con muestras de los datos reales almacenados en PostgreSQL.

## 6. Consultar métricas analíticas

```bash
psql postgres://miyu:miyu_secret@localhost:5432/miyu_datalake -f sql/analytics_queries.sql
```

Ejecuta consultas de explotación analítica que demuestran:
- Confiabilidad por API
- Rendimiento diario
- Cosméticos más frecuentes en tienda
- Clasificaciones de jugadores
- Estado del warehouse dimensional

## 7. Validar dashboards

Abrir la app en http://localhost:3000 y revisar:

| Dashboard | Ruta | Qué muestra |
|---|---|---|
| General | `/dashboard` | Visión general del sistema |
| Tienda | `/dashboard/shop` | Predicciones ML y cosméticos |
| Data Lake | `/dashboard/datalake` | Eventos, salud de ingesta, Kafka |
| Warehouse | `/dashboard/warehouse` | Dimensiones, hechos, marts |

## 8. Demo automatizada

Para ejecutar todo el flujo de forma automatizada:

```bash
./scripts/demo.sh
```

Este script levanta servicios, inserta datos, ejecuta batch/ML, reconstruye métricas y exporta datasets.

## 9. Reconstruir métricas de streaming

```bash
npm run stream:rebuild
```

Reprocesa los datos almacenados para recalcular las métricas de streaming. Esto representa el componente de reprocesamiento histórico dentro del enfoque Kappa.

## 10. Apagar y limpiar

```bash
# Apagar conservando datos
docker-compose down

# Apagar y borrar volúmenes (reinicia el data lake)
docker-compose down -v
```
