import pytest
import respx
import httpx
from httpx import ASGITransport, AsyncClient

from main import app, FRAUD_SERVICE_URL


@pytest.mark.asyncio
@respx.mock
async def test_ingest_calls_fraud_service_and_returns_result():
    # Mock de l'appel sortant vers Fraud Detection
    mocked_route = respx.post(f"{FRAUD_SERVICE_URL}/api/analyze").mock(
        return_value=httpx.Response(
            200,
            json={
                "success": True,
                "results": [{"is_fraud": False, "score": 0.02}],
            },
        )
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with open("data/sample.csv", "rb") as f:
            response = await client.post(
                "/api/multi-banking/ingest",
                headers={"Authorization": "Bearer fake"},  # DISABLE_INTERNAL_AUTH=true en test
                files={"file": ("sample.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "demo_retail", "bank_id": "bank-a"},
            )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["parsed_count"] == 2
    assert mocked_route.called


@pytest.mark.asyncio
@respx.mock
async def test_ingest_returns_502_when_fraud_service_errors():
    respx.post(f"{FRAUD_SERVICE_URL}/api/analyze").mock(
        return_value=httpx.Response(500, text="internal error")
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with open("data/sample.csv", "rb") as f:
            response = await client.post(
                "/api/multi-banking/ingest",
                headers={"Authorization": "Bearer fake"},
                files={"file": ("sample.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "demo_retail", "bank_id": "bank-a"},
            )

    assert response.status_code == 502