"""
ML Model Training Module for Pipe.AI — 6 Quantitative Geo-Hazard Determinants Classifier & Regressor
"""

from pathlib import Path
import csv
import numpy as np
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, mean_squared_error
import joblib

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
MODEL_PATH = DATA_DIR / "location_model.joblib"
REGRESSOR_PATH = DATA_DIR / "pof_regressor.joblib"
FEATURES_PATH = DATA_DIR / "location_features.csv"


def load_dataset():
    with FEATURES_PATH.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = [row for row in reader]

    X = []
    y_class = []
    y_prob = []

    for row in rows:
        feat = [
            float(row["flooding_index"]),
            float(row["earthquake_factor"]),
            float(row["erosion_factor"]),
            float(row["landslide_index"]),
            float(row["soil_corrosivity_index"]),
            float(row["hoop_stress_ratio"]),
            float(row["slope_deg"]),
            float(row["elevation"]),
            float(row["river_proximity_km"]),
            float(row["fault_distance_km"]),
            float(row["operating_pressure_psig"]),
            float(row["pipe_diameter_inches"]),
            float(row["design_wall_thickness_mm"]),
        ]
        X.append(feat)
        y_class.append(row["risk_class"])
        y_prob.append(float(row["failure_probability"]))

    return np.array(X), np.array(y_class), np.array(y_prob)


def train_models():
    print("Loading KP feature dataset with 6 Quantitative Determinants...")
    X, y_class, y_prob = load_dataset()

    X_train, X_test, y_train_c, y_test_c, y_train_p, y_test_p = train_test_split(
        X, y_class, y_prob, test_size=0.2, random_state=42
    )

    # 1. Train Classification Model
    clf = RandomForestClassifier(n_estimators=150, random_state=42)
    clf.fit(X_train, y_train_c)
    preds_c = clf.predict(X_test)
    print("\n--- Classification Report ---")
    print(classification_report(y_test_c, preds_c, zero_division=0))

    joblib.dump(clf, MODEL_PATH)
    print(f"[OK] Classification model saved to {MODEL_PATH}")

    # 2. Train Regressor Model for Probability of Failure %
    reg = RandomForestRegressor(n_estimators=150, random_state=42)
    reg.fit(X_train, y_train_p)
    preds_p = reg.predict(X_test)
    mse = mean_squared_error(y_test_p, preds_p)
    print(f"\n--- Regressor Evaluation ---")
    print(f"Mean Squared Error (MSE): {mse:.6f}")

    joblib.dump(reg, REGRESSOR_PATH)
    print(f"[OK] Regressor model saved to {REGRESSOR_PATH}")


if __name__ == "__main__":
    train_models()
