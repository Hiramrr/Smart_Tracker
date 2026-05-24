import json
import os

import numpy as np
import pandas as pd
import psycopg2
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler


DATABASE_URL = os.getenv("DATABASE_URL")
MODEL_NAME = "lol_player_kmeans_skill_classifier_v1"

TIER_BASE = {
    "IRON": 1,
    "BRONZE": 2,
    "SILVER": 3,
    "GOLD": 4,
    "PLATINUM": 5,
    "EMERALD": 6,
    "DIAMOND": 7,
    "MASTER": 8,
    "GRANDMASTER": 9,
    "CHALLENGER": 10,
}

DIVISION_VALUE = {"IV": 0.15, "III": 0.35, "II": 0.65, "I": 0.9}
SCORE_TIERS = [
    (10.0, "CHALLENGER"),
    (9.0, "GRANDMASTER"),
    (8.0, "MASTER"),
    (7.9, "DIAMOND I"),
    (7.65, "DIAMOND II"),
    (7.35, "DIAMOND III"),
    (7.15, "DIAMOND IV"),
    (6.9, "EMERALD I"),
    (6.65, "EMERALD II"),
    (6.35, "EMERALD III"),
    (6.15, "EMERALD IV"),
    (5.9, "PLATINUM I"),
    (5.65, "PLATINUM II"),
    (5.35, "PLATINUM III"),
    (5.15, "PLATINUM IV"),
    (4.9, "GOLD I"),
    (4.65, "GOLD II"),
    (4.35, "GOLD III"),
    (4.15, "GOLD IV"),
    (3.9, "SILVER I"),
    (3.65, "SILVER II"),
    (3.35, "SILVER III"),
    (3.15, "SILVER IV"),
    (2.9, "BRONZE I"),
    (2.65, "BRONZE II"),
    (2.35, "BRONZE III"),
    (2.15, "BRONZE IV"),
]

EASY_CHAMPIONS_BY_ROLE = {
    "TOP": ["Garen", "Malphite", "Mordekaiser", "Dr. Mundo", "Sett"],
    "JUNGLE": ["Warwick", "Amumu", "Nunu & Willump", "Vi", "Rammus"],
    "MIDDLE": ["Annie", "Malzahar", "Lux", "Veigar", "Ahri"],
    "BOTTOM": ["Ashe", "Miss Fortune", "Sivir", "Caitlyn", "Jinx"],
    "UTILITY": ["Leona", "Nautilus", "Soraka", "Sona", "Lulu"],
    "SUPPORT": ["Leona", "Nautilus", "Soraka", "Sona", "Lulu"],
}


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL no esta configurada")
    return psycopg2.connect(DATABASE_URL)


