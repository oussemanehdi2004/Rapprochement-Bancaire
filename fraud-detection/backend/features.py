"""
Utilitaires partagés pour le feature engineering de la détection de fraude.

Ce module centralise :
  - la liste des variables (features) attendues par le modèle ;
  - les formules d'erreur de solde (émetteur / destinataire).

Il est utilisé aussi bien par l'entraînement (`benchmark_fraud.py`) que par
l'API d'inférence (`main.py`) afin de garantir que les mêmes variables et les
mêmes formules sont utilisées des deux côtés.
"""

# Variables finales utilisées par l'IA, dans l'ordre attendu par le modèle.
FEATURE_NAMES = [
    "amount",
    "oldbalanceOrg",
    "newbalanceOrig",
    "oldbalanceDest",
    "newbalanceDest",
    "sender_balance_error",
    "receiver_balance_error",
    "is_transfer",
    "is_cash_out",
    # --- Features v2 (Granularité accrue) ---
    "amount_to_avg_ratio",       # Montant / Moyenne historique du compte
    "hour_of_day",                 # Heure de la transaction (0-23)
    "days_since_last_tx",          # Fraîcheur / inactivité du compte
    "beneficiary_tx_count"         # Nombre de transactions passées vers ce bénéficiaire
]


def sender_balance_error(amount: float, before: float, after: float) -> float:
    return round((before - amount) - after, 2)

def receiver_balance_error(amount: float, before: float, after: float) -> float:
    return round((before + amount) - after, 2)

def calculate_amount_ratio(amount: float, avg_amount: float) -> float:
    if not avg_amount or avg_amount == 0:
        return 1.0
    return round(amount / avg_amount, 2)