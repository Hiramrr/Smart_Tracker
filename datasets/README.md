# Datasets de ejemplo

Esta carpeta contiene muestras de datos utilizados y generados por Smart Tracker para demostrar el flujo de ingeniería de datos sin depender completamente de APIs externas.

## Archivos

| Archivo | Descripción |
|---|---|
| `sample_api_events.ndjson` | Eventos simulados de llamadas a APIs externas en formato NDJSON (un JSON por línea). |
| `sample_api_calls.csv` | Eventos procesados de consumo de APIs exportados desde PostgreSQL. |
| `sample_shop_appearances.csv` | Historial simulado de apariciones de cosméticos en tienda. |
| `sample_player_snapshots.csv` | Snapshots históricos de estadísticas de jugadores de Fortnite. |
| `sample_lol_player_snapshots.csv` | Snapshots de jugadores de League of Legends. |
| `sample_predictions.csv` | Salida de ejemplo del proceso batch/ML de predicción de tienda. |

## Uso

Estos archivos sirven para:

1. Poblar la base de datos local sin depender de APIs externas.
2. Probar el flujo batch y de streaming.
3. Validar consultas analíticas y vistas dimensionales.
4. Demostrar el proyecto en presentaciones y evaluaciones.

## Regenerar datasets

Después de ejecutar la app y acumular datos reales, puedes regenerar estos archivos con:

```bash
npm run datasets:export
```

Esto sobrescribirá los CSVs con datos reales extraídos de PostgreSQL.

## Formato NDJSON

El archivo `sample_api_events.ndjson` usa formato NDJSON (Newline Delimited JSON). Cada línea es un evento independiente que puede ser enviado a Kafka o insertado en el outbox para reprocesamiento. Es el formato estándar para flujos de eventos en arquitecturas de streaming.
