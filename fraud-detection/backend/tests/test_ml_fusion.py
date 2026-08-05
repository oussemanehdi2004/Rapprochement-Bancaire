"""Tests for the ML/rule fusion branches of ``/api/analyze``."""

import numpy as np
import pytest
from fastapi.testclient import TestClient

import main
from tests.factories import transaction_payload


class _FakeModel:
    """Returns a fixed ``predict_proba`` so ``model_flag`` is deterministic."""

    def __init__(self, fraud_probability: float):
        self._p = fraud_probability

    def predict_proba(self, _features):
        return [[1.0 - self._p, self._p]]


class _FakeExplainer:
    """Mimics a SHAP explainer returning per-feature contributions."""

    def __call__(self, features_array):
        n_features = np.asarray(features_array).shape[1]
        values = np.linspace(0.5, -0.5, n_features).reshape(1, n_features)
        return type("Explanation", (), {"values": values})()


@pytest.fixture
def client():
    return TestClient(main.app, raise_server_exceptions=False)


@pytest.fixture
def auth_header():
    token = main.generate_test_token()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def high_risk_model(monkeypatch):
    monkeypatch.setattr(main, "model", _FakeModel(fraud_probability=0.95))
    monkeypatch.setattr(main, "explainer", _FakeExplainer())


@pytest.fixture
def low_risk_model(monkeypatch):
    monkeypatch.setattr(main, "model", _FakeModel(fraud_probability=0.05))
    monkeypatch.setattr(main, "explainer", _FakeExplainer())


def test_model_only_flag_is_ai_detection(client, auth_header, high_risk_model):
    payload = transaction_payload(amount=100.0, description="ACHAT")
    body = client.post("/api/analyze", headers=auth_header, json=[payload]).json()
    assert body["success"] is True
    result = body["data"][0]
    assert result["isFraud"] is True
    assert result["reconciliationStatus"] == "SUSPICIOUS"
    assert "Détection IA" in result["explainability"]["summary"]
    assert result["explainability"]["factors"]


def test_rule_and_model_flag_is_critical_alert(client, auth_header, high_risk_model):
    payload = transaction_payload(amount=100.0, description="VIREMENT CASINO")
    body = client.post("/api/analyze", headers=auth_header, json=[payload]).json()
    assert body["success"] is True
    result = body["data"][0]
    assert result["isFraud"] is True
    assert "ALERTE CRITIQUE" in result["explainability"]["summary"]
    assert any("CASINO" in f.upper() or "MOT-CLÉ" in f.upper() or "RÈGLE" in f.upper() or "LAB/FT" in f.upper() for f in result["explainability"]["factors"])


def test_low_probability_clean_transaction_is_not_fraud(client, auth_header, low_risk_model):
    payload = transaction_payload(amount=50.0, description="ACHAT")
    body = client.post("/api/analyze", headers=auth_header, json=[payload]).json()
    assert body["success"] is True
    result = body["data"][0]
    assert result["isFraud"] is False
    assert result["reconciliationStatus"] == "MATCHED"
    assert 0.0 <= result["fraudProbability"] < 0.5
    assert "Aucune anomalie" in result["explainability"]["summary"]