def ensure_schema(conn):
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS lol_player_classifications (
            id SERIAL PRIMARY KEY,
            puuid VARCHAR(255) NOT NULL,
            game_name VARCHAR(255),
            tag_line VARCHAR(32),
            platform VARCHAR(20),
            matches_analyzed INTEGER NOT NULL DEFAULT 0,
            skill_label VARCHAR(100) NOT NULL,
            skill_value NUMERIC NOT NULL,
            playstyle_label VARCHAR(100),
            main_role VARCHAR(50),
            main_champion VARCHAR(100),
            win_rate NUMERIC,
            avg_kda NUMERIC,
            avg_kills NUMERIC,
            avg_deaths NUMERIC,
            avg_assists NUMERIC,
            avg_cs_per_min NUMERIC,
            avg_gold_per_min NUMERIC,
            ranked_score NUMERIC,
            ranked_tier VARCHAR(100),
            predicted_rank VARCHAR(100),
            predicted_rank_score NUMERIC,
            rank_prediction_confidence VARCHAR(50),
            rank_prediction_reasoning TEXT,
            focus_areas JSONB DEFAULT '[]'::jsonb,
            champion_recommendations JSONB DEFAULT '[]'::jsonb,
            next_pick JSONB DEFAULT '{}'::jsonb,
            beginner_pick JSONB DEFAULT '{}'::jsonb,
            cluster_id INTEGER,
            model_name VARCHAR(120) NOT NULL,
            features JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
        """
    )
    for ddl in [
        "ALTER TABLE lol_player_classifications ADD COLUMN IF NOT EXISTS predicted_rank VARCHAR(100)",
        "ALTER TABLE lol_player_classifications ADD COLUMN IF NOT EXISTS predicted_rank_score NUMERIC",
        "ALTER TABLE lol_player_classifications ADD COLUMN IF NOT EXISTS rank_prediction_confidence VARCHAR(50)",
        "ALTER TABLE lol_player_classifications ADD COLUMN IF NOT EXISTS rank_prediction_reasoning TEXT",
        "ALTER TABLE lol_player_classifications ADD COLUMN IF NOT EXISTS focus_areas JSONB DEFAULT '[]'::jsonb",
        "ALTER TABLE lol_player_classifications ADD COLUMN IF NOT EXISTS champion_recommendations JSONB DEFAULT '[]'::jsonb",
        "ALTER TABLE lol_player_classifications ADD COLUMN IF NOT EXISTS next_pick JSONB DEFAULT '{}'::jsonb",
        "ALTER TABLE lol_player_classifications ADD COLUMN IF NOT EXISTS beginner_pick JSONB DEFAULT '{}'::jsonb",
    ]:
        cur.execute(ddl)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_lol_classifications_puuid ON lol_player_classifications(puuid)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_lol_classifications_created ON lol_player_classifications(created_at)")
    cur.execute(
        """
        CREATE OR REPLACE VIEW v_lol_match_features AS
        SELECT
            m.match_id,
            m.puuid,
            m.game_creation,
            COALESCE((m.raw_json->'info'->>'gameDuration')::NUMERIC, m.game_duration) AS game_duration_seconds,
            COALESCE((m.raw_json->'info'->>'queueId')::INTEGER, m.queue_id) AS queue_id,
            participant.value->>'championName' AS champion_name,
            (participant.value->>'championId')::INTEGER AS champion_id,
            participant.value->>'teamPosition' AS team_position,
            participant.value->>'individualPosition' AS individual_position,
            COALESCE((participant.value->>'win')::BOOLEAN, FALSE) AS win,
            COALESCE((participant.value->>'kills')::NUMERIC, 0) AS kills,
            COALESCE((participant.value->>'deaths')::NUMERIC, 0) AS deaths,
            COALESCE((participant.value->>'assists')::NUMERIC, 0) AS assists,
            COALESCE((participant.value->>'goldEarned')::NUMERIC, 0) AS gold_earned,
            COALESCE((participant.value->>'totalMinionsKilled')::NUMERIC, 0)
              + COALESCE((participant.value->>'neutralMinionsKilled')::NUMERIC, 0) AS cs,
            participant.value AS participant_json,
            m.captured_at
        FROM lol_match_snapshots m
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.raw_json->'info'->'participants', '[]'::jsonb)) AS participant(value)
        WHERE participant.value->>'puuid' = m.puuid
        """
    )
    cur.execute(
        """
        CREATE OR REPLACE VIEW v_mart_lol_player_classification AS
        SELECT DISTINCT ON (c.puuid)
            c.*
        FROM lol_player_classifications c
        ORDER BY c.puuid, c.created_at DESC
        """
    )
    conn.commit()
    cur.close()


def ranked_score(ranked_rows):
    if not isinstance(ranked_rows, list) or not ranked_rows:
        return 0.0, None

    best_score = 0.0
    best_tier = None
    for entry in ranked_rows:
        tier = str(entry.get("tier", "")).upper()
        rank = str(entry.get("rank", "")).upper()
        lp = float(entry.get("leaguePoints") or 0)
        score = TIER_BASE.get(tier, 0) + DIVISION_VALUE.get(rank, 0) + min(lp, 100) / 1000
        if score > best_score:
            best_score = score
            best_tier = f"{tier} {rank}".strip()
    return best_score, best_tier


def load_player_metadata(conn):
    snapshots = pd.read_sql_query(
        """
        SELECT DISTINCT ON (puuid)
            puuid,
            game_name,
            tag_line,
            platform,
            ranked_data,
            mastery_data,
            captured_at
        FROM lol_player_snapshots
        ORDER BY puuid, captured_at DESC
        """,
        conn,
    )
    if snapshots.empty:
        return snapshots

    ranked = snapshots["ranked_data"].apply(lambda value: value if isinstance(value, list) else [])
    scores = ranked.apply(ranked_score)
    snapshots["ranked_score"] = scores.apply(lambda item: item[0])
    snapshots["ranked_tier"] = scores.apply(lambda item: item[1])
    snapshots["mastery_data"] = snapshots["mastery_data"].apply(lambda value: value if isinstance(value, list) else [])
    return snapshots.drop(columns=["ranked_data"])


def load_match_features(conn):
    return pd.read_sql_query(
        """
        SELECT
            puuid,
            match_id,
            champion_name,
            COALESCE(NULLIF(team_position, ''), NULLIF(individual_position, ''), 'UNKNOWN') AS role,
            win,
            kills,
            deaths,
            assists,
            gold_earned,
            cs,
            GREATEST(game_duration_seconds / 60.0, 1.0) AS duration_minutes
        FROM v_lol_match_features
        WHERE game_duration_seconds IS NOT NULL
        """,
        conn,
    )


def most_common(series):
    clean = series.dropna()
    if clean.empty:
        return None
    return clean.value_counts().idxmax()


def aggregate_features(matches, metadata):
    if matches.empty:
        return pd.DataFrame()

    df = matches.copy()
    df["deaths_safe"] = df["deaths"].replace(0, 1)
    df["kda"] = (df["kills"] + df["assists"]) / df["deaths_safe"]
    df["cs_per_min"] = df["cs"] / df["duration_minutes"]
    df["gold_per_min"] = df["gold_earned"] / df["duration_minutes"]

    grouped = df.groupby("puuid").agg(
        matches_analyzed=("match_id", "nunique"),
        win_rate=("win", "mean"),
        avg_kda=("kda", "mean"),
        avg_kills=("kills", "mean"),
        avg_deaths=("deaths", "mean"),
        avg_assists=("assists", "mean"),
        avg_cs_per_min=("cs_per_min", "mean"),
        avg_gold_per_min=("gold_per_min", "mean"),
    ).reset_index()

    grouped["win_rate"] = grouped["win_rate"] * 100
    grouped["main_role"] = grouped["puuid"].apply(lambda puuid: most_common(df.loc[df["puuid"] == puuid, "role"]))
    grouped["main_champion"] = grouped["puuid"].apply(lambda puuid: most_common(df.loc[df["puuid"] == puuid, "champion_name"]))

    return grouped.merge(metadata, on="puuid", how="left")


def heuristic_skill(row):
    score = (
        (float(row["win_rate"]) / 100) * 2.2
        + min(float(row["avg_kda"]) / 5, 1.5)
        + min(float(row["avg_cs_per_min"]) / 8, 1.2)
        + min(float(row["avg_gold_per_min"]) / 450, 1.1)
        + min(float(row.get("ranked_score") or 0) / 10, 1.0)
    )
    if score >= 5.2:
        return "Competitivo", 2.0
    if score >= 3.5:
        return "Intermedio", 1.0
    return "Casual", 0.0


def classify_players(features):
    if features.empty:
        return features

    model_columns = [
        "win_rate",
        "avg_kda",
        "avg_kills",
        "avg_deaths",
        "avg_assists",
        "avg_cs_per_min",
        "avg_gold_per_min",
        "ranked_score",
    ]
    data = features.copy()
    data[model_columns] = data[model_columns].fillna(0).astype(float)

    if len(data) >= 3:
        scaler = StandardScaler()
        matrix = scaler.fit_transform(data[model_columns])
        n_clusters = min(3, len(data))
        kmeans = KMeans(n_clusters=n_clusters, n_init=20, random_state=42)
        data["cluster_id"] = kmeans.fit_predict(matrix)
        cluster_strength = data.groupby("cluster_id").apply(
            lambda group: (
                group["win_rate"].mean() * 0.03
                + group["avg_kda"].mean() * 0.9
                + group["avg_cs_per_min"].mean() * 0.35
                + group["ranked_score"].mean() * 0.45
            ),
            include_groups=False,
        )
        labels = ["Casual", "Intermedio", "Competitivo"]
        ordered_clusters = list(cluster_strength.sort_values().index)
        cluster_to_label = {cluster: labels[index] for index, cluster in enumerate(ordered_clusters)}
        cluster_to_value = {cluster: float(index) for index, cluster in enumerate(ordered_clusters)}
        data["skill_label"] = data["cluster_id"].map(cluster_to_label)
        data["skill_value"] = data["cluster_id"].map(cluster_to_value)
    else:
        classifications = data.apply(heuristic_skill, axis=1)
        data["skill_label"] = classifications.apply(lambda item: item[0])
        data["skill_value"] = classifications.apply(lambda item: item[1])
        data["cluster_id"] = None

    data["playstyle_label"] = data.apply(playstyle_label, axis=1)
    return data


def playstyle_label(row):
    if float(row["avg_kills"]) >= 10 and float(row["avg_kda"]) >= 3:
        return "Carry agresivo"
    if float(row["avg_cs_per_min"]) >= 7:
        return "Farmeo / macro"
    if float(row["avg_assists"]) >= 12:
        return "Utilidad de equipo"
    if float(row["avg_deaths"]) >= 8:
        return "Riesgo alto"
    return "Balanceado"


def score_to_rank(score):
    if score <= 0:
        return "Sin ranked"
    for threshold, rank in SCORE_TIERS:
        if score >= threshold:
            return rank
    return "IRON"


def rank_prediction(row):
    base_score = float(row.get("ranked_score") or 0)
    if base_score <= 0:
        return "Sin ranked", 0.0, "baja", "No hay ranked base; juega algunas clasificatorias para proyectar un rango real."

    delta = 0.0
    if float(row["win_rate"]) >= 55:
        delta += 0.18
    elif float(row["win_rate"]) < 48:
        delta -= 0.12
    if float(row["avg_kda"]) >= 3.5:
        delta += 0.12
    elif float(row["avg_kda"]) < 2.0:
        delta -= 0.10
    if float(row["avg_cs_per_min"]) >= 6.5:
        delta += 0.10
    elif float(row["avg_cs_per_min"]) < 4.5:
        delta -= 0.08
    if float(row["avg_deaths"]) >= 7:
        delta -= 0.12

    sample = int(row["matches_analyzed"])
    confidence = "alta" if sample >= 20 else "media" if sample >= 10 else "baja"
    projected_score = max(0.0, min(10.0, base_score + delta))
    predicted = score_to_rank(projected_score)
    if delta > 0.12:
        reasoning = "Las senales recientes empujan por encima del rango actual: buen KDA, win rate o economia."
    elif delta < -0.10:
        reasoning = "Las senales recientes estan por debajo del rango actual; conviene estabilizar muertes y economia."
    else:
        reasoning = "La proyeccion conserva un rango cercano al actual porque las senales recientes estan equilibradas."
    return predicted, projected_score, confidence, reasoning


def focus_areas(row):
    areas = []
    if float(row["avg_deaths"]) >= 6.5:
        areas.append({
            "area": "Reducir muertes",
            "priority": "alta",
            "metric": round(float(row["avg_deaths"]), 2),
            "advice": "Juega las primeras oleadas con menos all-in y evita pelear sin vision lateral.",
        })
    if float(row["avg_cs_per_min"]) < 6:
        areas.append({
            "area": "Subir CS/min",
            "priority": "alta" if float(row["avg_cs_per_min"]) < 5 else "media",
            "metric": round(float(row["avg_cs_per_min"]), 2),
            "advice": "Prioriza oleadas antes de rotar y practica last hit con tu campeon principal.",
        })
    if float(row["win_rate"]) < 52:
        areas.append({
            "area": "Convertir ventaja en victoria",
            "priority": "media",
            "metric": round(float(row["win_rate"]), 2),
            "advice": "Despues de ganar pelea, fuerza objetivos o placas en vez de perseguir kills.",
        })
    if float(row["avg_gold_per_min"]) < 430:
        areas.append({
            "area": "Economia",
            "priority": "media",
            "metric": round(float(row["avg_gold_per_min"]), 2),
            "advice": "Busca bases limpias y evita perder oleadas completas por recalls tardios.",
        })
    return areas[:3] or [{
        "area": "Consistencia",
        "priority": "media",
        "metric": round(float(row["avg_kda"]), 2),
        "advice": "Mantén el pool reducido y repite el plan de partida que ya te da mejores resultados.",
    }]


def champion_stats(matches):
    if matches.empty:
        return pd.DataFrame()
    df = matches.copy()
    df["deaths_safe"] = df["deaths"].replace(0, 1)
    df["kda"] = (df["kills"] + df["assists"]) / df["deaths_safe"]
    df["cs_per_min"] = df["cs"] / df["duration_minutes"]
    return df.groupby(["puuid", "champion_name", "role"]).agg(
        games=("match_id", "nunique"),
        win_rate=("win", "mean"),
        avg_kda=("kda", "mean"),
        avg_cs_per_min=("cs_per_min", "mean"),
    ).reset_index()


def build_champion_recommendations(row, champ_perf):
    puuid = row["puuid"]
    player_champs = champ_perf[champ_perf["puuid"] == puuid].copy()
    recs = []
    if not player_champs.empty:
        player_champs["score"] = (
            player_champs["win_rate"] * 2.0
            + np.minimum(player_champs["avg_kda"] / 5, 1.2)
            + np.minimum(player_champs["avg_cs_per_min"] / 8, 1.0)
            + np.minimum(player_champs["games"] / 5, 1.0)
        )
        for _, champ in player_champs.sort_values("score", ascending=False).head(4).iterrows():
            recs.append({
                "champion": champ["champion_name"],
                "role": champ["role"],
                "games": int(champ["games"]),
                "winRate": round(float(champ["win_rate"]) * 100, 1),
                "avgKda": round(float(champ["avg_kda"]), 2),
                "reason": "Buen balance entre resultados recientes, KDA y comodidad.",
            })

    main_role = str(row.get("main_role") or "BOTTOM")
    easy_pool = EASY_CHAMPIONS_BY_ROLE.get(main_role, EASY_CHAMPIONS_BY_ROLE["BOTTOM"])
    beginner = next((rec for rec in recs if rec["champion"] in easy_pool), None)
    if beginner is None:
        beginner = {
            "champion": easy_pool[0],
            "role": main_role,
            "games": 0,
            "winRate": None,
            "avgKda": None,
            "reason": "Pick simple para practicar fundamentos del rol sin exigir mecanicas complejas.",
        }

    next_pick = recs[0] if recs else {
        "champion": row.get("main_champion") or easy_pool[0],
        "role": main_role,
        "games": int(row["matches_analyzed"]),
        "winRate": round(float(row["win_rate"]), 1),
        "avgKda": round(float(row["avg_kda"]), 2),
        "reason": "Recomendacion basada en campeon frecuente y estilo actual.",
    }
    return recs, next_pick, beginner


def enrich_predictions(data, matches):
    if data.empty:
        return data
    enriched = data.copy()
    predictions = enriched.apply(rank_prediction, axis=1)
    enriched["predicted_rank"] = predictions.apply(lambda item: item[0])
    enriched["predicted_rank_score"] = predictions.apply(lambda item: item[1])
    enriched["rank_prediction_confidence"] = predictions.apply(lambda item: item[2])
    enriched["rank_prediction_reasoning"] = predictions.apply(lambda item: item[3])
    enriched["focus_areas"] = enriched.apply(focus_areas, axis=1)

    perf = champion_stats(matches)
    champion_payload = enriched.apply(lambda row: build_champion_recommendations(row, perf), axis=1)
    enriched["champion_recommendations"] = champion_payload.apply(lambda item: item[0])
    enriched["next_pick"] = champion_payload.apply(lambda item: item[1])
    enriched["beginner_pick"] = champion_payload.apply(lambda item: item[2])
    return enriched


def store_classifications(conn, classifications):
    cur = conn.cursor()
    for _, row in classifications.iterrows():
        features = {
            "matches_analyzed": int(row["matches_analyzed"]),
            "win_rate": round(float(row["win_rate"]), 4),
            "avg_kda": round(float(row["avg_kda"]), 4),
            "avg_cs_per_min": round(float(row["avg_cs_per_min"]), 4),
            "avg_gold_per_min": round(float(row["avg_gold_per_min"]), 4),
            "ranked_score": round(float(row.get("ranked_score") or 0), 4),
        }
        cur.execute(
            """
            INSERT INTO lol_player_classifications (
                puuid, game_name, tag_line, platform, matches_analyzed,
                skill_label, skill_value, playstyle_label, main_role, main_champion,
                win_rate, avg_kda, avg_kills, avg_deaths, avg_assists,
                avg_cs_per_min, avg_gold_per_min, ranked_score, ranked_tier,
                predicted_rank, predicted_rank_score, rank_prediction_confidence,
                rank_prediction_reasoning, focus_areas, champion_recommendations,
                next_pick, beginner_pick, cluster_id, model_name, features
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s, %s
            )
            """,
            (
                row["puuid"],
                row.get("game_name"),
                row.get("tag_line"),
                row.get("platform"),
                int(row["matches_analyzed"]),
                row["skill_label"],
                float(row["skill_value"]),
                row["playstyle_label"],
                row.get("main_role"),
                row.get("main_champion"),
                round(float(row["win_rate"]), 4),
                round(float(row["avg_kda"]), 4),
                round(float(row["avg_kills"]), 4),
                round(float(row["avg_deaths"]), 4),
                round(float(row["avg_assists"]), 4),
                round(float(row["avg_cs_per_min"]), 4),
                round(float(row["avg_gold_per_min"]), 4),
                round(float(row.get("ranked_score") or 0), 4),
                row.get("ranked_tier"),
                row.get("predicted_rank"),
                round(float(row.get("predicted_rank_score") or 0), 4),
                row.get("rank_prediction_confidence"),
                row.get("rank_prediction_reasoning"),
                json.dumps(row.get("focus_areas") or []),
                json.dumps(row.get("champion_recommendations") or []),
                json.dumps(row.get("next_pick") or {}),
                json.dumps(row.get("beginner_pick") or {}),
                None if pd.isna(row.get("cluster_id")) else int(row.get("cluster_id")),
                MODEL_NAME,
                json.dumps(features),
            ),
        )
    conn.commit()
    cur.close()


def main():
    conn = get_connection()
    try:
        ensure_schema(conn)
        metadata = load_player_metadata(conn)
        matches = load_match_features(conn)
        features = aggregate_features(matches, metadata)
        if features.empty:
            print("[LoLClassifier] No hay partidas LoL suficientes para clasificar.")
            return
        classifications = enrich_predictions(classify_players(features), matches)
        store_classifications(conn, classifications)
        print(f"[LoLClassifier] Clasificaciones guardadas: {len(classifications)}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
