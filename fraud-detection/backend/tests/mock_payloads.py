"""Comprehensive mock data payloads for integration testing.

This module provides factory functions and pre-built payloads for every
fraud detection scenario, parser format, and edge case covered by the
integration test suite.

Usage:
    from tests.mock_payloads import (
        make_clean_transaction,
        make_regulatory_threshold_transaction,
        make_casino_transaction,
        make_csv_content,
        make_camt053_content,
        PAYLOAD_SCENARIOS,
    )
"""

from __future__ import annotations

import csv
import hashlib
import io
from datetime import datetime, timedelta, timezone
from typing import Any, Optional


# ============================================================================
# TRANSACTION PAYLOAD FACTORIES
# ============================================================================

def make_clean_transaction(**overrides: Any) -> dict:
    """Return a clean, low-risk transaction payload."""
    payload = {
        "tenant_id": "tenant-test",
        "transaction_reference": "ref_clean_001",
        "id": "TX-CLEAN-001",
        "date": "2026-08-14T10:00:00Z",
        "description": "ACHAT SUPERMARCHE CARREFOUR",
        "amount": 45.20,
        "sender_balance_before": 5000.00,
        "sender_balance_after": 4954.80,
        "receiver_balance_before": 0.00,
        "receiver_balance_after": 45.20,
        "transaction_type": "PAYMENT",
        "account_iban": "FR7612345678901234567890123",
        "beneficiary_iban": "FR7698765432109876543210987",
    }
    payload.update(overrides)
    return payload


def make_regulatory_threshold_transaction(**overrides: Any) -> dict:
    """Return a transaction exceeding the 10k regulatory threshold."""
    payload = {
        "tenant_id": "tenant-test",
        "transaction_reference": "ref_seuil_001",
        "id": "TX-SEUIL-001",
        "date": "2026-08-14T10:00:00Z",
        "description": "VIREMENT FOURNISSEUR EXTERNE",
        "amount": 15000.00,
        "sender_balance_before": 50000.00,
        "sender_balance_after": 35000.00,
        "receiver_balance_before": 0.00,
        "receiver_balance_after": 15000.00,
        "transaction_type": "TRANSFER",
        "account_iban": "FR7612345678901234567890123",
    }
    payload.update(overrides)
    return payload


def make_approche_threshold_transaction(**overrides: Any) -> dict:
    """Return a transaction near (90%) the regulatory threshold."""
    payload = {
        "tenant_id": "tenant-test",
        "transaction_reference": "ref_approche_001",
        "id": "TX-APPROCHE-001",
        "date": "2026-08-14T10:00:00Z",
        "description": "VIREMENT APPROCHE SEUIL",
        "amount": 9500.00,
        "sender_balance_before": 20000.00,
        "sender_balance_after": 10500.00,
        "transaction_type": "TRANSFER",
        "account_iban": "FR7612345678901234567890123",
    }
    payload.update(overrides)
    return payload


def make_casino_transaction(**overrides: Any) -> dict:
    """Return a transaction with sensitive gambling keyword."""
    payload = {
        "tenant_id": "tenant-test",
        "transaction_reference": "ref_casino_001",
        "id": "TX-CASINO-001",
        "date": "2026-08-14T10:00:00Z",
        "description": "DEPOT CASINO EN LIGNE POKER",
        "amount": 500.00,
        "sender_balance_before": 2000.00,
        "sender_balance_after": 1500.00,
        "transaction_type": "TRANSFER",
        "account_iban": "FR7612345678901234567890123",
    }
    payload.update(overrides)
    return payload


def make_cash_out_transaction(**overrides: Any) -> dict:
    """Return a large CASH_OUT transaction."""
    payload = {
        "tenant_id": "tenant-test",
        "transaction_reference": "ref_cash_001",
        "id": "TX-CASH-001",
        "date": "2026-08-14T10:00:00Z",
        "description": "RETRAIT DAB EXCEPTIONNEL",
        "amount": 6000.00,
        "sender_balance_before": 10000.00,
        "sender_balance_after": 4000.00,
        "transaction_type": "CASH_OUT",
        "account_iban": "FR7612345678901234567890123",
    }
    payload.update(overrides)
    return payload


