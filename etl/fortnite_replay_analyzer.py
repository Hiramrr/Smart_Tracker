import json
import os
import time
import psycopg2
import pandas as pd
import numpy as np
from kafka import KafkaConsumer
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

# ==========================================
# Configuración
# ==========================================
KAFKA_BROKER = os.getenv('KAFKA_BROKER', 'kafka:29092')
KAFKA_TOPIC = os.getenv('KAFKA_TOPIC', 'api-calls')
DATABASE_URL = os.getenv('DATABASE_URL')

print(f"--- Iniciando ETL Fortnite Replay Analyzer ---")
print(f"ML Stack: Pandas + Scikit-Learn (KMeans Clustering + Tendencias)")

# ==========================================
# Conexión Kafka & DB
# ==========================================
def get_kafka_consumer():
    while True:
        try:
            consumer = KafkaConsumer(
                KAFKA_TOPIC,
                bootstrap_servers=[KAFKA_BROKER],
                auto_offset_reset='earliest',
                enable_auto_commit=True,
                group_id='etl-fortnite-replay-analyzer',
                value_deserializer=lambda x: json.loads(x.decode('utf-8'))
            )
            return consumer
        except Exception as e:
            print(f"Error Kafka: {e}. Reintentando...")
            time.sleep(5)

def get_db_connection():
    while True:
        try:
            return psycopg2.connect(DATABASE_URL)
        except Exception:
            time.sleep(5)

# ==========================================
# Análisis de Replays
# ==========================================
def load_player_replays(conn, player_id, display_name=None):
    """Carga todos los replays de un jugador."""
    query = """
        SELECT
            replay_id, file_name, playlist, placement,
            eliminations, deaths, damage_to_players, damage_from_players,
            accuracy_percent, assists, revives,
            materials_gathered, materials_used, total_traveled,
            duration_seconds, total_players, created_at
        FROM fortnite_replays
        WHERE player_id = %s
        ORDER BY created_at ASC
    """
    df = pd.read_sql_query(query, conn, params=(player_id,))
    if df.empty and display_name:
        # Fallback por display_name si no hay player_id
        df = pd.read_sql_query(
            """
            SELECT
                replay_id, file_name, playlist, placement,
                eliminations, deaths, damage_to_players, damage_from_players,
                accuracy_percent, assists, revives,
                materials_gathered, materials_used, total_traveled,
                duration_seconds, total_players, created_at
            FROM fortnite_replays
            WHERE display_name = %s
            ORDER BY created_at ASC
            """,
            conn, params=(display_name,)
        )
    return df


def compute_replay_features(df):
    """Calcula features numéricas para clustering."""
    if df.empty:
        return None

    # Rellenar nulos con 0 para features clave
    features_df = df.copy()
    numeric_cols = ['eliminations', 'deaths', 'damage_to_players', 'damage_from_players',
                    'accuracy_percent', 'assists', 'revives', 'materials_gathered',
                    'materials_used', 'total_traveled', 'duration_seconds']
    for col in numeric_cols:
        features_df[col] = pd.to_numeric(features_df[col], errors='coerce').fillna(0)

    features_df['kd'] = features_df.apply(
        lambda r: r['eliminations'] / max(r['deaths'], 1), axis=1
    )
    features_df['damage_ratio'] = features_df.apply(
        lambda r: r['damage_to_players'] / max(r['damage_from_players'], 1), axis=1
    )
    features_df['placement_inv'] = features_df['placement'].apply(
        lambda p: 1 / max(p, 1) if pd.notna(p) else 0
    )

    return features_df


def classify_playstyle(features_df):
    """
    Clasifica el estilo de juego en 3 clusters:
    - Agresivo (alto KD, mucho daño)
    - Constructor (muchos materiales)
    - Estratégico/Survivor (buen placement, bajo daño recibido)
    """
    if features_df is None or len(features_df) < 3:
        return "Insuficientes datos", 0, None

    # Features para clustering
    feature_cols = ['kd', 'damage_to_players', 'damage_ratio', 'placement_inv',
                    'materials_gathered', 'materials_used', 'total_traveled']
    X = features_df[feature_cols].values

    # Estandarizar
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    n_clusters = min(3, len(features_df))
    kmeans = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
    clusters = kmeans.fit_predict(X_scaled)

    # Asignar etiquetas basadas en centroides
    labels = []
    for c in range(n_clusters):
        mask = clusters == c
        centroid = kmeans.cluster_centers_[c]
        # Mapear centroides a etiquetas interpretables
        kd_score = centroid[feature_cols.index('kd')]
        mat_score = centroid[feature_cols.index('materials_gathered')]
        dmg_score = centroid[feature_cols.index('damage_to_players')]

        if kd_score > 0.5 and dmg_score > 0.5:
            label = "Agresivo"
        elif mat_score > 0.5:
            label = "Constructor"
        else:
            label = "Estrategico"
        labels.append(label)

    # El estilo predominante es el del cluster con más partidas
    unique, counts = np.unique(clusters, return_counts=True)
    dominant_cluster = unique[np.argmax(counts)]
    dominant_label = labels[dominant_cluster]

    return dominant_label, int(dominant_cluster), kmeans


