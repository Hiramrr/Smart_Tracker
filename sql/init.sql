-- ==========================================
-- Miyu Tracker - Data Lake Schema
-- Esquema para almacenar históricos de consultas API
-- ==========================================

-- Extensión para generar UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- Tabla: api_calls
-- Almacena cada consulta realizada a las APIs externas
-- ==========================================
CREATE TABLE IF NOT EXISTS api_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(100) NOT NULL,
    parameters JSONB,
    source_ip INET,
    user_agent TEXT,
    response_status INTEGER,
    response_size INTEGER,
    duration_ms INTEGER,
    api_source VARCHAR(50),
    endpoint_url TEXT,
    response_body JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices para análisis
    CONSTRAINT valid_action CHECK (action IN (
        'lookup', 'stats', 'tracker-stats', 'fortnite-api-stats',
        'ranked-current', 'tournaments', 'leaderboard', 'shop',
        'cosmetic-search', 'cosmetic-ingest', 'cosmetic-features',
        'player-tournament-placements', 'tournament-player-stats'
    ))
);

-- Índices para consultas analíticas comunes
CREATE INDEX IF NOT EXISTS idx_api_calls_action ON api_calls(action);
CREATE INDEX IF NOT EXISTS idx_api_calls_created_at ON api_calls(created_at);
CREATE INDEX IF NOT EXISTS idx_api_calls_api_source ON api_calls(api_source);
CREATE INDEX IF NOT EXISTS idx_api_calls_response_status ON api_calls(response_status);

-- Índice compuesto para análisis de series temporales
CREATE INDEX IF NOT EXISTS idx_api_calls_time_action ON api_calls(created_at, action);

-- ==========================================
-- Tabla: api_responses (opcional, para guardar respuestas completas)
-- ==========================================
CREATE TABLE IF NOT EXISTS api_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_call_id UUID REFERENCES api_calls(id) ON DELETE CASCADE,
    response_body JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_responses_api_call_id ON api_responses(api_call_id);

-- ==========================================
-- Tabla: player_snapshots
-- Guarda snapshots de estadísticas de jugadores para análisis histórico
-- ==========================================
CREATE TABLE IF NOT EXISTS player_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id VARCHAR(255),
    display_name VARCHAR(255),
    platform VARCHAR(50),
    stats JSONB,
    ranked_data JSONB,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_snapshots_account_id ON player_snapshots(account_id);
CREATE INDEX IF NOT EXISTS idx_player_snapshots_captured_at ON player_snapshots(captured_at);

-- ==========================================
-- Tabla: shop_history
-- Historial de la tienda de Fortnite
-- ==========================================
CREATE TABLE IF NOT EXISTS shop_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_date DATE NOT NULL,
    items_count INTEGER,
    items_vbucks_total INTEGER,
    shop_data JSONB,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_history_date ON shop_history(shop_date);

-- ==========================================
-- Tabla: cosmetics
-- Catálogo normalizado de cosméticos de Fortnite
-- ==========================================
CREATE TABLE IF NOT EXISTS cosmetics (
    cosmetic_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(100),
    rarity VARCHAR(100),
    series VARCHAR(100),
    set_name VARCHAR(255),
    introduced_chapter INTEGER,
    introduced_season INTEGER,
    added_at TIMESTAMP WITH TIME ZONE,
    image_icon TEXT,
    image_featured TEXT,
    gameplay_tags JSONB DEFAULT '[]'::jsonb,
    variants JSONB DEFAULT '[]'::jsonb,
    raw_json JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cosmetics_name ON cosmetics(name);
CREATE INDEX IF NOT EXISTS idx_cosmetics_type ON cosmetics(type);
CREATE INDEX IF NOT EXISTS idx_cosmetics_rarity ON cosmetics(rarity);
CREATE INDEX IF NOT EXISTS idx_cosmetics_series ON cosmetics(series);

-- ==========================================
-- Tabla: cosmetic_shop_appearances
-- Fechas históricas en tienda por cosmético
-- ==========================================
CREATE TABLE IF NOT EXISTS cosmetic_shop_appearances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cosmetic_id VARCHAR(255) NOT NULL REFERENCES cosmetics(cosmetic_id) ON DELETE CASCADE,
    shop_date DATE NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'fortnite-api',
    offer_id TEXT,
    regular_price INTEGER,
    final_price INTEGER,
    in_date TIMESTAMP WITH TIME ZONE,
    out_date TIMESTAMP WITH TIME ZONE,
    giftable BOOLEAN,
    refundable BOOLEAN,
    layout_id VARCHAR(255),
    tile_size VARCHAR(100),
    raw_entry JSONB,
    ingested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_cosmetic_shop_appearance UNIQUE (cosmetic_id, shop_date, source)
);

