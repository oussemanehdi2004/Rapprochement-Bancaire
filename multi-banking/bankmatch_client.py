import os
import httpx

BANKMATCH_BASE_URL = os.getenv(
    "BANKMATCH_BASE_URL",
    "http://localhost:4090/api"
)


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