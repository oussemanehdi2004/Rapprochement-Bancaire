import requests
import time

BASE_URL = "http://localhost:8005/api/analyze"

BASE_PAYLOAD = {
    "id": "TX_TEST",
    "transaction_id": "TX_TEST",
    "transaction_reference": "REF_TEST",
    "account_iban": "FR7699999999999999999999999", # IBAN neutre pour isoler les regles
    "nameOrig": "C123456789",
    "nameDest": "M987654321",
    "amount": 1500.0,
    "date": "2026-08-16",
    "timestamp": "2026-08-16T14:00:00Z",
    "step": 1,
    "type": "TRANSFER",
    "transaction_type": "TRANSFER",
    "description": "Test de regles metier",
    "device_id": "DEV_KNOWN_01",
    "ip_address": "192.168.1.1",
    "country": "FR",
    "oldbalanceOrg": 5000.0,
    "newbalanceOrig": 3500.0,
    "oldbalanceDest": 0.0,
    "newbalanceDest": 1500.0,
    "avg_amount_30d": 500.0,
    "tx_count_24h": 1
}

tests = [
    ("HORAIRE_NIGHT", {
        "timestamp": "2026-08-16T03:15:00Z", 
        "hour_of_day": 3, 
        "amount": 4500.0
    }),
    ("VELOCITE_HIGH", {
        "tx_count_24h": 12, 
        "velocity_24h": 12
    }),
    ("DEVICE_CHANGE", {
        "device_id": "DEV_NEW_UNKNOWN_999", 
        "is_new_device": True
    }),
    ("GEOLOC_CHANGE", {
        "country": "RU"
    })
]

print("--- DEBUT DU TEST DES REGLES METIER (avec pause anti-rate-limit) ---")

for label, extra_data in tests:
    tx = BASE_PAYLOAD.copy()
    tx["id"] = f"TX_{label}"
    tx["transaction_reference"] = f"REF_{label}"
    tx.update(extra_data)
    
    response = requests.post(BASE_URL, json=[tx])
    
    if response.status_code == 200:
        res = response.json().get("data", [{}])[0]
        print(f"✅ [{label}] -> Score: {res.get('score')} | Statut: {res.get('reconciliationStatus')} | Catégorie: {res.get('ruleCategory')}")
    else:
        print(f"⚠️ [{label}] Statut {response.status_code} : {response.text}")
    
    print("⏳ Pause de 31s pour respecter le rate limit...")
    time.sleep(31)