def make_atypical_hour_transaction(**overrides: Any) -> dict:
    """Return a transaction at 3 AM (atypical hours)."""
    payload = {
        "tenant_id": "tenant-test",
        "transaction_reference": "ref_nuit_001",
        "id": "TX-NUIT-001",
        "date": "2026-08-14T03:15:00Z",
        "description": "PAIEMENT EN LIGNE",
        "amount": 25.00,
        "sender_balance_before": 500.00,
        "sender_balance_after": 475.00,
        "transaction_type": "TRANSFER",
        "account_iban": "FR7612345678901234567890123",
    }
    payload.update(overrides)
    return payload


def make_structuring_batch() -> list[dict]:
    """Return a batch of sub-threshold transactions that sum above 10k."""
    return [
        {
            "tenant_id": "tenant-test",
            "transaction_reference": f"ref_struct_{i}",
            "id": f"TX-STRUCT-{i}",
            "date": f"2026-08-15T1{i}:00:00Z",
            "description": f"Virement partiel {chr(65+i)}",
            "amount": 4000.00,
            "sender_balance_before": 20000.00 - i * 4000,
            "sender_balance_after": 16000.00 - i * 4000,
            "transaction_type": "TRANSFER",
            "account_iban": "TN59_STRUCT_TEST",
        }
        for i in range(3)
    ]


def make_duplicate_batch() -> list[dict]:
    """Return a batch with duplicate transactions."""
    return [
        {
            "tenant_id": "tenant-test",
            "transaction_reference": "ref_dup_1",
            "id": "TX-DUP-1",
            "date": "2026-08-15T11:00:00Z",
            "description": "Paiement Fournisseur ABC",
            "amount": 2500.00,
            "sender_balance_before": 8000.00,
            "sender_balance_after": 5500.00,
            "transaction_type": "PAYMENT",
            "account_iban": "FR7612345678901234567890123",
        },
        {
            "tenant_id": "tenant-test",
            "transaction_reference": "ref_dup_2",
            "id": "TX-DUP-2",
            "date": "2026-08-15T11:01:00Z",
            "description": "Paiement Fournisseur ABC",
            "amount": 2500.00,
            "sender_balance_before": 5500.00,
            "sender_balance_after": 3000.00,
            "transaction_type": "PAYMENT",
            "account_iban": "FR7612345678901234567890123",
        },
    ]


def make_repetitive_batch() -> list[dict]:
    """Return a batch with 3+ identical transactions."""
    return [
        {
            "tenant_id": "tenant-test",
            "transaction_reference": f"ref_rep_{i}",
            "id": f"TX-REP-{i}",
            "date": f"2026-08-16T12:0{i}:00Z",
            "description": "Abonnement mensuel Service X",
            "amount": 800.00,
            "sender_balance_before": 3000.00 - i * 800,
            "sender_balance_after": 2200.00 - i * 800,
            "transaction_type": "PAYMENT",
            "account_iban": "FR7612345678901234567890123",
        }
        for i in range(3)
    ]


def make_mixed_risk_batch() -> list[dict]:
    """Return a batch with various risk levels."""
    return [
        make_clean_transaction(
            id="TX-MIX-1", transaction_reference="ref_mix_1",
            description="ACHAT RESTAURANT", amount=35.00,
        ),
        make_regulatory_threshold_transaction(
            id="TX-MIX-2", transaction_reference="ref_mix_2",
        ),
        make_casino_transaction(
            id="TX-MIX-3", transaction_reference="ref_mix_3",
            amount=250.00,
        ),
        make_clean_transaction(
            id="TX-MIX-4", transaction_reference="ref_mix_4",
            description="PAIEMENT FACTURE EDF", amount=120.00,
        ),
    ]


# ============================================================================
# CSV CONTENT GENERATORS
# ============================================================================

