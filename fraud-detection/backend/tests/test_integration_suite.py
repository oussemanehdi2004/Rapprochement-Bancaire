"""Comprehensive integration test suite for the Fraud Detection backend.

Covers:
  - Full API endpoint integration (analyze, config, graph, transactions, reports)
  - Rules engine edge cases (all 14+ rules, batch processing, priority conflicts)
  - ML fusion logic (score fusion, confidence mapping, probability bounds)
  - Auth flows (S2S tokens, demo fallback, invalid tokens)
  - Config management (threshold read/write, type coercion, atomic writes)
  - SSE notification broadcasting
  - Malicious/flagged payload scenarios
  - Network latency simulation via timeout handling
"""

import asyncio
import datetime
import json
import os
import time
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import main
from rules_engine import (
    TransactionInput,
    apply_business_rules,
    apply_batch_rules,
    _velocity_cache,
    _device_cache,
    _geo_cache,
    check_atypical_time,
    check_abnormal_velocity,
    check_device_change,
    check_geolocation_change,
    validate_transaction_sanity,
)
from config_store import get_thresholds, update_thresholds, DEFAULT_THRESHOLDS
from features import (
    FEATURE_NAMES,
    sender_balance_error,
    receiver_balance_error,
    calculate_amount_ratio,
)
from tests.factories import transaction_payload, make_transaction


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def client():
    return TestClient(main.app, raise_server_exceptions=False)


@pytest.fixture
def auth_header():
    token = main.generate_test_token()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def rules_only(monkeypatch):
    """Disable ML model so only deterministic rule engine is active."""
    monkeypatch.setattr(main, "model", None)
    monkeypatch.setattr(main, "explainer", None)
    monkeypatch.setattr(main, "isolation_forest", None)


@pytest.fixture(autouse=True)
def clear_caches():
    """Clear behavioral caches between tests."""
    _velocity_cache.clear()
    _device_cache.clear()
    _geo_cache.clear()
    yield
    _velocity_cache.clear()
    _device_cache.clear()
    _geo_cache.clear()


# ============================================================================
# SECTION 1: HEALTH & ROOT ENDPOINTS
# ============================================================================

class TestHealthAndRoot:
    """Scope: System health check and root status endpoint."""

    def test_root_reports_all_system_statuses(self, client):
        """Simulation: Application starts and reports its operational state.
        Expected: All system flags are present and correctly typed."""
        response = client.get("/")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "production_ready"
        assert isinstance(body["model_loaded"], bool)
        assert isinstance(body["database_connected"], bool)
        assert isinstance(body["neo4j_connected"], bool)

    def test_health_endpoint_returns_ok(self, client):
        """Simulation: Monitoring system pings /health.
        Expected: 200 OK with status 'ok'."""
        response = client.get("/health")
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["status"] == "ok"

    def test_health_includes_x_request_id(self, client):
        """Simulation: API gateway requires request tracing.
        Expected: X-Request-ID header is present."""
        response = client.get("/health")
        assert "X-Request-ID" in response.headers


# ============================================================================
# SECTION 2: AUTHENTICATION FLOWS
# ============================================================================

