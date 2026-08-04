from fastapi.testclient import TestClient
import main

client = TestClient(main.app, raise_server_exceptions=False)

def test_analyze_success_with_valid_token():
    token = main.generate_test_token()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    payload = [{
        "mongo_transaction_id": "60d5ecb8b5c9c22234567890",
        "id": "TX_DEMO_001",
        "date": "2026-03-30T10:00:00Z",
        "description": "Virement classique demo",
        "amount": 250.0,
        "sender_balance_before": 1000.0,
        "sender_balance_after": 750.0,
        "receiver_balance_before": 200.0,
        "receiver_balance_after": 450.0,
        "transaction_type": "TRANSFER",
    }]
    response = client.post("/api/analyze", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"][0]["id"] == "TX_DEMO_001"
    assert data["data"][0]["tenant_id"] == "default"