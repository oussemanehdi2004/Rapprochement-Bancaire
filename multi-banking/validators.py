from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple
from models import PivotTransaction

# Tolérance pour les montants similaires (±2 centimes = ±0.02€)
# Ajusté pour gérer les erreurs d'arrondi en virgule flottante bancaire
AMOUNT_TOLERANCE = 0.02


def validate_transactions(
    transactions: List[PivotTransaction],
    existing_hashes: Optional[Set[str]] = None,
    existing_amounts: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Valide la structure des transactions et vérifie l'absence de doublons
    aussi bien à l'intérieur du fichier (intra-batch) que par rapport à l'historique.
    
    Amélioré avec tolérance de ±2 centimes sur les montants pour gérer les
    erreurs d'arrondi bancaire typiques et la précision en virgule flottante.
    """
    errors = []
    seen_hashes = set()
    historical_hashes = existing_hashes if existing_hashes is not None else set()
    historical_amounts = existing_amounts if existing_amounts is not None else {}

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
        # 1. Vérification par hash exact (doublon parfait)
        if tx.source_line_hash in seen_hashes:
            tx_errors.append("transaction en doublon dans ce fichier (hash exact)")
        elif tx.source_line_hash in historical_hashes:
            tx_errors.append("transaction déjà enregistrée dans l'historique (hash exact)")
        else:
            # 2. Vérification par tolérance de montant (±1 centime)
            for existing_hash, existing_amount in historical_amounts.items():
                if abs(tx.amount - existing_amount) <= AMOUNT_TOLERANCE:
                    # Vérifier si c'est le même hash de base (sans montant)
                    tx_hash_base = tx.source_line_hash.rsplit("_", 1)[0]  # Enlever le montant du hash
                    existing_hash_base = existing_hash.rsplit("_", 1)[0]
                    
                    if tx_hash_base == existing_hash_base:
                        tx_errors.append(f"transaction similaire détectée (écart montant: {abs(tx.amount - existing_amount):.2f}€ ≤ ±{AMOUNT_TOLERANCE}€)")
                        break
            
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
    existing_amounts: Optional[Dict[str, float]] = None,
) -> Tuple[List[PivotTransaction], List[PivotTransaction]]:
    """
    Helper pour séparer rapidement les nouvelles transactions des doublons
    déjà présents dans l'historique.
    
    Amélioré avec tolérance de ±2 centimes sur les montants pour gérer
    les erreurs d'arrondi bancaire typiques.
    """
    unique_txs = []
    duplicate_txs = []
    historical_amounts = existing_amounts if existing_amounts is not None else {}

    for tx in transactions:
        is_duplicate = False
        
        # 1. Vérification par hash exact
        if tx.source_line_hash in existing_hashes:
            is_duplicate = True
        else:
            # 2. Vérification par tolérance de montant
            for existing_hash, existing_amount in historical_amounts.items():
                if abs(tx.amount - existing_amount) <= AMOUNT_TOLERANCE:
                    # Vérifier si c'est le même hash de base
                    tx_hash_base = tx.source_line_hash.rsplit("_", 1)[0]
                    existing_hash_base = existing_hash.rsplit("_", 1)[0]
                    
                    if tx_hash_base == existing_hash_base:
                        is_duplicate = True
                        break
        
        if is_duplicate:
            duplicate_txs.append(tx)
        else:
            unique_txs.append(tx)

    return unique_txs, duplicate_txs