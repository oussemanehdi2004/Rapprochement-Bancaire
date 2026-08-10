# parsers/pain001.py
import xml.etree.ElementTree as ET
from typing import List
from pydantic import BaseModel, ConfigDict

class TransactionPivot(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    tenant_id: str
    bank_id: str
    reference: str
    source_line_hash: str
    value_date: str
    label: str
    amount: float
    account_iban: str
    counterparty_iban: str
    balance_before: float | None = None
    balance_after: float | None = None

def parse_pain001(content: bytes, tenant_id: str, bank_id: str) -> List[TransactionPivot]:
    """Extrait les ordres de virement à partir d'un fichier XML ISO 20022 pain.001."""
    transactions = []
    root = ET.fromstring(content)
    
    # Espace de noms XML standard pour pain.001
    ns = {'p': 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03'}

    for pmt_inf in root.findall('.//p:PmtInf', ns):
        sender_iban = pmt_inf.findtext('.//p:DbtrAcct/p:Id/p:IBAN', default='', namespaces=ns)
        
        for cdt_trf_tx_inf in pmt_inf.findall('.//p:CdtTrfTxInf', ns):
            ref = cdt_trf_tx_inf.findtext('.//p:PmtId/p:EndToEndId', default='', namespaces=ns)
            amt_elem = cdt_trf_tx_inf.find('.//p:Amt/p:InstdAmt', ns)
            amount = float(amt_elem.text) if amt_elem is not None and amt_elem.text else 0.0
            
            receiver_iban = cdt_trf_tx_inf.findtext('.//p:CdtrAcct/p:Id/p:IBAN', default='', namespaces=ns)
            label = cdt_trf_tx_inf.findtext('.//p:RmtInf/p:Ustrd', default='Virement pain.001', namespaces=ns)
            
            line_hash = f"{ref}_{amount}_{sender_iban}_{receiver_iban}"
            
            transactions.append(
                TransactionPivot(
                    tenant_id=tenant_id,
                    bank_id=bank_id,
                    reference=ref,
                    source_line_hash=line_hash,
                    value_date="",
                    label=label,
                    amount=amount,
                    account_iban=sender_iban,
                    counterparty_iban=receiver_iban
                )
            )
            
    return transactions