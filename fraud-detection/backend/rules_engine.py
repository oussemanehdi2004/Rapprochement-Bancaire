from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from config_store import get_thresholds

# =====================================================================
# SCHÉMA (Inchangé)
# =====================================================================
class TransactionInput(BaseModel):
    tenant_id: Optional[str] = None  
    transaction_reference: str  
    id: str
    date: str
    description: str
    amount: float
    sender_balance_before: Optional[float] = None
    sender_balance_after: Optional[float] = None
    receiver_balance_before: Optional[float] = None
    receiver_balance_after: Optional[float] = None
    transaction_type: str  
    account_iban: Optional[str] = None
    beneficiary_iban: Optional[str] = None
    sender_account: Optional[str] = None
    receiver_account: Optional[str] = None

# =====================================================================
# CONSTANTES & POIDS DU SCORE COMPOSITE
# =====================================================================
# Configuration conservée[cite: 1]
SEUIL_REGLEMENTAIRE = 10_000.0             
SEUIL_APPROCHE_RATIO = 0.90                
SEUIL_CASH_OUT = 5_000.0                   
SEUIL_MONTANT_ABERRANT = 1_000_000_000.0   

PATTERNS_MOTS_CLES_SENSIBLES = [
    r"\bCASINO\b", r"\bPARIS\b", r"\bPOKER\b", r"\bBET\b", r"\bPARI\b",
]

RATIO_MONTANT_INHABITUEL = 8.0             
SEUIL_JOURS_COMPTE_DORMANT = 90            

# Nouveaux poids pour le calcul du score de risque (0-100)
RULE_WEIGHTS = {
    "SEUIL_REGLEMENTAIRE": 100,
    "MOTCLE_SENSIBLE": 100,
    "RETRAIT_CASH_IMPORTANT": 80,
    "FRACTIONNEMENT_SUSPECT": 90,
    "MONTANT_EXCEPTIONNEL": 60,
    "COMPTE_RAREMENT_UTILISE": 50,
    "SEUIL_APPROCHE": 40,
    "VELOCITE_ANORMALE": 40,
    "NOUVEL_IBAN": 30,
    "HORAIRE_ATYPIQUE": 25,
    "PAIEMENT_REPETITIF": 60,
    "PAIEMENT_DUPLIQUE": 30
}

# Cache en mémoire pour la vélocité (à remplacer par Redis si plusieurs workers FastAPI)
_velocity_cache: Dict[str, List[datetime]] = {}

# =====================================================================
# NOUVELLES RÈGLES : HORAIRE & VÉLOCITÉ
# =====================================================================
def check_atypical_time(tx_date_str: str) -> bool:
    try:
        tx_time = datetime.fromisoformat(tx_date_str.replace("Z", "+00:00"))
        return 1 <= tx_time.hour < 5
    except ValueError:
        return False