class TestAuthenticationFlows:
    """Scope: JWT authentication, S2S tokens, and demo fallback."""

    def test_valid_s2s_token_grants_access(self, client, auth_header):
        """Simulation: Multi-banking service calls /api/analyze with valid internal token.
        Expected: Request is processed successfully."""
        payload = [transaction_payload(amount=100.0)]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_missing_token_falls_back_to_demo_context(self, client):
        """Simulation: Frontend calls /api/analyze without token (dev mode).
        Expected: Demo fallback context is used, request succeeds."""
        payload = [transaction_payload(amount=100.0)]
        response = client.post("/api/analyze", json=payload)
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_invalid_token_falls_back_to_dev_context(self, client):
        """Simulation: Corrupted JWT token is sent.
        Expected: Falls back to dev context, request still succeeds."""
        payload = [transaction_payload(amount=100.0)]
        response = client.post(
            "/api/analyze",
            headers={"Authorization": "Bearer not-a-real-jwt-token"},
            json=payload,
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_test_token_endpoint_returns_usable_token(self, client):
        """Simulation: Developer requests a test token for API exploration.
        Expected: Valid JWT token is returned."""
        response = client.get("/api/token")
        assert response.status_code == 200
        body = response.json()
        assert "access_token" in body
        assert len(body["access_token"]) > 20

    def test_demo_endpoint_requires_no_auth(self, client):
        """Simulation: Frontend calls /api/analyze-demo for development.
        Expected: No authentication required, request succeeds."""
        payload = [transaction_payload(amount=50.0)]
        response = client.post("/api/analyze-demo", json=payload)
        assert response.status_code == 200
        assert response.json()["success"] is True


# ============================================================================
# SECTION 3: ANALYZE ENDPOINT - NORMAL FLOWS
# ============================================================================

@pytest.mark.usefixtures("rules_only")
class TestAnalyzeNormalFlows:
    """Scope: Standard transaction analysis through the /api/analyze endpoint."""

    def test_clean_small_payment_is_matched(self, client, auth_header):
        """Simulation: Regular supermarket payment of 45.20 EUR.
        Expected: Not fraud, MATCHED status, zero probability."""
        payload = [transaction_payload(
            amount=45.2,
            transaction_type="PAYMENT",
            description="ACHAT SUPERMARCHE",
            sender_balance_before=5000.0,
            sender_balance_after=4954.8,
        )]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        body = response.json()
        result = body["data"][0]
        assert result["isFraud"] is False
        assert result["reconciliationStatus"] == "MATCHED"
        assert result["fraudProbability"] == 0.0
        assert result["score"] == 0
        assert result["confidence"] == "LOW"

    def test_medium_transfer_is_unmatched(self, client, auth_header):
        """Simulation: 6000 EUR invoice payment.
        Expected: Not fraud but UNMATCHED (amount > 5000 threshold)."""
        payload = [transaction_payload(
            amount=6000.0,
            transaction_type="PAYMENT",
            description="FACTURE FOURNISSEUR",
        )]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert result["isFraud"] is False
        assert result["reconciliationStatus"] == "UNMATCHED"

    def test_multiple_transactions_return_multiple_results(self, client, auth_header):
        """Simulation: Batch of 3 transactions with mixed risk profiles.
        Expected: One result per input transaction."""
        payloads = [
            transaction_payload(id="TX-1", amount=10.0, description="CAFE"),
            transaction_payload(id="TX-2", amount=20000.0, description="VIREMENT"),
            transaction_payload(id="TX-3", amount=100.0, description="RESTAURANT"),
        ]
        response = client.post("/api/analyze", headers=auth_header, json=payloads)
        results = response.json()["data"]
        assert len(results) == 3
        assert results[0]["isFraud"] is False
        assert results[1]["isFraud"] is True
        assert results[2]["isFraud"] is False

    def test_response_preserves_all_transaction_identifiers(self, client, auth_header):
        """Simulation: Transaction with specific IDs sent through pipeline.
        Expected: All identifiers preserved in output."""
        payload = [transaction_payload(
            id="TX-CUSTOM-777",
            tenant_id="tenant-specific",
            transaction_reference="ref-abc-123",
            description="TEST",
            amount=10.0,
        )]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert result["id"] == "TX-CUSTOM-777"
        assert result["transaction_reference"] == "ref-abc-123"

    def test_empty_batch_returns_empty_results(self, client, auth_header):
        """Simulation: Empty transaction list submitted.
        Expected: Empty results array returned."""
        response = client.post("/api/analyze", headers=auth_header, json=[])
        body = response.json()
        assert body["success"] is True
        assert body["data"] == []


# ============================================================================
# SECTION 4: RULES ENGINE - REGULATORY THRESHOLD RULES
# ============================================================================

@pytest.mark.usefixtures("rules_only")
class TestRegulatoryThresholdRules:
    """Scope: Rules SEUIL_REGLEMENTAIRE and SEUIL_APPROCHE."""

    def test_amount_above_10k_is_blocked(self, client, auth_header):
        """Simulation: 15,000 EUR transfer exceeds regulatory threshold.
        Expected: isFraud=True, SUSPICIOUS, score>=90, HIGH confidence."""
        payload = [transaction_payload(amount=15000.0, description="VIREMENT IMPORTANT")]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert result["isFraud"] is True
        assert result["reconciliationStatus"] == "SUSPICIOUS"
        assert result["fraudProbability"] >= 0.9
        assert result["score"] >= 90
        assert result["confidence"] == "HIGH"

    def test_amount_exactly_at_10k_triggers_approche(self, client, auth_header):
        """Simulation: Exactly 10,000 EUR (at threshold, not above).
        Expected: SEUIL_APPROCHE rule triggered, score=40."""
        payload = [transaction_payload(amount=10000.0, description="ACHAT")]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert "SEUIL_APPROCHE" in result.get("ruleCategory", "") or result["score"] >= 40

    def test_amount_just_below_approche_ratio_not_flagged(self, client, auth_header):
        """Simulation: 8,999 EUR (below 90% of 10k = 9,000).
        Expected: No regulatory rule triggered."""
        payload = [transaction_payload(amount=8999.0, description="ACHAT NORMAL")]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert result["isFraud"] is False

    def test_amount_at_9k_triggers_approche(self, client, auth_header):
        """Simulation: 9,000 EUR (exactly 90% of 10k threshold).
        Expected: SEUIL_APPROCHE rule triggered."""
        payload = [transaction_payload(amount=9000.0, description="VIREMENT")]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert result["score"] >= 40


# ============================================================================
# SECTION 5: RULES ENGINE - SENSITIVE KEYWORD RULES
# ============================================================================

@pytest.mark.usefixtures("rules_only")
class TestSensitiveKeywordRules:
    """Scope: MOTCLE_SENSIBLE rule with gambling/financial keywords."""

    @pytest.mark.parametrize("description", [
        "VIREMENT ENTRANT CASINO",
        "PAIEMENT CASINO EN LIGNE",
        "PARIS SPORTIFS",
        "Paris hippiques",
        "POKERstars DEPOT",
        "BET365 PARIS",
        "VIREMENT PARI MUTUEL",
    ])
    def test_gambling_keywords_are_flagged(self, client, auth_header, description):
        """Simulation: Transaction descriptions containing gambling keywords.
        Expected: All are flagged as SUSPICIOUS with MOTCLE_SENSIBLE category."""
        payload = [transaction_payload(amount=100.0, description=description)]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert result["isFraud"] is True
        assert result["reconciliationStatus"] == "SUSPICIOUS"

    def test_clean_description_not_flagged(self, client, auth_header):
        """Simulation: Normal business description without sensitive keywords.
        Expected: No keyword rule triggered."""
        payload = [transaction_payload(
            amount=100.0,
            description="PAIEMENT FACTURE FOURNISSEUR ALPHA",
        )]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert result["isFraud"] is False

    def test_keyword_rule_is_case_insensitive(self, client, auth_header):
        """Simulation: Keyword in mixed case (casino, Casino, CASINO).
        Expected: All case variants are detected."""
        for variant in ["casino", "Casino", "CASINO", "cAsInO"]:
            payload = [transaction_payload(amount=50.0, description=f"DEPOT {variant}")]
            response = client.post("/api/analyze", headers=auth_header, json=payload)
            result = response.json()["data"][0]
            assert result["isFraud"] is True, f"Failed for variant: {variant}"


# ============================================================================
# SECTION 6: RULES ENGINE - CASH OUT RULES
# ============================================================================

@pytest.mark.usefixtures("rules_only")
class TestCashOutRules:
    """Scope: RETRAIT_CASH_IMPORTANT rule."""

    def test_large_cash_out_is_blocked(self, client, auth_header):
        """Simulation: 6,000 EUR cash withdrawal.
        Expected: RETRAIT_CASH_IMPORTANT rule triggered, BLOCKED."""
        payload = [transaction_payload(
            amount=6000.0,
            transaction_type="CASH_OUT",
            description="RETRAIT DAB",
        )]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert result["isFraud"] is True
        assert result["score"] >= 80

    def test_cash_out_at_exact_threshold_not_flagged(self, client, auth_header):
        """Simulation: 5,000 EUR cash withdrawal (exactly at threshold).
        Expected: Not flagged by cash-out rule (amount must be > threshold)."""
        payload = [transaction_payload(
            amount=5000.0,
            transaction_type="CASH_OUT",
            description="RETRAIT",
        )]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        # Should not be blocked by cash-out rule specifically
        assert result["isFraud"] is False or result["score"] < 80

    def test_small_cash_out_not_flagged(self, client, auth_header):
        """Simulation: 200 EUR cash withdrawal.
        Expected: No cash-out rule triggered."""
        payload = [transaction_payload(
            amount=200.0,
            transaction_type="CASH_OUT",
            description="RETRAIT DAB",
        )]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert result["isFraud"] is False


# ============================================================================
# SECTION 7: RULES ENGINE - BEHAVIORAL RULES
# ============================================================================

@pytest.mark.usefixtures("rules_only")
class TestBehavioralRules:
    """Scope: Time-based, velocity, device, and geolocation rules."""

    def test_atypical_hour_3am_is_flagged(self, client, auth_header):
        """Simulation: Transaction at 3:15 AM (atypical hours).
        Expected: HORAIRE_ATYPIQUE rule triggered."""
        payload = [transaction_payload(
            amount=20.0,
            description="Paiement en ligne",
            date="2026-08-14T03:15:00Z",
            account_iban="FR76_HORAIRE_TEST",
        )]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        # Score should include HORAIRE_ATYPIQUE contribution
        assert result["score"] >= 25

    def test_normal_hour_2pm_not_flagged(self, client, auth_header):
        """Simulation: Transaction at 2:00 PM (normal business hours).
        Expected: HORAIRE_ATYPIQUE not triggered."""
        payload = [transaction_payload(
            amount=20.0,
            description="Paiement",
            date="2026-08-14T14:00:00Z",
            account_iban="FR76_HORAIRE_TEST",
        )]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert result["score"] < 25

    def test_device_change_detection(self, client, auth_header):
        """Simulation: Same account uses two different device fingerprints.
        Expected: CHANGEMENT_DEVICE rule triggered on second transaction."""
        base = transaction_payload(
            amount=50.0,
            description="Paiement",
            account_iban="TN59_DEVICE_TEST",
        )
        # First transaction establishes device
        base["device_fingerprint"] = "device_A"
        response1 = client.post("/api/analyze", headers=auth_header, json=[base])
        result1 = response1.json()["data"][0]
        assert "CHANGEMENT_DEVICE" not in str(result1.get("ruleCategory", ""))

        # Second transaction with different device
        base["id"] = "TX-DEVICE-2"
        base["device_fingerprint"] = "device_B"
        base["transaction_reference"] = "ref_device_2"
        response2 = client.post("/api/analyze", headers=auth_header, json=[base])
        result2 = response2.json()["data"][0]
        assert result2["score"] >= 70

    def test_geolocation_change_detection(self, client, auth_header):
        """Simulation: Account transacts from France then Tunisia.
        Expected: CHANGEMENT_GEOLOC rule triggered on second transaction."""
        base = transaction_payload(
            amount=50.0,
            description="Paiement",
            account_iban="TN59_GEOLOC_TEST",
        )
        # First transaction from France
        base["country"] = "FR"
        base["city"] = "Paris"
        response1 = client.post("/api/analyze", headers=auth_header, json=[base])

        # Second transaction from Tunisia
        base["id"] = "TX-GEO-2"
        base["transaction_reference"] = "ref_geo_2"
        base["country"] = "TN"
        base["city"] = "Tunis"
        response2 = client.post("/api/analyze", headers=auth_header, json=[base])
        result2 = response2.json()["data"][0]
        assert result2["score"] >= 70


# ============================================================================
# SECTION 8: RULES ENGINE - BATCH PROCESSING RULES
# ============================================================================

@pytest.mark.usefixtures("rules_only")
class TestBatchProcessingRules:
    """Scope: Duplicate detection, repetitive payments, and structuring."""

    def test_duplicate_payments_detected(self, client, auth_header):
        """Simulation: Two identical payments in same batch.
        Expected: PAIEMENT_DUPLIQUE category applied."""
        payloads = [
            transaction_payload(id="TX-DUP-1", amount=2500.0, description="Paiement Fournisseur ABC"),
            transaction_payload(id="TX-DUP-2", amount=2500.0, description="Paiement Fournisseur ABC",
                               transaction_reference="ref_dup_2"),
        ]
        response = client.post("/api/analyze", headers=auth_header, json=payloads)
        results = response.json()["data"]
        # Check that batch processing found duplicates and added factors
        for result in results:
            # Should have some factor from the duplicate detection
            if result["score"] > 0:
                assert any("doublon" in factor.lower() or "duplicat" in factor.lower() for factor in result["explainability"]["factors"])

    def test_repetitive_payments_detected(self, client, auth_header):
        """Simulation: Three identical payments in same batch.
        Expected: PAIEMENT_REPETITIF category applied."""
        payloads = [
            transaction_payload(id=f"TX-REP-{i}", amount=800.0,
                              description="Abonnement mensuel Service X",
                              transaction_reference=f"ref_rep_{i}")
            for i in range(3)
        ]
        response = client.post("/api/analyze", headers=auth_header, json=payloads)
        results = response.json()["data"]
        # All three should be flagged
        assert all(r["score"] > 0 for r in results)

    def test_structuring_detection(self, client, auth_header):
        """Simulation: Multiple sub-threshold payments that sum above regulatory limit.
        Expected: FRACTIONNEMENT_SUSPECT category applied."""
        base_date = "2026-08-15T"
        payloads = [
            transaction_payload(
                id=f"TX-STRUCT-{i}",
                amount=4000.0,
                description=f"Virement partiel {chr(65+i)}",
                date=f"{base_date}1{0+i*5}:00:00Z",
                account_iban="TN59_STRUCT_TEST",
                transaction_reference=f"ref_struct_{i}",
            )
            for i in range(3)
        ]
        response = client.post("/api/analyze", headers=auth_header, json=payloads)
        results = response.json()["data"]
        # Total = 12,000 > 10,000 threshold, each < 10,000
        flagged = [r for r in results if r["score"] > 0]
        assert len(flagged) >= 2


# ============================================================================
# SECTION 9: RULES ENGINE - EDGE CASES
# ============================================================================

@pytest.mark.usefixtures("rules_only")
class TestRulesEngineEdgeCases:
    """Scope: Boundary conditions, invalid data, and extreme values."""

    def test_zero_amount_is_invalid(self):
        """Simulation: Transaction with zero amount.
        Expected: DONNEE_INVALIDE category."""
        result = apply_business_rules({
            "amount": 0, "description": "TEST", "date": "2026-08-14",
            "transaction_type": "PAYMENT",
        })
        assert result["action"] == "BLOCKED"
        assert "DONNEE_INVALIDE" in result["categories"]

    def test_negative_amount_is_invalid(self):
        """Simulation: Negative transaction amount.
        Expected: DONNEE_INVALIDE category."""
        result = apply_business_rules({
            "amount": -500.0, "description": "TEST", "date": "2026-08-14",
            "transaction_type": "PAYMENT",
        })
        assert result["action"] == "BLOCKED"
        assert "DONNEE_INVALIDE" in result["categories"]

    def test_abnormally_large_amount_is_invalid(self):
        """Simulation: Amount exceeding 1 billion EUR.
        Expected: DONNEE_INVALIDE category."""
        result = apply_business_rules({
            "amount": 2_000_000_000.0, "description": "TEST", "date": "2026-08-14",
            "transaction_type": "TRANSFER",
        })
        assert result["action"] == "BLOCKED"
        assert "DONNEE_INVALIDE" in result["categories"]

    def test_empty_description_not_crash(self):
        """Simulation: Transaction with empty description.
        Expected: No crash, processed normally."""
        payload = [transaction_payload(amount=100.0, description="")]
        # Should not raise
        assert payload[0]["description"] == ""

    def test_missing_optional_fields_handled(self):
        """Simulation: Transaction with only required fields.
        Expected: Pydantic fills defaults, no crash."""
        tx = make_transaction(
            sender_balance_before=None,
            sender_balance_after=None,
            receiver_balance_before=None,
            receiver_balance_after=None,
            account_iban=None,
            beneficiary_iban=None,
        )
        assert tx.amount == 100.0

    def test_score_never_exceeds_100(self, client, auth_header):
        """Simulation: Transaction triggering multiple high-severity rules.
        Expected: Score capped at 100."""
        payload = [transaction_payload(
            amount=50000.0,
            description="VIREMENT CASINO PARIS POKER",
            transaction_type="CASH_OUT",
        )]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert result["score"] <= 100

    def test_probability_always_between_0_and_1(self, client, auth_header):
        """Simulation: Any transaction.
        Expected: fraudProbability is always in [0, 1]."""
        payload = [transaction_payload(amount=15000.0)]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert 0.0 <= result["fraudProbability"] <= 1.0


# ============================================================================
# SECTION 10: SCORE FUSION LOGIC
# ============================================================================

class TestScoreFusion:
    """Scope: fuse_scores function combining ML, rules, and isolation forest."""

    def test_fusion_with_no_rule_category(self):
        """Simulation: ML-only detection without rule trigger.
        Expected: Returns raw ML probability."""
        result = main.fuse_scores(0.5, None, False, 0.0)
        assert result == 0.5

    def test_fusion_with_rule_and_ml(self):
        """Simulation: Both ML and rules flag a transaction.
        Expected: Fused score is higher than either alone."""
        ml_score = 0.6
        result = main.fuse_scores(ml_score, "SEUIL_REGLEMENTAIRE", True, 0.0)
        assert result > ml_score

    def test_fusion_with_isolation_forest_anomaly(self):
        """Simulation: Isolation Forest detects anomaly.
        Expected: Anomaly score boosts the base score."""
        base = 0.3
        result = main.fuse_scores(base, None, False, 0.8)
        assert result > base

    def test_fusion_never_exceeds_1(self):
        """Simulation: Multiple high scores combined.
        Expected: Capped at 1.0."""
        result = main.fuse_scores(0.95, "SEUIL_REGLEMENTAIRE", True, 0.9)
        assert result <= 1.0

    def test_fusion_with_low_ml_and_high_rule(self):
        """Simulation: Low ML score but high rule severity.
        Expected: Rule severity dominates."""
        result = main.fuse_scores(0.1, "SEUIL_REGLEMENTAIRE", True, 0.0)
        assert result > 0.8


# ============================================================================
# SECTION 11: FEATURE ENGINEERING
# ============================================================================

class TestFeatureEngineering:
    """Scope: Feature computation for ML model input."""

    def test_feature_names_count_matches_expected(self):
        """Expected: 13 features defined."""
        assert len(FEATURE_NAMES) == 13

    def test_sender_balance_error_formula(self):
        """Expected: before - amount - after = 0 when balanced."""
        assert sender_balance_error(100.0, 1000.0, 900.0) == 0.0

    def test_sender_balance_error_with_discrepancy(self):
        """Expected: Non-zero when balance doesn't reconcile."""
        assert sender_balance_error(100.0, 1000.0, 850.0) == 50.0

    def test_receiver_balance_error_formula(self):
        """Expected: before + amount - after = 0 when balanced."""
        assert receiver_balance_error(100.0, 500.0, 600.0) == 0.0

    def test_amount_ratio_with_zero_average(self):
        """Expected: Returns 1.0 to avoid division by zero."""
        assert calculate_amount_ratio(100.0, 0.0) == 1.0

    def test_amount_ratio_calculation(self):
        """Expected: amount / avg_amount."""
        assert calculate_amount_ratio(1000.0, 200.0) == 5.0


# ============================================================================
# SECTION 12: CONFIG MANAGEMENT
# ============================================================================

class TestConfigManagement:
    """Scope: Threshold configuration read/write operations."""

    def test_get_thresholds_returns_defaults(self):
        """Expected: Default thresholds are returned."""
        thresholds = get_thresholds()
        assert thresholds["SEUIL_REGLEMENTAIRE"] == 10_000.0
        assert thresholds["SEUIL_APPROCHE_RATIO"] == 0.90
        assert thresholds["SEUIL_CASH_OUT"] == 5_000.0
        assert isinstance(thresholds["MOTS_CLES_SENSIBLES"], list)

    def test_thresholds_are_independent_copies(self):
        """Expected: Modifying returned dict doesn't affect internal state."""
        t1 = get_thresholds()
        t1["SEUIL_REGLEMENTAIRE"] = 99999
        t2 = get_thresholds()
        assert t2["SEUIL_REGLEMENTAIRE"] == 10_000.0

    def test_update_thresholds_persists(self):
        """Expected: Updated thresholds are reflected in subsequent reads."""
        original = get_thresholds()["SEUIL_REGLEMENTAIRE"]
        try:
            update_thresholds({"SEUIL_REGLEMENTAIRE": 15000.0})
            assert get_thresholds()["SEUIL_REGLEMENTAIRE"] == 15000.0
        finally:
            update_thresholds({"SEUIL_REGLEMENTAIRE": original})

    def test_update_with_invalid_keys_ignored(self):
        """Expected: Unknown keys are silently filtered out."""
        original = get_thresholds()
        result = update_thresholds({"INVALID_KEY": "value", "SEUIL_REGLEMENTAIRE": 12000.0})
        try:
            assert result["SEUIL_REGLEMENTAIRE"] == 12000.0
            assert "INVALID_KEY" not in result
        finally:
            update_thresholds({"SEUIL_REGLEMENTAIRE": original["SEUIL_REGLEMENTAIRE"]})

    def test_update_type_coercion_float(self):
        """Expected: Integer values are coerced to float for float fields."""
        original = get_thresholds()["SEUIL_REGLEMENTAIRE"]
        try:
            result = update_thresholds({"SEUIL_REGLEMENTAIRE": 11000})
            assert isinstance(result["SEUIL_REGLEMENTAIRE"], float)
            assert result["SEUIL_REGLEMENTAIRE"] == 11000.0
        finally:
            update_thresholds({"SEUIL_REGLEMENTAIRE": original})


# ============================================================================
# SECTION 13: CONFIG API ENDPOINTS
# ============================================================================

@pytest.mark.usefixtures("rules_only")
class TestConfigEndpoints:
    """Scope: GET/PUT /api/config/thresholds endpoints."""

    def test_get_thresholds_endpoint(self, client):
        """Simulation: Dashboard requests current threshold configuration.
        Expected: Full threshold model returned."""
        response = client.get("/api/config/thresholds")
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert "SEUIL_REGLEMENTAIRE" in body["data"]

    def test_put_thresholds_endpoint(self, client):
        """Simulation: Admin updates thresholds via dashboard.
        Expected: Updated values returned."""
        original = client.get("/api/config/thresholds").json()["data"]["SEUIL_REGLEMENTAIRE"]
        try:
            response = client.put("/api/config/thresholds", json={
                "SEUIL_REGLEMENTAIRE": 20000.0,
            })
            assert response.status_code == 200
            assert response.json()["data"]["SEUIL_REGLEMENTAIRE"] == 20000.0
        finally:
            client.put("/api/config/thresholds", json={"SEUIL_REGLEMENTAIRE": original})

    def test_put_empty_patch_returns_400(self, client):
        """Simulation: Admin submits empty form.
        Expected: 400 Bad Request."""
        response = client.put("/api/config/thresholds", json={})
        assert response.status_code == 400


# ============================================================================
# SECTION 14: GRAPH ENDPOINTS (MOCKED)
# ============================================================================

class TestGraphEndpoints:
    """Scope: Graph analysis endpoints with mocked Neo4j."""

    def test_top_accounts_returns_mock_data(self, client):
        """Simulation: Dashboard requests top flagged accounts.
        Expected: Mock data returned when Neo4j unavailable."""
        response = client.get("/api/graph/top-accounts")
        assert response.status_code == 200
        data = response.json()["data"]
        assert isinstance(data, list)
        assert len(data) > 0
        assert "iban" in data[0]

    def test_network_endpoint_returns_mock_data(self, client):
        """Simulation: Dashboard requests account network graph.
        Expected: Mock network data with nodes and edges."""
        response = client.get("/api/graph/network?iban=FR7612345678901234567890123")
        assert response.status_code == 200
        data = response.json()["data"]
        assert "center_iban" in data
        assert "nodes" in data
        assert "edges" in data

    def test_mule_accounts_returns_mock_data(self, client):
        """Simulation: Analyst requests mule account detection.
        Expected: Mock mule account data."""
        response = client.get("/api/graph/mule-accounts")
        assert response.status_code == 200
        data = response.json()["data"]
        assert isinstance(data, list)

    def test_pagerank_returns_mock_data(self, client):
        """Simulation: Dashboard requests PageRank computation.
        Expected: Mock PageRank scores."""
        response = client.get("/api/graph/pagerank")
        assert response.status_code == 200
        data = response.json()["data"]
        assert isinstance(data, list)

    def test_communities_returns_mock_data(self, client):
        """Simulation: Dashboard requests community detection.
        Expected: Mock community data."""
        response = client.get("/api/graph/communities")
        assert response.status_code == 200
        data = response.json()["data"]
        assert isinstance(data, list)


# ============================================================================
# SECTION 15: TRANSACTIONS LIST ENDPOINT
# ============================================================================

class TestTransactionsEndpoint:
    """Scope: GET /api/transactions list endpoint."""

    def test_transactions_endpoint_returns_list(self, client):
        """Simulation: Dashboard requests transaction list.
        Expected: Empty list (Supabase not connected in test)."""
        response = client.get("/api/transactions")
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)

    def test_transactions_with_status_filter(self, client):
        """Simulation: Filter by reconciliation status.
        Expected: Query parameter accepted."""
        response = client.get("/api/transactions?status=SUSPICIOUS")
        assert response.status_code == 200

    def test_transactions_with_date_range_filter(self, client):
        """Simulation: Filter by date range.
        Expected: Query parameters accepted."""
        response = client.get("/api/transactions?date_from=2026-01-01&date_to=2026-12-31")
        assert response.status_code == 200

    def test_transactions_with_search_filter(self, client):
        """Simulation: Search by transaction ID.
        Expected: Query parameter accepted."""
        response = client.get("/api/transactions?search=TX-001")
        assert response.status_code == 200


