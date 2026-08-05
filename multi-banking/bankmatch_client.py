import os
import jwt
import httpx
from datetime import datetime, timedelta, timezone

BANKMATCH_BASE_URL = os.getenv(
    "BANKMATCH_BASE_URL",
    "http://localhost:4090/api"
)

MULTI_BANKING_SERVICE_SECRET = os.getenv(
    "MULTI_BANKING_SERVICE_SECRET",
    "multi_banking_dev_secret"
)


def generate_service_token(tenant_id: str = "default") -> str:
    """
    Génère un token JWT interne pour l'authentification service-to-service
    avec BankMatch.
    
    Ce token est signé avec le secret propre au service Multi-Banking
    et contient les informations nécessaires pour l'identification du service.
    """
    payload = {
        "service": "multi-banking",
        "type": "internal",
        "tenantId": tenant_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
    }
    
    token = jwt.encode(
        payload,
        MULTI_BANKING_SERVICE_SECRET,
        algorithm="HS256"
    )
    
    return token


async def import_transactions(transactions: list[dict], token: str):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BANKMATCH_BASE_URL}/import",
            json={"transactions": transactions},
            headers={
                "Authorization": f"Bearer {token}"
            },
            timeout=30.0,
        )

    response.raise_for_status()
    return response.json()


async def start_matching(session_id: str, token: str):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BANKMATCH_BASE_URL}/reconciliation/sessions/{session_id}/matching/start",
            headers={
                "Authorization": f"Bearer {token}"
            },
            timeout=30.0,
        )

    response.raise_for_status()
    return response.json()