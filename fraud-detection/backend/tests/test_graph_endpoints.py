"""Unit tests for Neo4j Graph REST Endpoints in ``main.py``."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
import jwt

import main

client = TestClient(main.app, raise_server_exceptions=False)


def get_valid_token():
    return jwt.encode({"service": "express-backend", "tenant_id": "tenant_test"}, main.JWT_SECRET, algorithm="HS256")


@patch("main.graph_engine")
def test_top_flagged_accounts_success(mock_graph_engine):
    """Vérifie la réponse HTTP 200 enveloppée dans APIResponse sur /api/graph/top-accounts."""
    mock_graph_engine.get_top_flagged_accounts.return_value = [
        {"iban": "FR76123456789", "alert_count": 5, "categories": ["RESEAU_FRAUDE"]}
    ]

    headers = {"Authorization": f"Bearer {get_valid_token()}"}
    response = client.get("/api/graph/top-accounts?tenant_id=tenant_test&limit=10", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert len(data) == 1
    assert data[0]["iban"] == "FR76123456789"
    assert data[0]["alert_count"] == 5


@patch("main.graph_engine")
def test_account_network_success(mock_graph_engine):
    """Vérifie la réponse HTTP 200 du réseau de graphe d'un compte."""
    mock_graph_engine.get_account_network.return_value = {
        "center_iban": "FR76123456789",
        "nodes": ["FR76123456789", "FR76987654321"],
        "edges": [
            {
                "source": "FR76123456789",
                "target": "FR76987654321",
                "amount": 15000.0,
                "is_fraud": True,
                "tx_id": "tx_999"
            }
        ]
    }

    headers = {"Authorization": f"Bearer {get_valid_token()}"}
    response = client.get("/api/graph/network?tenant_id=tenant_test&iban=FR76123456789", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["center_iban"] == "FR76123456789"
    assert len(data["edges"]) == 1


@patch("main.graph_engine", None)
def test_graph_endpoints_service_unavailable():
    """Vérifie que des données mockées sont retournées quand Neo4j n'est pas initialisé."""
    headers = {"Authorization": f"Bearer {get_valid_token()}"}
    response = client.get("/api/graph/top-accounts?tenant_id=tenant_test", headers=headers)
    assert response.status_code == 200  # Retourne des données mockées
    body = response.json()
    assert body["success"] is True
    assert "data" in body
    assert len(body["data"]) > 0  # Données mockées