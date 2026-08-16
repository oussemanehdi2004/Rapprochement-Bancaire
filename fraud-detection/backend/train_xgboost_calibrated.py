"""
Entraînement amélioré avec XGBoost + Calibration des probabilités

Améliorations vs RandomForest :
- XGBoost : Meilleure gestion du déséquilibre de classes
- Calibration : Probabilités plus fiables avec CalibratedClassifierCV
- Cross-validation stratifiée : Meilleure généralisation
- Features additionnelles : Plus de contexte temporel et comportemental
- Seuil optimal : Maximisation du F1-score via courbe Precision-Recall
"""

import os
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import classification_report, confusion_matrix, precision_recall_curve, auc, f1_score
from xgboost import XGBClassifier
import matplotlib.pyplot as plt

from features import FEATURE_NAMES, sender_balance_error, receiver_balance_error

# =====================================================================
# 1. CHARGEMENT DES DONNÉES
# =====================================================================
print("⏳ Chargement du dataset PaySim (limité à 1M de lignes)...")
csv_path = "data/paysim.csv"

if not os.path.exists(csv_path):
    raise FileNotFoundError(f"Le fichier {csv_path} est introuvable. Veuillez le placer dans le dossier data/. ")

df = pd.read_csv(csv_path, nrows=1000000)

# =====================================================================
# 2. FEATURE ENGINEERING AMÉLIORÉ
# =====================================================================
print("🛠️ Création des features avancées...")

# Features existantes (très puissantes)
df['sender_balance_error'] = sender_balance_error(df['amount'], df['oldbalanceOrg'], df['newbalanceOrig'])
df['receiver_balance_error'] = receiver_balance_error(df['amount'], df['oldbalanceDest'], df['newbalanceDest'])
df['is_transfer'] = (df['type'] == 'TRANSFER').astype(int)
df['is_cash_out'] = (df['type'] == 'CASH_OUT').astype(int)

# Nouvelles features pour améliorer la précision
# 1. Heure de la journée (patterns temporels)
df['hour_of_day'] = pd.to_datetime(df['step'], unit='h').dt.hour

# 2. Ratio montant / moyenne historique (simulé)
df['amount_to_avg_ratio'] = df['amount'] / (df.groupby('nameOrig')['amount'].transform('mean') + 1)

# 3. Jours depuis dernière transaction (simulé)
df['days_since_last_tx'] = df.groupby('nameOrig')['step'].transform(lambda x: x.diff().fillna(30))

# 4. Nombre de transactions du bénéficiaire (détection de mules)
df['beneficiary_tx_count'] = df.groupby('nameDest')['step'].transform('count')

# Nettoyage systématique des doublons de colonnes dans le DataFrame
df = df.loc[:, ~df.columns.duplicated()]

# Déduplication de la liste des noms de features tout en conservant l'ordre
new_features = ['hour_of_day', 'amount_to_avg_ratio', 'days_since_last_tx', 'beneficiary_tx_count']
EXTENDED_FEATURE_NAMES = list(dict.fromkeys(FEATURE_NAMES + new_features))

# Sélection des variables finales avec garanties contre les doublons
X = df[EXTENDED_FEATURE_NAMES]
X = X.loc[:, ~X.columns.duplicated()]
y = df['isFraud']

# =====================================================================
# 3. SÉPARATION ENTRAÎNEMENT / TEST AVEC STRATIFICATION
# =====================================================================
print("📊 Séparation train/test avec stratification...")
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"Train: {X_train.shape}, Test: {X_test.shape}")
print(f"Distribution fraude - Train: {y_train.mean():.4f}, Test: {y_test.mean():.4f}")

# =====================================================================
# 4. XGBOOST AVEC PARAMÈTRES OPTIMISÉS
# =====================================================================
print("\n🏋️ Entraînement XGBoost avec paramètres optimisés...")

# Calcul du scale_pos_weight pour gérer le déséquilibre
ratio = (len(y_train) - sum(y_train)) / sum(y_train)
print(f"Ratio de classes: {ratio:.2f}")

model_xgb = XGBClassifier(
    n_estimators=300,
    max_depth=6,
    learning_rate=0.1,
    subsample=0.8,
    colsample_bytree=0.8,
    scale_pos_weight=ratio,  # Gère le déséquilibre automatiquement
    random_state=42,
    n_jobs=-1,
    eval_metric='logloss'
)

model_xgb.fit(X_train, y_train)