CREATE INDEX IF NOT EXISTS idx_cosmetic_shop_cosmetic ON cosmetic_shop_appearances(cosmetic_id);
CREATE INDEX IF NOT EXISTS idx_cosmetic_shop_date ON cosmetic_shop_appearances(shop_date);
CREATE INDEX IF NOT EXISTS idx_cosmetic_shop_source ON cosmetic_shop_appearances(source);

-- ==========================================
-- Tabla: daily_shop_snapshots
-- Snapshot diario completo de /v2/shop
-- ==========================================
CREATE TABLE IF NOT EXISTS daily_shop_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_date DATE NOT NULL,
    hash VARCHAR(255),
    entries_count INTEGER,
    raw_json JSONB NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'fortnite-api',
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_daily_shop_snapshot UNIQUE (shop_date, source)
);

CREATE INDEX IF NOT EXISTS idx_daily_shop_snapshots_date ON daily_shop_snapshots(shop_date);

-- ==========================================
-- Tabla: cosmetic_predictions
-- Salidas de modelos Python sobre próximos regresos a tienda
-- ==========================================
CREATE TABLE IF NOT EXISTS cosmetic_predictions (
    id SERIAL PRIMARY KEY,
    cosmetic_id VARCHAR(255) NOT NULL REFERENCES cosmetics(cosmetic_id) ON DELETE CASCADE,
    predicted_days_until_next NUMERIC,
    predicted_next_shop_date DATE,
    confidence_score NUMERIC,
    model_name VARCHAR(100) NOT NULL,
    features JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cosmetic_predictions_cosmetic ON cosmetic_predictions(cosmetic_id);
CREATE INDEX IF NOT EXISTS idx_cosmetic_predictions_created ON cosmetic_predictions(created_at);

-- ==========================================
-- Tabla: api_cache
-- Cache de respuestas de APIs para evitar consultas repetidas
-- ==========================================
CREATE TABLE IF NOT EXISTS api_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key VARCHAR(500) NOT NULL,
    action VARCHAR(100) NOT NULL,
    data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_cache UNIQUE (cache_key, action)
);

CREATE INDEX IF NOT EXISTS idx_api_cache_key_action ON api_cache(cache_key, action);
CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at);

-- ==========================================
-- Tabla: api_cache_snapshots
-- Historial append-only de respuestas cacheadas exitosas
-- ==========================================
CREATE TABLE IF NOT EXISTS api_cache_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key VARCHAR(500) NOT NULL,
    action VARCHAR(100) NOT NULL,
    data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_cache_snapshots_key_action ON api_cache_snapshots(cache_key, action);
CREATE INDEX IF NOT EXISTS idx_api_cache_snapshots_captured ON api_cache_snapshots(captured_at);

-- ==========================================
-- Tabla: tournament_images
-- Cache de imágenes de torneos (almacenadas como bytes en PostgreSQL)
-- ==========================================
CREATE TABLE IF NOT EXISTS tournament_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id VARCHAR(255) NOT NULL,
    image_type VARCHAR(50) NOT NULL,
    original_url TEXT NOT NULL,
    image_data BYTEA NOT NULL,
    content_type VARCHAR(100),
    size_bytes INTEGER,
    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_tournament_image UNIQUE (event_id, image_type)
);

CREATE INDEX IF NOT EXISTS idx_tournament_images_event_id ON tournament_images(event_id);
CREATE INDEX IF NOT EXISTS idx_tournament_images_type ON tournament_images(image_type);

-- ==========================================
-- Tabla: player_tournament_placements
-- Placements normalizados por jugador y ventana de torneo
-- ==========================================
CREATE TABLE IF NOT EXISTS player_tournament_placements (
    id SERIAL PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    epic_username VARCHAR(255),
    event_id VARCHAR(255),
    event_window_id VARCHAR(255) NOT NULL,
    placement INTEGER,
    points NUMERIC,
    eliminations NUMERIC,
    assists NUMERIC,
    avg_placement NUMERIC,
    total_matches INTEGER,
    tournament_data JSONB,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_player_tournament_window UNIQUE (account_id, event_window_id)
);

