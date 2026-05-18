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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índices para análisis
    CONSTRAINT valid_action CHECK (action IN (
        'lookup', 'stats', 'tracker-stats', 'fortnite-api-stats',
        'ranked-current', 'tournaments', 'leaderboard', 'shop'
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
