"""Unit tests for the Neo4j Graph Engine integration in ``main.py``."""

import pytest
from fastapi.testclient import TestClient

import main
from tests.factories import transaction_payload


class _FakeGraphEngine:
    def __init__(self):
        self.synced = []

    def sync_transaction(self, tx_dict, is_fraud, rule_category):
        self.synced.append((tx_dict["id"], is_fraud, rule_category))

    def detect_fraud_network(self, tenant_id, iban, min_alerts=3):
        return {"iban": iban, "alert_count": 5} if iban == "FR76-RESEAU" else None

    def detect_circular_payment(self, tenant_id, iban, max_hops=5):
        return ["FR76-A", "FR76-B", "FR76-A"] if iban == "FR76-CYCLE" else None

    def detect_reciprocal_flow(self, tenant_id, iban, min_occurrences=2):
        return None

    def get_top_suspicious_accounts(self, tenant_id=None, limit=10):
        return [{"iban": "FR76-RESEAU", "score": 0.95}]

    def get_top_flagged_accounts(self, tenant_id=None, limit=10):
        return [{"iban": "FR76-RESEAU", "alert_count": 5}]

    def get_account_network(self, tenant_id=None, iban=""):
        if iban == "FR76-RESEAU":
            return {"nodes": [{"id": iban}], "relationships": []}
        return None


@pytest.fixture
def client():
    return TestClient(main.app, raise_server_exceptions=False)


@pytest.fixture
def auth_header():
    token = main.generate_test_token()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def rules_only(monkeypatch):
    monkeypatch.setattr(main, "model", None)
    monkeypatch.setattr(main, "explainer", None)


# --- Tests de l'analyse des transactions (/api/analyze) ---

def test_fraud_network_marks_transaction_suspicious(client, auth_header, monkeypatch):
    monkeypatch.setattr(main, "graph_engine", _FakeGraphEngine())
    payload = transaction_payload(
        amount=50.0, description="ACHAT",
        account_iban="FR76-RESEAU",
        beneficiary_iban="FR76-X",
    )
    response = client.post("/api/analyze", headers=auth_header, json=[payload])
    body = response.json()
    assert body["success"] is True
    result = body["data"][0]
    assert result["isFraud"] is True
    assert result["ruleCategory"] == "RESEAU_FRAUDE"


def test_circular_payment_marks_transaction_suspicious(client, auth_header, monkeypatch):
    monkeypatch.setattr(main, "graph_engine", _FakeGraphEngine())
    payload = transaction_payload(
        amount=50.0, description="ACHAT",
        account_iban="FR76-CYCLE",
        beneficiary_iban="FR76-B",
    )
    response = client.post("/api/analyze", headers=auth_header, json=[payload])
    body = response.json()
    assert body["success"] is True
    result = body["data"][0]
    assert result["isFraud"] is True
    assert result["ruleCategory"] == "PAIEMENT_CIRCULAIRE"


# --- Tests directs des endpoints REST Graphe (/api/graph/*) ---

def test_get_top_accounts_success(client, auth_header, monkeypatch):
    monkeypatch.setattr(main, "graph_engine", _FakeGraphEngine())
    response = client.get("/api/graph/top-accounts", headers=auth_header)
    assert response.status_code == 200
    body = response.json()
    data = body["data"] if isinstance(body, dict) and "data" in body else body
    assert len(data) > 0


def test_get_account_network_not_found(client, auth_header, monkeypatch):
    monkeypatch.setattr(main, "graph_engine", _FakeGraphEngine())
    response = client.get("/api/graph/network/FR76-INCONNU", headers=auth_header)
    assert response.status_code == 404


def test_graph_endpoints_unauthorized(client):
    """Vérifie le comportement en l'absence de token JWT (repli contextuel démo)."""
    response = client.get("/api/graph/top-accounts")
    # En mode démo, le serveur autorise la requête avec le profil de secours
    assert response.status_code == 200


def test_graph_endpoints_service_unavailable(client, auth_header, monkeypatch):
    monkeypatch.setattr(main, "graph_engine", None)
    response = client.get("/api/graph/top-accounts", headers=auth_header)
    assert response.status_code == 503