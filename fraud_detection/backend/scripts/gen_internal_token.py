# backend/scripts/gen_internal_token.py
import jwt, os
secret = os.getenv("INTERNAL_SERVICE_SECRET", "internal_dev_secret")
print(jwt.encode({"tenantId": "demo_retail", "userId": "test", "roles": ["ADMIN"], "type": "internal"}, secret, algorithm="HS256"))
