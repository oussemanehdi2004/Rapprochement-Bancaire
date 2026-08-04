"""Unit tests for ``main.preprocess_transaction`` feature engineering."""

import main
from tests.factories import make_transaction

FEATURE_ORDER = [
    "amount",
    "sender_balance_before",
    "sender_balance_after",
    "receiver_balance_before",
    "receiver_balance_after",
    "sender_balance_error",
    "receiver_balance_error",
    "is_transfer",
    "is_cash_out",
]


def test_returns_vector_of_nine_features():
    vector = main.preprocess_transaction(make_transaction())
    assert len(vector) == len(FEATURE_ORDER)


def test_balance_errors_are_computed_correctly():
    tx = make_transaction(
        amount=100.0,
        sender_balance_before=1000.0,
        sender_balance_after=850.0,
        receiver_balance_before=200.0,
        receiver_balance_after=350.0,
    )
    vector = main.preprocess_transaction(tx)
    # sender_balance_error = before - amount - after = 1000 - 100 - 850 = 50
    assert vector[5] == 50.0
    # receiver_balance_error = before + amount - after = 200 + 100 - 350 = -50
    assert vector[6] == -50.0


def test_transfer_flag_is_one_for_transfer():
    vector = main.preprocess_transaction(make_transaction(transaction_type="TRANSFER"))
    assert vector[7] == 1
    assert vector[8] == 0


def test_cash_out_flag_is_one_for_cash_out():
    vector = main.preprocess_transaction(make_transaction(transaction_type="CASH_OUT"))
    assert vector[7] == 0
    assert vector[8] == 1


def test_transaction_type_matching_is_case_insensitive():
    vector = main.preprocess_transaction(make_transaction(transaction_type="transfer"))
    assert vector[7] == 1


def test_other_transaction_type_has_no_type_flags():
    vector = main.preprocess_transaction(make_transaction(transaction_type="PAYMENT"))
    assert vector[7] == 0
    assert vector[8] == 0


def test_amount_and_balances_are_passed_through():
    tx = make_transaction(
        amount=123.0,
        sender_balance_before=1.0,
        sender_balance_after=2.0,
        receiver_balance_before=3.0,
        receiver_balance_after=4.0,
    )
    vector = main.preprocess_transaction(tx)
    assert vector[0] == 123.0
    assert vector[1] == 1.0
    assert vector[2] == 2.0
    assert vector[3] == 3.0
    assert vector[4] == 4.0
