import requests
import pyotp
import time
import jwt
import os
import concurrent.futures
from datetime import datetime, timezone, timedelta

BASE_URL = "http://localhost:8005/api"

# Generate internal token for S2S authentication
def get_internal_token():
    # Try to get the secret from environment or use default
    secret = os.getenv("FRAUD_INTERNAL_SECRET", "default_fraud_secret")
    
    payload = {
        "service": "test_service",
        "purpose": "internal_api_call", 
        "tenant_id": "default",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15)
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    return token

def test_all_features():
    print("--- 1. ML & Règles métier ---")
    
    # Check if auth is disabled or get token
    disable_auth = os.getenv("DISABLE_INTERNAL_AUTH", "false").lower() == "true"
    
    if disable_auth:
        print("[+] Authentication disabled (DISABLE_INTERNAL_AUTH=true)")
        headers = {}
        # Use demo endpoint instead
        analyze_endpoint = f"{BASE_URL}/analyze-demo"
    else:
        # Try to get token from the test token endpoint first
        try:
            token_response = requests.get(f"{BASE_URL}/token", timeout=5)
            if token_response.status_code == 200:
                token_data = token_response.json()
                token = token_data.get("access_token")
                headers = {"Authorization": f"Bearer {token}"}
                print("[+] Authentication token obtained from /api/token endpoint")
                analyze_endpoint = f"{BASE_URL}/analyze"
            else:
                raise Exception("Test token endpoint not available")
        except Exception as e:
            print(f"[-] Could not get test token: {e}")
            # Fall back to generating our own token
            try:
                token = get_internal_token()
                headers = {"Authorization": f"Bearer {token}"}
                print("[+] Authentication token generated locally")
                analyze_endpoint = f"{BASE_URL}/analyze"
            except Exception as e:
                print(f"[-] Failed to generate token: {e}")
                print("[+] Falling back to demo endpoint")
                headers = {}
                analyze_endpoint = f"{BASE_URL}/analyze-demo"
    
    # Complete transaction data with all required fields
    tx_data = {
        "id": "test_tx_001",
        "transaction_reference": "REF_TEST_999",
        "date": "2026-08-16T03:00:00Z",  # 3h du matin pour la règle métier
        "description": "Virement sortant suspect",
        "transaction_type": "TRANSFER",
        "amount": 4500.0,
        "sender_balance_before": 10000.0,
        "sender_balance_after": 5500.0,
        "receiver_balance_before": 5000.0,
        "receiver_balance_after": 9500.0,
        "account_iban": "FR7612345678901234567890123",
        "beneficiary_iban": "FR7698765432109876543210987",
        "device_fingerprint": "DEV_NEW_99",
        "country": "FR"
    }
    
    print(f"[+] Using endpoint: {analyze_endpoint}")
    r_analyze = requests.post(analyze_endpoint, json=[tx_data], headers=headers)
    print(f"Status /analyze: {r_analyze.status_code}")
    
    if r_analyze.status_code == 200:
        res_json = r_analyze.json()
        print(f"[+] Response structure: {list(res_json.keys())}")
        
        # Handle the APIResponse structure
        if "data" in res_json and isinstance(res_json["data"], list):
            res_list = res_json["data"]
            if res_list:
                res = res_list[0]
                print(f"[+] Transaction ID: {res.get('id')}")
                print(f"[+] Fraud Probability: {res.get('fraudProbability')}")
                print(f"[+] Is Fraud: {res.get('isFraud')}")
                print(f"[+] Score: {res.get('score')}")
                print(f"[+] Rule Category: {res.get('ruleCategory')}")
                print(f"[+] Summary: {res.get('explainability', {}).get('summary')}")
        else:
            print(f"[-] Unexpected response structure: {res_json}")
    else:
        print(f"Body: {r_analyze.text}")

    print("\n--- 2. Authentification 2FA ---")
    r_enable = requests.post(f"{BASE_URL}/2fa/enable", json={"user_id": "usr_test"})
    print(f"Status /2fa/enable: {r_enable.status_code}")
    
    if r_enable.status_code == 200:
        enable_res = r_enable.json()
        secret = enable_res.get("data", {}).get("secret")
        if secret:
            totp = pyotp.TOTP(secret)
            verify_res = requests.post(f"{BASE_URL}/2fa/verify", json={"user_id": "usr_test", "code": totp.now()})
            print(f"[+] 2FA Validation: {verify_res.status_code == 200} (Status: {verify_res.status_code})")
        else:
            print("[-] Clé 'secret' introuvable dans data.")

    print("\n--- 3. Rate Limiting ---")
    print(f"[+] Envoi de 150 requêtes simultanées vers {analyze_endpoint}...")
    
    blocked = False
    status_codes = []

    def send_request():
        return requests.post(analyze_endpoint, json=[tx_data], headers=headers)

    # Utilisation d'un ThreadPoolExecutor pour envoyer les requêtes en parallèle
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        # Exécute la fonction 'send_request' 150 fois
        futures = [executor.submit(send_request) for _ in range(150)]
        
        for future in concurrent.futures.as_completed(futures):
            try:
                status = future.result().status_code
                status_codes.append(status)
                if status == 429 and not blocked:
                    blocked = True
                    print(f"[+] Rate Limit déclenché (429) ! Le serveur bloque bien les requêtes intensives.")
            except Exception as e:
                print(f"[-] Erreur lors de la requête : {e}")

    if not blocked:
        # Affiche les codes de statut uniques obtenus s'il n'y a pas de 429
        codes_uniques = set(status_codes)
        print(f"[-] Rate limit non atteint.")
        print(f"[-] Codes HTTP reçus : {codes_uniques} (limites trop hautes, IP sur liste blanche, ou route non protégée).")

if __name__ == "__main__":
    test_all_features()