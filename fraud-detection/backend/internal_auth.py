import os
import jwt
from fastapi import Header, HTTPException

# Internal Service Authentication Secret
# CRITICAL: This secret is used to validate internal service-to-service tokens
# CRITICAL: Use strong secrets (32+ characters) in production
# TODO: Implement secret rotation strategy for production
INTERNAL_SERVICE_SECRET = os.getenv("INTERNAL_SERVICE_SECRET", "internal_dev_secret")

# Development Mode Toggle
# CRITICAL: NEVER set to true in production environment
# When true: bypasses authentication for standalone development
# When false: enforces JWT validation for all requests
# Bascule dev : laisse passer sans token tant que BankMatch n'appelle pas encore le service
DISABLE_INTERNAL_AUTH = os.getenv("DISABLE_INTERNAL_AUTH", "false").lower() == "true"
def verify_internal_token(authorization: str = Header(default=None)):
    if DISABLE_INTERNAL_AUTH:
        # Contexte de dev/démo : reproduit ce que fait déjà get_current_user_context()
        return {"tenantId": "default", "userId": "dev_user", "roles": ["ADMIN"], "type": "internal"}

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, INTERNAL_SERVICE_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Internal token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid internal token")

    if payload.get("type") != "internal":
        raise HTTPException(status_code=401, detail="Wrong token type")
    if not payload.get("tenantId"):
        raise HTTPException(status_code=401, detail="Missing tenantId")
    return payload