from __future__ import annotations

import re
from collections import defaultdict
from typing import Optional
from pydantic import BaseModel
from config_store import get_thresholds


# =====================================================================
# SCHÉMA MISE À JOUR
# =====================================================================
class TransactionInput(BaseModel):
    tenant_id: Optional[str] = None  # Ignoré si fourni ; toujours dérivé du token serveur
    transaction_reference: str  # Renamed from mongo_transaction_id (SHA-256 hash, not true Mongo ObjectId)
    id: str
    date: str
    description: str
    amount: float
    sender_balance_before: Optional[float] = None
    sender_balance_after: Optional[float] = None
    receiver_balance_before: Optional[float] = None
    receiver_balance_after: Optional[float] = None
    transaction_type: str  # TRANSFER, CASH_OUT, PAYMENT, etc.
    
    # 🔑 Nouveaux champs optionnels nécessaires pour la Phase 2
    account_iban: Optional[str] = None
    beneficiary_iban: Optional[str] = None
    sender_account: Optional[str] = None
    receiver_account: Optional[str] = None


# =====================================================================
# CONSTANTES DE RÈGLES
# =====================================================================
SEUIL_REGLEMENTAIRE = 10_000.0             # Déclaration TRACFIN (> 10k€)
SEUIL_APPROCHE_RATIO = 0.90                # 90% du seuil (9 000 €)
SEUIL_CASH_OUT = 5_000.0                   # Plafond retrait cash suspect (> 5k€)
SEUIL_MONTANT_ABERRANT = 1_000_000_000.0   # Plafond de sûreté (1 milliard €)

PATTERNS_MOTS_CLES_SENSIBLES = [
    r"\bCASINO\b",
    r"\bPARIS\b",
    r"\bPOKER\b",
    r"\bBET\b",
    r"\bPARI\b",
]

RATIO_MONTANT_INHABITUEL = 8.0             # Montant x8 par rapport à la moyenne du compte
SEUIL_JOURS_COMPTE_DORMANT = 90            # Inactivité de plus de 90 jours


# =====================================================================
# CONTROLES DE DONNÉES (Sanity Checks)
# =====================================================================
def validate_transaction_sanity(amount: float, seuil_montant_aberrant: float) -> str | None:
    if amount <= 0:
        return "Montant négatif ou nul invalide"
    if amount > seuil_montant_aberrant:
        return f"Montant aberrant supérieur au plafond autorisé ({seuil_montant_aberrant:,.0f} €)"
    return None


def _build_keyword_patterns(mots_cles: list[str]) -> list[str]:
    return [rf"\b{re.escape(m)}\b" for m in mots_cles]


# =====================================================================
# RÈGLES UNITAIRES (Phase 1 + Phase 2)
# =====================================================================
def apply_business_rules(
    transaction: dict,
    account_aggregate: dict | None = None,
    beneficiary_history: list[dict] | None = None
) -> dict:
    cfg = get_thresholds()
    seuil_reglementaire = cfg["SEUIL_REGLEMENTAIRE"]
    seuil_approche_ratio = cfg["SEUIL_APPROCHE_RATIO"]
    seuil_cash_out = cfg["SEUIL_CASH_OUT"]
    seuil_montant_aberrant = cfg["SEUIL_MONTANT_ABERRANT"]
    ratio_montant_inhabituel = cfg["RATIO_MONTANT_INHABITUEL"]
    seuil_jours_dormant = cfg["SEUIL_JOURS_COMPTE_DORMANT"]
    keyword_patterns = _build_keyword_patterns(cfg["MOTS_CLES_SENSIBLES"])

    amount = float(transaction.get("amount", 0))
    description = str(transaction.get("description", ""))
    factors = []
    is_blocked = False
    category = "NON_CATEGORISE"

    sanity_error = validate_transaction_sanity(amount, seuil_montant_aberrant)
    if sanity_error:
        return {
            "is_blocked": True,
            "ruleCategory": "DONNEE_INVALIDE",
            "factors": [sanity_error],
        }

    # =================================================================
    # 🔹 RÈGLES PHASE 1
    # =================================================================
    if amount > seuil_reglementaire:
        is_blocked = True
        category = "SEUIL_REGLEMENTAIRE"
        factors.append("Règlement : Montant supérieur au seuil réglementaire (10k)")
    elif amount >= seuil_reglementaire * seuil_approche_ratio:
        category = "SEUIL_APPROCHE"
        factors.append("Montant proche du seuil réglementaire (10k) — possible contournement")

    tx_type = str(transaction.get("transaction_type", "")).upper()
    if tx_type == "CASH_OUT" and amount > seuil_cash_out:
        is_blocked = True
        if category == "NON_CATEGORISE":
            category = "RETRAIT_CASH_IMPORTANT"
        factors.append("Retrait cash important")

    desc_upper = description.upper()
    for pattern in keyword_patterns:
        if re.search(pattern, desc_upper):
            is_blocked = True
            if category == "NON_CATEGORISE":
                category = "MOTCLE_SENSIBLE"
            factors.append("Mot-clé sensible détecté (LAB/FT)")
            break

    # =================================================================
    # 🔹 RÈGLES PHASE 2
    # =================================================================
    if account_aggregate:
        avg_amount = float(account_aggregate.get("avg_transaction_amount") or 0.0)
        days_inactive = account_aggregate.get("days_since_last_transaction")

        if avg_amount > 0 and (amount / avg_amount) >= ratio_montant_inhabituel:
            is_blocked = True
            if category == "NON_CATEGORISE":
                category = "MONTANT_EXCEPTIONNEL"
            ratio = amount / avg_amount
            factors.append(f"Montant inhabituel (x{ratio:.1f} supérieur à la moyenne du compte : {avg_amount:,.2f} €)")

        if days_inactive is not None and days_inactive > seuil_jours_dormant:
            is_blocked = True
            if category == "NON_CATEGORISE":
                category = "COMPTE_RAREMENT_UTILISE"
            factors.append(f"Compte inactif réactivé après {days_inactive} jours sans transaction")

    beneficiary_iban = transaction.get("beneficiary_iban") or transaction.get("receiver_account")
    account_iban = transaction.get("account_iban") or transaction.get("sender_account")

    if beneficiary_history is not None and beneficiary_iban:
        known_ibans = {
            b.get("beneficiary_iban")
            for b in beneficiary_history
            if b.get("account_iban") == account_iban
        }
        if beneficiary_iban not in known_ibans:
            is_blocked = True
            if category == "NON_CATEGORISE":
                category = "NOUVEL_IBAN"
            factors.append(f"Premier virement exécuté vers ce nouvel IBAN ({beneficiary_iban})")

    return {
        "is_blocked": is_blocked,
        "ruleCategory": category,
        "factors": factors,
    }


