"""
Entraîne un modèle XGBoost calibré (remplace train_calibrated_model.py qui
utilisait RandomForest + données 100% synthétiques).

Utilise le vrai dataset PaySim (data/paysim.csv, comme benchmark_fraud.py),
avec les 9 features de main.py::preprocess_transaction. Produit
model_fraud_calibrated.pkl, directement chargé par main.py au démarrage.

Usage :
    pip install xgboost --break-system-packages
    python train_xgboost_calibrated.py
"""

import os
import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    auc,
    classification_report,
    confusion_matrix,
    precision_recall_curve,
)
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from features import FEATURE_NAMES, receiver_balance_error, sender_balance_error

# Les 9 premières features de FEATURE_NAMES = celles réellement calculées
# par main.py::preprocess_transaction aujourd'hui.
ACTIVE_FEATURES = FEATURE_NAMES
CSV_PATH = "data/paysim.csv"
OUTPUT_PATH = "model_fraud_calibrated.pkl"
N_ROWS = 1_000_000  # aligné sur benchmark_fraud.py


def load_and_engineer(csv_path: str) -> tuple[pd.DataFrame, pd.Series]:
    if not os.path.exists(csv_path):
        raise FileNotFoundError(
            f"'{csv_path}' introuvable. Placez PaySim (Kaggle) dans data/, "
            "ou voir la note en bas pour un dataset alternatif."
        )

    df = pd.read_csv(csv_path, nrows=N_ROWS)

    df["sender_balance_error"] = sender_balance_error(
        df["amount"], df["oldbalanceOrg"], df["newbalanceOrig"]
    )
    df["receiver_balance_error"] = receiver_balance_error(
        df["amount"], df["oldbalanceDest"], df["newbalanceDest"]
    )
    df["is_transfer"] = (df["type"] == "TRANSFER").astype(int)
    df["is_cash_out"] = (df["type"] == "CASH_OUT").astype(int)

    
    # --- Calcul des 4 nouvelles features V2 ---
    # 1. L'heure de la journée (Kaggle utilise 'step' qui représente 1 heure)
    df["hour_of_day"] = df["step"] % 24
    
    # 2. Ratio du montant par rapport à la moyenne du client
    # On calcule la moyenne par envoyeur (nameOrig)
    df["amount_to_avg_ratio"] = df["amount"] / df.groupby("nameOrig")["amount"].transform("mean")
    df["amount_to_avg_ratio"] = df["amount_to_avg_ratio"].fillna(1.0)
    
    # 3. Jours depuis la dernière transaction (valeur neutre par défaut pour Kaggle)
    df["days_since_last_tx"] = 5.0
    
    # 4. Nombre de transactions passées vers ce bénéficiaire
    df["beneficiary_tx_count"] = df.groupby("nameDest").cumcount()

    # (Laissez la ligne X = df[ACTIVE_FEATURES] juste en dessous)
    X = df[ACTIVE_FEATURES]
    y = df["isFraud"]
    return X, y


def find_optimal_threshold(y_true, y_proba) -> float:
    """Seuil qui maximise le F1-score sur la classe minoritaire (plutôt que 0.5 fixe)."""
    precision, recall, thresholds = precision_recall_curve(y_true, y_proba)
    f1_scores = np.divide(
        2 * precision * recall,
        precision + recall,
        out=np.zeros_like(precision),
        where=(precision + recall) != 0,
    )
    best_idx = np.argmax(f1_scores[:-1])  # thresholds a un élément de moins
    return float(thresholds[best_idx]), float(f1_scores[best_idx])


def main() -> None:
    print("⏳ Chargement et feature engineering (PaySim)...")
    X, y = load_and_engineer(CSV_PATH)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    scale_pos_weight = (y_train == 0).sum() / max((y_train == 1).sum(), 1)
    print(f"⚖️  scale_pos_weight calculé : {scale_pos_weight:.1f}")

    print("\n🏋️ Entraînement XGBoost (base, avant calibration)...")
    base_model = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        eval_metric="aucpr",
        random_state=42,
        n_jobs=-1,
    )

    print("⚙️  Calibration isotonique (probabilités exploitables telles quelles)...")
    calibrated_model = CalibratedClassifierCV(
        estimator=base_model,
        method="isotonic",
        cv=5,
    )
    calibrated_model.fit(X_train, y_train)

    print("\n📊 Évaluation...")
    y_proba = calibrated_model.predict_proba(X_test)[:, 1]

    optimal_threshold, best_f1 = find_optimal_threshold(y_test, y_proba)
    print(f"🎯 Seuil optimal (F1 max) : {optimal_threshold:.4f} (F1={best_f1:.4f})")
    print(f"   Pour référence, le seuil fixe actuel dans main.py est 0.50")

    y_pred_default = (y_proba >= 0.5).astype(int)
    y_pred_optimal = (y_proba >= optimal_threshold).astype(int)

    precision, recall, _ = precision_recall_curve(y_test, y_proba)
    auc_pr = auc(recall, precision)

    print("\n=== RAPPORT (seuil 0.50, comme aujourd'hui en prod) ===")
    print(classification_report(y_test, y_pred_default, target_names=["Légitime", "Fraude"]))
    print(confusion_matrix(y_test, y_pred_default))

    print(f"\n=== RAPPORT (seuil optimal {optimal_threshold:.4f}) ===")
    print(classification_report(y_test, y_pred_optimal, target_names=["Légitime", "Fraude"]))
    print(confusion_matrix(y_test, y_pred_optimal))

    print(f"\n📈 AUC-PR : {auc_pr:.4f}")
    print(f"   (comparez ce chiffre à celui affiché par benchmark_fraud.py pour le RandomForest actuel)")

    joblib.dump(calibrated_model, OUTPUT_PATH)
    print(f"\n✅ Modèle sauvegardé : '{OUTPUT_PATH}'")
    print("   main.py le chargera automatiquement au prochain redémarrage")
    print("   (MODEL_PATH préfère déjà model_fraud_calibrated.pkl s'il existe).")

    if abs(optimal_threshold - 0.5) > 0.1:
        print(
            f"\n💡 Le seuil optimal ({optimal_threshold:.2f}) diverge du seuil fixe 0.5 "
            "utilisé dans main.py (`model_flag = raw_ml_probability > 0.50`). "
            "On pourra en discuter à l'étape 'règles métier' pour le rendre configurable."
        )


if __name__ == "__main__":
    main()