def make_csv_content(transactions: list[dict] | None = None) -> bytes:
    """Generate CSV content from transaction dicts."""
    if transactions is None:
        transactions = [
            {"account_iban": "FR7612345678901234567890123", "value_date": "2026-07-01",
             "label": "VIREMENT FOURNISSEUR", "amount": "150.00", "currency": "EUR",
             "counterparty_iban": "FR7698765432109876543210987", "reference": "REF-001"},
            {"account_iban": "FR7612345678901234567890123", "value_date": "2026-07-02",
             "label": "PAIEMENT CLIENT", "amount": "-500.00", "currency": "EUR",
             "counterparty_iban": "FR7611111111111111111111111", "reference": "REF-002"},
        ]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=transactions[0].keys())
    writer.writeheader()
    writer.writerows(transactions)
    return output.getvalue().encode("utf-8")


def make_csv_content_with_balance() -> bytes:
    """Generate CSV with balance fields."""
    rows = [
        {"account_iban": "FR7612345678901234567890123", "value_date": "2026-07-01",
         "label": "VIREMENT", "amount": "1000.00", "currency": "EUR",
         "balance_before": "5000.00", "balance_after": "4000.00"},
    ]
    return make_csv_content(rows)


def make_csv_with_high_amount() -> bytes:
    """Generate CSV with a high-amount transaction."""
    rows = [
        {"account_iban": "FR7612345678901234567890123", "value_date": "2026-08-01",
         "label": "VIREMENT URGENT", "amount": "15000.00", "currency": "EUR"},
    ]
    return make_csv_content(rows)


def make_csv_with_casino_keyword() -> bytes:
    """Generate CSV with gambling keyword."""
    rows = [
        {"account_iban": "FR7612345678901234567890123", "value_date": "2026-08-01",
         "label": "DEPOT CASINO EN LIGNE", "amount": "500.00", "currency": "EUR"},
    ]
    return make_csv_content(rows)


# ============================================================================
# CAMT.053 CONTENT GENERATORS
# ============================================================================

def make_camt053_content(
    iban: str = "FR7612345678901234567890123",
    amount: float = 2500.00,
    label: str = "VIR SEPA FOURNISSEUR",
    date: str = "2026-07-15",
    is_credit: bool = True,
) -> bytes:
    """Generate CAMT.053 XML content."""
    indicator = "CRDT" if is_credit else "DBIT"
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <Stmt>
      <Acct><Id><IBAN>{iban}</IBAN></Id></Acct>
      <TxDtls>
        <Ntry>
          <Amt Ccy="EUR">{amount:.2f}</Amt>
          <CdtDbtInd>{indicator}</CdtDbtInd>
          <BookgDt><Dt>{date}</Dt></BookgDt>
          <AddtlNtryInf>{label}</AddtlNtryInf>
        </Ntry>
      </TxDtls>
    </Stmt>
  </BkToCstmrStmt>
