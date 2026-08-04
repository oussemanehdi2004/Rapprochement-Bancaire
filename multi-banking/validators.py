from datetime import datetime
from typing import List, Dict, Any
from models import PivotTransaction


def validate_transactions(
    transactions: List[PivotTransaction]
) -> Dict[str, Any]:

    errors = []
    seen_hashes = set()

    for index, tx in enumerate(transactions):

        tx_errors = []

        # ✅ IBAN obligatoire
        if not tx.account_iban:
            tx_errors.append("account_iban manquant")

        # ✅ Date ISO valide
        try:
            datetime.fromisoformat(tx.value_date)
        except Exception:
            tx_errors.append("value_date invalide (ISO 8601 attendu)")

        # ✅ Montant non nul
        if tx.amount == 0:
            tx_errors.append("amount ne peut pas être 0")

        # ✅ Détection doublon via hash
        if tx.source_line_hash in seen_hashes:
            tx_errors.append("transaction en doublon (hash)")
        else:
            seen_hashes.add(tx.source_line_hash)

        if tx_errors:
            errors.append({
                "index": index,
                "reference": tx.reference,
                "errors": tx_errors
            })

    return {
        "valid": len(errors) == 0,
        "error_count": len(errors),
        "errors": errors
    }