import os
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, IsolationForest
from sklearn.metrics import classification_report, confusion_matrix, precision_recall_curve, auc

from features import FEATURE_NAMES, sender_balance_error, receiver_balance_error

# =====================================================================
# 1. CHARGEMENT DES DONNÉES
# =====================================================================
# Support pour différents datasets : IEEE-CIS (recommandé) ou PaySim (fallback)
DATASET_TYPE = os.environ.get("DATASET_TYPE", "paysim").lower()

if DATASET_TYPE == "ieee_cis":
    print("⏳ Chargement du dataset IEEE-CIS (données réelles de fraude)...")
    csv_path = "data/ieee_cis_fraud.csv"
    if not os.path.exists(csv_path):
        raise FileNotFoundError(
            f"Le fichier {csv_path} est introuvable. "
            "Pour utiliser le dataset IEEE-CIS, téléchargez-le depuis Kaggle: "
            "https://www.kaggle.com/mlg-ulb/creditcardfraud "
            "et placez-le dans le dossier data/ sous le nom 'ieee_cis_fraud.csv'"
        )
    df = pd.read_csv(csv_path)
    # Adapter les colonnes IEEE-CIS au format attendu
    df = df.rename(columns={
        'Time': 'step',
        'V1': 'oldbalanceOrg', 'V2': 'newbalanceOrig',
        'V3': 'oldbalanceDest', 'V4': 'newbalanceDest',
        'Amount': 'amount',
        'Class': 'isFraud'
    })
    # Colonnes manquantes à remplir
    df['type'] = 'TRANSFER'
    df['nameOrig'] = 'C' + df.index.astype(str)
    df['nameDest'] = 'M' + (df.index + 1000000).astype(str)
    df['isFlaggedFraud'] = 0
else:
    print("⏳ Chargement du dataset PaySim (limité à 1M de lignes)...")
    csv_path = "data/paysim.csv"
    if not os.path.exists(csv_path):
        raise FileNotFoundError(
            f"Le fichier {csv_path} est introuvable. Veuillez le placer dans le dossier data/. "
            "Pour de meilleurs résultats, utilisez le dataset IEEE-CIS en définissant DATASET_TYPE=ieee_cis"
        )
    df = pd.read_csv(csv_path, nrows=1000000) 

# =====================================================================
# 2. FEATURE ENGINEERING (Variables logiques)
# =====================================================================
print("🛠️ Création des nouvelles features...")

# Erreurs de solde (très puissantes pour détecter la fraude)
df['sender_balance_error'] = sender_balance_error(df['amount'], df['oldbalanceOrg'], df['newbalanceOrig'])
df['receiver_balance_error'] = receiver_balance_error(df['amount'], df['oldbalanceDest'], df['newbalanceDest'])

# Encodage des types de transaction clés (TRANSFER et CASH_OUT)
df['is_transfer'] = (df['type'] == 'TRANSFER').astype(int)
df['is_cash_out'] = (df['type'] == 'CASH_OUT').astype(int)

# Sélection des variables finales pour l’IA
features = FEATURE_NAMES

X = df[features]
y = df['isFraud']

# =====================================================================
# 3. SÉPARATION ENTRAÎNEMENT / TEST
# =====================================================================
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

# =====================================================================
# 4. BENCHMARK : RANDOM FOREST (Supervisé, optimisé)
# =====================================================================
print("\n🏋️ [1/2] Entraînement du Random Forest (200 estimateurs, class_weight='balanced')...")
model_rf = RandomForestClassifier(
    n_estimators=200, class_weight="balanced", random_state=42, n_jobs=-1
)
model_rf.fit(X_train, y_train)

print("📊 Évaluation de Random Forest...")
y_proba_rf = model_rf.predict_proba(X_test)[:, 1]
y_pred_rf = model_rf.predict(X_test)

# Calcul de la courbe Precision-Recall (très recommandée pour les jeux de données déséquilibrés)
precision_rf, recall_rf, _ = precision_recall_curve(y_test, y_proba_rf)
auc_pr_rf = auc(recall_rf, precision_rf)

print("\n=== RAPPORT DE CLASSIFICATION : RANDOM FOREST ===")
print(classification_report(y_test, y_pred_rf, target_names=["Légitime", "Fraude"]))
print(f"📈 AUC-PR Random Forest : {auc_pr_rf:.4f}")

# =====================================================================
# 5. BENCHMARK : ISOLATION FOREST (Non supervisé)
# =====================================================================
print("\n🕵️ [2/2] Entraînement de l'Isolation Forest (sans étiquettes de fraude)...")
model_iso = IsolationForest(contamination=0.0017, random_state=42, n_jobs=-1)
model_iso.fit(X_train)  # Pas besoin de y_train car c'est du non-supervisé !

print("📊 Évaluation de l'Isolation Forest...")
y_pred_iso = model_iso.predict(X_test)  # Renvoie -1 pour anomalie, 1 pour normal

# Conversion des prédictions (-1 devient 1 pour correspondre à "Fraude", 1 devient 0 pour "Légitime")
y_pred_iso_binary = (y_pred_iso == -1).astype(int)

print("\n=== RAPPORT DE CLASSIFICATION : ISOLATION FOREST ===")
print(classification_report(y_test, y_pred_iso_binary, target_names=["Légitime", "Fraude"]))

# =====================================================================
# 6. SAUVEGARDE DES MODÈLES OPTIMISÉS POUR L'API
# =====================================================================
model_filename = "model_fraud.pkl"
joblib.dump(model_rf, model_filename)
print(f"\n✅ Modèle Random Forest optimisé sauvegardé avec succès sous '{model_filename}' !")

# Sauvegarde de l'Isolation Forest pour utilisation hybride
isolation_model_filename = "model_isolation_forest.pkl"
joblib.dump(model_iso, isolation_model_filename)
print(f"✅ Modèle Isolation Forest sauvegardé avec succès sous '{isolation_model_filename}' !")