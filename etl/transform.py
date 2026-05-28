import json
import math
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

print(f"--- Iniciando Servicio ETL Avanzado (Python) ---")
print(f"ML Stack: Pandas + Scikit-Learn (KMeans 3-Clusters + Regresión Lineal)")


def db_float(value, default=0.0):
    try:
        if value is None:
            return default
        number = float(value)
        return number if math.isfinite(number) else default
    except (TypeError, ValueError):
        return default


def db_int(value, default=0):
    number = db_float(value, None)
    return int(number) if number is not None else default


def json_default(value):
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return db_float(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    return str(value)

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
                group_id='etl-transform-group',
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
# Clasificación con KMeans (3 clusters)
# ==========================================
def classify_player_skill(historical_data):
    """
    Usa KMeans para clasificar al jugador basado en su historial de temporadas.
    3 clusters: Casual (0), Intermedio (1), Competitivo (2).
    Features: KD, Win Rate, Partidas Jugadas.
    """
    if len(historical_data) < 3:
        return "Nivel Inicial (Pocos datos)", 0
    
    df = pd.DataFrame(historical_data)
    # Features para el modelo
    X = df[['kd', 'win_rate', 'matches']].values
    
    # Normalización
    X_norm = (X - X.mean(axis=0)) / (X.std(axis=0) + 1e-6)
    
    # Determinar número de clusters (máximo 3, mínimo según los datos)
    n_clusters = min(3, len(historical_data))
    
    # KMeans con n_clusters (corregido: era n_components, que es PCA, no KMeans)
    kmeans = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
    clusters = kmeans.fit_predict(X_norm)
    
    # Determinar nivel de cada cluster basado en promedio de KD
    cluster_kd_avg = {}
    for c in range(n_clusters):
        mask = clusters == c
        if mask.sum() > 0:
            cluster_kd_avg[c] = df.loc[mask, 'kd'].mean()
        else:
            cluster_kd_avg[c] = 0
    
    # Ordenar clusters por KD promedio: menor=casual, medio=intermedio, mayor=competitivo
    sorted_clusters = sorted(cluster_kd_avg.keys(), key=lambda c: cluster_kd_avg[c])
    
    # Mapear: 0=casual, 1=intermedio, 2=competitivo
    cluster_to_level = {}
    labels = ["Casual", "Intermedio", "Competitivo"]
    for i, c in enumerate(sorted_clusters):
        if n_clusters == 2:
            # Con solo 2 clusters: casual y competitivo
            cluster_to_level[c] = labels[i * 2]  # 0->Casual, 1->Competitivo
        else:
            cluster_to_level[c] = labels[i]
    
    # El nivel del jugador es determinado por su temporada más reciente
    latest_cluster = clusters[-1]
    level_name = cluster_to_level.get(latest_cluster, "Casual")
    
    # Valor numérico: 0=Casual, 1=Intermedio, 2=Competitivo
    level_value = sorted_clusters.index(latest_cluster)
    
    return level_name, level_value


# ==========================================
# Predicción de Tendencia (Regresión Lineal)
# ==========================================
def predict_next_season(historical_data):
    """
    Usa regresión lineal simple (numpy polyfit) para predecir
    el KD y Win Rate de la próxima temporada basado en el historial.
    Retorna: (predicted_kd, predicted_wr, trend_direction)
    """
    if len(historical_data) < 2:
        return None, None, 'neutral'
    
    df = pd.DataFrame(historical_data)
    x = np.arange(len(df))
    
    # Regresión lineal para KD
    kd_values = df['kd'].values
    kd_coeffs = np.polyfit(x, kd_values, 1)  # pendiente, intercepto
    predicted_kd = kd_coeffs[0] * len(df) + kd_coeffs[1]
    predicted_kd = db_float(max(0, predicted_kd))  # No puede ser negativo
    
    # Regresión lineal para Win Rate
    wr_values = df['win_rate'].values
    wr_coeffs = np.polyfit(x, wr_values, 1)
    predicted_wr = wr_coeffs[0] * len(df) + wr_coeffs[1]
    predicted_wr = db_float(max(0, min(100, predicted_wr)))  # Entre 0 y 100
    
    # Determinar dirección de la tendencia
    kd_trend = db_float(kd_coeffs[0])  # pendiente
    wr_trend = db_float(wr_coeffs[0])
    
    if kd_trend > 0.01 and wr_trend > 0.01:
        trend = 'up'
    elif kd_trend < -0.01 and wr_trend < -0.01:
        trend = 'down'
    elif kd_trend > 0.01 or wr_trend > 0.01:
        trend = 'slightly_up'
    elif kd_trend < -0.01 or wr_trend < -0.01:
        trend = 'slightly_down'
    else:
        trend = 'stable'
    
    return predicted_kd, predicted_wr, trend


# ==========================================
# Procesamiento de Temporadas Pasadas (Historial Completo)
# ==========================================
def process_past_seasons(conn, account_id, past_seasons):
    """
    Para temporadas pasadas: análisis completo.
    - Guarda cada temporada como punto histórico con deltas
    - Aplica KMeans para clasificación de skill
    - Genera predicción de tendencia con regresión lineal
    """
    history = []
    cur = conn.cursor()
    
    prev_kd = None
    prev_wr = None
    
    for s in past_seasons:
        stats = s.get('stats', {})
        season_name = s.get('seasonName', 'Unknown')
        
        kd = db_float(stats.get('kd', 0))
        win_rate = db_float(stats.get('winRate', 0))
        matches = db_int(stats.get('totalMatches', 0))
        
        # Calcular deltas entre temporadas
        delta_kd = (kd - prev_kd) if prev_kd is not None else 0
        delta_wr = (win_rate - prev_wr) if prev_wr is not None else 0
        
        history.append({
            'season': season_name,
            'kd': kd,
            'win_rate': win_rate,
            'matches': matches
        })
        
        # Guardar puntos históricos en player_progress con deltas reales
        cur.execute("""
            INSERT INTO player_progress (account_id, metric_name, metric_value, delta, period_label)
            VALUES (%s, %s, %s, %s, %s)
        """, (account_id, 'kd_season', kd, db_float(round(delta_kd, 4)), season_name))
        
        cur.execute("""
            INSERT INTO player_progress (account_id, metric_name, metric_value, delta, period_label)
            VALUES (%s, %s, %s, %s, %s)
        """, (account_id, 'win_rate_season', win_rate, db_float(round(delta_wr, 4)), season_name))
        
        # Guardar matches por temporada también
        cur.execute("""
            INSERT INTO player_progress (account_id, metric_name, metric_value, delta, period_label)
            VALUES (%s, %s, %s, %s, %s)
        """, (account_id, 'matches_season', db_float(matches), 0, season_name))
        
        prev_kd = kd
        prev_wr = win_rate
    
    if not history:
        cur.close()
        return
    
    # === Clasificar nivel con KMeans ===
    skill_level, skill_value = classify_player_skill(history)
    
    cur.execute("""
        INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
        VALUES (%s, %s, %s, %s)
        """, (account_id, 'skill_category', db_float(skill_value), 0))
    
    # === Predecir próxima temporada ===
    predicted_kd, predicted_wr, trend = predict_next_season(history)
    
    if predicted_kd is not None:
        # Delta de predicción = diferencia vs última temporada real
        last_kd = history[-1]['kd']
        last_wr = history[-1]['win_rate']
        
        cur.execute("""
            INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
            VALUES (%s, %s, %s, %s)
        """, (account_id, 'predicted_kd_next', db_float(round(predicted_kd, 4)), db_float(round(predicted_kd - last_kd, 4))))
        
        cur.execute("""
            INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
            VALUES (%s, %s, %s, %s)
        """, (account_id, 'predicted_wr_next', db_float(round(predicted_wr, 4)), db_float(round(predicted_wr - last_wr, 4))))
        
        # Guardar dirección de tendencia como valor numérico
        trend_val = {'down': -2, 'slightly_down': -1, 'stable': 0, 'slightly_up': 1, 'up': 2}
        cur.execute("""
            INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
            VALUES (%s, %s, %s, %s)
        """, (account_id, 'trend_direction', db_float(trend_val.get(trend, 0)), 0))
    
    print(f"[ETL-ML] Procesadas {len(history)} temporadas pasadas para {account_id}.")
    print(f"  -> Nivel KMeans: {skill_level} (valor={skill_value})")
    if predicted_kd is not None:
        print(f"  -> Predicción KD: {predicted_kd:.2f}, WR: {predicted_wr:.1f}%, Tendencia: {trend}")
    
    conn.commit()
    cur.close()


# ==========================================
# Procesamiento de Temporada Actual (Recolección Progresiva)
# ==========================================
def process_current_season(conn, account_id, stats_data):
    """
    Para la temporada actual: solo recolectar datos progresivamente.
    Compara con el último snapshot para calcular deltas de sesión.
    NO aplica KMeans ni predicción (aún no hay suficiente data de esta temp).
    """
    metrics = []
    if 'stats' in stats_data:
        s = stats_data['stats']
        metrics.append(('kd', s.get('kd', 0)))
        metrics.append(('win_rate', s.get('winRate', 0)))
    
    if not metrics:
        return
    
    cur = conn.cursor()
    for name, value in metrics:
        try:
            # Obtener último valor registrado para calcular delta
            cur.execute("""
                SELECT metric_value FROM player_progress 
                WHERE account_id = %s AND metric_name = %s 
                ORDER BY created_at DESC LIMIT 1
            """, (account_id, name))
            
            row = cur.fetchone()
            last_value = float(row[0]) if row else None
            current_value = db_float(value)
            delta = (current_value - last_value) if last_value is not None else 0
            
            cur.execute("""
                INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
                VALUES (%s, %s, %s, %s)
            """, (account_id, name, current_value, db_float(round(delta, 4))))
        except Exception as e:
            print(f"Error metric {name}: {e}")
    
    conn.commit()
    cur.close()
    print(f"[ETL] Snapshot de temporada actual guardado para {account_id}")


def _num(value, default=None):
    return db_float(value, default)


def _int_or_none(value):
    number = _num(value)
    return int(number) if number is not None else None


def _first_num(record, keys):
    for key in keys:
        value = _num(record.get(key))
        if value is not None and value >= 0:
            return value
    return None


def _normalize_tournament_placements(event, data, account_id):
    if isinstance(data.get('placements'), list):
        return [p for p in data['placements'] if p and p.get('eventWindowId')]

    players = data.get('players') if isinstance(data.get('players'), list) else []
    event_window_id = event.get('parameters', {}).get('eventWindowId')
    if not event_window_id:
        return []

    placements = []
    for player in players:
        placements.append({
            'accountId': account_id,
            'epicUsername': player.get('epicUsername') or player.get('displayName'),
            'eventId': event.get('parameters', {}).get('eventId') or player.get('eventId'),
            'eventWindowId': event_window_id,
            'placement': _first_num(player, ['placement', 'rank', 'eventRank', 'pointsRank', 'scoreRank', 'totalPointsRank']),
            'points': _first_num(player, ['points', 'score', 'totalPoints']),
            'eliminations': _first_num(player, ['eliminations', 'kills']),
            'assists': _first_num(player, ['assists']),
            'avgPlacement': _num(player.get('avgPlacement')),
            'totalMatches': _first_num(player, ['matches', 'totalMatches']),
            'raw': player,
        })
    return placements


def process_tournament_placements(conn, account_id, event, data):
    """
    Persiste placements de torneos y genera métricas compactas para clasificar
    perfil competitivo: consistencia, volumen, puntos y eliminaciones.
    """
    placements = _normalize_tournament_placements(event, data, account_id)
    if not placements:
        return

    cur = conn.cursor()
    numeric_placements = []
    points_values = []
    elimination_values = []

    for placement in placements:
        event_window_id = placement.get('eventWindowId')
        if not event_window_id:
            continue

        rank = _int_or_none(placement.get('placement'))
        points = _num(placement.get('points'))
        eliminations = _num(placement.get('eliminations'))
        assists = _num(placement.get('assists'))
        avg_placement = _num(placement.get('avgPlacement'))
        total_matches = _int_or_none(placement.get('totalMatches'))

        cur.execute("""
            INSERT INTO player_tournament_placements (
                account_id, epic_username, event_id, event_window_id, placement,
                points, eliminations, assists, avg_placement, total_matches, tournament_data
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (account_id, event_window_id)
            DO UPDATE SET
                epic_username = EXCLUDED.epic_username,
                event_id = EXCLUDED.event_id,
                placement = EXCLUDED.placement,
                points = EXCLUDED.points,
                eliminations = EXCLUDED.eliminations,
                assists = EXCLUDED.assists,
                avg_placement = EXCLUDED.avg_placement,
                total_matches = EXCLUDED.total_matches,
                tournament_data = EXCLUDED.tournament_data,
                captured_at = NOW()
        """, (
            account_id,
            placement.get('epicUsername'),
            placement.get('eventId'),
            event_window_id,
            rank,
            points,
            eliminations,
            assists,
            avg_placement,
            total_matches,
            json.dumps(placement.get('raw', placement), default=json_default)
        ))

        if rank is not None:
            numeric_placements.append(rank)
            cur.execute("""
                INSERT INTO player_progress (account_id, metric_name, metric_value, delta, period_label)
                VALUES (%s, %s, %s, %s, %s)
            """, (account_id, 'tournament_placement', rank, 0, event_window_id))
        if points is not None:
            points_values.append(points)
        if eliminations is not None:
            elimination_values.append(eliminations)

    if numeric_placements:
        best = min(numeric_placements)
        avg_rank = db_float(np.mean(numeric_placements))
        top_10 = sum(1 for rank in numeric_placements if rank <= 10)
        top_25 = sum(1 for rank in numeric_placements if rank <= 25)
        top_100 = sum(1 for rank in numeric_placements if rank <= 100)
        top_500 = sum(1 for rank in numeric_placements if rank <= 500)
        top_1000 = sum(1 for rank in numeric_placements if rank <= 1000)
        events_count = len(numeric_placements)
        # Higher is better: rewards top finishes, consistency and volume.
        # Tournament history is a better pro signal than public lifetime KD/WR.
        placement_power = db_float(np.mean([100 / np.log10(max(rank, 2)) for rank in numeric_placements]))
        consistency_bonus = (
            top_10 * 24 +
            top_25 * 14 +
            top_100 * 7 +
            top_500 * 2.5 +
            min(events_count, 60) * 0.55
        )
        placement_score = db_float(min(100, placement_power + consistency_bonus))
        skill_value = classify_competitive_profile(placement_score, best, top_25, top_100, top_500)

        aggregate_metrics = [
            ('tournament_events_count', events_count),
            ('tournament_best_placement', best),
            ('tournament_avg_placement', db_float(round(avg_rank, 4))),
            ('tournament_top_10_count', top_10),
            ('tournament_top_25_count', top_25),
            ('tournament_top_100_count', top_100),
            ('tournament_top_500_count', top_500),
            ('tournament_top_1000_count', top_1000),
            ('tournament_profile_score', db_float(round(placement_score, 4))),
            ('competitive_power_score', db_float(round(placement_score, 4))),
            ('skill_category', skill_value),
        ]
        if points_values:
            aggregate_metrics.append(('tournament_avg_points', db_float(round(db_float(np.mean(points_values)), 4))))
        if elimination_values:
            aggregate_metrics.append(('tournament_avg_eliminations', db_float(round(db_float(np.mean(elimination_values)), 4))))

        for metric_name, metric_value in aggregate_metrics:
            cur.execute("""
                INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
                VALUES (%s, %s, %s, %s)
            """, (account_id, metric_name, db_float(metric_value), 0))

    conn.commit()
    cur.close()
    print(f"[ETL-Tournaments] Procesados {len(placements)} placements para {account_id}.")


def classify_competitive_profile(score, best, top_25, top_100, top_500):
    """
    0..5 compatible con UI:
    5=S Elite/Pro, 4=A Competitivo, 3=B Avanzado.
    Prioriza evidencia de torneos para no degradar pros con stats publicas ruidosas.
    """
    if score >= 88 or best <= 10 or top_25 >= 2 or top_100 >= 5:
        return 5
    if score >= 72 or best <= 75 or top_100 >= 2 or top_500 >= 6:
        return 4
    if score >= 36 or best <= 1000:
        return 3
    return 2


# ==========================================
# Análisis de Replays de Fortnite
# ==========================================
def load_fortnite_replays(conn, player_id, display_name=None):
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
    if df.empty:
        return None
    features_df = df.copy()
    numeric_cols = ['eliminations', 'deaths', 'damage_to_players', 'damage_from_players',
                    'accuracy_percent', 'assists', 'revives', 'materials_gathered',
                    'materials_used', 'total_traveled', 'duration_seconds']
    for col in numeric_cols:
        features_df[col] = pd.to_numeric(features_df[col], errors='coerce').fillna(0)

    features_df['kd'] = features_df.apply(lambda r: r['eliminations'] / max(r['deaths'], 1), axis=1)
    features_df['damage_ratio'] = features_df.apply(lambda r: r['damage_to_players'] / max(r['damage_from_players'], 1), axis=1)
    features_df['placement_inv'] = features_df['placement'].apply(lambda p: 1 / max(p, 1) if pd.notna(p) else 0)
    return features_df


def classify_fortnite_playstyle(features_df):
    if features_df is None or len(features_df) < 3:
        return "Insuficientes datos", 0

    feature_cols = ['kd', 'damage_to_players', 'damage_ratio', 'placement_inv',
                    'materials_gathered', 'materials_used', 'total_traveled']
    X = features_df[feature_cols].values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    n_clusters = min(3, len(features_df))
    kmeans = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
    clusters = kmeans.fit_predict(X_scaled)

    labels = []
    for c in range(n_clusters):
        centroid = kmeans.cluster_centers_[c]
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

    unique, counts = np.unique(clusters, return_counts=True)
    dominant_cluster = unique[np.argmax(counts)]
    dominant_label = labels[dominant_cluster]
    return dominant_label, int(dominant_cluster)


def analyze_fortnite_trends(features_df):
    if features_df is None or len(features_df) < 2:
        return {}

    trends = {}
    metrics = ['kd', 'placement', 'damage_to_players', 'accuracy_percent']
    x = np.arange(len(features_df))

    for metric in metrics:
        values = features_df[metric].values
        valid_mask = ~np.isnan(values)
        if valid_mask.sum() < 2:
            continue
        coeffs = np.polyfit(x[valid_mask], values[valid_mask], 1)
        slope = coeffs[0]
        trends[f'{metric}_trend_slope'] = round(float(slope), 6)

        if metric == 'placement':
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

    if 'kd_trend_slope' in trends and len(features_df) >= 2:
        last_kd = features_df['kd'].iloc[-1]
        predicted_kd = last_kd + trends['kd_trend_slope']
        trends['predicted_kd_next'] = round(max(0, predicted_kd), 4)

    return trends


def save_fortnite_replay_metrics(conn, player_id, display_name, features_df, playstyle_label, playstyle_value, trends):
    cur = conn.cursor()
    total_matches = len(features_df)
    avg_kd = db_float(round(db_float(features_df['kd'].mean()), 4)) if not features_df['kd'].isna().all() else 0
    avg_placement = db_float(round(db_float(features_df['placement'].mean()), 4)) if not features_df['placement'].isna().all() else 0
    avg_damage = db_float(round(db_float(features_df['damage_to_players'].mean()), 4)) if not features_df['damage_to_players'].isna().all() else 0
    avg_accuracy = db_float(round(db_float(features_df['accuracy_percent'].mean()), 4)) if not features_df['accuracy_percent'].isna().all() else 0
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
            continue
        cur.execute("""
            INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
            VALUES (%s, %s, %s, %s)
        """, (player_id, metric_name, float(metric_value), 0))

    for key, value in trends.items():
        if isinstance(value, (int, float)):
            cur.execute("""
                INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
                VALUES (%s, %s, %s, %s)
            """, (player_id, f'fortnite_replay_{key}', float(value), 0))

    win_rate = round((wins / max(total_matches, 1)) * 100, 4)
    kills = int(features_df['eliminations'].sum()) if not features_df['eliminations'].isna().all() else 0
    deaths = int(features_df['deaths'].sum()) if not features_df['deaths'].isna().all() else 0

    cur.execute("""
        INSERT INTO player_analysis_snapshots (
            account_id, kd, win_rate, matches, kills, score_per_match
        ) VALUES (%s, %s, %s, %s, %s, %s)
    """, (player_id, db_float(avg_kd), db_float(win_rate), db_int(total_matches), db_int(kills), db_float(avg_damage)))

    conn.commit()
    cur.close()
    print(f"[ETL-FN] Guardadas métricas para {display_name or player_id}: {total_matches} matches, estilo={playstyle_label}")


def process_fortnite_replays(conn, data):
    player_id = data.get('player', {}).get('playerId')
    display_name = data.get('player', {}).get('displayName')

    if not player_id and not display_name:
        return

    features_df = compute_replay_features(load_fortnite_replays(conn, player_id, display_name))
    if features_df is None or features_df.empty:
        print(f"[ETL-FN] No hay replays para procesar: {display_name or player_id}")
        return

    playstyle_label, playstyle_value = classify_fortnite_playstyle(features_df)
    trends = analyze_fortnite_trends(features_df)
    save_fortnite_replay_metrics(conn, player_id or display_name, display_name, features_df,
                                  playstyle_label, playstyle_value, trends)


# ==========================================
# Lógica de Transformación Principal
# ==========================================
def transform_and_save(conn, event):
    action = event.get('action')
    data = event.get('responseBody')
    
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except:
            return

    if not data or event.get('responseStatus') != 200:
        return

    account_id = event.get('parameters', {}).get('accountId') or event.get('parameters', {}).get('epicIds') or data.get('accountId')
    if not account_id:
        return

    if action in ('player-tournament-placements', 'tournament-player-stats'):
        process_tournament_placements(conn, account_id, event, data)
        return

    if action == 'fortnite-replay-parse':
        process_fortnite_replays(conn, data)
        return

    # 1. Procesar temporadas pasadas (análisis completo + KMeans + predicción)
    if 'pastSeasons' in data:
        past_seasons = data['pastSeasons']
        if past_seasons and len(past_seasons) > 0:
            process_past_seasons(conn, account_id, past_seasons)

    # 2. Procesar temporada actual (recolección progresiva de snapshots)
    if 'stats' in data:
        process_current_season(conn, account_id, data)


def persist_dead_letter(conn, message, error):
    try:
        conn.rollback()
        key = message.key.decode('utf-8') if isinstance(message.key, bytes) else message.key
        raw_value = json.dumps(message.value, default=json_default)
        if len(raw_value) > 20000:
            raw_value = raw_value[:20000] + '... [truncated]'
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO stream_dead_letters (
                topic, partition_id, offset_value, message_key, raw_value, error_message
            ) VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            message.topic,
            message.partition,
            str(message.offset),
            key,
            raw_value,
            str(error)
        ))
        conn.commit()
        cur.close()
    except Exception as dlq_error:
        try:
            conn.rollback()
        except Exception:
            pass
        print(f"Error guardando DLQ ETL: {dlq_error}")

def main():
    consumer = get_kafka_consumer()
    conn = get_db_connection()
    try:
        for message in consumer:
            try:
                transform_and_save(conn, message.value)
            except Exception as e:
                print(f"Error procesando evento ETL: {e}")
                persist_dead_letter(conn, message, e)
    except Exception as e:
        print(f"Error Loop: {e}")
    finally:
        consumer.close()
        conn.close()

if __name__ == "__main__":
    main()
