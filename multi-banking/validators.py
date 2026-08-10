from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple
from models import PivotTransaction


def validate_transactions(
    transactions: List[PivotTransaction],
    existing_hashes: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    """
    Valide la structure des transactions et vérifie l'absence de doublons
    aussi bien à l'intérieur du fichier (intra-batch) que par rapport à l'historique.
    """
    errors = []
    seen_hashes = set()
    historical_hashes = existing_hashes if existing_hashes is not None else set()

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

        # ✅ Détection des doublons (intra-batch & inter-fichiers / historique)
        if tx.source_line_hash in seen_hashes:
            tx_errors.append("transaction en doublon dans ce fichier (hash)")
        elif tx.source_line_hash in historical_hashes:
            tx_errors.append("transaction déjà enregistrée dans l'historique (hash)")
        else:
            seen_hashes.add(tx.source_line_hash)

        if tx_errors:
            errors.append(
                {
                    "index": index,
                    "reference": tx.reference,
                    "errors": tx_errors,
                }
            )

    return {
        "valid": len(errors) == 0,
        "error_count": len(errors),
        "errors": errors,
    }


def filter_unique_transactions(
    transactions: List[PivotTransaction],
    existing_hashes: Set[str],
) -> Tuple[List[PivotTransaction], List[PivotTransaction]]:
    """
    Helper pour séparer rapidement les nouvelles transactions des doublons
    déjà présents dans l'historique.
    """
    unique_txs = []
    duplicate_txs = []

    for tx in transactions:
        if tx.source_line_hash in existing_hashes:
            duplicate_txs.append(tx)
        else:
            unique_txs.append(tx)

    return unique_txs, duplicate_txs