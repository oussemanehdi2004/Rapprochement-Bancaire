# parsers/pain001.py
import xml.etree.ElementTree as ET
from typing import List
from datetime import datetime
from models import PivotTransaction

def parse_pain001(content: bytes, tenant_id: str, bank_id: str) -> List[PivotTransaction]:
    """
    Extrait les ordres de virement à partir d'un fichier XML ISO 20022 pain.001.
    
    Supporte pain.001.001.03 (version courante) et extrait:
    - Référence end-to-end
    - Montant et devise
    - Date de demande
    - Expéditeur et bénéficiaire (IBAN)
    - Informations de paiement
    """
    transactions = []
    
    try:
        root = ET.fromstring(content)
    except ET.ParseError as e:
        raise ValueError(f"Erreur de parsing XML pain.001: {e}")
    
    # Espace de noms XML standard pour pain.001
    ns = {'p': 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03'}

    for pmt_inf in root.findall('.//p:PmtInf', ns):
        # Informations sur le demandeur
        sender_iban = pmt_inf.findtext('.//p:DbtrAcct/p:Id/p:IBAN', default='', namespaces=ns)
        sender_name = pmt_inf.findtext('.//p:Dbtr/p:Nm', default='', namespaces=ns)
        
        # Date de demande de paiement
        req_date = pmt_inf.findtext('.//p:ReqdExctnDt', default='', namespaces=ns)
        
        # Conversion de la date au format ISO si nécessaire
        if req_date:
            try:
                # pain.001 utilise généralement YYYY-MM-DD
                value_date = req_date
            except ValueError:
                value_date = ""
        else:
            value_date = ""
        
        for cdt_trf_tx_inf in pmt_inf.findall('.//p:CdtTrfTxInf', ns):
            # Référence de paiement
            ref = cdt_trf_tx_inf.findtext('.//p:PmtId/p:EndToEndId', default='', namespaces=ns)
            if not ref:
                ref = cdt_trf_tx_inf.findtext('.//p:PmtId/p:InstrId', default='', namespaces=ns)
            
            # Montant et devise
            amt_elem = cdt_trf_tx_inf.find('.//p:Amt/p:InstdAmt', ns)
            amount = 0.0
            currency = "EUR"
            
            if amt_elem is not None and amt_elem.text:
                try:
                    amount = float(amt_elem.text)
                    currency = amt_elem.get('Ccy', 'EUR')
                except ValueError:
                    amount = 0.0
            
            # Bénéficiaire
            receiver_iban = cdt_trf_tx_inf.findtext('.//p:CdtrAcct/p:Id/p:IBAN', default='', namespaces=ns)
            receiver_name = cdt_trf_tx_inf.findtext('.//p:Cdtr/p:Nm', default='', namespaces=ns)
            
            # Informations de paiement / motif
            label = cdt_trf_tx_inf.findtext('.//p:RmtInf/p:Ustrd', default='', namespaces=ns)
            if not label:
                label = f"Virement vers {receiver_name or receiver_iban}"
            
            # Construction du hash pour détection de doublons
            line_hash = f"{ref}_{amount}_{currency}_{sender_iban}_{receiver_iban}_{value_date}"
            
            # Création de la transaction pivot
            transactions.append(
                PivotTransaction(
                    tenant_id=tenant_id,
                    bank_id=bank_id,
                    account_iban=sender_iban,
                    value_date=value_date,
                    label=label,
                    amount=amount,
                    currency=currency,
                    counterparty_iban=receiver_iban,
                    reference=ref,
                    source_format="pain001",
                    source_line_hash=line_hash,
                    balance_before=None,
                    balance_after=None
                )
            )
            
    return transactions