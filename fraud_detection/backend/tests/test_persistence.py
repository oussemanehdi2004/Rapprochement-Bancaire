"""Tests for the Supabase persistence path and the global error handler."""

import pytest
from fastapi.testclient import TestClient

import main
from tests.factories import transaction_payload


class _FakeQuery:
    def __init__(self, recorder, should_raise=False):
        self._recorder = recorder
        self._should_raise = should_raise
        self._pending = None

    def insert(self, row):
        self._pending = row
        return self

    def execute(self):
        if self._should_raise:
            raise RuntimeError("supabase down")
        self._recorder.append(self._pending)
        return {"data": [self._pending]}


class _FakeSupabase:
    def __init__(self, should_raise=False):
        self.inserted_rows = []
        self._should_raise = should_raise
        self.tables = []

    def table(self, name):
        self.tables.append(name)
        return _FakeQuery(self.inserted_rows, self._should_raise)


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


def test_results_are_persisted_to_supabase(client, auth_header, monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(main, "supabase", fake)

    payload = transaction_payload(id="TX-501", amount=20000.0, description="VIREMENT")
    response = client.post("/api/analyze", headers=auth_header, json=[payload])

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert fake.tables == ["fraud_alerts"]
    assert len(fake.inserted_rows) == 1
    row = fake.inserted_rows[0]
    assert row["transaction_id"] == "TX-501"
    assert row["is_fraud"] is True
    assert row["reconciliation_status"] == "SUSPICIOUS"
    assert isinstance(row["explainability"], dict)


def test_supabase_failure_returns_502(client, auth_header, monkeypatch):
    monkeypatch.setattr(main, "supabase", _FakeSupabase(should_raise=True))

    payload = transaction_payload(amount=100.0, description="ACHAT")
    response = client.post("/api/analyze", headers=auth_header, json=[payload])

    assert response.status_code == 502
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "HTTP_502"
    assert "base de données" in body["error"]["message"].lower()