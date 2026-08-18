import os
import jwt

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

INTERNAL_SERVICE_SECRET = os.getenv(
    "INTERNAL_SERVICE_SECRET",
    "internal_dev_secret",
)

DISABLE_INTERNAL_AUTH = (
    os.getenv("DISABLE_INTERNAL_AUTH", "false").lower() == "true"
)

security = HTTPBearer(auto_error=False)


def verify_internal_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    """
    Vérifie un JWT interne signé avec INTERNAL_SERVICE_SECRET.

    Ajoute également le token brut dans le payload
    pour pouvoir le forwarder vers d'autres services.
    """

    # ✅ Mode dev si nécessaire
    if DISABLE_INTERNAL_AUTH:
        return {
            "tenantId": "default",
            "userId": "dev_user",
            "roles": ["ADMIN"],
            "type": "internal",
            "raw_token": None,
        }

    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication scheme",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            INTERNAL_SERVICE_SECRET,
            algorithms=["HS256"],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Internal token expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid internal token",
        )

    if payload.get("type") != "internal":
        raise HTTPException(
            status_code=401,
            detail="Wrong token type",
        )

    if not payload.get("tenantId"):
        raise HTTPException(
            status_code=401,
            detail="Missing tenantId",
        )

    # ✅ Ajout du token brut pour forward vers Fraud Detection
    payload["raw_token"] = token

    return payload