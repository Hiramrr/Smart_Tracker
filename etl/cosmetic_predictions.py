import json
import os
from datetime import date, timedelta

import numpy as np
import pandas as pd
import psycopg2
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import OneHotEncoder


DATABASE_URL = os.getenv("DATABASE_URL")
MODEL_NAME = "cosmetic_shop_gap_random_forest_v1"


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL no esta configurada")
    return psycopg2.connect(DATABASE_URL)


def load_features(conn):
    return pd.read_sql_query(
        """
        SELECT
            cosmetic_id,
            name,
            type,
            rarity,
            series,
            appearances_count,
            first_seen,
            last_seen,
            days_since_last_seen,
            avg_days_between_appearances,
            stddev_days_between_appearances,
            estimated_days_until_next_shop
        FROM v_cosmetic_prediction_features
        WHERE appearances_count >= 3
          AND avg_days_between_appearances IS NOT NULL
          AND days_since_last_seen IS NOT NULL
        """,
        conn,
    )


def build_training_rows(conn):
    appearances = pd.read_sql_query(
        """
        SELECT
            a.cosmetic_id,
            c.type,
            c.rarity,
            c.series,
            a.shop_date
        FROM cosmetic_shop_appearances a
        JOIN cosmetics c ON c.cosmetic_id = a.cosmetic_id
        ORDER BY a.cosmetic_id, a.shop_date
        """,
        conn,
    )
    if appearances.empty:
        return appearances

    appearances["shop_date"] = pd.to_datetime(appearances["shop_date"])
    appearances["previous_shop_date"] = appearances.groupby("cosmetic_id")["shop_date"].shift(1)
    appearances["target_gap_days"] = (
        appearances["shop_date"] - appearances["previous_shop_date"]
    ).dt.days
    appearances["appearance_index"] = appearances.groupby("cosmetic_id").cumcount()
    return appearances.dropna(subset=["target_gap_days"])


def train_model(training):
    categorical = training[["type", "rarity", "series"]].fillna("unknown")
    encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
    categorical_matrix = encoder.fit_transform(categorical)
    numeric_matrix = training[["appearance_index"]].to_numpy(dtype=float)
    x_train = np.hstack([numeric_matrix, categorical_matrix])
    y_train = training["target_gap_days"].to_numpy(dtype=float)

    model = RandomForestRegressor(
        n_estimators=200,
        min_samples_leaf=2,
        random_state=42,
    )
    model.fit(x_train, y_train)
    return model, encoder


def predict_features(features, model, encoder):
    categorical = features[["type", "rarity", "series"]].fillna("unknown")
    categorical_matrix = encoder.transform(categorical)
    numeric_matrix = features[["appearances_count"]].to_numpy(dtype=float)
    x_pred = np.hstack([numeric_matrix, categorical_matrix])
    predicted_gap = model.predict(x_pred)

    predictions = features.copy()
    predictions["predicted_days_until_next"] = np.maximum(
        0,
        predicted_gap - predictions["days_since_last_seen"].to_numpy(dtype=float),
    )
    predictions["confidence_score"] = np.minimum(
        1.0,
        np.log1p(predictions["appearances_count"].to_numpy(dtype=float)) / np.log1p(60),
    )
    return predictions


def store_predictions(conn, predictions):
    cur = conn.cursor()
    today = date.today()

    for _, row in predictions.iterrows():
        predicted_days = float(row["predicted_days_until_next"])
        predicted_date = today + timedelta(days=int(round(predicted_days)))
        features = {
            "appearances_count": int(row["appearances_count"]),
            "days_since_last_seen": int(row["days_since_last_seen"]),
            "avg_days_between_appearances": float(row["avg_days_between_appearances"]),
            "stddev_days_between_appearances": None
            if pd.isna(row["stddev_days_between_appearances"])
            else float(row["stddev_days_between_appearances"]),
            "type": row["type"],
            "rarity": row["rarity"],
            "series": row["series"],
        }

        cur.execute(
            """
            INSERT INTO cosmetic_predictions (
                cosmetic_id,
                predicted_days_until_next,
                predicted_next_shop_date,
                confidence_score,
                model_name,
                features
            ) VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                row["cosmetic_id"],
                round(predicted_days, 2),
                predicted_date,
                round(float(row["confidence_score"]), 4),
                MODEL_NAME,
                json.dumps(features),
            ),
        )

    conn.commit()
    cur.close()


def main():
    conn = get_connection()
    try:
        training = build_training_rows(conn)
        features = load_features(conn)

        if len(training) < 20 or features.empty:
            print("[CosmeticML] No hay suficientes datos historicos para entrenar.")
            return

        model, encoder = train_model(training)
        predictions = predict_features(features, model, encoder)
        store_predictions(conn, predictions)
        print(f"[CosmeticML] Predicciones guardadas: {len(predictions)}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
