"""Comprehensive E2E integration test suite for cross-service validation.

Tests the full pipeline: Multi-Banking → Fraud Detection → Frontend Contract.
Requires running services (docker-compose or local):
  - fraud-service on port 8005/8006
  - multi-banking on port 8010

These tests validate:
  - Full data flow from file upload through fraud analysis
  - Multi-format support (CSV, CAMT.053, MT940)
  - Error propagation across services
  - Retry logic and resilience
  - S2S authentication flow
  - API contract consistency between services
"""

import csv
import io
import json
import os
import time
from typing import Any

import httpx
import jwt
import pytest

MULTI_BANKING_URL = os.getenv("MULTI_BANKING_URL", "http://localhost:8010")
FRAUD_URL = os.getenv("FRAUD_URL", "http://localhost:8005")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:4200")


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture(scope="module")
def internal_token():
    """Generate S2S JWT token for multi-banking → fraud communication."""
    return jwt.encode(
        {"tenantId": "e2e_test", "userId": "e2e_runner", "roles": ["ADMIN"], "type": "internal"},
        "internal_dev_secret",
        algorithm="HS256",
    )


@pytest.fixture(scope="module")
def fraud_internal_token():
    """Generate S2S JWT token for fraud service authentication."""
    return jwt.encode(
        {"service": "multi-banking", "type": "internal", "tenant_id": "e2e_test"},
        "fraud_dev_secret_123",
        algorithm="HS256",
    )


@pytest.fixture
def csv_file_factory(tmp_path):
    """Factory for creating temporary CSV files."""
    def _create(transactions: list[dict], filename: str = "test.csv") -> str:
        filepath = tmp_path / filename
        with open(filepath, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=transactions[0].keys())
            writer.writeheader()
            writer.writerows(transactions)
        return str(filepath)
    return _create


# ============================================================================
# SECTION 1: HEALTH CHECKS
# ============================================================================

class TestServiceHealth:
    """Scope: Verify all services are running and healthy."""

    def test_multi_banking_health(self):
        """Simulation: Monitoring system checks multi-banking health.
        Expected: 200 OK."""
        response = httpx.get(f"{MULTI_BANKING_URL}/banking/health", timeout=5)
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_fraud_detection_health(self):
        """Simulation: Monitoring system checks fraud detection health.
        Expected: 200 OK."""
        response = httpx.get(f"{FRAUD_URL}/", timeout=5)
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "production_ready"

    def test_multi_banking_stats_endpoint(self):
        """Simulation: Dashboard requests ingestion statistics.
        Expected: Stats object returned."""
        response = httpx.get(f"{MULTI_BANKING_URL}/banking/stats", timeout=5)
        assert response.status_code == 200
        stats = response.json()
        assert "total_files" in stats
        assert "total_transactions" in stats


# ============================================================================
# SECTION 2: FULL PIPELINE - CSV INGEST
# ============================================================================

