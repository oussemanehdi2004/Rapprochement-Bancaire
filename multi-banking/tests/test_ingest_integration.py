import pytest
import respx
import httpx
from httpx import ASGITransport, AsyncClient
import os

from main import app, FRAUD_SERVICE_URL


@pytest.mark.asyncio
@respx.mock
async def test_ingest_calls_fraud_service_and_returns_result():
    # Mock de l'appel sortant vers Fraud Detection avec le format correct
    mocked_route = respx.post(f"{FRAUD_SERVICE_URL}/api/analyze").mock(
        return_value=httpx.Response(
            200,
            json={
                "success": True,
                "data": [
                    {
                        "transaction_reference": "test_hash_1",
                        "id": "TX-001",
                        "isFraud": False,
                        "fraudProbability": 0.02,
                        "score": 2,
                        "confidence": "LOW",
                        "reconciliationStatus": "UNMATCHED",
                        "ruleCategory": "NON_CATEGORISE",
                        "explainability": {
                            "summary": "Pas de risque détecté",
                            "factors": [],
                            "shap_contributions": []
                        }
                    }
                ],
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
    assert "fraud_result" in body
    assert body["fraud_result"]["success"] is True


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


@pytest.mark.asyncio
@respx.mock
async def test_ingest_with_bankmatch_integration_disabled():
    """Test que BankMatch integration n'est pas appelée quand désactivée"""
    # Mock uniquement pour Fraud Detection
    fraud_route = respx.post(f"{FRAUD_SERVICE_URL}/api/analyze").mock(
        return_value=httpx.Response(
            200,
            json={
                "success": True,
                "data": [],
            },
        )
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

    assert response.status_code == 200
    body = response.json()
    assert body["bankmatch_result"] is None
    assert body["metadata"]["bankmatch_integration_enabled"] is False


@pytest.mark.asyncio
async def test_parse_endpoint_with_internal_auth():
    """Test du endpoint parse avec authentification interne"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with open("data/sample.csv", "rb") as f:
            response = await client.post(
                "/api/multi-banking/parse",
                headers={"Authorization": "Bearer fake"},
                files={"file": ("sample.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "demo_retail", "bank_id": "bank-a"},
            )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["count"] > 0
    assert "data" in body
    assert "metadata" in body