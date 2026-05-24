import json
import os
import time
import psycopg2
import pandas as pd
import numpy as np
from kafka import KafkaConsumer
from sklearn.cluster import KMeans

# ==========================================
# Configuración
# ==========================================
KAFKA_BROKER = os.getenv('KAFKA_BROKER', 'kafka:29092')
KAFKA_TOPIC = os.getenv('KAFKA_TOPIC', 'api-calls')
DATABASE_URL = os.getenv('DATABASE_URL')

print(f"--- Iniciando Servicio ETL Avanzado (Python) ---")
print(f"ML Stack: Pandas + Scikit-Learn (KMeans 3-Clusters + Regresión Lineal)")

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
    predicted_kd = max(0, predicted_kd)  # No puede ser negativo
    
    # Regresión lineal para Win Rate
    wr_values = df['win_rate'].values
    wr_coeffs = np.polyfit(x, wr_values, 1)
    predicted_wr = wr_coeffs[0] * len(df) + wr_coeffs[1]
    predicted_wr = max(0, min(100, predicted_wr))  # Entre 0 y 100
    
    # Determinar dirección de la tendencia
    kd_trend = kd_coeffs[0]  # pendiente
    wr_trend = wr_coeffs[0]
    
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
        
        kd = float(stats.get('kd', 0))
        win_rate = float(stats.get('winRate', 0))
        matches = int(stats.get('totalMatches', 0))
        
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
        """, (account_id, 'kd_season', kd, round(delta_kd, 4), season_name))
        
        cur.execute("""
            INSERT INTO player_progress (account_id, metric_name, metric_value, delta, period_label)
            VALUES (%s, %s, %s, %s, %s)
        """, (account_id, 'win_rate_season', win_rate, round(delta_wr, 4), season_name))
        
        # Guardar matches por temporada también
        cur.execute("""
            INSERT INTO player_progress (account_id, metric_name, metric_value, delta, period_label)
            VALUES (%s, %s, %s, %s, %s)
        """, (account_id, 'matches_season', matches, 0, season_name))
        
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
    """, (account_id, 'skill_category', float(skill_value), 0))
    
    # === Predecir próxima temporada ===
    predicted_kd, predicted_wr, trend = predict_next_season(history)
    
    if predicted_kd is not None:
        # Delta de predicción = diferencia vs última temporada real
        last_kd = history[-1]['kd']
        last_wr = history[-1]['win_rate']
        
        cur.execute("""
            INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
            VALUES (%s, %s, %s, %s)
        """, (account_id, 'predicted_kd_next', round(predicted_kd, 4), round(predicted_kd - last_kd, 4)))
        
        cur.execute("""
            INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
            VALUES (%s, %s, %s, %s)
        """, (account_id, 'predicted_wr_next', round(predicted_wr, 4), round(predicted_wr - last_wr, 4)))
        
        # Guardar dirección de tendencia como valor numérico
        trend_val = {'down': -2, 'slightly_down': -1, 'stable': 0, 'slightly_up': 1, 'up': 2}
        cur.execute("""
            INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
            VALUES (%s, %s, %s, %s)
        """, (account_id, 'trend_direction', float(trend_val.get(trend, 0)), 0))
    
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
            delta = (float(value) - last_value) if last_value is not None else 0
            
            cur.execute("""
                INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
                VALUES (%s, %s, %s, %s)
            """, (account_id, name, value, round(delta, 4)))
        except Exception as e:
            print(f"Error metric {name}: {e}")
    
    conn.commit()
    cur.close()
    print(f"[ETL] Snapshot de temporada actual guardado para {account_id}")


def _num(value, default=None):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


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
            json.dumps(placement.get('raw', placement))
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
        avg_rank = float(np.mean(numeric_placements))
        top_10 = sum(1 for rank in numeric_placements if rank <= 10)
        top_25 = sum(1 for rank in numeric_placements if rank <= 25)
        top_100 = sum(1 for rank in numeric_placements if rank <= 100)
        top_500 = sum(1 for rank in numeric_placements if rank <= 500)
        top_1000 = sum(1 for rank in numeric_placements if rank <= 1000)
        events_count = len(numeric_placements)
        # Higher is better: rewards top finishes, consistency and volume.
        # Tournament history is a better pro signal than public lifetime KD/WR.
        placement_power = np.mean([100 / np.log10(max(rank, 2)) for rank in numeric_placements])
        consistency_bonus = (
            top_10 * 24 +
            top_25 * 14 +
            top_100 * 7 +
            top_500 * 2.5 +
            min(events_count, 60) * 0.55
        )
        placement_score = min(100, placement_power + consistency_bonus)
        skill_value = classify_competitive_profile(placement_score, best, top_25, top_100, top_500)

        aggregate_metrics = [
            ('tournament_events_count', events_count),
            ('tournament_best_placement', best),
            ('tournament_avg_placement', round(avg_rank, 4)),
            ('tournament_top_10_count', top_10),
            ('tournament_top_25_count', top_25),
            ('tournament_top_100_count', top_100),
            ('tournament_top_500_count', top_500),
            ('tournament_top_1000_count', top_1000),
            ('tournament_profile_score', round(float(placement_score), 4)),
            ('competitive_power_score', round(float(placement_score), 4)),
            ('skill_category', skill_value),
        ]
        if points_values:
            aggregate_metrics.append(('tournament_avg_points', round(float(np.mean(points_values)), 4)))
        if elimination_values:
            aggregate_metrics.append(('tournament_avg_eliminations', round(float(np.mean(elimination_values)), 4)))

        for metric_name, metric_value in aggregate_metrics:
            cur.execute("""
                INSERT INTO player_progress (account_id, metric_name, metric_value, delta)
                VALUES (%s, %s, %s, %s)
            """, (account_id, metric_name, metric_value, 0))

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

    # 1. Procesar temporadas pasadas (análisis completo + KMeans + predicción)
    if 'pastSeasons' in data:
        past_seasons = data['pastSeasons']
        if past_seasons and len(past_seasons) > 0:
            process_past_seasons(conn, account_id, past_seasons)

    # 2. Procesar temporada actual (recolección progresiva de snapshots)
    if 'stats' in data:
        process_current_season(conn, account_id, data)

def main():
    consumer = get_kafka_consumer()
    conn = get_db_connection()
    try:
        for message in consumer:
            transform_and_save(conn, message.value)
    except Exception as e:
        print(f"Error Loop: {e}")
    finally:
        consumer.close()
        conn.close()

if __name__ == "__main__":
    main()
