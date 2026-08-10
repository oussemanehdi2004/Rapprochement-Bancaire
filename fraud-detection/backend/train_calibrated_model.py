import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split


def generate_synthetic_data(n_samples: int = 10000):
    """
    Génère un jeu de données synthétique basé sur les 9 variables de features.py.
    Remplacez cette fonction par le chargement de votre vrai CSV si disponible.
    """
    np.random.seed(42)

    # 1. Montants et soldes
    amounts = np.random.exponential(scale=1500, size=n_samples) + 10.0
    sender_before = np.random.uniform(100, 50000, size=n_samples)
    is_transfer = np.random.choice([1, 0], size=n_samples, p=[0.7, 0.3])
    is_cash_out = 1 - is_transfer

    sender_after = np.maximum(0.0, sender_before - amounts)
    receiver_before = np.random.uniform(0, 20000, size=n_samples)
    receiver_after = receiver_before + amounts

    # Erreurs de solde
    sender_err = np.round((sender_before - amounts) - sender_after, 2)
    receiver_err = np.round((receiver_before + amounts) - receiver_after, 2)

    X = np.column_stack([
        amounts,
        sender_before,
        sender_after,
        receiver_before,
        receiver_after,
        sender_err,
        receiver_err,
        is_transfer,
        is_cash_out,
    ])

    # Simulation d'un risque continu pour l'étiquette 'y'
    fraud_score = (
        (amounts > 5000).astype(float) * 0.35 +
        (sender_err != 0).astype(float) * 0.40 +
        (is_cash_out * (amounts > 2000)).astype(float) * 0.25 +
        np.random.normal(0, 0.1, size=n_samples)
    )

    y = (fraud_score > 0.45).astype(int)
    return X, y


def train_and_export_calibrated_model():
    print(" Préparation des données d'entraînement...")

    # Si vous avez un fichier CSV réel, décommentez les lignes ci-dessous :
    # df = pd.read_csv("votre_dataset.csv")
    # X = df[FEATURE_NAMES].values
    # y = df["is_fraud"].values

    X, y = generate_synthetic_data(n_samples=10000)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(" Entraînement du modèle Random Forest...")
    base_model = RandomForestClassifier(
        n_estimators=150,
        max_depth=8,
        min_samples_leaf=3,
        random_state=42,
        n_jobs=-1,
    )

    print("⚙️ Application de la calibration Isotonique (etallements des probabilités)...")
    calibrated_model = CalibratedClassifierCV(
        estimator=base_model,
        method="isotonic",
        cv=5,
    )

    calibrated_model.fit(X_train, y_train)

    # Vérification de la distribution des probabilités obtenues
    probas = calibrated_model.predict_proba(X_test)[:, 1]

    print("\n Vérification de la variance des probabilités :")
    print(f"   - Minimum : {probas.min() * 100:.2f}%")
    print(f"   - Maximum : {probas.max() * 100:.2f}%")
    print(f"   - Moyenne : {probas.mean() * 100:.2f}%")
    print(f"   - Échantillon de scores générés : {np.round(probas[:8] * 100, 1)}%")

    output_filename = "model_fraud_calibrated.pkl"
    joblib.dump(calibrated_model, output_filename)
    print(f"\n Modèle sauvegardé avec succès : '{output_filename}'")


if __name__ == "__main__":
    train_and_export_calibrated_model()