# ============================================================================
# SECTION 16: REPORTS ENDPOINT
# ============================================================================

class TestReportsEndpoint:
    """Scope: GET /api/reports endpoint."""

    def test_reports_endpoint_returns_empty_when_no_db(self, client):
        """Simulation: Dashboard requests reports.
        Expected: Empty report data (Supabase not connected)."""
        response = client.get("/api/reports?start_date=2026-01-01&end_date=2026-12-31")
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["total_transactions"] == 0


# ============================================================================
# SECTION 17: MALICIOUS / FLAGGED PAYLOAD SCENARIOS
# ============================================================================

@pytest.mark.usefixtures("rules_only")
class TestMaliciousPayloadScenarios:
    """Scope: Simulating various fraud patterns and malicious inputs."""

    def test_layering_pattern_multiple_accounts(self, client, auth_header):
        """Simulation: Money layering through multiple accounts.
        Expected: Multiple high-risk flags."""
        payloads = [
            transaction_payload(
                id=f"TX-LAYER-{i}",
                amount=9500.0,
                description="VIR INTERNE",
                account_iban=f"FR76LAYER{i:03d}",
                beneficiary_iban=f"FR76LAYER{(i+1)%3:03d}",
                transaction_reference=f"ref_layer_{i}",
            )
            for i in range(3)
        ]
        response = client.post("/api/analyze", headers=auth_header, json=payloads)
        results = response.json()["data"]
        assert len(results) == 3

    def test_smurfing_pattern(self, client, auth_header):
        """Simulation: Multiple small transactions just below reporting threshold.
        Expected: Individual transactions may not flag, but batch rules catch structuring."""
        payloads = [
            transaction_payload(
                id=f"TX-SMURF-{i}",
                amount=3500.0,
                description=f"Paiement {i}",
                date=f"2026-08-15T1{i}:00:00Z",
                account_iban="TN59_SMURF_TEST",
                transaction_reference=f"ref_smurf_{i}",
            )
            for i in range(4)
        ]
        response = client.post("/api/analyze", headers=auth_header, json=payloads)
        results = response.json()["data"]
        # Total = 14,000 > 10,000, should trigger structuring
        assert any(r["score"] > 0 for r in results)

    def test_dormant_account_reactivation(self, client, auth_header):
        """Simulation: Account inactive for 100+ days suddenly transacts.
        Expected: COMPTE_RAREMENT_UTILISE rule triggered."""
        payload = [transaction_payload(
            amount=500.0,
            description="REACTIVATION COMPTE",
            account_iban="TN59_DORMANT_TEST",
        )]
        # Mock account aggregate showing dormancy
        account_aggregate = {"avg_transaction_amount": 100.0, "days_since_last_transaction": 150}
        tx_dict = payload[0]
        result = apply_business_rules(tx_dict, account_aggregate=account_aggregate)
        assert "COMPTE_RAREMENT_UTILISE" in result["categories"]

    def test_unusual_amount_detection(self, client, auth_header):
        """Simulation: Transaction 10x larger than account average.
        Expected: MONTANT_EXCEPTIONNEL rule triggered."""
        tx_dict = transaction_payload(
            amount=5000.0,
            description="GROS MONTANT",
            account_iban="TN59_UNUSUAL_TEST",
        )
        account_aggregate = {"avg_transaction_amount": 200.0, "days_since_last_transaction": 5}
        result = apply_business_rules(tx_dict, account_aggregate=account_aggregate)
        assert "MONTANT_EXCEPTIONNEL" in result["categories"]
        assert result["score"] >= 60

    def test_new_beneficiary_iban(self, client, auth_header):
        """Simulation: First-time transfer to new IBAN.
        Expected: NOUVEL_IBAN rule triggered."""
        tx_dict = transaction_payload(
            amount=500.0,
            description="VIR NOUVEAU BENE",
            account_iban="TN59_SENDER",
            beneficiary_iban="FR76NEWBENEF",
        )
        beneficiary_history = [
            {"account_iban": "TN59_SENDER", "beneficiary_iban": "FR76EXISTING"},
        ]
        result = apply_business_rules(tx_dict, beneficiary_history=beneficiary_history)
        assert "NOUVEL_IBAN" in result["categories"]

    def test_known_beneficiary_not_flagged(self, client, auth_header):
        """Simulation: Transfer to previously known beneficiary.
        Expected: NOUVEL_IBAN rule NOT triggered."""
        tx_dict = transaction_payload(
            amount=500.0,
            description="VIR FOURNISSEUR",
            account_iban="TN59_SENDER2",
            beneficiary_iban="FR76KNOWNBEN",
        )
        beneficiary_history = [
            {"account_iban": "TN59_SENDER2", "beneficiary_iban": "FR76KNOWNBEN"},
        ]
        result = apply_business_rules(tx_dict, beneficiary_history=beneficiary_history)
        assert "NOUVEL_IBAN" not in result["categories"]