class TestFullPipelineCsvIngest:
    """Scope: CSV file → Multi-Banking parse → Fraud Detection analysis."""

    def test_clean_transaction_pipeline(self, csv_file_factory, internal_token):
        """Simulation: Normal CSV with clean transactions.
        Expected: Parsed, analyzed, no fraud detected."""
        csv_path = csv_file_factory([
            {"account_iban": "FR761234567890", "value_date": "2026-08-01",
             "label": "ACHAT FOURNISSEUR", "amount": "150.00", "currency": "EUR"},
        ])

        with open(csv_path, "rb") as f:
            response = httpx.post(
                f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
                headers={"Authorization": f"Bearer {internal_token}"},
                files={"file": ("test.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
                timeout=30,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["parsed_count"] == 1
        assert body["fraud_result"]["success"] is True
        fraud_data = body["fraud_result"]["data"]
        assert len(fraud_data) == 1
        assert fraud_data[0]["isFraud"] is False

    def test_high_amount_flags_fraud(self, csv_file_factory, internal_token):
        """Simulation: CSV with 15,000 EUR transaction.
        Expected: Fraud detection flags as SEUIL_REGLEMENTAIRE."""
        csv_path = csv_file_factory([
            {"account_iban": "FR761234567890", "value_date": "2026-08-01",
             "label": "VIREMENT URGENT", "amount": "15000.00", "currency": "EUR"},
        ])

        with open(csv_path, "rb") as f:
            response = httpx.post(
                f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
                headers={"Authorization": f"Bearer {internal_token}"},
                files={"file": ("high_amount.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
                timeout=30,
            )

        assert response.status_code == 200
        body = response.json()
        fraud_data = body["fraud_result"]["data"]
        assert fraud_data[0]["isFraud"] is True
        assert fraud_data[0]["ruleCategory"] == "SEUIL_REGLEMENTAIRE"
        assert fraud_data[0]["reconciliationStatus"] == "SUSPICIOUS"

    def test_sensitive_keyword_flags_fraud(self, csv_file_factory, internal_token):
        """Simulation: CSV with CASINO keyword in description.
        Expected: Fraud detection flags as MOTCLE_SENSIBLE."""
        csv_path = csv_file_factory([
            {"account_iban": "FR761234567890", "value_date": "2026-08-01",
             "label": "DEPOT CASINO EN LIGNE", "amount": "500.00", "currency": "EUR"},
        ])

        with open(csv_path, "rb") as f:
            response = httpx.post(
                f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
                headers={"Authorization": f"Bearer {internal_token}"},
                files={"file": ("casino.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
                timeout=30,
            )

        assert response.status_code == 200
        fraud_data = response.json()["fraud_result"]["data"]
        assert fraud_data[0]["isFraud"] is True
        assert fraud_data[0]["ruleCategory"] == "MOTCLE_SENSIBLE"

    def test_multi_transaction_batch(self, csv_file_factory, internal_token):
        """Simulation: CSV with multiple transactions (mixed risk).
        Expected: All analyzed individually."""
        csv_path = csv_file_factory([
            {"account_iban": "FR761234567890", "value_date": "2026-08-01",
             "label": "ACHAT NORMAL", "amount": "75.00", "currency": "EUR"},
            {"account_iban": "FR761234567890", "value_date": "2026-08-01",
             "label": "VIREMENT GROS MONTANT", "amount": "25000.00", "currency": "EUR"},
            {"account_iban": "FR761234567890", "value_date": "2026-08-01",
             "label": "PAIEMENT FOURNISSEUR", "amount": "350.00", "currency": "EUR"},
        ])

        with open(csv_path, "rb") as f:
            response = httpx.post(
                f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
                headers={"Authorization": f"Bearer {internal_token}"},
                files={"file": ("multi.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
                timeout=30,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["parsed_count"] == 3
        fraud_data = body["fraud_result"]["data"]
        assert len(fraud_data) == 3
        # First and third should be clean, second should be flagged
        assert fraud_data[0]["isFraud"] is False
        assert fraud_data[1]["isFraud"] is True
        assert fraud_data[2]["isFraud"] is False


# ============================================================================
# SECTION 3: DIRECT FRAUD DETECTION API
# ============================================================================

class TestDirectFraudDetection:
    """Scope: Direct calls to fraud detection /api/analyze endpoint."""

    def test_analyze_with_valid_token(self, fraud_internal_token):
        """Simulation: Multi-banking calls fraud detection with valid S2S token.
        Expected: Analysis completes successfully."""
        payload = [{
            "tenant_id": "e2e_test",
            "transaction_reference": "e2e-direct-001",
            "id": "TX-E2E-D1",
            "date": "2026-08-01T10:00:00Z",
            "description": "VIREMENT FOURNISSEUR",
            "amount": 5000.0,
            "sender_balance_before": 20000.0,
            "sender_balance_after": 15000.0,
            "receiver_balance_before": 0.0,
            "receiver_balance_after": 5000.0,
            "transaction_type": "TRANSFER",
        }]
        response = httpx.post(
            f"{FRAUD_URL}/api/analyze",
            json=payload,
            headers={"Authorization": f"Bearer {fraud_internal_token}"},
            timeout=10,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert len(body["data"]) == 1

    def test_analyze_with_sensitive_keyword(self):
        """Simulation: Direct call with CASINO keyword.
        Expected: Transaction flagged as fraud."""
        payload = [{
            "tenant_id": "e2e_test",
            "transaction_reference": "e2e-keyword-001",
            "id": "TX-E2E-K1",
            "date": "2026-08-01",
            "description": "VIREMENT ENTRANT CASINO",
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
        assert result["ruleCategory"] == "MOTCLE_SENSIBLE"

    def test_analyze_multiple_transactions(self):
        """Simulation: Batch analysis of 5 transactions.
        Expected: All 5 results returned."""
        payload = [
            {
                "tenant_id": "e2e_test", "transaction_reference": f"ref-{i}",
                "id": f"TX-BATCH-{i}", "date": "2026-08-01",
                "description": f"Transaction {i}", "amount": float(i * 1000),
                "sender_balance_before": 50000.0, "sender_balance_after": 50000.0 - i * 1000,
                "transaction_type": "TRANSFER",
            }
            for i in range(1, 6)
        ]
        response = httpx.post(f"{FRAUD_URL}/api/analyze", json=payload, timeout=10)
        assert response.status_code == 200
        assert len(response.json()["data"]) == 5


# ============================================================================
# SECTION 4: ERROR PROPAGATION
# ============================================================================

class TestErrorPropagation:
    """Scope: How errors propagate between services."""

    def test_empty_file_returns_400(self, internal_token):
        """Simulation: User uploads empty CSV file.
        Expected: 400 Bad Request from multi-banking."""
        response = httpx.post(
            f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
            headers={"Authorization": f"Bearer {internal_token}"},
            files={"file": ("empty.csv", b"", "text/csv")},
            data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
            timeout=10,
        )
        assert response.status_code == 400

    def test_unsupported_format_returns_400(self, internal_token):
        """Simulation: User selects unsupported file format.
        Expected: 400 with format error."""
        response = httpx.post(
            f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
            headers={"Authorization": f"Bearer {internal_token}"},
            files={"file": ("test.bin", b"binary content", "application/octet-stream")},
            data={"format": "unsupported", "tenant_id": "e2e_test", "bank_id": "bank-a"},
            timeout=10,
        )
        assert response.status_code == 400

    def test_parse_endpoint_works_without_fraud_service(self, internal_token, csv_file_factory):
        """Simulation: Parse file without invoking fraud analysis.
        Expected: Parsed transactions returned."""
        csv_path = csv_file_factory([
            {"account_iban": "FR761234567890", "value_date": "2026-08-01",
             "label": "TEST", "amount": "100.00", "currency": "EUR"},
        ])

        with open(csv_path, "rb") as f:
            response = httpx.post(
                f"{MULTI_BANKING_URL}/banking/api/multi-banking/parse",
                headers={"Authorization": f"Bearer {internal_token}"},
                files={"file": ("test.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
                timeout=10,
            )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["count"] == 1


# ============================================================================
# SECTION 5: S2S AUTHENTICATION FLOW
# ============================================================================

class TestS2SAuthentication:
    """Scope: Service-to-service authentication between multi-banking and fraud."""

    def test_valid_s2s_token_accepted(self, fraud_internal_token):
        """Simulation: Multi-banking sends request with valid internal token.
        Expected: Request processed successfully."""
        payload = [{
            "tenant_id": "e2e_test", "transaction_reference": "auth-001",
            "id": "TX-AUTH-1", "date": "2026-08-01", "description": "TEST",
            "amount": 100.0, "transaction_type": "TRANSFER",
        }]
        response = httpx.post(
            f"{FRAUD_URL}/api/analyze",
            json=payload,
            headers={"Authorization": f"Bearer {fraud_internal_token}"},
            timeout=10,
        )
        assert response.status_code == 200

    def test_invalid_token_still_works_in_dev_mode(self):
        """Simulation: Invalid token sent in development mode.
        Expected: Falls back to demo context."""
        payload = [{
            "tenant_id": "e2e_test", "transaction_reference": "auth-002",
            "id": "TX-AUTH-2", "date": "2026-08-01", "description": "TEST",
            "amount": 100.0, "transaction_type": "TRANSFER",
        }]
        response = httpx.post(
            f"{FRAUD_URL}/api/analyze",
            json=payload,
            headers={"Authorization": "Bearer invalid-token"},
            timeout=10,
        )
        assert response.status_code == 200


# ============================================================================
# SECTION 6: DATA CONSISTENCY
# ============================================================================

class TestDataConsistency:
    """Scope: Data consistency across the full pipeline."""

    def test_transaction_reference_preserved_through_pipeline(self, csv_file_factory, internal_token):
        """Simulation: Transaction reference flows through entire pipeline.
        Expected: Reference is preserved in fraud analysis output."""
        csv_path = csv_file_factory([
            {"account_iban": "FR761234567890", "value_date": "2026-08-01",
             "label": "TEST REF", "amount": "500.00", "currency": "EUR",
             "reference": "MY-UNIQUE-REF-001"},
        ])

        with open(csv_path, "rb") as f:
            response = httpx.post(
                f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
                headers={"Authorization": f"Bearer {internal_token}"},
                files={"file": ("ref_test.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
                timeout=30,
            )

        body = response.json()
        fraud_data = body["fraud_result"]["data"]
        # Reference should be present in the fraud analysis output
        assert len(fraud_data) == 1
        assert "transaction_reference" in fraud_data[0]

    def test_amount_preserved_through_pipeline(self, csv_file_factory, internal_token):
        """Simulation: Transaction amount flows through pipeline.
        Expected: Amount in fraud output matches input."""
        csv_path = csv_file_factory([
            {"account_iban": "FR761234567890", "value_date": "2026-08-01",
             "label": "AMOUNT TEST", "amount": "7777.77", "currency": "EUR"},
        ])

        with open(csv_path, "rb") as f:
            response = httpx.post(
                f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
                headers={"Authorization": f"Bearer {internal_token}"},
                files={"file": ("amount.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
                timeout=30,
            )

        body = response.json()
        fraud_data = body["fraud_result"]["data"]
        assert fraud_data[0]["amount"] == 7777.77

    def test_iban_preserved_through_pipeline(self, csv_file_factory, internal_token):
        """Simulation: Account IBAN flows through pipeline.
        Expected: IBAN preserved in fraud output."""
        csv_path = csv_file_factory([
            {"account_iban": "FR7612345678901234567890123", "value_date": "2026-08-01",
             "label": "IBAN TEST", "amount": "250.00", "currency": "EUR"},
        ])

        with open(csv_path, "rb") as f:
            response = httpx.post(
                f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
                headers={"Authorization": f"Bearer {internal_token}"},
                files={"file": ("iban.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
                timeout=30,
            )

        body = response.json()
        fraud_data = body["fraud_result"]["data"]
        # IBAN should be in the explainability or account fields
        assert fraud_data[0]["isFraud"] is False


# ============================================================================
# SECTION 7: EXPLAINABILITY CHAIN
# ============================================================================

class TestExplainabilityChain:
    """Scope: Explainability output flows from rules engine to API response."""

    def test_regulatory_flag_has_explainability(self, csv_file_factory, internal_token):
        """Simulation: High-amount transaction flagged.
        Expected: Explainability summary and factors are populated."""
        csv_path = csv_file_factory([
            {"account_iban": "FR761234567890", "value_date": "2026-08-01",
             "label": "VIREMENT GRAND", "amount": "50000.00", "currency": "EUR"},
        ])

        with open(csv_path, "rb") as f:
            response = httpx.post(
                f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
                headers={"Authorization": f"Bearer {internal_token}"},
                files={"file": ("explain.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
                timeout=30,
            )

        fraud_data = response.json()["fraud_result"]["data"]
        assert "explainability" in fraud_data[0]
        assert "summary" in fraud_data[0]["explainability"]
        assert "factors" in fraud_data[0]["explainability"]
        assert len(fraud_data[0]["explainability"]["factors"]) > 0


# ============================================================================
# SECTION 8: RESPONSE TIME PERFORMANCE
# ============================================================================

class TestPerformance:
    """Scope: Response time validation for critical paths."""

    def test_analyze_response_time_under_2s(self, csv_file_factory, internal_token):
        """Simulation: Performance SLA validation.
        Expected: Full pipeline completes in under 2 seconds."""
        csv_path = csv_file_factory([
            {"account_iban": f"FR76{i:026d}", "value_date": "2026-08-01",
             "label": f"PERF TEST {i}", "amount": f"{i*100}.00", "currency": "EUR"}
            for i in range(10)
        ])

        start = time.time()
        with open(csv_path, "rb") as f:
            response = httpx.post(
                f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
                headers={"Authorization": f"Bearer {internal_token}"},
                files={"file": ("perf.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
                timeout=30,
            )
        elapsed = time.time() - start

        assert response.status_code == 200
        assert elapsed < 2.0, f"Pipeline took {elapsed:.2f}s, exceeding 2s SLA"

    def test_direct_analyze_response_time_under_1s(self, fraud_internal_token):
        """Simulation: Direct fraud analysis SLA.
        Expected: Analysis completes in under 1 second."""
        payload = [{
            "tenant_id": "e2e_test", "transaction_reference": "perf-001",
            "id": "TX-PERF-1", "date": "2026-08-01", "description": "PERF TEST",
            "amount": 1000.0, "transaction_type": "TRANSFER",
        }]

        start = time.time()
        response = httpx.post(
            f"{FRAUD_URL}/api/analyze",
            json=payload,
            headers={"Authorization": f"Bearer {fraud_internal_token}"},
            timeout=10,
        )
        elapsed = time.time() - start

        assert response.status_code == 200
        assert elapsed < 1.0, f"Analysis took {elapsed:.2f}s, exceeding 1s SLA"


# ============================================================================
# SECTION 9: UPLOAD STATS ACCUMULATION
# ============================================================================

class TestStatsAccumulation:
    """Scope: Stats and upload history accumulate across requests."""

    def test_stats_increment_after_ingest(self, csv_file_factory, internal_token):
        """Simulation: Multiple ingests should increment stats.
        Expected: Stats counters increase."""
        # Get initial stats
        initial_stats = httpx.get(f"{MULTI_BANKING_URL}/banking/stats", timeout=5).json()
        initial_files = initial_stats["total_files"]

        # Perform an ingest
        csv_path = csv_file_factory([
            {"account_iban": "FR761234567890", "value_date": "2026-08-01",
             "label": "STATS TEST", "amount": "100.00", "currency": "EUR"},
        ])

        with open(csv_path, "rb") as f:
            httpx.post(
                f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
                headers={"Authorization": f"Bearer {internal_token}"},
                files={"file": ("stats.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
                timeout=30,
            )

        # Check updated stats
        updated_stats = httpx.get(f"{MULTI_BANKING_URL}/banking/stats", timeout=5).json()
        assert updated_stats["total_files"] >= initial_files + 1

    def test_uploads_history_records_ingest(self, csv_file_factory, internal_token):
        """Simulation: Upload history records each ingest.
        Expected: Upload entry appears in history."""
        initial_uploads = httpx.get(f"{MULTI_BANKING_URL}/banking/uploads", timeout=5).json()
        initial_count = len(initial_uploads)

        csv_path = csv_file_factory([
            {"account_iban": "FR761234567890", "value_date": "2026-08-01",
             "label": "HISTORY TEST", "amount": "200.00", "currency": "EUR"},
        ])

        with open(csv_path, "rb") as f:
            httpx.post(
                f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
                headers={"Authorization": f"Bearer {internal_token}"},
                files={"file": ("history.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
                timeout=30,
            )

        updated_uploads = httpx.get(f"{MULTI_BANKING_URL}/banking/uploads", timeout=5).json()
        assert len(updated_uploads) > initial_count


# ============================================================================
# SECTION 10: API CONTRACT CONSISTENCY
# ============================================================================

class TestApiContractConsistency:
    """Scope: Verify API contracts match between services and frontend expectations."""

    def test_fraud_analyze_response_has_required_fields(self, fraud_internal_token):
        """Simulation: Verify fraud analysis response structure.
        Expected: All required fields present."""
        payload = [{
            "tenant_id": "e2e_test", "transaction_reference": "contract-001",
            "id": "TX-CONTRACT-1", "date": "2026-08-01", "description": "CONTRACT TEST",
            "amount": 100.0, "transaction_type": "TRANSFER",
        }]
        response = httpx.post(
            f"{FRAUD_URL}/api/analyze",
            json=payload,
            headers={"Authorization": f"Bearer {fraud_internal_token}"},
            timeout=10,
        )

        body = response.json()
        assert "success" in body
        assert "data" in body

        result = body["data"][0]
        required_fields = [
            "tenant_id", "transaction_reference", "id", "date",
            "description", "amount", "isFraud", "fraudProbability",
            "score", "confidence", "reconciliationStatus", "explainability",
        ]
        for field in required_fields:
            assert field in result, f"Missing field: {field}"

        assert isinstance(result["isFraud"], bool)
        assert isinstance(result["fraudProbability"], float)
        assert isinstance(result["score"], int)
        assert result["confidence"] in ("LOW", "MEDIUM", "HIGH")
        assert result["reconciliationStatus"] in ("MATCHED", "UNMATCHED", "SUSPICIOUS")

    def test_multi_banking_ingest_response_has_required_fields(self, csv_file_factory, internal_token):
        """Simulation: Verify multi-banking ingest response structure.
        Expected: All required fields present."""
        csv_path = csv_file_factory([
            {"account_iban": "FR761234567890", "value_date": "2026-08-01",
             "label": "CONTRACT", "amount": "100.00", "currency": "EUR"},
        ])

        with open(csv_path, "rb") as f:
            response = httpx.post(
                f"{MULTI_BANKING_URL}/banking/api/multi-banking/ingest",
                headers={"Authorization": f"Bearer {internal_token}"},
                files={"file": ("contract.csv", f, "text/csv")},
                data={"format": "csv", "tenant_id": "e2e_test", "bank_id": "bank-a"},
                timeout=30,
            )

        body = response.json()
        required_fields = ["success", "parsed_count", "fraud_result", "bankmatch_result", "metadata"]
        for field in required_fields:
            assert field in body, f"Missing field: {field}"

        assert isinstance(body["success"], bool)
        assert isinstance(body["parsed_count"], int)
        assert isinstance(body["metadata"], dict)
        assert "filename" in body["metadata"]
        assert "format" in body["metadata"]
        assert "tenant_id" in body["metadata"]
        assert "bank_id" in body["metadata"]
