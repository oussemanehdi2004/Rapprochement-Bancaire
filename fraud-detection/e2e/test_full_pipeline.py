"""E2E: Multi-Banking ingest -> Fraud Detection analyze, sur services réellement démarrés.
Nécessite fraud-service (8005) et multi-banking (8010) up (docker-compose ou local)."""
import httpx
import pytest

MULTI_BANKING_URL = "http://localhost:8010"
FRAUD_URL = "http://localhost:8005"


@pytest.fixture(scope="module")
def internal_token():
    import jwt
    return jwt.encode(
        {"tenantId": "demo_retail", "userId": "e2e", "roles": ["ADMIN"], "type": "internal"},
        "internal_dev_secret",
        algorithm="HS256",
    )


def test_health_checks():
    assert httpx.get(f"{MULTI_BANKING_URL}/health", timeout=5).status_code == 200
    assert httpx.get(f"{FRAUD_URL}/", timeout=5).status_code == 200


def test_ingest_pipeline_flags_high_amount(internal_token, tmp_path):
    csv_content = (
        "account_iban,value_date,label,amount,currency\n"
        "FR761234567890,2026-08-01,VIREMENT URGENT,15000.00,EUR\n"
    )
    csv_file = tmp_path / "e2e.csv"
    csv_file.write_text(csv_content)

    with open(csv_file, "rb") as f:
        response = httpx.post(
            f"{MULTI_BANKING_URL}/api/multi-banking/ingest",
            headers={"Authorization": f"Bearer {internal_token}"},
            files={"file": ("e2e.csv", f, "text/csv")},
            data={"format": "csv", "tenant_id": "demo_retail", "bank_id": "bank-a"},
            timeout=30,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    fraud_data = body["fraud_result"]["data"]
    assert len(fraud_data) == 1
    assert fraud_data[0]["isFraud"] is True
    assert fraud_data[0]["ruleCategory"] == "SEUIL_REGLEMENTAIRE"


def test_analyze_sensitive_keyword_direct():
    payload = [{
        "tenant_id": "tenant-e2e",
        "transaction_reference": "e2e-001",
        "id": "TX-E2E-1",
        "date": "2026-08-01",
        "description": "VIREMENT CASINO EN LIGNE",
        "amount": 100.0,
        "sender_balance_before": 500.0,
        "sender_balance_after": 400.0,
        "receiver_balance_before": 0.0,
        "receiver_balance_after": 100.0,
        "transaction_type": "TRANSFER",
    }]
    response = httpx.post(f"{FRAUD_URL}/api/analyze", json=payload, timeout=10)
    assert response.status_code == 200
    result = response.json()["data"][0]
    assert result["isFraud"] is True