def check_abnormal_velocity(account_id: str, tx_date_str: str, time_window_minutes: int = 15, max_tx: int = 3) -> bool:
    if not account_id:
        return False
        
    try:
        tx_time = datetime.fromisoformat(tx_date_str.replace("Z", "+00:00"))
    except ValueError:
        return False

    if account_id not in _velocity_cache:
        _velocity_cache[account_id] = []
        
    history = _velocity_cache[account_id]
    cutoff_time = tx_time - timedelta(minutes=time_window_minutes)
    history = [t for t in history if t >= cutoff_time]
    
    history.append(tx_time)
    _velocity_cache[account_id] = history
    
    return len(history) > max_tx

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
# MOTEUR PRINCIPAL : APPLICATION DES RÈGLES
# =====================================================================
def apply_business_rules(
    transaction: dict,
    account_aggregate: dict | None = None,
    beneficiary_history: list[dict] | None = None
) -> dict:
    cfg = get_thresholds()
    seuil_reglementaire = cfg.get("SEUIL_REGLEMENTAIRE", SEUIL_REGLEMENTAIRE)
    seuil_approche_ratio = cfg.get("SEUIL_APPROCHE_RATIO", SEUIL_APPROCHE_RATIO)
    seuil_cash_out = cfg.get("SEUIL_CASH_OUT", SEUIL_CASH_OUT)
    seuil_montant_aberrant = cfg.get("SEUIL_MONTANT_ABERRANT", SEUIL_MONTANT_ABERRANT)
    ratio_montant_inhabituel = cfg.get("RATIO_MONTANT_INHABITUEL", RATIO_MONTANT_INHABITUEL)
    seuil_jours_dormant = cfg.get("SEUIL_JOURS_COMPTE_DORMANT", SEUIL_JOURS_COMPTE_DORMANT)
    keyword_patterns = _build_keyword_patterns(cfg.get("MOTS_CLES_SENSIBLES", PATTERNS_MOTS_CLES_SENSIBLES))

    amount = float(transaction.get("amount", 0))
    description = str(transaction.get("description", ""))
    tx_date_str = str(transaction.get("date", ""))
    
    score = 0
    factors = []
    triggered_categories = []

    # 1. Sanity Check (Bloquant direct)[cite: 1]
    sanity_error = validate_transaction_sanity(amount, seuil_montant_aberrant)
    if sanity_error:
        return {
            "score": 100,
            "action": "BLOCKED",
            "categories": ["DONNEE_INVALIDE"],
            "factors": [sanity_error],
        }

    # =================================================================
    # 🔹 RÈGLES PHASE 1[cite: 1]
    # =================================================================
    if amount > seuil_reglementaire:
        score += RULE_WEIGHTS["SEUIL_REGLEMENTAIRE"]
        triggered_categories.append("SEUIL_REGLEMENTAIRE")
        factors.append("Règlement : Montant supérieur au seuil réglementaire (10k)")
    elif amount >= seuil_reglementaire * seuil_approche_ratio:
        score += RULE_WEIGHTS["SEUIL_APPROCHE"]
        triggered_categories.append("SEUIL_APPROCHE")
        factors.append("Montant proche du seuil réglementaire (10k) — possible contournement")

    tx_type = str(transaction.get("transaction_type", "")).upper()
    if tx_type == "CASH_OUT" and amount > seuil_cash_out:
        score += RULE_WEIGHTS["RETRAIT_CASH_IMPORTANT"]
        triggered_categories.append("RETRAIT_CASH_IMPORTANT")
        factors.append("Retrait cash important")

    desc_upper = description.upper()
    for pattern in keyword_patterns:
        if re.search(pattern, desc_upper):
            score += RULE_WEIGHTS["MOTCLE_SENSIBLE"]
            triggered_categories.append("MOTCLE_SENSIBLE")
            factors.append("Mot-clé sensible détecté (LAB/FT)")
            break

    # =================================================================
    # 🔹 RÈGLES PHASE 2[cite: 1]
    # =================================================================
    if account_aggregate:
        avg_amount = float(account_aggregate.get("avg_transaction_amount") or 0.0)
        days_inactive = account_aggregate.get("days_since_last_transaction")

        if avg_amount > 0 and (amount / avg_amount) >= ratio_montant_inhabituel:
            score += RULE_WEIGHTS["MONTANT_EXCEPTIONNEL"]
            triggered_categories.append("MONTANT_EXCEPTIONNEL")
            ratio = amount / avg_amount
            factors.append(f"Montant inhabituel (x{ratio:.1f} supérieur à la moyenne du compte : {avg_amount:,.2f} €)")

        if days_inactive is not None and days_inactive > seuil_jours_dormant:
            score += RULE_WEIGHTS["COMPTE_RAREMENT_UTILISE"]
            triggered_categories.append("COMPTE_RAREMENT_UTILISE")
            factors.append(f"Compte inactif réactivé après {days_inactive} jours sans transaction")

    beneficiary_iban = transaction.get("beneficiary_iban") or transaction.get("receiver_account")
    account_iban = transaction.get("account_iban") or transaction.get("sender_account")

    if beneficiary_history is not None and beneficiary_iban:
        known_ibans = {b.get("beneficiary_iban") for b in beneficiary_history if b.get("account_iban") == account_iban}
        if beneficiary_iban not in known_ibans:
            score += RULE_WEIGHTS["NOUVEL_IBAN"]
            triggered_categories.append("NOUVEL_IBAN")
            factors.append(f"Premier virement exécuté vers ce nouvel IBAN ({beneficiary_iban})")

    # =================================================================
    # 🔹 RÈGLES PHASE 3 : HORAIRES ET VÉLOCITÉ
    # =================================================================
    if check_atypical_time(tx_date_str):
        score += RULE_WEIGHTS["HORAIRE_ATYPIQUE"]
        triggered_categories.append("HORAIRE_ATYPIQUE")
        factors.append("Transaction effectuée à un horaire atypique (1h-5h du matin)")

    if check_abnormal_velocity(account_iban, tx_date_str):
        score += RULE_WEIGHTS["VELOCITE_ANORMALE"]
        triggered_categories.append("VELOCITE_ANORMALE")
        factors.append("Vélocité anormale : Multiples transactions en moins de 15 minutes")

    # --- ÉVALUATION FINALE ---
    final_score = min(score, 100)
    
    if final_score >= 70:
        action = "BLOCKED"
    elif final_score >= 40:
        action = "REVIEW_NEEDED"
    else:
        action = "APPROVED"

    if not triggered_categories:
        triggered_categories.append("NON_CATEGORISE")

    return {
        "score": final_score,
        "action": action,
        "categories": list(set(triggered_categories)), # Déduplication
        "factors": factors,
    }

