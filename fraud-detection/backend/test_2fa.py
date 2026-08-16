import requests
import pyotp

BASE_URL = "http://localhost:8005/api/2fa"
USER_ID = "usr_test_01"

print("--- VALIDATION DYNAMIQUE DU MODULE 2FA ---")

# 1. Générer/Récupérer un secret tout neuf
res_enable = requests.post(f"{BASE_URL}/enable", json={"user_id": USER_ID}).json()
secret = res_enable["data"]["secret"]
print(f"1. Secret actif : {secret}")

# 2. Générer le code TOTP synchrone
totp_code = pyotp.TOTP(secret).now()
print(f"2. Code TOTP calculé : {totp_code}")

# 3. Valider le code auprès de l'API
res_verify = requests.post(f"{BASE_URL}/verify", json={"user_id": USER_ID, "code": totp_code}).json()
print("3. Résultat vérification :", res_verify)