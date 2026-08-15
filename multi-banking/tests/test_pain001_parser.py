"""Tests pour le parser pain.001 amélioré"""
import pytest
from parsers.pain001 import parse_pain001
from models import PivotTransaction


def test_parse_pain001_basic():
    """Test le parsing basique d'un fichier pain.001"""
    pain001_content = """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
    <CstmrCdtTrfInitn>
        <GrpHdr>
            <MsgId>MSG001</MsgId>
            <CreDtTm>2026-08-15T10:00:00</CreDtTm>
        </GrpHdr>
        <PmtInf>
            <PmtInfId>PMT001</PmtInfId>
            <PmtMtd>TRF</PmtMtd>
            <ReqdExctnDt>2026-08-16</ReqdExctnDt>
            <Dbtr>
                <Nm>Expediteur Test</Nm>
            </Dbtr>
            <DbtrAcct>
                <Id>
                    <IBAN>FR7630006000011234567890189</IBAN>
                </Id>
            </DbtrAcct>
            <CdtTrfTxInf>
                <PmtId>
                    <EndToEndId>REF123456</EndToEndId>
                </PmtId>
                <Amt>
                    <InstdAmt Ccy="EUR">100.50</InstdAmt>
                </Amt>
                <Cdtr>
                    <Nm>Beneficiaire Test</Nm>
                </Cdtr>
                <CdtrAcct>
                    <Id>
                        <IBAN>FR7630006000019876543210123</IBAN>
                    </Id>
                </CdtrAcct>
                <RmtInf>
                    <Ustrd>Paiement facture</Ustrd>
                </RmtInf>
            </CdtTrfTxInf>
        </PmtInf>
    </CstmrCdtTrfInitn>
</Document>""".encode('utf-8')
    
    transactions = parse_pain001(pain001_content, "tenant_test", "bank_test")
    
    assert len(transactions) == 1
    tx = transactions[0]
    
    assert tx.tenant_id == "tenant_test"
    assert tx.bank_id == "bank_test"
    assert tx.reference == "REF123456"
    assert tx.amount == 100.50
    assert tx.currency == "EUR"
    assert tx.account_iban == "FR7630006000011234567890189"
    assert tx.counterparty_iban == "FR7630006000019876543210123"
    assert tx.value_date == "2026-08-16"
    assert "facture" in tx.label or "Facture" in tx.label
    assert tx.source_format == "pain001"
    assert tx.source_line_hash is not None


def test_parse_pain001_multiple_transactions():
    """Test le parsing de plusieurs transactions dans un fichier pain.001"""
    pain001_content = """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
    <CstmrCdtTrfInitn>
        <GrpHdr>
            <MsgId>MSG001</MsgId>
            <CreDtTm>2026-08-15T10:00:00</CreDtTm>
        </GrpHdr>
        <PmtInf>
            <PmtInfId>PMT001</PmtInfId>
            <PmtMtd>TRF</PmtMtd>
            <ReqdExctnDt>2026-08-16</ReqdExctnDt>
            <Dbtr>
                <Nm>Expediteur Test</Nm>
            </Dbtr>
            <DbtrAcct>
                <Id>
                    <IBAN>FR7630006000011234567890189</IBAN>
                </Id>
            </DbtrAcct>
            <CdtTrfTxInf>
                <PmtId>
                    <EndToEndId>REF001</EndToEndId>
                </PmtId>
                <Amt>
                    <InstdAmt Ccy="EUR">50.00</InstdAmt>
                </Amt>
                <Cdtr>
                    <Nm>Beneficiaire 1</Nm>
                </Cdtr>
                <CdtrAcct>
                    <Id>
                        <IBAN>FR7630006000019876543210123</IBAN>
                    </Id>
                </CdtrAcct>
            </CdtTrfTxInf>
            <CdtTrfTxInf>
                <PmtId>
                    <EndToEndId>REF002</EndToEndId>
                </PmtId>
                <Amt>
                    <InstdAmt Ccy="EUR">75.00</InstdAmt>
                </Amt>
                <Cdtr>
                    <Nm>Beneficiaire 2</Nm>
                </Cdtr>
                <CdtrAcct>
                    <Id>
                        <IBAN>FR7630006000019876543210999</IBAN>
                    </Id>
                </CdtrAcct>
            </CdtTrfTxInf>
        </PmtInf>
    </CstmrCdtTrfInitn>
</Document>""".encode('utf-8')
    
    transactions = parse_pain001(pain001_content, "tenant_test", "bank_test")
    
    assert len(transactions) == 2
    assert transactions[0].amount == 50.00
    assert transactions[1].amount == 75.00
    assert transactions[0].reference == "REF001"
    assert transactions[1].reference == "REF002"