# =====================================================================
# RÈGLES DE BATCH (Adaptées au scoring)[cite: 1]
# =====================================================================
def apply_batch_rules(transactions: list[dict]) -> dict[str, dict]:
    findings: dict[str, dict] = defaultdict(
        lambda: {"score": 0, "action": "APPROVED", "categories": [], "factors": []}
    )

    _detect_paiements_dupliques_et_repetitifs(transactions, findings)
    _detect_fractionnement(transactions, findings)

    return dict(findings)

def _detect_paiements_dupliques_et_repetitifs(transactions: list[dict], findings: dict[str, dict]) -> None:
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
            message = f"Paiement répétitif : {occurrences} transactions identiques ({amount} € — \"{description}\") dans le même lot"
        else:
            categorie = "PAIEMENT_DUPLIQUE"
            message = f"Doublon potentiel : {occurrences} transactions identiques ({amount} € — \"{description}\") dans le même lot"

        for tx in membres:
            _ajouter_finding(findings, tx.get("id"), categorie, message)

def _detect_fractionnement(transactions: list[dict], findings: dict[str, dict]) -> None:
    cfg = get_thresholds()
    seuil_reglementaire = cfg.get("SEUIL_REGLEMENTAIRE", SEUIL_REGLEMENTAIRE)
    
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
            message = f"Fractionnement suspect : {len(membres)} paiements totalisant {total:.2f} € le {date_str} (seuil réglementaire dépassé par cumul)"
            for tx in membres:
                _ajouter_finding(findings, tx.get("id"), "FRACTIONNEMENT_SUSPECT", message)

def _ajouter_finding(findings: dict[str, dict], tx_id: str | None, categorie: str, message: str) -> None:
    if not tx_id:
        return
    entry = findings[tx_id]
    poids = RULE_WEIGHTS.get(categorie, 50)
    
    nouveau_score = min(entry["score"] + poids, 100)
    entry["score"] = nouveau_score
    
    if nouveau_score >= 70:
        entry["action"] = "BLOCKED"
    elif nouveau_score >= 40:
        entry["action"] = "REVIEW_NEEDED"
        
    if categorie not in entry["categories"]:
        entry["categories"].append(categorie)
    entry["factors"].append(message)