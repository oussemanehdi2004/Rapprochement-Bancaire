"""
Tests pour le parser CAMT.053.
À placer dans multi-banking/tests/test_camt053_parser.py
"""
from parsers.camt053 import parse_camt053

SAMPLE_CAMT_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Acct>
        <Id>
          <IBAN>FR761234567890</IBAN>
        </Id>
      </Acct>
      <Ntry>
        <Amt Ccy="EUR">1500.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <ValDt>
          <Dt>2026-07-01</Dt>
        </ValDt>
        <AddtlNtryInf>SALAIRE</AddtlNtryInf>
        <AcctSvcrRef>REFCAMT001</AcctSvcrRef>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">500.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <ValDt>
          <Dt>2026-07-02</Dt>
        </ValDt>
        <AddtlNtryInf>LOYER</AddtlNtryInf>
        <AcctSvcrRef>REFCAMT002</AcctSvcrRef>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>"""


def test_parse_camt053_returns_two_transactions():
    result = parse_camt053(SAMPLE_CAMT_XML, "tenant-1", "bank-a")
    assert len(result) == 2


def test_parse_camt053_credit_is_positive():
    result = parse_camt053(SAMPLE_CAMT_XML, "tenant-1", "bank-a")
    credit_tx = result[0]
    assert credit_tx.amount == 1500.00
    assert credit_tx.label == "SALAIRE"
    assert credit_tx.reference == "REFCAMT001"


def test_parse_camt053_debit_is_negative():
    result = parse_camt053(SAMPLE_CAMT_XML, "tenant-1", "bank-a")
    debit_tx = result[1]
    assert debit_tx.amount == -500.00
    assert debit_tx.label == "LOYER"


def test_parse_camt053_extracts_account_iban():
    result = parse_camt053(SAMPLE_CAMT_XML, "tenant-1", "bank-a")
    for tx in result:
        assert tx.account_iban == "FR761234567890"


def test_parse_camt053_sets_source_format_and_hash():
    result = parse_camt053(SAMPLE_CAMT_XML, "tenant-1", "bank-a")
    for tx in result:
        assert tx.source_format == "camt053"
        assert tx.source_line_hash is not None


def test_parse_camt053_ignores_entry_without_amount():
    xml_missing_amt = SAMPLE_CAMT_XML.replace(
        b'<Amt Ccy="EUR">500.00</Amt>', b""
    )
    result = parse_camt053(xml_missing_amt, "tenant-1", "bank-a")
    # L'entrée sans montant doit être ignorée, pas planter le parsing
    assert len(result) == 1