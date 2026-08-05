import json
import urllib.request

# Port aligné sur main.py / Dockerfile (8005), endpoint unique /api/analyze
# (l'ancien /api/analyze-demo a été supprimé — point 6 du CR v3 validé avec Dhirar)
url = "http://127.0.0.1:8005/api/analyze"

payload = [
    # Transaction 1 : B envoie à C
    {
        "tenant_id": "tenant-123",
        "transaction_reference": "60f1e9b2c9e1f80015b3a1a2",  # Renamed from mongo_transaction_id
        "id": "TX-REAL-002",
        "date": "2026-07-26",
        "description": "AVANCE FOURNISSEUR",
        "amount": 1400.0,
        "sender_balance_before": 1700.0,
        "sender_balance_after": 300.0,
        "receiver_balance_before": 0.0,
        "receiver_balance_after": 1400.0,
        "transaction_type": "TRANSFER",
        "account_iban": "FR76-FOURNISSEUR-B",
        "beneficiary_iban": "FR76-COMPTE-C",
    },
    # Transaction 2 : C renvoie vers A (Fermeture du cycle !)
    {
        "tenant_id": "tenant-123",
        "transaction_reference": "60f1e9b2c9e1f80015b3a1a3",  # Renamed from mongo_transaction_id
        "id": "TX-REAL-003",
        "date": "2026-07-26",
        "description": "REVENUE FRAUDEUR",
        "amount": 1350.0,
        "sender_balance_before": 1400.0,
        "sender_balance_after": 50.0,
        "receiver_balance_before": 3500.0,
        "receiver_balance_after": 4850.0,
        "transaction_type": "TRANSFER",
        "account_iban": "FR76-COMPTE-C",
        "beneficiary_iban": "FR76-ENTREPRISE-A",
    },
]

data = json.dumps(payload).encode("utf-8")
req = urllib.request.Request(
    url, data=data, headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req) as response:
        body = json.loads(response.read().decode())
        # Réponse enveloppée dans {success, data} (point 3 du CR v3)
        results = body["data"] if isinstance(body, dict) and "data" in body else body
        print("=== RÉSULTATS D'ANALYSE ===")
        for tx in results:
            print(f"\nTransaction ID : {tx['id']}")
            print(f"Catégorie      : {tx.get('ruleCategory')}")
            print(f"Est une Fraude : {tx['isFraud']}")
            print(f"Score/Conf.    : {tx.get('score')} / {tx.get('confidence')}")
            print(f"Explications   : {tx['explainability']['factors']}")
except Exception as e:
    print("Erreur :", e)