CREATE INDEX IF NOT EXISTS idx_player_tournament_placements_account ON player_tournament_placements(account_id);
CREATE INDEX IF NOT EXISTS idx_player_tournament_placements_event ON player_tournament_placements(event_id);
CREATE INDEX IF NOT EXISTS idx_player_tournament_placements_window ON player_tournament_placements(event_window_id);

-- ==========================================
-- Vistas analíticas
-- ==========================================

-- Vista: resumen de llamadas por hora
CREATE OR REPLACE VIEW v_api_calls_hourly AS
SELECT 
    DATE_TRUNC('hour', created_at) AS hour,
    action,
    api_source,
    COUNT(*) AS total_calls,
    AVG(duration_ms) AS avg_duration_ms,
    SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) AS error_count
FROM api_calls
GROUP BY DATE_TRUNC('hour', created_at), action, api_source;

-- Vista: resumen diario
CREATE OR REPLACE VIEW v_api_calls_daily AS
SELECT 
    DATE(created_at) AS day,
    action,
    COUNT(*) AS total_calls,
    AVG(duration_ms) AS avg_duration_ms,
    MAX(duration_ms) AS max_duration_ms,
    SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) AS error_count
FROM api_calls
GROUP BY DATE(created_at), action;

-- Vista: features para modelos de predicción de tienda
DROP VIEW IF EXISTS v_mart_shop_predictions CASCADE;
DROP VIEW IF EXISTS v_cosmetic_prediction_features CASCADE;
CREATE VIEW v_cosmetic_prediction_features AS
WITH ordered AS (
    SELECT
        cosmetic_id,
        shop_date,
        shop_date - (ROW_NUMBER() OVER (PARTITION BY cosmetic_id ORDER BY shop_date))::INTEGER AS grp
    FROM cosmetic_shop_appearances
),
blocks AS (
    SELECT
        cosmetic_id,
        MIN(shop_date) AS block_start,
        MAX(shop_date) AS block_end,
        COUNT(*) AS block_days
    FROM ordered
    GROUP BY cosmetic_id, grp
),
block_gaps AS (
    SELECT
        cosmetic_id,
        block_start,
        block_end,
        block_days,
        block_start - LAG(block_end) OVER (PARTITION BY cosmetic_id ORDER BY block_start) AS gap_days
    FROM blocks
),
agg AS (
    SELECT
        cosmetic_id,
        COUNT(*) AS appearances_count,
        MIN(block_start) AS first_seen,
        MAX(block_end) AS last_seen,
        AVG(gap_days) FILTER (WHERE gap_days IS NOT NULL) AS avg_days_between_appearances,
        STDDEV(gap_days) FILTER (WHERE gap_days IS NOT NULL) AS stddev_days_between_appearances,
        AVG(block_days) AS avg_block_duration,
        MAX(block_days) AS max_block_duration
    FROM block_gaps
    GROUP BY cosmetic_id
)
SELECT
    c.cosmetic_id,
    c.name,
    c.type,
    c.rarity,
    c.series,
    c.set_name,
    c.introduced_chapter,
    c.introduced_season,
    c.added_at,
    c.image_icon,
    c.image_featured,
    COALESCE(a.appearances_count, 0) AS appearances_count,
    a.first_seen,
    a.last_seen,
    CASE WHEN a.last_seen IS NULL THEN NULL ELSE CURRENT_DATE - a.last_seen END AS days_since_last_seen,
    a.avg_days_between_appearances,
    a.stddev_days_between_appearances,
    a.avg_block_duration,
    a.max_block_duration,
    CASE
        WHEN a.avg_days_between_appearances IS NULL OR a.last_seen IS NULL THEN NULL
        ELSE GREATEST(0, a.avg_days_between_appearances - (CURRENT_DATE - a.last_seen))
    END AS estimated_days_until_next_shop
FROM cosmetics c
LEFT JOIN agg a ON a.cosmetic_id = c.cosmetic_id;

-- ==========================================
-- Mini Data Mart / Capa Warehouse
-- Vistas dimensionales para consulta analítica
-- ==========================================