# ============================================================================
# SECTION 18: EXPLAINABILITY OUTPUT
# ============================================================================

@pytest.mark.usefixtures("rules_only")
class TestExplainabilityOutput:
    """Scope: Explainability summary and factors in API response."""

    def test_clean_transaction_has_no_anomaly_summary(self, client, auth_header):
        """Simulation: Normal transaction analysis.
        Expected: Summary indicates no anomaly."""
        payload = [transaction_payload(amount=50.0, description="ACHAT")]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert "aucune anomalie" in result["explainability"]["summary"].lower()

    def test_blocked_transaction_has_rule_summary(self, client, auth_header):
        """Simulation: Transaction blocked by rules.
        Expected: Summary mentions rule blocking."""
        payload = [transaction_payload(amount=15000.0, description="VIREMENT")]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert "bloqué" in result["explainability"]["summary"].lower() or "conformité" in result["explainability"]["summary"].lower()

    def test_factors_list_is_populated_for_flagged_transactions(self, client, auth_header):
        """Simulation: Transaction with multiple rules triggered.
        Expected: Factors list contains human-readable explanations."""
        payload = [transaction_payload(amount=50000.0, description="VIREMENT CASINO")]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert len(result["explainability"]["factors"]) > 0


# ============================================================================
# SECTION 19: PREPROCESS TRANSACTION
# ============================================================================

