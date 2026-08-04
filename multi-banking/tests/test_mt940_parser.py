"""
Tests pour le parser MT940.
À placer dans multi-banking/tests/test_mt940_parser.py

⚠️ IMPORTANT : ces tests révèlent un bug réel dans la regex actuelle de
parsers/mt940.py (voir mt940_fixed.py fourni à côté pour le correctif).

Le groupe optionnel du "funds code" est défini comme `(\\w)?`, qui matche
aussi bien une lettre qu'un CHIFFRE. Comme il est glouton, il "mange" le
premier chiffre du montant avant que le groupe montant ne commence à
matcher, ce qui tronque le montant d'un chiffre :
    ":61:...C1500,00..."  →  parsé comme 500.00 au lieu de 1500.00
    ":61:...D500,00..."   →  parsé comme 0.00   au lieu de 500.00

Le correctif consiste à restreindre ce groupe aux lettres uniquement :
`([A-Za-z])?` au lieu de `(\\w)?`.
"""
from parsers.mt940 import parse_mt940

SAMPLE_MT940 = (
    b":20:STARTREF\n"
    b":25:FR761234567890\n"
    b":28C:1/1\n"
    b":60F:C260630EUR1000,00\n"
    b":61:2607010701C1500,00NTRFREF001\n"
    b":86:SALAIRE JUILLET\n"
    b":61:2607020702D500,00NTRFREF002\n"
    b":86:LOYER\n"
    b":62F:C260702EUR2000,00\n"
)


def test_parse_mt940_returns_two_transactions():
    result = parse_mt940(SAMPLE_MT940, "tenant-1", "bank-a")
    assert len(result) == 2


def test_parse_mt940_extracts_account_iban():
    result = parse_mt940(SAMPLE_MT940, "tenant-1", "bank-a")
    for tx in result:
        assert tx.account_iban == "FR761234567890"


def test_parse_mt940_extracts_value_date():
    result = parse_mt940(SAMPLE_MT940, "tenant-1", "bank-a")
    assert result[0].value_date == "2026-07-01"
    assert result[1].value_date == "2026-07-02"


def test_parse_mt940_extracts_label_from_next_line():
    result = parse_mt940(SAMPLE_MT940, "tenant-1", "bank-a")
    assert result[0].label == "SALAIRE JUILLET"
    assert result[1].label == "LOYER"


def test_parse_mt940_credit_amount_is_correct():
    """
    Ce test échoue avec le parser actuel (retourne 500.0 au lieu de 1500.0)
    à cause du bug de regex décrit en en-tête de ce fichier.
    """
    result = parse_mt940(SAMPLE_MT940, "tenant-1", "bank-a")
    assert result[0].amount == 1500.00


def test_parse_mt940_debit_amount_is_correct():
    """
    Ce test échoue avec le parser actuel (retourne -0.0 au lieu de -500.0)
    à cause du même bug — cas encore plus grave car le montant est
    quasiment annulé.
    """
    result = parse_mt940(SAMPLE_MT940, "tenant-1", "bank-a")
    assert result[1].amount == -500.00