CREATE OR REPLACE VIEW v_dim_date AS
SELECT DISTINCT
    DATE(created_at) AS date_key,
    EXTRACT(YEAR FROM created_at)::INTEGER AS year,
    EXTRACT(MONTH FROM created_at)::INTEGER AS month,
    EXTRACT(DAY FROM created_at)::INTEGER AS day,
    EXTRACT(DOW FROM created_at)::INTEGER AS day_of_week,
    TO_CHAR(created_at, 'Dy') AS day_name
FROM api_calls
UNION
SELECT DISTINCT
    shop_date AS date_key,
    EXTRACT(YEAR FROM shop_date)::INTEGER AS year,
    EXTRACT(MONTH FROM shop_date)::INTEGER AS month,
    EXTRACT(DAY FROM shop_date)::INTEGER AS day,
    EXTRACT(DOW FROM shop_date)::INTEGER AS day_of_week,
    TO_CHAR(shop_date, 'Dy') AS day_name
FROM cosmetic_shop_appearances;

CREATE OR REPLACE VIEW v_dim_api_action AS
SELECT
    ROW_NUMBER() OVER (ORDER BY action, api_source) AS action_key,
    action,
    COALESCE(api_source, 'unknown') AS api_source,
    CASE
        WHEN action LIKE '%cached' THEN 'cache'
        WHEN action IN ('shop', 'cosmetic-search', 'cosmetic-ingest', 'cosmetic-features') THEN 'cosmetics'
        WHEN action IN ('tournaments', 'leaderboard', 'player-tournament-placements', 'tournament-player-stats') THEN 'tournaments'
        WHEN action IN ('lookup', 'stats', 'tracker-stats', 'fortnite-api-stats', 'ranked-current') THEN 'player'
        ELSE 'other'
    END AS business_domain
FROM (
    SELECT DISTINCT action, api_source
    FROM api_calls
) actions;

CREATE OR REPLACE VIEW v_dim_player AS
SELECT
    account_id AS player_key,
    MAX(display_name) AS display_name,
    MAX(platform) AS platform,
    MIN(captured_at) AS first_seen_at,
    MAX(captured_at) AS last_seen_at,
    COUNT(*) AS snapshot_count
FROM player_snapshots
WHERE account_id IS NOT NULL
GROUP BY account_id;

CREATE OR REPLACE VIEW v_dim_cosmetic AS
SELECT
    cosmetic_id AS cosmetic_key,
    name,
    type,
    rarity,
    series,
    set_name,
    introduced_chapter,
    introduced_season,
    image_icon,
    image_featured,
    added_at,
    updated_at
FROM cosmetics;

CREATE OR REPLACE VIEW v_fact_api_calls AS
SELECT
    id AS api_call_key,
    DATE(created_at) AS date_key,
    action,
    COALESCE(api_source, 'unknown') AS api_source,
    response_status,
    response_size,
    duration_ms,
    CASE WHEN response_status >= 400 THEN 1 ELSE 0 END AS error_count,
    1 AS call_count,
    created_at
FROM api_calls;

CREATE OR REPLACE VIEW v_fact_shop_appearances AS
SELECT
    a.id AS shop_appearance_key,
    a.shop_date AS date_key,
    a.cosmetic_id AS cosmetic_key,
    a.source,
    a.regular_price,
    a.final_price,
    CASE
        WHEN a.regular_price IS NOT NULL AND a.final_price IS NOT NULL
        THEN a.regular_price - a.final_price
        ELSE NULL
    END AS discount_amount,
    1 AS appearance_count,
    a.ingested_at
FROM cosmetic_shop_appearances a;

CREATE OR REPLACE VIEW v_mart_api_reliability_daily AS
SELECT
    date_key,
    api_source,
    action,
    SUM(call_count) AS total_calls,
    ROUND(AVG(duration_ms)::numeric, 2) AS avg_duration_ms,
    MAX(duration_ms) AS max_duration_ms,
    SUM(error_count) AS errors,
    ROUND((SUM(error_count)::numeric / NULLIF(SUM(call_count), 0)) * 100, 2) AS error_rate_pct
FROM v_fact_api_calls
GROUP BY date_key, api_source, action;