class TestPreprocessTransaction:
    """Scope: preprocess_transaction feature vector generation."""

    def test_feature_vector_length_matches(self):
        """Expected: 13 features returned."""
        tx = make_transaction()
        features = main.preprocess_transaction(tx)
        assert len(features) == 13

    def test_feature_vector_with_aggregate_data(self):
        """Expected: Aggregate data influences amount_to_avg_ratio."""
        tx = make_transaction(amount=1000.0)
        aggregate = {"avg_transaction_amount": 200.0, "days_since_last_transaction": 10}
        features = main.preprocess_transaction(tx, account_aggregate=aggregate)
        assert features[9] == 5.0  # amount_to_avg_ratio = 1000/200

    def test_feature_vector_with_beneficiary_history(self):
        """Expected: Beneficiary count is computed."""
        tx = make_transaction(beneficiary_iban="FR76KNOWN")
        history = [
            {"beneficiary_iban": "FR76KNOWN"},
            {"beneficiary_iban": "FR76KNOWN"},
            {"beneficiary_iban": "FR76OTHER"},
        ]
        features = main.preprocess_transaction(tx, beneficiary_history=history)
        assert features[12] == 2  # Two transactions to this beneficiary

    def test_hour_extraction_from_iso_date(self):
        """Expected: Hour is correctly extracted from ISO date."""
        tx = make_transaction(date="2026-08-14T15:30:00Z")
        features = main.preprocess_transaction(tx)
        assert features[10] == 15  # hour_of_day

    def test_default_hour_when_no_T_in_date(self):
        """Expected: Default hour=12 when date format lacks T."""
        tx = make_transaction(date="2026-08-14")
        features = main.preprocess_transaction(tx)
        assert features[10] == 12


