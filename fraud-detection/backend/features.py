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
]


def sender_balance_error(amount, balance_before, balance_after):
    """Écart sur le solde de l'émetteur (attendu ~0 pour une transaction saine).

    Fonctionne avec des scalaires (float) comme avec des colonnes pandas.
    """
    return balance_before - amount - balance_after


def receiver_balance_error(amount, balance_before, balance_after):
    """Écart sur le solde du destinataire (attendu ~0 pour une transaction saine).

    Fonctionne avec des scalaires (float) comme avec des colonnes pandas.
    """
    return balance_before + amount - balance_after