</Document>""".encode("utf-8")


# ============================================================================
# MT940 CONTENT GENERATORS
# ============================================================================

def make_mt940_content(
    iban: str = "FR7612345678901234567890123",
    opening_balance: float = 5000.00,
    amount: float = 1500.00,
    label: str = "VIR FOURNISSEUR",
) -> bytes:
    """Generate MT940 SWIFT content."""
    closing = opening_balance + amount
    return (
        f":20:REF123\n"
        f":25:{iban}\n"
        f":60F:C260701EUR{opening_balance:,.2f}\n"
        f":61:260701C{amount:,.2f}NTRFREF001//REF001\n"
        f"{label}\n"
        f":62F:C260702EUR{closing:,.2f}\n"
    ).encode("utf-8")


# ============================================================================
# FRAUD DETECTION API PAYLOADS (for direct /api/analyze calls)
# ============================================================================

def make_fraud_api_payload(transactions: list[dict] | None = None) -> list[dict]:
    """Generate payload for POST /api/analyze."""
    if transactions is None:
        transactions = [make_clean_transaction()]
    return transactions


# ============================================================================
# PRE-BUILT SCENARIO PAYLOADS
# ============================================================================

PAYLOAD_SCENARIOS: dict[str, Any] = {
    "clean_small_payment": make_clean_transaction(),
    "regulatory_threshold": make_regulatory_threshold_transaction(),
    "approche_threshold": make_approche_threshold_transaction(),
    "casino_keyword": make_casino_transaction(),
    "large_cash_out": make_cash_out_transaction(),
    "atypical_hour": make_atypical_hour_transaction(),
    "structuring_batch": make_structuring_batch(),
    "duplicate_batch": make_duplicate_batch(),
    "repetitive_batch": make_repetitive_batch(),
    "mixed_risk_batch": make_mixed_risk_batch(),
}


# ============================================================================
# EXPECTED OUTCOMES (for assertion helpers)
# ============================================================================

EXPECTED_OUTCOMES: dict[str, dict] = {
    "clean_small_payment": {
        "isFraud": False,
        "reconciliationStatus": "MATCHED",
        "fraudProbability": 0.0,
    },
    "regulatory_threshold": {
        "isFraud": True,
        "reconciliationStatus": "SUSPICIOUS",
        "ruleCategory": "SEUIL_REGLEMENTAIRE",
        "min_score": 90,
    },
    "approche_threshold": {
        "isFraud": False,  # or True depending on exact ratio
        "min_score": 40,
    },
    "casino_keyword": {
        "isFraud": True,
        "reconciliationStatus": "SUSPICIOUS",
        "ruleCategory": "MOTCLE_SENSIBLE",
    },
    "large_cash_out": {
        "isFraud": True,
        "min_score": 80,
    },
    "atypical_hour": {
        "min_score": 25,  # HORAIRE_ATYPIQUE contributes 25 points
    },
}


# ============================================================================
# EDGE CASE PAYLOADS
# ============================================================================

EDGE_CASE_PAYLOADS: list[dict] = [
    {"description": "Zero amount", "payload": {"amount": 0, "transaction_type": "PAYMENT", "description": "TEST", "date": "2026-08-14"}},
    {"description": "Negative amount", "payload": {"amount": -100, "transaction_type": "PAYMENT", "description": "TEST", "date": "2026-08-14"}},
    {"description": "Abnormally large amount", "payload": {"amount": 2e9, "transaction_type": "TRANSFER", "description": "TEST", "date": "2026-08-14"}},
    {"description": "Empty description", "payload": {"amount": 100, "transaction_type": "PAYMENT", "description": "", "date": "2026-08-14"}},
    {"description": "Unicode description", "payload": {"amount": 50, "transaction_type": "PAYMENT", "description": "Café français é à ü", "date": "2026-08-14"}},
    {"description": "Very long description", "payload": {"amount": 10, "transaction_type": "PAYMENT", "description": "A" * 1000, "date": "2026-08-14"}},
    {"description": "Boundary amount 9999.99", "payload": {"amount": 9999.99, "transaction_type": "TRANSFER", "description": "VIREMENT", "date": "2026-08-14"}},
    {"description": "Boundary amount 10000.01", "payload": {"amount": 10000.01, "transaction_type": "TRANSFER", "description": "VIREMENT", "date": "2026-08-14"}},
    {"description": "Micro amount 0.01", "payload": {"amount": 0.01, "transaction_type": "PAYMENT", "description": "MICRO", "date": "2026-08-14"}},
]


# ============================================================================
# MULTIPLE SENSITIVE KEYWORDS (for parametrized testing)
# ============================================================================

SENSITIVE_KEYWORD_PAYLOADS: list[tuple[str, dict]] = [
    ("CASINO", {"amount": 100, "description": "DEPOT CASINO EN LIGNE", "transaction_type": "TRANSFER", "date": "2026-08-14"}),
    ("PARIS", {"amount": 100, "description": "PARIS SPORTIFS", "transaction_type": "TRANSFER", "date": "2026-08-14"}),
    ("POKER", {"amount": 100, "description": "POKERstars DEPOT", "transaction_type": "TRANSFER", "date": "2026-08-14"}),
    ("BET", {"amount": 100, "description": "BET365 PARIS", "transaction_type": "TRANSFER", "date": "2026-08-14"}),
    ("PARI", {"amount": 100, "description": "VIREMENT PARI MUTUEL", "transaction_type": "TRANSFER", "date": "2026-08-14"}),
]