DROP VIEW IF EXISTS v_mart_shop_predictions CASCADE;
CREATE VIEW v_mart_shop_predictions AS
WITH latest_predictions AS (
    SELECT DISTINCT ON (p.cosmetic_id)
        p.cosmetic_id,
        p.predicted_days_until_next,
        p.predicted_next_shop_date,
        p.confidence_score,
        p.model_name,
        p.created_at
    FROM cosmetic_predictions p
    ORDER BY p.cosmetic_id, p.created_at DESC
)
SELECT
    c.cosmetic_key,
    c.name,
    c.type,
    c.rarity,
    c.series,
    c.image_icon,
    c.image_featured,
    f.appearances_count,
    f.last_seen,
    f.days_since_last_seen,
    f.avg_days_between_appearances,
    f.stddev_days_between_appearances,
    f.avg_block_duration,
    f.max_block_duration,
    f.estimated_days_until_next_shop,
    lp.predicted_days_until_next,
    lp.predicted_next_shop_date,
    lp.confidence_score,
    lp.model_name,
    lp.created_at AS prediction_created_at
FROM v_dim_cosmetic c
LEFT JOIN v_cosmetic_prediction_features f ON f.cosmetic_id = c.cosmetic_key
LEFT JOIN latest_predictions lp ON lp.cosmetic_id = c.cosmetic_key;
-- ==========================================
-- Patrón Outbox
-- ==========================================

-- Tabla: api_outbox
-- Almacena eventos pendientes de ser enviados a Kafka
CREATE TABLE IF NOT EXISTS api_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic VARCHAR(100) NOT NULL,
    event_key VARCHAR(100),
    payload JSONB NOT NULL,
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_api_outbox_published ON api_outbox(published) WHERE published = FALSE;

-- Función trigger para mover api_calls a api_outbox
CREATE OR REPLACE FUNCTION fn_api_call_to_outbox()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO api_outbox (topic, event_key, payload)
    VALUES (
        'api-calls',
        NEW.action,
        jsonb_build_object(
            'id', NEW.id,
            'action', NEW.action,
            'parameters', NEW.parameters,
            'sourceIp', NEW.source_ip,
            'userAgent', NEW.user_agent,
            'responseStatus', NEW.response_status,
            'responseSize', NEW.response_size,
            'durationMs', NEW.duration_ms,
            'apiSource', NEW.api_source,
            'endpointUrl', NEW.endpoint_url,
            'responseBody', NEW.response_body,
            'timestamp', NEW.created_at
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: cada vez que se inserta en api_calls, se crea un evento en outbox
DROP TRIGGER IF EXISTS trg_api_call_to_outbox ON api_calls;
CREATE TRIGGER trg_api_call_to_outbox
AFTER INSERT ON api_calls
FOR EACH ROW
EXECUTE FUNCTION fn_api_call_to_outbox();
-- ==========================================
-- Capa de Transformación (ETL)
-- ==========================================

-- Tabla: player_progress
-- Almacena métricas transformadas y calculadas por el servicio ETL
CREATE TABLE IF NOT EXISTS player_progress (
    id SERIAL PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    metric_name VARCHAR(100) NOT NULL, -- 'kd', 'win_rate', 'kills_per_match'
    metric_value NUMERIC NOT NULL,
    delta NUMERIC, -- cambio respecto a la medición anterior
    period_label TEXT,
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_progress_account ON player_progress(account_id);
CREATE INDEX IF NOT EXISTS idx_player_progress_metric ON player_progress(metric_name);

CREATE OR REPLACE VIEW v_fact_player_progress AS
SELECT
    id AS progress_key,
    account_id AS player_key,
    DATE(created_at) AS date_key,
    metric_name,
    metric_value,
    delta,
    period_label,
    created_at
FROM player_progress;

-- ==========================================
-- Tabla: player_analysis_snapshots
-- Snapshots periódicos de stats para análisis de tendencia
-- Usado por /api/player/analysis/[accountId]
-- ==========================================
CREATE TABLE IF NOT EXISTS player_analysis_snapshots (
    id SERIAL PRIMARY KEY,
    account_id VARCHAR(255) NOT NULL,
    kd NUMERIC NOT NULL DEFAULT 0,
    win_rate NUMERIC NOT NULL DEFAULT 0,
    matches INTEGER NOT NULL DEFAULT 0,
    kills INTEGER NOT NULL DEFAULT 0,
    score_per_match NUMERIC NOT NULL DEFAULT 0,
    season_kd NUMERIC DEFAULT 0,
    season_win_rate NUMERIC DEFAULT 0,
    season_matches INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_account ON player_analysis_snapshots(account_id);
CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_created ON player_analysis_snapshots(created_at);