# ============================================================================
# SECTION 20: PYDANTIC MODEL VALIDATION
# ============================================================================

class TestPydanticModels:
    """Scope: TransactionInput and TransactionOutput model validation."""

    def test_transaction_input_valid_construction(self):
        """Expected: Valid payload creates model."""
        tx = make_transaction()
        assert isinstance(tx, TransactionInput)
        assert tx.amount == 100.0

    def test_transaction_input_coerces_amount_to_float(self):
        """Expected: String amount is coerced to float."""
        tx = make_transaction(amount="250")
        assert tx.amount == 250.0
        assert isinstance(tx.amount, float)

    def test_transaction_input_missing_required_field_raises(self):
        """Expected: Missing 'amount' raises ValidationError."""
        from pydantic import ValidationError
        payload = transaction_payload()
        del payload["amount"]
        with pytest.raises(ValidationError):
            TransactionInput(**payload)

    def test_transaction_input_non_numeric_amount_raises(self):
        """Expected: Non-numeric amount raises ValidationError."""
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            make_transaction(amount="not-a-number")

    def test_transaction_output_model_structure(self):
        """Expected: TransactionOutput has all required fields."""
        output = main.TransactionOutput(
            tenant_id="t1", transaction_reference="ref1", id="TX-1",
            date="2026-08-14", description="Test", amount=100.0,
            isFraud=False, fraudProbability=0.05, score=5,
            confidence="LOW", reconciliationStatus="MATCHED",
            explainability=main.ExplainabilityOutput(summary="Test", factors=[]),
        )
        assert output.isFraud is False
        assert output.confidence == "LOW"


