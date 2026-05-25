-- =========================================================
-- Consultas analíticas Smart Tracker
-- Estas consultas demuestran la explotación analítica
-- sobre el data lake y las vistas dimensionales.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Confiabilidad de APIs por fuente
-- Muestra el rendimiento y tasa de error por cada API.
-- ---------------------------------------------------------
SELECT
  api_source,
  COUNT(*) AS total_requests,
  SUM(CASE WHEN response_status < 400 THEN 1 ELSE 0 END) AS successful_requests,
  SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) AS failed_requests,
  ROUND(AVG(duration_ms)::numeric, 2) AS avg_duration_ms,
  ROUND(
    (SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END)::numeric
    / NULLIF(COUNT(*), 0)) * 100, 2
  ) AS error_rate_pct
FROM api_calls
GROUP BY api_source
ORDER BY total_requests DESC;

-- ---------------------------------------------------------
-- 2. Rendimiento diario de APIs
-- Serie temporal de latencia y volumen por fuente.
-- ---------------------------------------------------------
SELECT
  DATE(created_at) AS date_day,
  api_source,
  COUNT(*) AS total_requests,
  ROUND(AVG(duration_ms)::numeric, 2) AS avg_duration_ms,
  MAX(duration_ms) AS max_duration_ms,
  SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) AS errors
FROM api_calls
GROUP BY DATE(created_at), api_source
ORDER BY date_day DESC, total_requests DESC;

-- ---------------------------------------------------------
-- 3. Distribución de acciones (endpoints más usados)
-- ---------------------------------------------------------
SELECT
  action,
  api_source,
  COUNT(*) AS total_calls,
  ROUND(AVG(duration_ms)::numeric, 2) AS avg_duration_ms
FROM api_calls
GROUP BY action, api_source
ORDER BY total_calls DESC
LIMIT 20;

-- ---------------------------------------------------------
-- 4. Cosméticos con más apariciones en tienda
-- ---------------------------------------------------------
SELECT
  c.cosmetic_id,
  c.name,
  c.type,
  c.rarity,
  COUNT(a.id) AS appearances,
  MIN(a.shop_date) AS first_seen,
  MAX(a.shop_date) AS last_seen
FROM cosmetics c
JOIN cosmetic_shop_appearances a ON a.cosmetic_id = c.cosmetic_id
GROUP BY c.cosmetic_id, c.name, c.type, c.rarity
ORDER BY appearances DESC
LIMIT 20;

-- ---------------------------------------------------------
-- 5. Jugadores Fortnite con más snapshots históricos
-- ---------------------------------------------------------
SELECT
  account_id,
  MAX(display_name) AS display_name,
  MAX(platform) AS platform,
  COUNT(*) AS snapshots_count,
  MIN(captured_at) AS first_snapshot,
  MAX(captured_at) AS last_snapshot
FROM player_snapshots
GROUP BY account_id
ORDER BY snapshots_count DESC
LIMIT 20;

-- ---------------------------------------------------------
-- 6. Jugadores LoL con más snapshots
-- ---------------------------------------------------------
SELECT
  puuid,
  MAX(game_name) AS game_name,
  MAX(tag_line) AS tag_line,
  MAX(platform) AS platform,
  COUNT(*) AS snapshots_count,
  MIN(captured_at) AS first_snapshot,
  MAX(captured_at) AS last_snapshot
FROM lol_player_snapshots
GROUP BY puuid
ORDER BY snapshots_count DESC
LIMIT 20;

-- ---------------------------------------------------------
-- 7. Predicciones de cosméticos con mayor confianza
-- (salida del modelo RandomForest batch/ML)
-- ---------------------------------------------------------
SELECT
  cp.cosmetic_id,
  c.name,
  c.rarity,
  cp.predicted_days_until_next,
  cp.predicted_next_shop_date,
  cp.confidence_score,
  cp.model_name,
  cp.created_at
FROM cosmetic_predictions cp
JOIN cosmetics c ON c.cosmetic_id = cp.cosmetic_id
ORDER BY cp.confidence_score DESC
LIMIT 20;

-- ---------------------------------------------------------
-- 8. Clasificación de jugadores LoL (salida KMeans batch/ML)
-- ---------------------------------------------------------
SELECT
  game_name,
  tag_line,
  platform,
  skill_label,
  skill_value,
  main_role,
  main_champion,
  win_rate,
  avg_kda,
  matches_analyzed,
  predicted_rank,
  model_name,
  created_at
FROM v_mart_lol_player_classification
ORDER BY skill_value DESC
LIMIT 20;

-- ---------------------------------------------------------
-- 9. Métricas de streaming por ventana temporal
-- (tabla materializada desde Kafka consumer)
-- ---------------------------------------------------------
SELECT
  window_start,
  action,
  api_source,
  total_events,
  success_count,
  error_count,
  ROUND((total_duration_ms::numeric / NULLIF(total_events, 0)), 2) AS avg_duration_ms,
  min_duration_ms,
  max_duration_ms
FROM stream_api_metrics_minute
ORDER BY window_start DESC
LIMIT 20;

-- ---------------------------------------------------------
-- 10. Dead Letter Queue: eventos que fallaron en streaming
-- ---------------------------------------------------------
SELECT
  id,
  topic,
  partition_id,
  message_key,
  error_message,
  created_at
FROM stream_dead_letters
ORDER BY created_at DESC
LIMIT 20;

-- ---------------------------------------------------------
-- 11. Conteo general de dimensiones y hechos (warehouse)
-- ---------------------------------------------------------
SELECT 'v_dim_date' AS vista, COUNT(*) AS filas FROM v_dim_date
UNION ALL
SELECT 'v_dim_api_action', COUNT(*) FROM v_dim_api_action
UNION ALL
SELECT 'v_dim_player', COUNT(*) FROM v_dim_player
UNION ALL
SELECT 'v_dim_cosmetic', COUNT(*) FROM v_dim_cosmetic
UNION ALL
SELECT 'v_fact_api_calls', COUNT(*) FROM v_fact_api_calls
UNION ALL
SELECT 'v_fact_shop_appearances', COUNT(*) FROM v_fact_shop_appearances
UNION ALL
SELECT 'v_fact_player_progress', COUNT(*) FROM v_fact_player_progress
UNION ALL
SELECT 'v_mart_api_reliability_daily', COUNT(*) FROM v_mart_api_reliability_daily
UNION ALL
SELECT 'v_mart_shop_predictions', COUNT(*) FROM v_mart_shop_predictions
UNION ALL
SELECT 'v_mart_lol_player_classification', COUNT(*) FROM v_mart_lol_player_classification;

-- ---------------------------------------------------------
-- 12. Confiabilidad diaria desde el mart dimensional
-- ---------------------------------------------------------
SELECT
  date_key,
  api_source,
  action,
  total_calls,
  avg_duration_ms,
  max_duration_ms,
  errors,
  error_rate_pct
FROM v_mart_api_reliability_daily
ORDER BY date_key DESC, total_calls DESC
LIMIT 20;

-- ---------------------------------------------------------
-- 13. Outbox: eventos pendientes vs publicados
-- ---------------------------------------------------------
SELECT
  published,
  COUNT(*) AS total,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM api_outbox
GROUP BY published;
