-- ==========================================
-- Tabla: player_analysis_snapshots
-- Snapshots periódicos de stats para análisis de tendencia
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