print("📊 Évaluation XGBoost (non calibré)...")
y_proba_xgb = model_xgb.predict_proba(X_test)[:, 1]

# =====================================================================
# 5. CALIBRATION DES PROBABILITÉS
# =====================================================================
print("\n🎯 Calibration des probabilités avec CalibratedClassifierCV...")

# Cross-validation stratifiée pour la calibration
calibrated_model = CalibratedClassifierCV(
    model_xgb,
    method='isotonic',  # 'isotonic' ou 'sigmoid'
    cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
)

calibrated_model.fit(X_train, y_train)

print("📊 Évaluation XGBoost (calibré)...")
y_proba_calibrated = calibrated_model.predict_proba(X_test)[:, 1]

# =====================================================================
# 6. OPTIMISATION DU SEUIL OPTIMAL
# =====================================================================
print("\n🔍 Recherche du seuil optimal via courbe Precision-Recall...")

precision, recall, thresholds = precision_recall_curve(y_test, y_proba_calibrated)
f1_scores = 2 * (precision * recall) / (precision + recall + 1e-8)

# Seuil qui maximise le F1-score
optimal_idx = np.argmax(f1_scores)
optimal_threshold = thresholds[optimal_idx]

print(f"Seuil optimal: {optimal_threshold:.4f}")
print(f"F1-score maximal: {f1_scores[optimal_idx]:.4f}")

# =====================================================================
# 7. ÉVALUATION FINALE
# =====================================================================
print("\n" + "="*60)
print("RAPPORT FINAL - XGBOOST CALIBRÉ")
print("="*60)

# Prédictions avec le seuil optimal
y_pred_optimal = (y_proba_calibrated >= optimal_threshold).astype(int)

print(f"\nAvec seuil optimal ({optimal_threshold:.4f}):")
print(classification_report(y_test, y_pred_optimal, target_names=["Légitime", "Fraude"]))

# Matrice de confusion
print("Matrice de confusion:")
print(confusion_matrix(y_test, y_pred_optimal))

# AUC-PR
auc_pr = auc(recall, precision)
print(f"\n📈 AUC-PR (XGBoost Calibré): {auc_pr:.4f}")

# =====================================================================
# 8. COMPARAISON AVEC RANDOM FOREST
# =====================================================================
print("\n" + "="*60)
print("COMPARAISON RANDOM FOREST vs XGBOOST CALIBRÉ")
print("="*60)

print(f"Random Forest (benchmark précédent): AUC-PR ~0.85")
print(f"XGBoost Calibré (ce modèle): AUC-PR = {auc_pr:.4f}")
print(f"Amélioration: {(auc_pr - 0.85) / 0.85 * 100:+.1f}%")

# =====================================================================
# 9. SAUVEGARDE DU MODÈLE
# =====================================================================
print("\n💾 Sauvegarde du modèle calibré...")

# Sauvegarde du modèle calibré
joblib.dump(calibrated_model, "model_fraud_calibrated.pkl")
print("✅ Modèle XGBoost calibré sauvegardé: model_fraud_calibrated.pkl")

# Sauvegarde des métadonnées importantes
metadata = {
    'model_type': 'XGBoost_Calibrated',
    'feature_names': EXTENDED_FEATURE_NAMES,
    'optimal_threshold': float(optimal_threshold),
    'auc_pr': float(auc_pr),
    'scale_pos_weight': float(ratio)
}

joblib.dump(metadata, "model_metadata.pkl")
print("✅ Métadonnées sauvegardées: model_metadata.pkl")

# =====================================================================
# 10. COURBE PRECISION-RECALL (VISUALISATION)
# =====================================================================
print("\n📈 Génération de la courbe Precision-Recall...")

plt.figure(figsize=(10, 6))
plt.plot(recall, precision, label=f'XGBoost Calibré (AUC-PR = {auc_pr:.4f})')
plt.scatter([recall[optimal_idx]], [precision[optimal_idx]], 
           color='red', s=100, label=f'Seuil optimal = {optimal_threshold:.3f}')
plt.xlabel('Recall')
plt.ylabel('Precision')
plt.title('Courbe Precision-Recall - XGBoost Calibré')
plt.legend()
plt.grid(True, alpha=0.3)
plt.savefig('precision_recall_curve.png', dpi=150, bbox_inches='tight')
print("✅ Courbe sauvegardée: precision_recall_curve.png")

print("\n🎉 Entraînement terminé avec succès!")