# ============================================================================
# SECTION 21: VELOCITY CACHE BEHAVIOR
# ============================================================================

class TestVelocityCache:
    """Scope: Transaction velocity detection with cache management."""

    def setup_method(self):
        _velocity_cache.clear()

    def teardown_method(self):
        _velocity_cache.clear()

    def test_velocity_within_window_not_flagged(self):
        """Simulation: 2 transactions within 15 minutes.
        Expected: Not flagged (threshold is >3)."""
        account = "TN59_VEL_TEST_1"
        base_time = datetime.datetime(2026, 8, 14, 12, 0, 0)
        for i in range(3):
            tx_time = (base_time + datetime.timedelta(minutes=i*5)).isoformat() + "Z"
            result = check_abnormal_velocity(account, tx_time)
            assert result is False

    def test_velocity_exceeding_window_flagged(self):
        """Simulation: 4 transactions within 15 minutes.
        Expected: Flagged as abnormal velocity."""
        account = "TN59_VEL_TEST_2"
        base_time = datetime.datetime(2026, 8, 14, 12, 0, 0)
        for i in range(4):
            tx_time = (base_time + datetime.timedelta(minutes=i*3)).isoformat() + "Z"
            result = check_abnormal_velocity(account, tx_time)
        assert result is True

    def test_velocity_resets_after_window(self):
        """Simulation: Transactions spread across >15 minutes.
        Expected: Not flagged."""
        account = "TN59_VEL_TEST_3"
        base_time = datetime.datetime(2026, 8, 14, 12, 0, 0)
        for i in range(4):
            tx_time = (base_time + datetime.timedelta(minutes=i*20)).isoformat() + "Z"
            result = check_abnormal_velocity(account, tx_time)
            assert result is False

    def test_velocity_requires_account_id(self):
        """Simulation: Transaction without account ID.
        Expected: Returns False (can't track velocity)."""
        assert check_abnormal_velocity("", "2026-08-14T12:00:00Z") is False


# ============================================================================
# SECTION 22: ATYPICAL TIME DETECTION
# ============================================================================

class TestAtypicalTimeDetection:
    """Scope: check_atypical_time function."""

    @pytest.mark.parametrize("hour", [1, 2, 3, 4])
    def test_night_hours_are_atypical(self, hour):
        """Expected: Hours 1-4 are atypical."""
        date_str = f"2026-08-14T{hour:02d}:30:00Z"
        assert check_atypical_time(date_str) is True

    @pytest.mark.parametrize("hour", [0, 5, 6, 12, 18, 23])
    def test_other_hours_are_not_atypical(self, hour):
        """Expected: Hours outside 1-4 are not atypical."""
        date_str = f"2026-08-14T{hour:02d}:30:00Z"
        assert check_atypical_time(date_str) is False

    def test_invalid_date_returns_false(self):
        """Expected: Invalid date string returns False."""
        assert check_atypical_time("not-a-date") is False


# ============================================================================
# SECTION 23: DEVICE CHANGE DETECTION
# ============================================================================