def test_parse_pain001_missing_optional_fields():
    """Test le parsing avec des champs optionnels manquants"""
    pain001_content = """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
    <CstmrCdtTrfInitn>
        <GrpHdr>
            <MsgId>MSG001</MsgId>
            <CreDtTm>2026-08-15T10:00:00</CreDtTm>
        </GrpHdr>
        <PmtInf>
            <PmtInfId>PMT001</PmtInfId>
            <PmtMtd>TRF</PmtMtd>
            <DbtrAcct>
                <Id>
                    <IBAN>FR7630006000011234567890189</IBAN>
                </Id>
            </DbtrAcct>
            <CdtTrfTxInf>
                <Amt>
                    <InstdAmt Ccy="EUR">100.00</InstdAmt>
                </Amt>
                <CdtrAcct>
                    <Id>
                        <IBAN>FR7630006000019876543210123</IBAN>
                    </Id>
                </CdtrAcct>
            </CdtTrfTxInf>
        </PmtInf>
    </CstmrCdtTrfInitn>
</Document>""".encode('utf-8')
    
    transactions = parse_pain001(pain001_content, "tenant_test", "bank_test")
    
    assert len(transactions) == 1
    tx = transactions[0]
    
    # Champs optionnels manquants doivent avoir des valeurs par défaut
    assert tx.reference == ""
    assert tx.value_date == ""
    assert tx.label  # Devrait avoir un label généré


def test_parse_pain001_invalid_xml():
    """Test que le XML invalide lève une erreur"""
    invalid_xml = b"Ceci n'est pas du XML valide"
    
    with pytest.raises(ValueError, match="Erreur de parsing XML"):
        parse_pain001(invalid_xml, "tenant_test", "bank_test")


def test_parse_pain001_different_currency():
    """Test le parsing avec une devise differente"""
    pain001_content = """<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
    <CstmrCdtTrfInitn>
        <GrpHdr>
            <MsgId>MSG001</MsgId>
            <CreDtTm>2026-08-15T10:00:00</CreDtTm>
        </GrpHdr>
        <PmtInf>
            <PmtInfId>PMT001</PmtInfId>
            <PmtMtd>TRF</PmtMtd>
            <ReqdExctnDt>2026-08-16</ReqdExctnDt>
            <DbtrAcct>
                <Id>
                    <IBAN>FR7630006000011234567890189</IBAN>
                </Id>
            </DbtrAcct>
            <CdtTrfTxInf>
                <PmtId>
                    <EndToEndId>REF001</EndToEndId>
                </PmtId>
                <Amt>
                    <InstdAmt Ccy="USD">250.00</InstdAmt>
                </Amt>
                <CdtrAcct>
                    <Id>
                        <IBAN>FR7630006000019876543210123</IBAN>
                    </Id>
                </CdtrAcct>
            </CdtTrfTxInf>
        </PmtInf>
    </CstmrCdtTrfInitn>
</Document>""".encode('utf-8')
    
    transactions = parse_pain001(pain001_content, "tenant_test", "bank_test")
    
    assert len(transactions) == 1
    assert transactions[0].currency == "USD"
    assert transactions[0].amount == 250.00