def analyze_trends(features_df):
    """
    Analiza tendencias usando regresión lineal sobre métricas clave.
    Retorna diccionario con tendencias.
    """
    if features_df is None or len(features_df) < 2:
        return {}

    trends = {}
    metrics = ['kd', 'placement', 'damage_to_players', 'accuracy_percent']

    x = np.arange(len(features_df))
    for metric in metrics:
        values = features_df[metric].values
        if np.all(np.isnan(values)) or len(values) < 2:
            continue

        # Limpiar NaNs
        valid_mask = ~np.isnan(values)
        if valid_mask.sum() < 2:
            continue

        coeffs = np.polyfit(x[valid_mask], values[valid_mask], 1)
        slope = coeffs[0]
        trends[f'{metric}_trend_slope'] = round(float(slope), 6)

        # Dirección cualitativa
        if metric == 'placement':
            # Para placement, pendiente negativa es buena (mejorando)
            if slope < -0.1:
                trends[f'{metric}_trend'] = 'mejorando'
            elif slope > 0.1:
                trends[f'{metric}_trend'] = 'empeorando'
            else:
                trends[f'{metric}_trend'] = 'estable'
        else:
            if slope > 0.01:
                trends[f'{metric}_trend'] = 'mejorando'
            elif slope < -0.01:
                trends[f'{metric}_trend'] = 'empeorando'
            else:
                trends[f'{metric}_trend'] = 'estable'

    # Calcular predicted_kd_next si hay datos suficientes
    if 'kd_trend_slope' in trends and len(features_df) >= 2:
        last_kd = features_df['kd'].iloc[-1]
        predicted_kd = last_kd + trends['kd_trend_slope']
        trends['predicted_kd_next'] = round(max(0, predicted_kd), 4)

    return trends


def save_replay_metrics(conn, player_id, display_name, features_df, playstyle_label, playstyle_value, trends):
    """Guarda métricas agregadas en player_progress."""
    cur = conn.cursor()

    total_matches = len(features_df)
    avg_kd = round(features_df['kd'].mean(), 4) if not features_df['kd'].isna().all() else 0
    avg_placement = round(features_df['placement'].mean(), 4) if not features_df['placement'].isna().all() else 0
    avg_damage = round(features_df['damage_to_players'].mean(), 4) if not features_df['damage_to_players'].isna().all() else 0
    avg_accuracy = round(features_df['accuracy_percent'].mean(), 4) if not features_df['accuracy_percent'].isna().all() else 0
    wins = int((features_df['placement'] == 1).sum()) if not features_df['placement'].isna().all() else 0

    metrics = [
        ('fortnite_replay_matches', total_matches),
        ('fortnite_replay_avg_kd', avg_kd),
        ('fortnite_replay_avg_placement', avg_placement),
        ('fortnite_replay_avg_damage', avg_damage),
        ('fortnite_replay_avg_accuracy', avg_accuracy),
        ('fortnite_replay_wins', wins),
        ('fortnite_replay_playstyle', playstyle_value),
        ('fortnite_replay_playstyle_label', playstyle_label),
    ]

    for metric_name, metric_value in metrics:
        if isinstance(metric_value, str):
            # Para strings, guardar en otra tabla o como valor especial
            continue
        cur.execute("""
            INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
            VALUES (%s, %s, %s, %s)
        """, (player_id, metric_name, float(metric_value), 0))

    # Guardar tendencias
    for key, value in trends.items():
        if isinstance(value, (int, float)):
            cur.execute("""
                INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
                VALUES (%s, %s, %s, %s)
            """, (player_id, f'fortnite_replay_{key}', float(value), 0))

    # Guardar análisis en player_analysis_snapshots
    win_rate = round((wins / max(total_matches, 1)) * 100, 4)
    kills = int(features_df['eliminations'].sum()) if not features_df['eliminations'].isna().all() else 0
    deaths = int(features_df['deaths'].sum()) if not features_df['deaths'].isna().all() else 0

    cur.execute("""
        INSERT INTO player_analysis_snapshots (
            account_id, kd, win_rate, matches, kills, score_per_match
        ) VALUES (%s, %s, %s, %s, %s, %s)
    """, (player_id, avg_kd, win_rate, total_matches, kills, avg_damage))

    conn.commit()
    cur.close()
    print(f"[ETL-FN] Guardadas métricas para {display_name or player_id}: {total_matches} matches, estilo={playstyle_label}")


def process_replay_event(conn, event):
    """Procesa un evento de replay desde Kafka."""
    action = event.get('action')
    data = event.get('responseBody')

    if isinstance(data, str):
        try:
            data = json.loads(data)
        except:
            return

    if not data or event.get('responseStatus') != 200:
        return

    # Solo procesar si es un evento de replay de fortnite
    if action != 'fortnite-replay-parse':
        return

    player_id = data.get('player', {}).get('playerId')
    display_name = data.get('player', {}).get('displayName')

    if not player_id and not display_name:
        return

    # Cargar datos de la base (incluyendo los recién guardados)
    features_df = compute_replay_features(
        load_player_replays(conn, player_id, display_name)
    )

    if features_df is None or features_df.empty:
        print(f"[ETL-FN] No hay replays para procesar: {display_name or player_id}")
        return

    # Clasificar estilo de juego
    playstyle_label, playstyle_value, _ = classify_playstyle(features_df)

    # Analizar tendencias
    trends = analyze_trends(features_df)

    # Guardar métricas
    save_replay_metrics(conn, player_id or display_name, display_name, features_df,
                        playstyle_label, playstyle_value, trends)


def main():
    consumer = get_kafka_consumer()
    conn = get_db_connection()
    try:
        for message in consumer:
            try:
                process_replay_event(conn, message.value)
            except Exception as e:
                print(f"[ETL-FN] Error procesando evento: {e}")
    except Exception as e:
        print(f"Error Loop: {e}")
    finally:
        consumer.close()
        conn.close()


if __name__ == "__main__":
    main()
