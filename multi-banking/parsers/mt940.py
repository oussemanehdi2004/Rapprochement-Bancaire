"""
Version corrigée de multi-banking/parsers/mt940.py

Seule modification : le groupe optionnel du "funds code" est restreint aux
lettres (`[A-Za-z]`) au lieu de `\\w` (qui incluait aussi les chiffres et
mangeait le premier chiffre du montant). Voir tests/test_mt940_parser.py
pour la démonstration du bug.
"""
import re
from models import PivotTransaction

def _parse_60f_balance(line: str) -> float | None:
    """Parse une ligne :60F: (solde d'ouverture)."""
    m = re.match(r":60F:([CD])(\d{6})([A-Z]{3})([\d,]+)", line)
    if not m:
        return None

    sign, _, _, amt_str = m.groups()
    value = float(amt_str.replace(",", "."))
    return value if sign == "C" else -value

def parse_mt940(content: bytes, tenant_id: str, bank_id: str) -> list[PivotTransaction]:
    text = content.decode("utf-8")
    lines = text.splitlines()
    results = []
    account_iban = ""
    running_balance = None

    for i, line in enumerate(lines):
        if line.startswith(":25:"):
            account_iban = line[4:].strip()
        elif line.startswith(":60F:"):
            running_balance = _parse_60f_balance(line)
        elif line.startswith(":61:"):
            # AVANT : r":61:(\d{6})(\d{4})?([CD])(\w)?([\d,]+)"
            m = re.match(r":61:(\d{6})(\d{4})?([CD])([A-Za-z])?([\d,]+)", line)
            if m:
                yymmdd, _, sign, _, amt_str = m.groups()
                amount = float(amt_str.replace(",", "."))
                signed = amount if sign == "C" else -amount
                balance_before = running_balance
                balance_after = (
                    round(running_balance + signed, 2)
                    if running_balance is not None else None
                )

                running_balance = balance_after
                value_date = f"20{yymmdd[0:2]}-{yymmdd[2:4]}-{yymmdd[4:6]}"
                label = lines[i + 1][4:] if i + 1 < len(lines) and lines[i + 1].startswith(":86:") else ""
                tx = PivotTransaction(
                    tenant_id=tenant_id, bank_id=bank_id,
                    account_iban=account_iban, value_date=value_date,
                    label=label, amount=signed, source_format="mt940",
                    balance_before=balance_before,
                    balance_after=balance_after,
                )
                tx.source_line_hash = tx.compute_hash()
                results.append(tx)
    return results