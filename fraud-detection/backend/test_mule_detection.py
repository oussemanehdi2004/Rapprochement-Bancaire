"""
Script de test manuel pour la détection de comptes mules.
Ce script permet de tester la nouvelle fonctionnalité sans avoir Neo4j configuré.
"""

import httpx
import json

BASE_URL = "http://127.0.0.1:8001"

def test_mule_accounts_endpoint():
    """Test de l'endpoint /api/graph/mule-accounts"""
    print("=== Test 1: Endpoint /api/graph/mule-accounts ===")
    
    # Test avec paramètres personnalisés
    params = {
        "min_transactions": 3,
        "min_in_out_ratio": 0.6,
        "max_delay_hours": 48
    }
    try:
        response = httpx.get(f"{BASE_URL}/api/graph/mule-accounts", params=params, timeout=60.0)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except httpx.TimeoutException:
        print("Timeout sur l'appel")

def test_analyze_with_mule_account():
    """Test de l'intégration automatique via /api/analyze"""
    print("\n=== Test 2: Intégration automatique via /api/analyze ===")
    
    # Transaction avec un compte suspect (simulé)
    transaction = {
        "id": "test_tx_001",
        "transaction_reference": "REF_001",
        "date": "2026-08-15T10:00:00Z",
        "description": "Test transaction",
        "amount": 15000.0,
        "transaction_type": "TRANSFER",
        "account_iban": "FR76-MULE1",  # Compte qui pourrait être détecté comme mule
        "beneficiary_iban": "FR76-BENEFICIARY",
        "tenant_id": "default"
    }
    
    response = httpx.post(f"{BASE_URL}/api/analyze", json=[transaction], timeout=30.0)
    print(f"Status Code: {response.status_code}")
    result = response.json()
    print(f"Response: {json.dumps(result, indent=2)}")
    
    # Vérifier si la transaction a été marquée comme fraude
    if result.get("success") and len(result.get("data", [])) > 0:
        tx_result = result["data"][0]
        print(f"\nTransaction marquee comme fraude: {tx_result['isFraud']}")
        print(f"Categorie de regle: {tx_result['ruleCategory']}")
        print(f"Facteurs d'explicabilite: {tx_result['explainability']['factors']}")
    else:
        print(f"\nErreur dans la reponse: {result}")

def test_normal_transaction():
    """Test avec une transaction normale"""
    print("\n=== Test 3: Transaction normale ===")
    
    transaction = {
        "id": "test_tx_002",
        "transaction_reference": "REF_002",
        "date": "2026-08-15T10:00:00Z",
        "description": "Normal transaction",
        "amount": 50.0,
        "transaction_type": "TRANSFER",
        "account_iban": "FR76-NORMAL",
        "beneficiary_iban": "FR76-BENEFICIARY",
        "tenant_id": "default"
    }
    
    response = httpx.post(f"{BASE_URL}/api/analyze", json=[transaction], timeout=30.0)
    print(f"Status Code: {response.status_code}")
    result = response.json()
    print(f"Response: {json.dumps(result, indent=2)}")

if __name__ == "__main__":
    print("Démarrage des tests de détection de comptes mules...\n")
    
    try:
        test_mule_accounts_endpoint()
        test_analyze_with_mule_account()
        test_normal_transaction()
        print("\nTests termines avec succes!")
    except httpx.ConnectError:
        print("Erreur: Le serveur n'est pas demarre. Lancez d'abord:")
        print("   cd fraud-detection/backend")
        print("   python -m uvicorn main:app --reload --port 8000")
    except Exception as e:
        print(f"Erreur lors des tests: {e}")