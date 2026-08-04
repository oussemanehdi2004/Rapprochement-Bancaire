from lxml import etree
from typing import List
from models import PivotTransaction


def _get_namespace(root):
    """
    Extrait dynamiquement le namespace du document XML.
    Permet de supporter plusieurs versions camt.053.
    """
    if root.tag.startswith("{"):
        return root.tag.split("}")[0].strip("{")
    return ""

def _extract_opening_balance(root, NS):
    """Cherche le solde d'ouverture (OPBD) dans les <Bal>."""
    bal_elems = root.findall(".//ns:Bal", NS) if NS else root.findall(".//Bal")

    for bal in bal_elems:
        cd_code = (
            bal.findtext("ns:Tp/ns:CdOrPrtry/ns:Cd", namespaces=NS)
            if NS else bal.findtext("Tp/CdOrPrtry/Cd")
        )

        if cd_code == "OPBD":
            amt_elem = bal.find("ns:Amt", NS) if NS else bal.find("Amt")
            cdt_dbt = (
                bal.findtext("ns:CdtDbtInd", namespaces=NS)
                if NS else bal.findtext("CdtDbtInd")
            )

            if amt_elem is not None:
                value = float(amt_elem.text)
                return value if cdt_dbt == "CRDT" else -value

    return None
def parse_camt053(
    content: bytes,
    tenant_id: str,
    bank_id: str
) -> List[PivotTransaction]:

    root = etree.fromstring(content)
    namespace = _get_namespace(root)

    NS = {"ns": namespace} if namespace else {}

    results = []

    # IBAN du compte principal
    account_iban = (
        root.findtext(".//ns:Acct/ns:Id/ns:IBAN", namespaces=NS)
        if NS else root.findtext(".//Acct/Id/IBAN")
    ) or ""
    opening_balance = _extract_opening_balance(root, NS)
    running_balance = opening_balance
    # Parcours des entrées
    entries = (
        root.findall(".//ns:Ntry", NS)
        if NS else root.findall(".//Ntry")
    )

    for ntry in entries:

        # Montant
        amt_elem = (
            ntry.find("ns:Amt", NS)
            if NS else ntry.find("Amt")
        )

        if amt_elem is None:
            continue

        amount = float(amt_elem.text)
        currency = amt_elem.attrib.get("Ccy", "EUR")

        # Crédit / Débit
        cdt_dbt = (
            ntry.findtext("ns:CdtDbtInd", namespaces=NS)
            if NS else ntry.findtext("CdtDbtInd")
        )

        signed_amount = amount if cdt_dbt == "CRDT" else -amount
        balance_before = running_balance

        balance_after = (
            round(running_balance + signed_amount, 2)
            if running_balance is not None else None
        )

        running_balance = balance_after
        # Date valeur
        value_date = (
            ntry.findtext(".//ns:ValDt/ns:Dt", namespaces=NS)
            if NS else ntry.findtext(".//ValDt/Dt")
        ) or ""

        # Libellé
        label = (
            ntry.findtext(".//ns:AddtlNtryInf", namespaces=NS)
            if NS else ntry.findtext(".//AddtlNtryInf")
        ) or ""

        # Référence
        reference = (
            ntry.findtext(".//ns:AcctSvcrRef", namespaces=NS)
            if NS else ntry.findtext(".//AcctSvcrRef")
        )

        # Contrepartie IBAN
        counterparty_iban = (
            ntry.findtext(".//ns:CdtrAcct/ns:Id/ns:IBAN", namespaces=NS)
            or ntry.findtext(".//ns:DbtrAcct/ns:Id/ns:IBAN", namespaces=NS)
        ) if NS else (
            ntry.findtext(".//CdtrAcct/Id/IBAN")
            or ntry.findtext(".//DbtrAcct/Id/IBAN")
        )

        tx = PivotTransaction(
            tenant_id=tenant_id,
            bank_id=bank_id,
            account_iban=account_iban,
            value_date=value_date,
            label=label,
            amount=signed_amount,
            currency=currency,
            counterparty_iban=counterparty_iban,
            reference=reference,
            source_format="camt053",
            balance_before=balance_before,
            balance_after=balance_after,
        )

        tx.source_line_hash = tx.compute_hash()
        results.append(tx)

    return results