# =====================================================================
# RÈGLES DE BATCH
# =====================================================================
def apply_batch_rules(transactions: list[dict]) -> dict[str, dict]:
    findings: dict[str, dict] = defaultdict(
        lambda: {"is_blocked": False, "ruleCategory": "NON_CATEGORISE", "factors": []}
    )

    _detect_paiements_dupliques_et_repetitifs(transactions, findings)
    _detect_fractionnement(transactions, findings)

    return dict(findings)


def _detect_paiements_dupliques_et_repetitifs(
    transactions: list[dict], findings: dict[str, dict]
) -> None:
    groupes: dict[tuple, list[dict]] = defaultdict(list)
    for tx in transactions:
        cle = (tx.get("tenant_id"), tx.get("amount"), tx.get("description"))
        groupes[cle].append(tx)

    for (_, amount, description), membres in groupes.items():
        occurrences = len(membres)
        if occurrences < 2:
            continue

        if occurrences >= 3:
            categorie = "PAIEMENT_REPETITIF"
            message = (
                f"Paiement répétitif : {occurrences} transactions identiques "
                f'({amount} € — "{description}") dans le même lot'
            )
        else:
            categorie = "PAIEMENT_DUPLIQUE"
            message = (
                f"Doublon potentiel : {occurrences} transactions identiques "
                f'({amount} € — "{description}") dans le même lot'
            )

        for tx in membres:
            _ajouter_finding(findings, tx.get("id"), categorie, message)


def _detect_fractionnement(
    transactions: list[dict], findings: dict[str, dict]
) -> None:
    cfg = get_thresholds()
    seuil_reglementaire = cfg["SEUIL_REGLEMENTAIRE"]
    
    groupes: dict[tuple, list[dict]] = defaultdict(list)
    for tx in transactions:
        date_iso = str(tx.get("date", ""))[:10]
        cle = (tx.get("tenant_id"), date_iso)
        groupes[cle].append(tx)

    for (_, date_str), membres in groupes.items():
        total = sum(float(tx.get("amount", 0)) for tx in membres)
        if total <= seuil_reglementaire or len(membres) < 2:
            continue

        if all(float(tx.get("amount", 0)) <= seuil_reglementaire for tx in membres):
            message = (
                f"Fractionnement suspect : {len(membres)} paiements totalisant "
                f"{total:.2f} € le {date_str} (seuil réglementaire dépassé par cumul)"
            )
            for tx in membres:
                _ajouter_finding(findings, tx.get("id"), "FRACTIONNEMENT_SUSPECT", message)


def _ajouter_finding(
    findings: dict[str, dict], tx_id: str | None, categorie: str, message: str
) -> None:
    if not tx_id:
        return
    entry = findings[tx_id]
    entry["is_blocked"] = True
    if entry["ruleCategory"] == "NON_CATEGORISE":
        entry["ruleCategory"] = categorie
    entry["factors"].append(message)