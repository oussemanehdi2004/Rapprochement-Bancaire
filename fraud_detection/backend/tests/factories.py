"""Helpers to build valid ``TransactionInput`` payloads for tests."""

from __future__ import annotations

from typing import Any

from rules_engine import TransactionInput


def transaction_payload(**overrides: Any) -> dict:
    """Return a valid transaction payload dict, with optional field overrides."""
    payload: dict = {
        "tenant_id": "tenant-123",
        "mongo_transaction_id": "507f1f77bcf86cd799439011",
        "id": "TX-10024",
        "date": "2026-07-16",
        "description": "ACHAT SUPERMARCHE",
        "amount": 100.0,
        "sender_balance_before": 5000.0,
        "sender_balance_after": 4900.0,
        "receiver_balance_before": 200.0,
        "receiver_balance_after": 300.0,
        "transaction_type": "PAYMENT",
    }
    payload.update(overrides)
    return payload


def make_transaction(**overrides: Any) -> TransactionInput:
    """Return a valid ``TransactionInput`` instance, with optional overrides."""
    return TransactionInput(**transaction_payload(**overrides))
