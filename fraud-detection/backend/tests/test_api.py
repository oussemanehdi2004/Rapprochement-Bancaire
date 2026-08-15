"""Integration-style unit tests for the FastAPI endpoints in ``main.py``.

These exercise the request/response contract of the ``/api/analyze`` endpoint
through FastAPI's ``TestClient``. For deterministic assertions on the business
outcome, the ML model is disabled via the ``rules_only`` fixture so that only
the (deterministic) rule engine drives the decision.
"""

import pytest
from fastapi.testclient import TestClient

import main
from tests.factories import transaction_payload


@pytest.fixture
def client():
    return TestClient(main.app, raise_server_exceptions=False)


@pytest.fixture
def auth_header():
    token = main.generate_test_token()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def rules_only(monkeypatch):
    """Disable the ML model so only the deterministic rule engine is active."""
    monkeypatch.setattr(main, "model", None)
    monkeypatch.setattr(main, "explainer", None)


class TestHealthcheck:
    def test_root_reports_status(self, client):
        response = client.get("/")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "production_ready"
        assert "model_loaded" in body
        assert isinstance(body["database_connected"], bool)


class TestTokenRoute:
    def test_token_route_returns_usable_token(self, client):
        response = client.get("/api/token")
        assert response.status_code == 200
        assert "access_token" in response.json()


class TestAnalyzeAuth:
    def test_missing_authorization_is_accepted_in_demo_fallback(self, client):
        response = client.post("/api/analyze", json=[transaction_payload()])
        # get_current_user_context autorise le repli démo sans token
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True

    def test_invalid_token_falls_back_to_dev_context(self, client):
        response = client.post(
            "/api/analyze",
            headers={"Authorization": "Bearer not-a-real-token"},
            json=[transaction_payload()],
        )
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True


@pytest.mark.usefixtures("rules_only")
class TestAnalyzeBusinessOutcomes:
    def test_clean_small_transaction_is_matched(self, client, auth_header):
        payload = transaction_payload(
            amount=45.2, transaction_type="PAYMENT", description="ACHAT SUPERMARCHE"
        )
        response = client.post("/api/analyze", headers=auth_header, json=[payload])
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        result = body["data"][0]
        assert result["isFraud"] is False
        assert result["reconciliationStatus"] == "MATCHED"
        assert result["fraudProbability"] == 0.0
        assert "score" in result
        assert "confidence" in result

    def test_large_clean_transaction_is_unmatched(self, client, auth_header):
        payload = transaction_payload(
            amount=6000.0, transaction_type="PAYMENT", description="FACTURE"
        )
        response = client.post("/api/analyze", headers=auth_header, json=[payload])
        body = response.json()
        assert body["success"] is True
        result = body["data"][0]
        assert result["isFraud"] is False
        assert result["reconciliationStatus"] == "UNMATCHED"

    def test_regulatory_threshold_transaction_is_suspicious(self, client, auth_header):
        payload = transaction_payload(amount=15000.0, description="VIREMENT")
        response = client.post("/api/analyze", headers=auth_header, json=[payload])
        body = response.json()
        assert body["success"] is True
        result = body["data"][0]
        assert result["isFraud"] is True
        assert result["reconciliationStatus"] == "SUSPICIOUS"
        assert result["fraudProbability"] >= 0.9  # Permettre une petite marge de tolérance
        assert result["score"] >= 90  # Permettre une marge pour le calcul de score
        assert result["confidence"] == "HIGH"
        assert "conformité" in result["explainability"]["summary"].lower()

    def test_sensitive_keyword_transaction_is_suspicious(self, client, auth_header):
        payload = transaction_payload(
            amount=100.0, description="VIREMENT ENTRANT CASINO"
        )
        response = client.post("/api/analyze", headers=auth_header, json=[payload])
        body = response.json()
        assert body["success"] is True
        result = body["data"][0]
        assert result["isFraud"] is True
        assert result["reconciliationStatus"] == "SUSPICIOUS"

    def test_response_preserves_transaction_identifiers(self, client, auth_header):
        payload = transaction_payload(
            id="TX-777", tenant_id="tenant-propose-par-client", description="ACHAT", amount=10.0
        )
        response = client.post("/api/analyze", headers=auth_header, json=[payload])
        body = response.json()
        result = body["data"][0]
        assert result["id"] == "TX-777"
        assert result["tenant_id"] == "default"

    def test_multiple_transactions_return_multiple_results(self, client, auth_header):
        payloads = [
            transaction_payload(id="TX-1", amount=10.0, description="ACHAT"),
            transaction_payload(id="TX-2", amount=20000.0, description="VIREMENT"),
        ]
        response = client.post("/api/analyze", headers=auth_header, json=payloads)
        body = response.json()
        results = body["data"]
        assert len(results) == 2
        assert results[0]["isFraud"] is False
        assert results[1]["isFraud"] is True


class TestAnalyzeWithModel:
    """Covers the ML + SHAP branch using the real bundled model, when present."""

    def test_ml_branch_produces_valid_probability_and_factors(self, client, auth_header):
        if main.model is None or main.explainer is None:
            pytest.skip("model_fraud.pkl / SHAP explainer not available")
        payload = transaction_payload(
            amount=1500.5, transaction_type="TRANSFER", description="ACHAT"
        )
        response = client.post("/api/analyze", headers=auth_header, json=[payload])
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        result = body["data"][0]
        assert 0.0 <= result["fraudProbability"] <= 1.0
        assert 0 <= result["score"] <= 100
        assert result["confidence"] in ("LOW", "MEDIUM", "HIGH")
        assert isinstance(result["isFraud"], bool)
        assert isinstance(result["explainability"]["factors"], list)