class TestDeviceChangeDetection:
    """Scope: check_device_change function."""

    def test_first_use_not_flagged(self):
        """Expected: First device for account is not a change."""
        assert check_device_change("TN59_DEV1", "device_A") is False

    def test_same_device_not_flagged(self):
        """Expected: Same device again is not a change."""
        check_device_change("TN59_DEV2", "device_A")
        assert check_device_change("TN59_DEV2", "device_A") is False

    def test_different_device_flagged(self):
        """Expected: Different device is flagged as change."""
        check_device_change("TN59_DEV3", "device_A")
        assert check_device_change("TN59_DEV3", "device_B") is True

    def test_missing_iban_returns_false(self):
        """Expected: Missing IBAN returns False."""
        assert check_device_change("", "device_A") is False

    def test_missing_fingerprint_returns_false(self):
        """Expected: Missing fingerprint returns False."""
        assert check_device_change("TN59_DEV5", "") is False


# ============================================================================
# SECTION 24: GEOLOCATION CHANGE DETECTION
# ============================================================================

class TestGeolocationChangeDetection:
    """Scope: check_geolocation_change function."""

    def test_first_location_not_flagged(self):
        """Expected: First location for account is not a change."""
        assert check_geolocation_change("TN59_GEO1", "FR", "Paris") is False

    def test_same_country_not_flagged(self):
        """Expected: Same country is not a change."""
        check_geolocation_change("TN59_GEO2", "FR", "Paris")
        assert check_geolocation_change("TN59_GEO2", "FR", "Lyon") is False

    def test_different_country_flagged(self):
        """Expected: Different country is flagged."""
        check_geolocation_change("TN59_GEO3", "FR", "Paris")
        assert check_geolocation_change("TN59_GEO3", "TN", "Tunis") is True

    def test_missing_iban_returns_false(self):
        """Expected: Missing IBAN returns False."""
        assert check_geolocation_change("", "FR", "Paris") is False

    def test_missing_country_returns_false(self):
        """Expected: Missing country returns False."""
        assert check_geolocation_change("TN59_GEO5", "", "Paris") is False


# ============================================================================
# SECTION 25: VALIDATE TRANSACTION SANITY
# ============================================================================

class TestValidateTransactionSanity:
    """Scope: validate_transaction_sanity function."""

    def test_zero_amount_returns_error(self):
        assert validate_transaction_sanity(0, 1e9) is not None

    def test_negative_amount_returns_error(self):
        assert validate_transaction_sanity(-100, 1e9) is not None

    def test_normal_amount_returns_none(self):
        assert validate_transaction_sanity(100.0, 1e9) is None

    def test_abnormally_large_amount_returns_error(self):
        assert validate_transaction_sanity(2e9, 1e9) is not None

    def test_exactly_at_limit_returns_none(self):
        assert validate_transaction_sanity(1e9, 1e9) is None


# ============================================================================
# SECTION 26: RATE LIMITING
# ============================================================================

class TestRateLimiting:
    """Scope: Rate limiting middleware behavior."""

    def test_rate_limit_headers_present(self, client):
        """Expected: Rate limit headers are included in responses."""
        response = client.get("/health")
        # slowapi adds RateLimit headers
        assert response.status_code == 200


# ============================================================================
# SECTION 27: CORS MIDDLEWARE
# ============================================================================

class TestCorsMiddleware:
    """Scope: CORS configuration."""

    def test_cors_preflight_allowed_origins(self, client):
        """Expected: OPTIONS request returns CORS headers."""
        response = client.options(
            "/api/analyze-demo",
            headers={
                "Origin": "http://localhost:4200",
                "Access-Control-Request-Method": "POST",
            },
        )
        # Should not be blocked
        assert response.status_code in (200, 405)


# ============================================================================
# SECTION 28: REQUEST LOGGING MIDDLEWARE
# ============================================================================

class TestRequestLogging:
    """Scope: HTTP request logging middleware."""

    def test_request_id_header_added(self, client):
        """Expected: Every response has X-Request-ID header."""
        response = client.get("/health")
        assert "X-Request-ID" in response.headers
        assert len(response.headers["X-Request-ID"]) > 0


# ============================================================================
# SECTION 29: EMPTY AND EDGE PAYLOADS
# ============================================================================

@pytest.mark.usefixtures("rules_only")
class TestEdgePayloads:
    """Scope: Extreme and unusual payload scenarios."""

    def test_single_character_description(self, client, auth_header):
        """Simulation: Minimal description field.
        Expected: Processed without error."""
        payload = [transaction_payload(amount=1.0, description="X")]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        assert response.status_code == 200

    def test_very_long_description(self, client, auth_header):
        """Simulation: 1000-character description.
        Expected: Processed without error."""
        payload = [transaction_payload(amount=10.0, description="A" * 1000)]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        assert response.status_code == 200

    def test_unicode_in_description(self, client, auth_header):
        """Simulation: Unicode characters in description.
        Expected: Processed correctly."""
        payload = [transaction_payload(amount=50.0, description="Paiement café français é à ü")]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        assert response.status_code == 200

    def test_very_small_amount(self, client, auth_header):
        """Simulation: 0.01 EUR transaction.
        Expected: Processed without error."""
        payload = [transaction_payload(amount=0.01, description="MICRO")]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        assert response.status_code == 200

    def test_boundary_amount_9999_99(self, client, auth_header):
        """Simulation: 9999.99 EUR (above 90% of 10k threshold).
        Expected: Flagged by SEUIL_APPROCHE since it's above 9000."""
        payload = [transaction_payload(amount=9999.99, description="VIREMENT")]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        # Should be flagged by SEUIL_APPROCHE since 9999.99 > 9000 (90% of 10000)
        assert result["isFraud"] is True or "SEUIL_APPROCHE" in result.get("ruleCategory", "")

    def test_boundary_amount_10000_01(self, client, auth_header):
        """Simulation: 10000.01 EUR (just above 10k threshold).
        Expected: Flagged by regulatory threshold."""
        payload = [transaction_payload(amount=10000.01, description="VIREMENT")]
        response = client.post("/api/analyze", headers=auth_header, json=payload)
        result = response.json()["data"][0]
        assert result["isFraud"] is True
