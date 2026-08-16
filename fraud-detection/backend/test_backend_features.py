import requests
import json

BASE_URL = "http://localhost:8005"

def run_tests():
    print("--- 1. TEST POINT 3: RÈGLES MÉTIER & ML ---")
    payload_night = [{
        "id": "TX_NIGHT_01",
        "transaction_id": "TX_NIGHT_01",
        "transaction_reference": "REF_NIGHT_01",
        "account_iban": "FR7612345678901234567890123",
        "nameOrig": "C123456789",
        "nameDest": "M987654321",
        "amount": 250.0,
        "date": "2026-08-16",
        "timestamp": "2026-08-16T03:15:00Z",
        "step": 3,
        "type": "TRANSFER",
        "transaction_type": "TRANSFER",
        "description": "Test virement nocturne",
        "device_id": "DEV_01",
        "ip_address": "192.168.1.1",
        "country": "FR",
        "oldbalanceOrg": 1000.0,
        "newbalanceOrig": 750.0,
        "oldbalanceDest": 0.0,
        "newbalanceDest": 250.0,
        "avg_amount_30d": 50.0,
        "tx_count_24h": 1
    }]
    
    r = requests.post(f"{BASE_URL}/api/analyze", json=payload_night)
    print("Statut HTTP /api/analyze :", r.status_code)
    if r.status_code == 200:
        print("Résultat :", json.dumps(r.json(), indent=2, ensure_ascii=False))
    else:
        print("Erreur :", r.text)

if __name__ == "__main__":
    run_tests()