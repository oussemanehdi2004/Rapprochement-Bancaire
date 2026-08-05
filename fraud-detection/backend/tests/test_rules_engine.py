"""Unit tests for the business-rule engine (``rules_engine.py``)."""

import pytest
from pydantic import ValidationError

from rules_engine import TransactionInput, apply_business_rules
from tests.factories import make_transaction, transaction_payload


def _to_dict(tx):
    """Helper pour convertir le modèle Pydantic en dictionnaire si nécessaire."""
    return tx.model_dump() if hasattr(tx, "model_dump") else tx


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
        assert res["is_blocked"] is True
        assert res["ruleCategory"] == "SEUIL_REGLEMENTAIRE"
        assert any("seuil réglementaire" in f.lower() for f in res["factors"])

    def test_amount_exactly_at_threshold_is_not_flagged_by_rule_one(self):
        # La règle 1 utilise une comparaison stricte ``> 10000``.
        res = apply_business_rules(
            _to_dict(make_transaction(amount=10_000.0, description="ACHAT"))
        )
        assert res["is_blocked"] is False
        assert res["ruleCategory"] == "SEUIL_APPROCHE"
        assert any("SEUIL" in f.upper() for f in res["factors"])

    def test_threshold_takes_priority_over_keyword(self):
        # Un montant très élevé correspondant aussi à un mot-clé doit rapporter
        # la catégorie de seuil réglementaire car la règle est prioritaire.
        res = apply_business_rules(
            _to_dict(make_transaction(amount=50_000.0, description="VIREMENT CASINO"))
        )
        assert res["is_blocked"] is True
        assert res["ruleCategory"] == "SEUIL_REGLEMENTAIRE"
        assert any("seuil réglementaire" in f.lower() for f in res["factors"])


class TestCashOutRule:
    def test_large_cash_out_is_flagged(self):
        res = apply_business_rules(
            _to_dict(make_transaction(amount=6_000.0, transaction_type="CASH_OUT"))
        )
        assert res["is_blocked"] is True
        assert res["ruleCategory"] == "RETRAIT_CASH_IMPORTANT"
        assert any("retrait cash important" in f.lower() for f in res["factors"])

    def test_cash_out_rule_is_case_insensitive(self):
        res = apply_business_rules(
            _to_dict(make_transaction(amount=6_000.0, transaction_type="cash_out"))
        )
        assert res["is_blocked"] is True
        assert res["ruleCategory"] == "RETRAIT_CASH_IMPORTANT"

    def test_small_cash_out_is_not_flagged(self):
        res = apply_business_rules(
            _to_dict(
                make_transaction(
                    amount=4_999.0, transaction_type="CASH_OUT", description="OK"
                )
            )
        )
        assert res["is_blocked"] is False
        assert res["factors"] == []

    def test_cash_out_at_boundary_is_not_flagged(self):
        # La règle utilise une comparaison stricte ``> 5000``.
        res = apply_business_rules(
            _to_dict(
                make_transaction(
                    amount=5_000.0, transaction_type="CASH_OUT", description="OK"
                )
            )
        )
        assert res["is_blocked"] is False

    def test_large_amount_but_not_cash_out_below_threshold_not_flagged(self):
        res = apply_business_rules(
            _to_dict(
                make_transaction(
                    amount=6_000.0, transaction_type="PAYMENT", description="OK"
                )
            )
        )
        assert res["is_blocked"] is False


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
        assert res["is_blocked"] is True
        assert res["ruleCategory"] == "MOTCLE_SENSIBLE"
        assert any("lab/ft" in f.lower() for f in res["factors"])

    def test_description_without_keyword_is_not_flagged(self):
        res = apply_business_rules(
            _to_dict(
                make_transaction(amount=100.0, description="ACHAT BOULANGERIE")
            )
        )
        assert res["is_blocked"] is False
        assert res["factors"] == []


class TestCleanTransaction:
    def test_ordinary_transaction_passes_all_rules(self):
        res = apply_business_rules(
            _to_dict(
                make_transaction(
                    amount=42.5, transaction_type="PAYMENT", description="RESTAURANT"
                )
            )
        )
        assert res["is_blocked"] is False
        assert res["factors"] == []

    def test_return_type_is_dict(self):
        res = apply_business_rules(_to_dict(make_transaction()))
        assert isinstance(res, dict)
        assert "is_blocked" in res
        assert "ruleCategory" in res
        assert "factors" in res
        assert isinstance(res["is_blocked"], bool)
        assert isinstance(res["ruleCategory"], str)
        assert isinstance(res["factors"], list)