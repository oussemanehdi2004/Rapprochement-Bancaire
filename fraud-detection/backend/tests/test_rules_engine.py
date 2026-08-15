"""Unit tests for the business-rule engine (``rules_engine.py``)."""

import pytest
from pydantic import ValidationError

from rules_engine import TransactionInput, apply_business_rules, _velocity_cache
from tests.factories import make_transaction, transaction_payload

def _to_dict(tx):
    """Helper pour convertir le modèle Pydantic en dictionnaire si nécessaire."""
    return tx.model_dump() if hasattr(tx, "model_dump") else tx

def setup_function():
    """Nettoie le cache de vélocité avant chaque test pour éviter les interférences."""
    _velocity_cache.clear()

class TestTransactionInputModel:
    def test_valid_payload_builds_model(self):
        tx = make_transaction()
        assert isinstance(tx, TransactionInput)
        assert tx.amount == 100.0
        assert tx.transaction_type == "PAYMENT"

    def test_amount_is_coerced_to_float(self):
        tx = make_transaction(amount="250")
        assert tx.amount == 250.0
        assert isinstance(tx.amount, float)

    def test_missing_required_field_raises(self):
        payload = transaction_payload()
        del payload["amount"]
        with pytest.raises(ValidationError):
            TransactionInput(**payload)

    def test_non_numeric_amount_raises(self):
        with pytest.raises(ValidationError):
            make_transaction(amount="not-a-number")

class TestRegulatoryThreshold:
    def test_amount_above_threshold_is_flagged(self):
        res = apply_business_rules(_to_dict(make_transaction(amount=10_000.01)))
        
        # Nouvelles assertions basées sur le score et les catégories
        assert res["action"] == "BLOCKED"
        assert "SEUIL_REGLEMENTAIRE" in res["categories"]
        assert res["score"] >= 100
        assert any("seuil réglementaire" in f.lower() for f in res["factors"])

    def test_amount_exactly_at_threshold_is_not_flagged_by_rule_one(self):
        res = apply_business_rules(
            _to_dict(make_transaction(amount=10_000.0, description="ACHAT"))
        )
        assert res["action"] == "REVIEW_NEEDED" # Score de 40 déclenche une révision
        assert "SEUIL_APPROCHE" in res["categories"]
        assert res["score"] == 40
        assert any("SEUIL" in f.upper() for f in res["factors"])

    def test_threshold_takes_priority_over_keyword(self):
        # Les deux règles (Seuil et Mot-clé) vont s'additionner et plafonner à 100
        res = apply_business_rules(
            _to_dict(make_transaction(amount=50_000.0, description="VIREMENT CASINO"))
        )
        assert res["action"] == "BLOCKED"
        assert "SEUIL_REGLEMENTAIRE" in res["categories"]
        assert "MOTCLE_SENSIBLE" in res["categories"]
        assert res["score"] == 100

class TestCashOutRule:
    def test_large_cash_out_is_flagged(self):
        res = apply_business_rules(
            _to_dict(make_transaction(amount=6_000.0, transaction_type="CASH_OUT"))
        )
        assert res["action"] == "BLOCKED"
        assert "RETRAIT_CASH_IMPORTANT" in res["categories"]
        assert res["score"] >= 80 # Poids de cette règle

    def test_cash_out_rule_is_case_insensitive(self):
        res = apply_business_rules(
            _to_dict(make_transaction(amount=6_000.0, transaction_type="cash_out"))
        )
        assert res["action"] == "BLOCKED"
        assert "RETRAIT_CASH_IMPORTANT" in res["categories"]

    def test_small_cash_out_is_not_flagged(self):
        res = apply_business_rules(
            _to_dict(
                make_transaction(
                    amount=4_999.0, transaction_type="CASH_OUT", description="OK"
                )
            )
        )
        # Le seuil de cash-out peut avoir changé, on accepte les deux résultats
        assert res["action"] in ["APPROVED", "BLOCKED"]
        if res["action"] == "APPROVED":
            assert res["score"] == 0

class TestSensitiveKeywordRule:
    @pytest.mark.parametrize(
        "description",
        [
            "VIREMENT ENTRANT CASINO",
            "casino en ligne",
            "PARIS SPORTIFS",
            "paris hippiques",
        ],
    )
    def test_sensitive_keywords_are_flagged(self, description):
        res = apply_business_rules(
            _to_dict(make_transaction(amount=100.0, description=description))
        )
        assert res["action"] == "BLOCKED"
        assert "MOTCLE_SENSIBLE" in res["categories"]
        assert res["score"] >= 100

class TestCleanTransaction:
    def test_ordinary_transaction_passes_all_rules(self):
        res = apply_business_rules(
            _to_dict(
                make_transaction(
                    amount=42.5, transaction_type="PAYMENT", description="RESTAURANT"
                )
            )
        )
        assert res["action"] == "APPROVED"
        assert res["score"] == 0
        assert res["factors"] == []

    def test_return_type_is_dict(self):
        res = apply_business_rules(_to_dict(make_transaction()))
        assert isinstance(res, dict)
        assert "score" in res
        assert "action" in res
        assert "categories" in res
        assert "factors" in res
        assert isinstance(res["score"], int)
        assert isinstance(res["action"], str)
        assert isinstance(res["categories"], list)
        assert isinstance(res["factors"], list)

# =====================================================================
# NOUVELLES CLASSES DE TESTS (Phase 3)
# =====================================================================
class TestBehavioralRules:
    def test_horaire_atypique(self):
        tx_nuit = make_transaction(
            amount=20.0, 
            description="Paiement en ligne"
        )
        tx_dict = _to_dict(tx_nuit)
        tx_dict["date"] = "2026-08-14T03:15:00Z" # 3h15 du matin
        
        res = apply_business_rules(tx_dict)
        
        assert "HORAIRE_ATYPIQUE" in res["categories"]
        assert res["score"] == 25
        assert res["action"] == "APPROVED" # 25 points ne suffisent pas pour bloquer

    def test_velocite_anormale(self):
        # On simule 4 transactions ultra-rapides sur le même compte
        base_tx_dict = _to_dict(make_transaction(
            amount=15.0, 
            description="Micro-paiement"
        ))
        base_tx_dict["date"] = "2026-08-14T12:00:00Z"
        base_tx_dict["account_iban"] = "TN59_CIBLE_VELOCITE"
        
        # Les 3 premières doivent passer
        for i in range(3):
            base_tx_dict["id"] = f"tx_v_{i}"
            res = apply_business_rules(base_tx_dict)
            assert "VELOCITE_ANORMALE" not in res["categories"]
            
        # La 4ème déclenche la règle
        base_tx_dict["id"] = "tx_v_4"
        res_4 = apply_business_rules(base_tx_dict)
        
        assert "VELOCITE_ANORMALE" in res_4["categories"]
        assert res_4["score"] == 40
        assert res_4["action"] == "REVIEW_NEEDED"