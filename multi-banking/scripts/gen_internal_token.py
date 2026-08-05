# backend/scripts/gen_internal_token.py
import jwt, os
from datetime import datetime, timedelta

# Pour développement/démo interne
secret = os.getenv("INTERNAL_SERVICE_SECRET", "internal_dev_secret")
print("Token développement interne:")
print(jwt.encode({"tenantId": "demo_retail", "userId": "test", "roles": ["ADMIN"], "type": "internal"}, secret, algorithm="HS256"))

# Pour service-to-service avec BankMatch
service_secret = os.getenv("MULTI_BANKING_SERVICE_SECRET", "multi_banking_dev_secret")
service_payload = {
    "service": "multi-banking",
    "type": "internal",
    "tenantId": "demo_retail",
    "iat": datetime.utcnow(),
    "exp": datetime.utcnow() + timedelta(minutes=30),
}
print("\nToken service-to-service BankMatch:")
print(jwt.encode(service_payload, service_secret, algorithm="HS256"))
