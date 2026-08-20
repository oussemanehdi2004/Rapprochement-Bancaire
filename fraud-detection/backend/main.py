import asyncio
import csv
import datetime
import io
import json
import logging
import os
import time
import uuid
from collections import defaultdict
from typing import Any, Generic, List, Optional, TypeVar, Union

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import httpx
import joblib
import jwt
import numpy as np
from pydantic import BaseModel
import shap
from supabase import create_client

from auth import create_internal_token, get_jwt_secret
from two_factor_auth import get_2fa_service
# IMPORT MODIFIE: on importe les nouvelles variables de configuration
from config_store import get_thresholds, update_thresholds, DISABLE_INTERNAL_AUTH, FRAUD_INTERNAL_SECRET
from features import FEATURE_NAMES, receiver_balance_error, sender_balance_error, calculate_amount_ratio

# Retrait de l'import obsolète (internal_auth.py ne sera plus nécessaire pour les routes S2S principales)
# from internal_auth import verify_internal_token

from rules_engine import (
    TransactionInput,
    apply_batch_rules,
    apply_business_rules,
)
from prometheus_fastapi_instrumentator import Instrumentator
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("fraud_api")

NODE_BACKEND_URL = os.environ.get("NODE_BACKEND_URL", "http://localhost:3000")

try:
    from graph_engine import create_graph_engine
    graph_engine = create_graph_engine()
    if graph_engine:
        logger.info("✅ Neo4j connecté avec succès")
    else:
        logger.warning("⚠️ Neo4j non configuré - Le système fonctionnera sans analyse de graphe")
except Exception as e:
    logger.warning(f"⚠️ Impossible de connecter Neo4j: {e}")
    graph_engine = None

# Gestionnaire de connexions SSE pour notifications temps réel
class SSEManager:
    def __init__(self):
        self.active_connections: List[asyncio.Queue] = []

    async def connect(self) -> asyncio.Queue:
        queue = asyncio.Queue()
        self.active_connections.append(queue)
        return queue

    def disconnect(self, queue: asyncio.Queue):
        if queue in self.active_connections:
            self.active_connections.remove(queue)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.put(message)

sse_manager = SSEManager()

# Configuration du rate limiting
limiter = Limiter(key_func=get_remote_address)
RATE_LIMIT_REQUESTS = int(os.environ.get("RATE_LIMIT_REQUESTS", "30"))
RATE_LIMIT_PERIOD = int(os.environ.get("RATE_LIMIT_PERIOD", "60"))  # seconds

ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT in ("production", "prod")

app = FastAPI(
    title="API de Rapprochement Bancaire, Fraude Hybride et Persistance",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
    root_path="/fraud",
)
app.state.limiter = limiter
# 1. Créez une fonction de gestion d'erreur personnalisée
def custom_rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    # Le "or {}" garantit que si getattr renvoie None, nous aurons bien un dictionnaire vide
    headers = getattr(exc, "headers", None) or {}
    
    return JSONResponse(
        status_code=429,
        content={
            "success": False,
            "error": "Trop de requêtes détectées.",
            "message": f"Limite atteinte. Veuillez patienter {headers.get('Retry-After', 60)} secondes."
        },
        headers=headers
    )

# 2. Enregistrez ce gestionnaire dans votre application FastAPI
# (Remplacez l'ancien app.add_exception_handler si vous en aviez un)
app.add_exception_handler(RateLimitExceeded, custom_rate_limit_handler)
Instrumentator().instrument(app).expose(app)

def _parse_allowed_origins() -> list[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]

    if IS_PRODUCTION:
        return []

    return [
        "http://localhost:4200", "http://127.0.0.1:4200",
        "http://localhost:4000", "http://127.0.0.1:4000",
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:8005", "http://127.0.0.1:8005",
    ]

origins = _parse_allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request, call_next):
    request_id = str(uuid.uuid4())
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start) * 1000, 2)
    logger.info(
        json.dumps({
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "environment": ENVIRONMENT,
        })
    )
    response.headers["X-Request-ID"] = request_id
    return response

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception:
        logger.exception("Erreur Supabase.")

MODEL_PATH = "model_fraud_calibrated.pkl" if os.path.exists("model_fraud_calibrated.pkl") else "model_fraud.pkl"
ISOLATION_FOREST_PATH = "model_isolation_forest.pkl"
METADATA_PATH = "model_metadata.pkl"
model = None
isolation_forest = None
explainer = None
feature_names = FEATURE_NAMES
optimal_threshold = 0.4758  # Seuil par défaut (sera écrasé si métadonnées existent)

# Chargement des métadonnées du modèle si disponibles
if os.path.exists(METADATA_PATH):
    try:
        metadata = joblib.load(METADATA_PATH)
        optimal_threshold = metadata.get('optimal_threshold', 0.4758)
        logger.info(f"Seuil optimal chargé depuis métadonnées: {optimal_threshold:.4f}")
    except Exception:
        logger.warning("Impossible de charger les métadonnées du modèle, utilisation du seuil par défaut")

if os.path.exists(MODEL_PATH):
    try:
        model = joblib.load(MODEL_PATH)
        tree_model = model
        if hasattr(model, "calibrated_classifiers_") and model.calibrated_classifiers_:
            first_cal = model.calibrated_classifiers_[0]
            tree_model = getattr(first_cal, "estimator", getattr(first_cal, "base_estimator", model))
        explainer = shap.TreeExplainer(tree_model)
        logger.info(f"Modèle chargé: {MODEL_PATH}")
    except Exception:
        model = None
        explainer = None
        logger.warning("Impossible de charger le modèle ML")

# Chargement du modèle Isolation Forest pour détection d'anomalies complémentaire
if os.path.exists(ISOLATION_FOREST_PATH):
    try:
        isolation_forest = joblib.load(ISOLATION_FOREST_PATH)
        logger.info(f"Modèle Isolation Forest chargé: {ISOLATION_FOREST_PATH}")
    except Exception:
        isolation_forest = None
        logger.warning("Impossible de charger le modèle Isolation Forest")

RULE_SEVERITY_WEIGHTS = {
    "SEUIL_REGLEMENTAIRE": 0.95, "MOTCLE_SENSIBLE": 0.90, "FRACTIONNEMENT_SUSPECT": 0.85,
    "RETRAIT_CASH_IMPORTANT": 0.80, "MONTANT_EXCEPTIONNEL": 0.75, "PAIEMENT_DUPLIQUE": 0.60,
    "NOUVEL_IBAN": 0.55, "COMPTE_RAREMENT_UTILISE": 0.50, "SEUIL_APPROCHE": 0.45,
}

def fuse_scores(ml_probability: float, rule_category: Optional[str], is_blocked: bool, isolation_anomaly_score: float = 0.0) -> float:
    """
    Fusionne les scores ML, règles métier et Isolation Forest.
    isolation_anomaly_score: 0.0 (normal) à 1.0 (anomalie forte)
    """
    base_score = ml_probability
    
    # Intégration Isolation Forest (poids de 0.3 pour les anomalies détectées)
    if isolation_anomaly_score > 0:
        base_score = base_score + (isolation_anomaly_score * 0.3)
        base_score = min(base_score, 1.0)  # Plafond à 1.0
    
    if not is_blocked or not rule_category:
        return round(base_score, 4)
    
    rule_score = RULE_SEVERITY_WEIGHTS.get(rule_category, 0.70)
    return round(1.0 - ((1.0 - base_score) * (1.0 - rule_score)), 4)

T = TypeVar("T")
class APIResponse(BaseModel, Generic[T]):
    success: bool = True
    data: T

class APIErrorDetail(BaseModel):
    code: str
    message: str

class APIErrorResponse(BaseModel):
    success: bool = False
    error: APIErrorDetail
    requestId: Optional[str] = None

class ShapContribution(BaseModel):
    feature: str
    value: float
    direction: str

class ExplainabilityOutput(BaseModel):
    summary: str
    factors: List[str]
    shap_contributions: List[ShapContribution] = []

class TransactionOutput(BaseModel):
    tenant_id: str
    transaction_reference: str
    id: str
    date: str
    description: str
    amount: float
    isFraud: bool
    fraudProbability: float
    score: int
    confidence: str
    reconciliationStatus: str
    ruleCategory: Optional[str] = "NON_CATEGORISE"
    explainability: ExplainabilityOutput

def probability_to_confidence(probability: float) -> dict:
    score = round(probability * 100)
    if score >= 85: confidence = "HIGH"
    elif score >= 70: confidence = "MEDIUM"
    else: confidence = "LOW"
    return {"score": score, "confidence": confidence}

JWT_SECRET = get_jwt_secret()
security = HTTPBearer(auto_error=False)

# =====================================================================
# GESTION D'AUTHENTIFICATION (Clarification Point 3)
# =====================================================================

async def get_service_context(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    NOUVEAU: Source de vérité unique pour les appels Service-à-Service (ex: BankMatch).
    Valide UNIQUEMENT le token interne avec le secret spécifique Fraud (FRAUD_INTERNAL_SECRET).
    """
    if DISABLE_INTERNAL_AUTH:
        return {"user_id": "internal_dev", "tenant_id": "default", "is_internal": True}

    if not credentials:
        raise HTTPException(status_code=401, detail="Token d'authentification inter-services manquant")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, FRAUD_INTERNAL_SECRET, algorithms=["HS256"])
        return {
            "user_id": payload.get("service", "internal"),
            "tenant_id": payload.get("tenant_id", "default"),
            "is_internal": True,
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token interne expiré")
    except jwt.PyJWTError:
        raise HTTPException(status_code=403, detail="Signature du token interne invalide")

# Dépendance optionnelle pour le développement (pas d'authentification requise)
async def get_optional_context(credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))):
    """Pour le développement : retourne un contexte par défaut si pas de token."""
    if DISABLE_INTERNAL_AUTH or not credentials:
        return {"user_id": "dev_user", "tenant_id": "default", "is_internal": False}
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, FRAUD_INTERNAL_SECRET, algorithms=["HS256"])
        return {
            "user_id": payload.get("service", "internal"),
            "tenant_id": payload.get("tenant_id", "default"),
            "is_internal": True,
        }
    except:
        return {"user_id": "dev_user", "tenant_id": "default", "is_internal": False}

async def get_current_user_context(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Maintenu pour les appels provenant du Frontend (dashboard) ou du proxy temporaire Express.
    Sera décommissionné une fois le Frontend directement connecté via l'API Gateway de BankMatch.
    """
    if not credentials:
        return {"user_id": "demo_user", "tenant_id": "default", "is_internal": False}
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("purpose") == "internal_api_call":
            return {"user_id": payload.get("service", "internal"), "tenant_id": payload.get("tenant_id", "default"), "is_internal": True}
    except jwt.PyJWTError:
        pass

    if NODE_BACKEND_URL and NODE_BACKEND_URL != "NONE":
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                response = await client.get(f"{NODE_BACKEND_URL}/api/users/me", headers={"Authorization": f"Bearer {token}"})
                if response.status_code == 200:
                    user_data = response.json()
                    return {"user_id": user_data.get("id"), "tenant_id": user_data.get("tenantId", "default"), "is_internal": False}
        except httpx.HTTPError:
            pass

    return {"user_id": "dev_user", "tenant_id": "default", "is_internal": False}

# =====================================================================
# METIER
# =====================================================================

def preprocess_transaction(tx: TransactionInput, account_aggregate: Optional[dict] = None, beneficiary_history: Optional[List[dict]] = None) -> list:
    tx_type = tx.transaction_type.upper()
    is_transfer = 1 if tx_type == "TRANSFER" else 0
    is_cash_out = 1 if tx_type == "CASH_OUT" else 0

    # --- Features V2 (Granularité accrue) ---
    # Extraction de l'heure depuis la date ISO (ex: "2026-08-14T14:30:00Z")
    try:
        hour_of_day = int(tx.date[11:13]) if tx.date and "T" in tx.date else 12
    except (ValueError, IndexError):
        hour_of_day = 12

    # Calcul du ratio montant / moyenne historique avec données réelles si disponibles
    # Parer aux réponses vides [] de Supabase pour éviter l'IndexError / ZeroDivisionError
    if account_aggregate and isinstance(account_aggregate, dict):
        avg_amount = float(account_aggregate.get("avg_transaction_amount") or 0.0)
        amount_to_avg_ratio = calculate_amount_ratio(tx.amount, avg_amount) if avg_amount > 0 else 1.0
        days_since_last_tx = float(account_aggregate.get("days_since_last_transaction") or 5.0)
    else:
        amount_to_avg_ratio = 1.0
        days_since_last_tx = 5.0

    # Calcul du nombre de transactions vers ce bénéficiaire
    beneficiary_tx_count = 0
    if beneficiary_history and isinstance(beneficiary_history, list) and tx.beneficiary_iban:
        beneficiary_tx_count = sum(
            1 for b in beneficiary_history 
            if b and isinstance(b, dict) and b.get("beneficiary_iban") == tx.beneficiary_iban
        )

    # Gestion des valeurs None pour les soldes avec valeurs par défaut
    sender_before = tx.sender_balance_before if tx.sender_balance_before is not None else 0.0
    sender_after = tx.sender_balance_after if tx.sender_balance_after is not None else 0.0
    receiver_before = tx.receiver_balance_before if tx.receiver_balance_before is not None else 0.0
    receiver_after = tx.receiver_balance_after if tx.receiver_balance_after is not None else 0.0

    return [
        tx.amount, 
        sender_before, 
        sender_after,
        receiver_before, 
        receiver_after,
        sender_balance_error(tx.amount, sender_before, sender_after),
        receiver_balance_error(tx.amount, receiver_before, receiver_after),
        is_transfer, 
        is_cash_out,
        # Ajout strict des 4 variables V2 dans l'ordre de FEATURE_NAMES
        amount_to_avg_ratio,
        hour_of_day,
        days_since_last_tx,
        beneficiary_tx_count
    ]

def extract_rule_evaluation(tx: TransactionInput, batch_finding: Optional[dict] = None, account_aggregate: Optional[dict] = None, beneficiary_history: Optional[List[dict]] = None):
    tx_dict = tx.model_dump()
    rule_res = apply_business_rules(transaction=tx_dict, account_aggregate=account_aggregate, beneficiary_history=beneficiary_history)

    if isinstance(rule_res, tuple):
        if len(rule_res) == 3: rule_flag, rule_reason, rule_category = rule_res
        elif len(rule_res) == 2:
            rule_flag, rule_reason = rule_res
            rule_category = "SEUIL_REGLEMENTAIRE" if rule_flag else "NON_CATEGORISE"
        else: rule_flag, rule_reason, rule_category = False, "", "NON_CATEGORISE"
        rule_factors = [rule_reason] if rule_reason else []
    elif isinstance(rule_res, dict):
        # Corrigé : utiliser le champ 'action' au lieu de 'is_blocked' ou 'rule_flag'
        action = rule_res.get("action", "APPROVED")
        rule_flag = action in ("BLOCKED", "REVIEW_NEEDED")
        rule_category = rule_res.get("categories", ["NON_CATEGORISE"])[0] if rule_res.get("categories") else "NON_CATEGORISE"
        rule_factors = rule_res.get("factors", [])
        if not rule_factors:
            single_reason = rule_res.get("reason", "") or rule_res.get("rule_reason", "")
            rule_factors = [single_reason] if single_reason else []
    else: rule_flag, rule_category, rule_factors = False, "NON_CATEGORISE", []

    if batch_finding:
        # Corrigé : utiliser le champ 'action' au lieu de 'is_blocked'
        batch_action = batch_finding.get("action", "APPROVED")
        rule_flag = rule_flag or batch_action in ("BLOCKED", "REVIEW_NEEDED")
        if rule_category == "NON_CATEGORISE":
            batch_categories = batch_finding.get("categories", ["NON_CATEGORISE"])
            rule_category = batch_categories[0] if batch_categories else "NON_CATEGORISE"
        for factor in batch_finding.get("factors", []):
            if factor not in rule_factors: rule_factors.append(factor)

    rule_reason = rule_factors[0] if rule_factors else ""
    return rule_flag, rule_reason, rule_category, rule_factors

def build_transaction_output(tx: TransactionInput, batch_finding: Optional[dict] = None, account_aggregate: Optional[dict] = None, beneficiary_history: Optional[List[dict]] = None) -> TransactionOutput:
    rule_flag, rule_reason, rule_category, factors_from_rules = extract_rule_evaluation(tx, batch_finding, account_aggregate, beneficiary_history)

    model_flag, raw_ml_probability = False, 0.0
    factors_text = list(factors_from_rules)
    main_ml_factor = ""
    shap_contributions_list = []
    isolation_anomaly_score = 0.0

    if model is not None and explainer is not None:
        features_vector = preprocess_transaction(tx, account_aggregate, beneficiary_history)
        probabilities = model.predict_proba([features_vector])[0]
        raw_ml_probability = float(probabilities[1])
        model_flag = raw_ml_probability >= optimal_threshold

        features_array = np.array([features_vector])
        shap_values = explainer(features_array)
        shap_vals_vector = shap_values.values[0]
        if hasattr(shap_vals_vector, "shape") and len(shap_vals_vector.shape) == 2 and shap_vals_vector.shape[1] == 2:
            shap_vals_vector = shap_vals_vector[:, 1]

        contributions = list(zip(feature_names, shap_vals_vector))
        top_factors = sorted(contributions, key=lambda x: abs(x[1]), reverse=True)[:3]
        main_ml_factor = top_factors[0][0]

        shap_contributions_list = [ShapContribution(feature=n, value=float(v), direction="positive" if v > 0 else "negative") for n, v in top_factors]
        factors_text.extend(f"{n} a contribué {'positivement' if v > 0 else 'négativement'}" for n, v in top_factors)

    # Intégration Isolation Forest pour détection d'anomalies non supervisée
    if isolation_forest is not None:
        features_vector = preprocess_transaction(tx, account_aggregate, beneficiary_history)
        iso_prediction = isolation_forest.predict([features_vector])[0]
        # Isolation Forest renvoie -1 pour anomalie, 1 pour normal
        if iso_prediction == -1:
            isolation_anomaly_score = 0.8  # Score d'anomalie élevé
            factors_text.append("Anomalie détectée par Isolation Forest (comportement atypique non supervisé)")
            model_flag = True  # Renforce la détection de fraude

    is_fraud = model_flag or rule_flag
    final_fraud_probability = fuse_scores(raw_ml_probability, rule_category, rule_flag, isolation_anomaly_score)

    if rule_flag and model_flag: summary_text = f"ALERTE CRITIQUE : Bloqué par règle métier ({rule_reason}) et validé par l'IA."
    elif rule_flag: summary_text = f"Bloqué par conformité : {rule_reason}."
    elif model_flag: summary_text = f"Détection IA : Comportement suspect identifié via {main_ml_factor}."
    else: summary_text = "Aucune anomalie détectée par l'IA ou les filtres métiers."

    if is_fraud: rec_status = "SUSPICIOUS"
    elif tx.amount > 5000: rec_status = "UNMATCHED"
    else: rec_status = "MATCHED"

    return TransactionOutput(
        tenant_id=tx.tenant_id, transaction_reference=tx.transaction_reference, id=tx.id, date=tx.date, description=tx.description, amount=tx.amount,
        isFraud=is_fraud, fraudProbability=final_fraud_probability, score=probability_to_confidence(final_fraud_probability)["score"],
        confidence=probability_to_confidence(final_fraud_probability)["confidence"], reconciliationStatus=rec_status, ruleCategory=rule_category,
        explainability=ExplainabilityOutput(summary=summary_text, factors=factors_text, shap_contributions=shap_contributions_list)
    )

@app.get("/health", tags=["System"], response_model=APIResponse[dict])
@limiter.limit(f"{RATE_LIMIT_REQUESTS}/{RATE_LIMIT_PERIOD} seconds")
async def health_check(request: Request):
    return APIResponse(success=True, data={"status": "ok"})

def _apply_graph_findings(result: TransactionOutput, iban: str, tenant_id: str) -> None:
    if graph_engine is None: return
    OVERWRITABLE_CATEGORIES = {"NON_CATEGORISE", "NOUVEL_IBAN"}

    network = graph_engine.detect_fraud_network(tenant_id, iban)
    if network:
        result.isFraud, result.reconciliationStatus = True, "SUSPICIOUS"
        result.explainability.factors.append(f"Compte connecté à un réseau de fraude ({network['alert_count']} alertes liées)")
        if result.ruleCategory in OVERWRITABLE_CATEGORIES: result.ruleCategory = "RESEAU_FRAUDE"

    cycle = graph_engine.detect_circular_payment(tenant_id, iban)
    if cycle:
        result.isFraud, result.reconciliationStatus = True, "SUSPICIOUS"
        result.explainability.factors.append("Paiement circulaire détecté : " + " → ".join(cycle))
        if result.ruleCategory in OVERWRITABLE_CATEGORIES: result.ruleCategory = "PAIEMENT_CIRCULAIRE"

    reciprocal = graph_engine.detect_reciprocal_flow(tenant_id, iban)
    if reciprocal:
        result.explainability.factors.append(f"Flux réciproque suspect avec {reciprocal['counterparty']} ({reciprocal['out_count']} envois / {reciprocal['in_count']} retours)")
        if result.ruleCategory in OVERWRITABLE_CATEGORIES: result.ruleCategory = "COLLUSION_SUSPECTE"

    # Détection de comptes mules (in/out ratio + délai court)
    mule_accounts = graph_engine.detect_mule_accounts(tenant_id, min_transactions=3, min_in_out_ratio=0.6, max_delay_hours=48)
    if mule_accounts:
        mule_ibans = {m['iban'] for m in mule_accounts}
        if iban in mule_ibans:
            mule_info = next(m for m in mule_accounts if m['iban'] == iban)
            result.isFraud, result.reconciliationStatus = True, "SUSPICIOUS"
            result.explainability.factors.append(
                f"Compte mule suspecté : ratio in/out de {mule_info['in_out_ratio']:.2f} "
                f"({mule_info['in_count']} entrées, {mule_info['out_count']} sorties, "
                f"délai moyen {mule_info['avg_delay_hours']:.1f}h)"
            )
            if result.ruleCategory in OVERWRITABLE_CATEGORIES: result.ruleCategory = "COMPTE_MULE"

def analyze_batch(transactions: List[TransactionInput]) -> List[TransactionOutput]:
    tx_dicts = [tx.model_dump() for tx in transactions]
    batch_findings = apply_batch_rules(tx_dicts)
    aggregates_map, beneficiaries_map = {}, {}

    if supabase is not None:
        try:
            account_ibans = list({tx_dict.get("account_iban") or tx_dict.get("sender_account") for tx_dict in tx_dicts if tx_dict.get("account_iban") or tx_dict.get("sender_account")})
            if account_ibans:
                res_agg = supabase.table("account_aggregates").select("*").in_("account_iban", account_ibans).execute()
                if res_agg.data: aggregates_map = {item["account_iban"]: item for item in res_agg.data}
                res_ben = supabase.table("beneficiary_history").select("*").in_("account_iban", account_ibans).execute()
                if res_ben.data:
                    for item in res_ben.data:
                        beneficiaries_map.setdefault(item["account_iban"], []).append(item)
        except Exception:
            pass

    results = []
    for tx in transactions:
        tx_dict = tx.model_dump()
        iban = tx_dict.get("account_iban") or tx_dict.get("sender_account")
        results.append(build_transaction_output(tx=tx, batch_finding=batch_findings.get(tx.id), account_aggregate=aggregates_map.get(iban), beneficiary_history=beneficiaries_map.get(iban, [])))

    if graph_engine is not None:
        for tx, result in zip(transactions, results):
            tx_dict = tx.model_dump()
            try: graph_engine.sync_transaction(tx_dict, result.isFraud, result.ruleCategory)
            except Exception: pass
            iban = tx_dict.get("account_iban") or tx_dict.get("sender_account")
            if iban:
                try: _apply_graph_findings(result, iban, tx_dict.get("tenant_id"))
                except Exception: pass

    # Broadcast notifications pour les fraudes détectées via SSE
    for result in results:
        if result.isFraud:
            notification = {
                "type": "fraud_alert",
                "transaction_id": result.id,
                "transaction_reference": result.transaction_reference,
                "amount": result.amount,
                "fraud_probability": result.fraudProbability,
                "score": result.score,
                "rule_category": result.ruleCategory,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "message": result.explainability.summary
            }
            asyncio.create_task(sse_manager.broadcast(notification))

    return results

# =====================================================================
# ENDPOINT D'ANALYSE HYBRIDE (Nettoyé des doubles auth)
# =====================================================================
@app.post("/api/analyze", response_model=APIResponse[List[TransactionOutput]])
@limiter.limit(f"{RATE_LIMIT_REQUESTS}/{RATE_LIMIT_PERIOD} seconds")
async def analyze_transactions_secure(
    transactions: List[TransactionInput],
    request: Request,
    # NOUVEAU : On utilise UNIQUEMENT le contexte S2S avec le secret isolé
    internal_ctx: dict = Depends(get_service_context),
):
    logger.info("Accès API sécurisé via S2S (token interne).")
    start_time = time.perf_counter()
    auth_tenant_id = internal_ctx.get("tenant_id", "default")

    for tx in transactions:
        tx.tenant_id = auth_tenant_id

    try:
        results = analyze_batch(transactions)
        if supabase is not None:
            try:
                for r in results:
                    supabase.table("fraud_alerts").insert({
                        "tenant_id": r.tenant_id, "transaction_reference": r.transaction_reference, "transaction_id": r.id,
                        "date": r.date, "amount": r.amount, "is_fraud": r.isFraud, "fraud_probability": r.fraudProbability,
                        "score": r.score, "reconciliation_status": r.reconciliationStatus, "rule_category": r.ruleCategory, "explainability": r.explainability.model_dump(),
                    }).execute()
            except Exception as database_error:
                raise HTTPException(status_code=502, detail="Échec de la sauvegarde des résultats.") from database_error

        logger.info(f"Temps de traitement : {(time.perf_counter() - start_time) * 1000:.2f} ms pour {len(results)} transaction(s)")
        return APIResponse(success=True, data=results)
    except HTTPException: raise
    except Exception: raise HTTPException(status_code=500, detail="Erreur interne du serveur.")


class ThresholdsModel(BaseModel):
    SEUIL_REGLEMENTAIRE: float
    SEUIL_APPROCHE_RATIO: float
    SEUIL_CASH_OUT: float
    SEUIL_MONTANT_ABERRANT: float
    RATIO_MONTANT_INHABITUEL: float
    SEUIL_JOURS_COMPTE_DORMANT: int
    MOTS_CLES_SENSIBLES: List[str]

class ThresholdsPatch(BaseModel):
    SEUIL_REGLEMENTAIRE: Optional[float] = None
    SEUIL_APPROCHE_RATIO: Optional[float] = None
    SEUIL_CASH_OUT: Optional[float] = None
    SEUIL_MONTANT_ABERRANT: Optional[float] = None
    RATIO_MONTANT_INHABITUEL: Optional[float] = None
    SEUIL_JOURS_COMPTE_DORMANT: Optional[int] = None
    MOTS_CLES_SENSIBLES: Optional[List[str]] = None

@app.get("/api/config/thresholds", response_model=APIResponse[ThresholdsModel])
async def get_config_thresholds(token_payload: dict = Depends(get_optional_context)):
    return APIResponse(success=True, data=get_thresholds())

@app.put("/api/config/thresholds", response_model=APIResponse[ThresholdsModel])
async def put_config_thresholds(patch: ThresholdsPatch, token_payload: dict = Depends(get_optional_context)):
    updates = {k: v for k, v in patch.model_dump().items() if v is not None}
    if not updates: raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour.")
    return APIResponse(success=True, data=update_thresholds(updates))

class GraphEdge(BaseModel): source: str; target: str; amount: float; is_fraud: bool; tx_id: str
class GraphNetworkResponse(BaseModel): center_iban: str; nodes: List[str]; edges: List[GraphEdge]

@app.get("/api/graph/top-accounts")
async def get_top_flagged_accounts(tenant_id: Optional[str] = None, limit: int = 10, token_payload: dict = Depends(get_optional_context)):
    effective_tenant_id = tenant_id or token_payload.get("tenant_id", "default")
    
    # Données mockées pour le développement quand Neo4j n'est pas disponible
    if graph_engine is None:
        mock_data = [
            {"iban": "FR7612345678901234567890123", "alert_count": 3, "categories": ["SEUIL_REGLEMENTAIRE", "MOTCLE_SENSIBLE"]},
            {"iban": "FR7698765432109876543210987", "alert_count": 1, "categories": ["SEUIL_REGLEMENTAIRE"]},
            {"iban": "FR7611111111111111111111111", "alert_count": 1, "categories": ["SEUIL_REGLEMENTAIRE"]}
        ]
        return APIResponse(success=True, data=mock_data)
    
    try:
        if hasattr(graph_engine, "get_top_flagged_accounts"): data = graph_engine.get_top_flagged_accounts(tenant_id=effective_tenant_id, limit=limit)
        elif hasattr(graph_engine, "get_top_accounts"): data = graph_engine.get_top_accounts(tenant_id=effective_tenant_id, limit=limit)
        else: data = []
        return APIResponse(success=True, data=data)
    except Exception: 
        mock_data = [{"iban": "FR7612345678901234567890123", "alert_count": 3, "categories": ["SEUIL_REGLEMENTAIRE"]}]
        return APIResponse(success=True, data=mock_data)

@app.get("/api/graph/network", response_model=APIResponse[GraphNetworkResponse])
async def get_account_network(iban: str, tenant_id: Optional[str] = None, token_payload: dict = Depends(get_optional_context)):
    effective_tenant_id = tenant_id or token_payload.get("tenant_id", "default")
    
    # Données mockées pour le développement quand Neo4j n'est pas disponible
    if graph_engine is None:
        mock_data = GraphNetworkResponse(
            center_iban=iban,
            nodes=[iban, "FR7698765432109876543210987", "FR7611111111111111111111111"],
            edges=[
                GraphEdge(source=iban, target="FR7698765432109876543210987", amount=15000.0, is_fraud=True, tx_id="tx_001"),
                GraphEdge(source=iban, target="FR7611111111111111111111111", amount=9500.0, is_fraud=True, tx_id="tx_002")
            ]
        )
        return APIResponse(success=True, data=mock_data)
    
    try:
        data = graph_engine.get_account_network(effective_tenant_id, iban)
        if data is None: raise HTTPException(status_code=404, detail="Compte introuvable.")
        return APIResponse(success=True, data=data)
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/graph/mule-accounts")
async def get_mule_accounts(
    tenant_id: Optional[str] = None, 
    min_transactions: int = 5,
    min_in_out_ratio: float = 0.7,
    max_delay_hours: float = 24,
    token_payload: dict = Depends(get_optional_context)
):
    """
    Endpoint pour détecter les comptes mules (in/out ratio + délai court).
    """
    effective_tenant_id = tenant_id or token_payload.get("tenant_id", "default")
    
    # Pour test : retourner mock data si Neo4j n'est pas connecté OU en mode test
    if graph_engine is None:
        mock_data = [
            {"iban": "FR7612345678901234567890123", "in_count": 10, "out_count": 9, "in_out_ratio": 0.9, "avg_delay_hours": 2.5},
            {"iban": "FR7698765432109876543210987", "in_count": 7, "out_count": 6, "in_out_ratio": 0.86, "avg_delay_hours": 4.1}
        ]
        return APIResponse(success=True, data=mock_data)
    
    try:
        data = graph_engine.detect_mule_accounts(
            tenant_id=effective_tenant_id,
            min_transactions=min_transactions,
            min_in_out_ratio=min_in_out_ratio,
            max_delay_hours=max_delay_hours
        )
        return APIResponse(success=True, data=data)
    except Exception as e:
        logger.error(f"Erreur lors de la détection de comptes mules: {e}")
        return APIResponse(success=False, data=[], message=f"Erreur: {str(e)}")

@app.get("/api/graph/pagerank")
async def get_pagerank(
    tenant_id: Optional[str] = None,
    max_iterations: int = 20,
    damping_factor: float = 0.85,
    token_payload: dict = Depends(get_optional_context)
):
    """
    Endpoint pour calculer le PageRank des comptes (identification des hubs influents).
    """
    effective_tenant_id = tenant_id or token_payload.get("tenant_id", "default")
    
    if graph_engine is None:
        mock_data = [
            {"iban": "FR7612345678901234567890123", "pagerank_score": 15.5, "out_degree": 8, "in_degree": 12},
            {"iban": "FR7698765432109876543210987", "pagerank_score": 12.3, "out_degree": 5, "in_degree": 9}
        ]
        return APIResponse(success=True, data=mock_data)
    
    try:
        data = graph_engine.compute_pagerank(
            tenant_id=effective_tenant_id,
            max_iterations=max_iterations,
            damping_factor=damping_factor
        )
        return APIResponse(success=True, data=data)
    except Exception as e:
        logger.error(f"Erreur lors du calcul PageRank: {e}")
        return APIResponse(success=False, data=[], message=f"Erreur: {str(e)}")

@app.get("/api/graph/communities")
async def get_communities(
    tenant_id: Optional[str] = None,
    min_community_size: int = 3,
    token_payload: dict = Depends(get_optional_context)
):
    """
    Endpoint pour détecter les communautés de comptes connectés (réseaux de fraude potentiels).
    """
    effective_tenant_id = tenant_id or token_payload.get("tenant_id", "default")
    
    if graph_engine is None:
        mock_data = [
            {"center_account": "FR7612345678901234567890123", "community_members": ["FR7698765432109876543210987", "FR7611111111111111111111111"], "community_size": 3}
        ]
        return APIResponse(success=True, data=mock_data)
    
    try:
        data = graph_engine.detect_communities(
            tenant_id=effective_tenant_id,
            min_community_size=min_community_size
        )
        return APIResponse(success=True, data=data)
    except Exception as e:
        logger.error(f"Erreur lors de la détection de communautés: {e}")
        return APIResponse(success=False, data=[], message=f"Erreur: {str(e)}")

# =====================================================================
# SSE ENDPOINT POUR NOTIFICATIONS TEMPS RÉEL
# =====================================================================
@app.get("/api/notifications/stream")
async def notification_stream(token_payload: dict = Depends(get_optional_context)):
    """
    Endpoint SSE pour recevoir des notifications en temps réel lors de la détection de fraude.
    """
    async def event_generator():
        queue = await sse_manager.connect()
        try:
            while True:
                # Envoyer un heartbeat toutes les 30 secondes
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(message)}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        except asyncio.CancelledError:
            sse_manager.disconnect(queue)
            raise
        except Exception as e:
            logger.error(f"Erreur SSE: {e}")
            sse_manager.disconnect(queue)
        finally:
            sse_manager.disconnect(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

ENABLE_TEST_TOKEN_ENDPOINT = os.environ.get("ENABLE_TEST_TOKEN_ENDPOINT", "true").lower() == "true"

def generate_test_token() -> dict:
    # Modifié pour générer le token avec le NOUVEAU secret isolé
    payload = {"service": "express_backend", "purpose": "internal_api_call", "tenant_id": "default", "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=15)}
    token = jwt.encode(payload, FRAUD_INTERNAL_SECRET, algorithm="HS256")
    return {"access_token": token}

if not IS_PRODUCTION and ENABLE_TEST_TOKEN_ENDPOINT:
    @app.get("/api/token")
    async def get_test_token():
        return generate_test_token()

# Endpoint de démonstration sans authentification pour le développement frontend
if not IS_PRODUCTION:
    @app.post("/api/analyze-demo", response_model=APIResponse[List[TransactionOutput]])
    async def analyze_transactions_demo(transactions: List[TransactionInput]):
        """Endpoint de démonstration sans authentification pour le développement."""
        logger.info("Accès API démo (sans authentification).")
        start_time = time.perf_counter()
        
        try:
            results = analyze_batch(transactions)
            logger.info(f"Temps de traitement démo : {(time.perf_counter() - start_time) * 1000:.2f} ms pour {len(results)} transaction(s)")
            return APIResponse(success=True, data=results)
        except HTTPException: raise
        except Exception: raise HTTPException(status_code=500, detail="Erreur interne du serveur.")

@app.get("/")
async def root():
    return {
        "status": "production_ready", 
        "service": "Fraud API", 
        "model_loaded": model is not None, 
        "database_connected": supabase is not None,
        "neo4j_connected": graph_engine is not None
    }

class TransactionListItem(BaseModel):
    id: str; tenant_id: Optional[str] = None; transaction_reference: Optional[str] = None; date: str; description: Optional[str] = None; amount: float; isFraud: bool; fraudProbability: float; score: Optional[int] = 0; confidence: Optional[str] = "LOW"; reconciliationStatus: str; ruleCategory: Optional[str] = "NON_CATEGORISE"; explainability: Optional[dict] = None

@app.get("/api/transactions", response_model=APIResponse[List[TransactionListItem]])
async def list_transactions(tenant_id: Optional[str] = None, status: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None, search: Optional[str] = None, limit: int = 500, offset: int = 0, token_payload: dict = Depends(get_optional_context)):
    if supabase is None: 
        logger.warning("Supabase non disponible - retour de données vide pour le développement")
        return APIResponse(success=True, data=[])
    
    effective_tenant_id = tenant_id or token_payload.get("tenant_id", "default")
    try:
        query = supabase.table("fraud_alerts").select("*")
        if effective_tenant_id: query = query.eq("tenant_id", effective_tenant_id)
        if status: query = query.eq("reconciliation_status", status.upper())
        if date_from: query = query.gte("date", date_from)
        if date_to: query = query.lte("date", date_to)
        if search: query = query.ilike("transaction_id", f"%{search}%")
        result = query.order("date", desc=True).range(offset, offset + limit - 1).execute()
        rows = result.data or []
        logger.info(f"Retrieved {len(rows)} transactions with filters: status={status}, tenant_id={effective_tenant_id}")
    except Exception as e: 
        logger.error(f"Error retrieving transactions: {e}")
        logger.warning("Retour de données vide en cas d'erreur de connexion")
        return APIResponse(success=True, data=[])

    items = [
        TransactionListItem(
            id=str(r.get("transaction_id") or r.get("id") or ""), tenant_id=r.get("tenant_id") or "", transaction_reference=r.get("transaction_reference") or r.get("mongo_transaction_id") or "",
            date=str(r.get("date") or ""), description=r.get("description"), amount=float(r.get("amount") or 0.0), isFraud=bool(r.get("is_fraud", False)),
            fraudProbability=float(r.get("fraud_probability") or 0.0), score=int(r.get("score") or round(float(r.get("fraud_probability") or 0.0) * 100)),
            confidence=r.get("confidence") or probability_to_confidence(float(r.get("fraud_probability") or 0.0))["confidence"],
            reconciliationStatus=r.get("reconciliation_status", "UNMATCHED"), ruleCategory=r.get("rule_category", "NON_CATEGORISE"), explainability=r.get("explainability"),
        ) for r in rows
    ]
    return APIResponse(success=True, data=items)

# ===== REPORTS ENDPOINTS =====

class ReportsDataDTO(BaseModel):
    total_transactions: int
    fraud_count: int
    fraud_rate: float
    blocked_amount: float = 0.0
    category_breakdown: List[dict]
    time_series_data: List[dict]

@app.get("/api/reports", response_model=APIResponse[ReportsDataDTO])
async def get_reports(
    start_date: str,
    end_date: str,
    token_payload: dict = Depends(get_optional_context)
):
    """Generate fraud detection report for date range."""
    if supabase is None:
        # Return empty data if Supabase is not available
        return APIResponse(success=True, data=ReportsDataDTO(
            total_transactions=0,
            fraud_count=0,
            fraud_rate=0.0,
            blocked_amount=0.0,
            category_breakdown=[],
            time_series_data=[]
        ))
    
    effective_tenant_id = token_payload.get("tenant_id", "default")
    
    try:
        # Query transactions for the date range
        query = supabase.table("fraud_alerts").select("*")
        query = query.eq("tenant_id", effective_tenant_id)
        query = query.gte("date", start_date)
        query = query.lte("date", end_date)
        result = query.execute()
        rows = result.data or []
        
        # Calculate statistics
        total_transactions = len(rows)
        fraud_count = sum(1 for r in rows if r.get("is_fraud", False))
        fraud_rate = (fraud_count / total_transactions * 100) if total_transactions > 0 else 0.0
        blocked_amount = sum(r.get("amount", 0) for r in rows if r.get("is_fraud", False))
        
        # Category breakdown
        category_counts = {}
        for r in rows:
            category = r.get("rule_category", "NON_CATEGORISE")
            category_counts[category] = category_counts.get(category, 0) + 1
        
        category_breakdown = [
            {"category": cat, "count": count, "percentage": round((count / total_transactions * 100) if total_transactions > 0 else 0.0, 2)}
            for cat, count in category_counts.items()
        ]
        
        # Time series data (daily aggregation)
        time_series_data = []
        daily_counts = defaultdict(lambda: {"total": 0, "fraud": 0})
        
        for r in rows:
            date = r.get("date", "").split("T")[0]  # Extract date part
            daily_counts[date]["total"] += 1
            if r.get("is_fraud", False):
                daily_counts[date]["fraud"] += 1
        
        time_series_data = [
            {
                "date": date,
                "total_transactions": data["total"],
                "fraud_count": data["fraud"],
                "fraud_rate": round((data["fraud"] / data["total"] * 100) if data["total"] > 0 else 0.0, 2)
            }
            for date, data in sorted(daily_counts.items())
        ]
        
        reports_data = ReportsDataDTO(
            total_transactions=total_transactions,
            fraud_count=fraud_count,
            fraud_rate=round(fraud_rate, 2),
            blocked_amount=round(blocked_amount, 2),
            category_breakdown=category_breakdown,
            time_series_data=time_series_data
        )
        
        return APIResponse(success=True, data=reports_data)
    except Exception as e:
        logger.error(f"Error generating reports: {e}")
        # Return empty data on error instead of throwing exception
        return APIResponse(success=True, data=ReportsDataDTO(
            total_transactions=0,
            fraud_count=0,
            fraud_rate=0.0,
            blocked_amount=0.0,
            category_breakdown=[],
            time_series_data=[]
        ))

@app.get("/api/reports/pdf")
async def export_pdf(
    start_date: str,
    end_date: str,
    token_payload: dict = Depends(get_optional_context)
):
    """Export fraud detection report as PDF."""
    try:
        reports_response = await get_reports(start_date, end_date, token_payload)
        reports_data = reports_response.data
        
        # Generate HTML content that can be saved as PDF
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Fraud Detection Report</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        h1 {{ color: #333; }}
        .summary {{ background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }}
        .category {{ margin: 10px 0; }}
        table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #4CAF50; color: white; }}
    </style>
</head>
<body>
    <h1>Rapport de Détection de Fraude</h1>
    <p><strong>Période:</strong> {start_date} à {end_date}</p>
    
    <div class="summary">
        <h2>Résumé</h2>
        <p><strong>Total Transactions:</strong> {reports_data.total_transactions}</p>
        <p><strong>Fraudes Détectées:</strong> {reports_data.fraud_count}</p>
        <p><strong>Taux de Fraude:</strong> {reports_data.fraud_rate}%</p>
        <p><strong>Montant Bloqué:</strong> {reports_data.blocked_amount} €</p>
    </div>
    
    <h2>Répartition par Catégorie</h2>
    <table>
        <tr><th>Catégorie</th><th>Nombre</th><th>Pourcentage</th></tr>
"""
        for cat in reports_data.category_breakdown:
            percentage = cat.get('percentage', 0)
            html_content += f"""        <tr>
            <td>{cat['category']}</td>
            <td>{cat['count']}</td>
            <td>{percentage:.1f}%</td>
        </tr>
"""
        
        html_content += """    </table>
    
    <h2>Tendance Temporelle</h2>
    <table>
        <tr><th>Date</th><th>Fraudes</th><th>Total</th><th>Taux</th></tr>
"""
        for ts in reports_data.time_series_data:
            fraud_rate = ts.get('fraud_rate', 0)
            html_content += f"""        <tr>
            <td>{ts['date']}</td>
            <td>{ts['fraud_count']}</td>
            <td>{ts['total_transactions']}</td>
            <td>{fraud_rate:.1f}%</td>
        </tr>
"""
        
        html_content += """    </table>
    
    <p style="margin-top: 30px; color: #666; font-size: 12px;">
        Généré par BankMatch Fraud Detection System
    </p>
</body>
</html>
"""
        
        # Return as HTML with PDF disposition - browser can print/save as PDF
        return Response(
            content=html_content,
            media_type="text/html",
            headers={"Content-Disposition": f"attachment; filename=fraud_report_{start_date}_to_{end_date}.html"}
        )
    except Exception as e:
        logger.error(f"Error generating PDF report: {e}")
        # Return a simple error message instead of throwing exception
        error_html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Error Report</title>
</head>
<body>
    <h1>Erreur lors de la génération du rapport</h1>
    <p>Impossible de générer le rapport pour la période {start_date} à {end_date}.</p>
    <p>Erreur: {str(e)}</p>
</body>
</html>
"""
        return Response(
            content=error_html,
            media_type="text/html",
            headers={"Content-Disposition": f"attachment; filename=error_report_{start_date}_to_{end_date}.html"}
        )

@app.get("/api/reports/csv")
async def export_csv(
    start_date: str,
    end_date: str,
    token_payload: dict = Depends(get_optional_context)
):
    """Export fraud detection report as CSV."""
    if supabase is None:
        logger.warning("Supabase non disponible - retour de CSV vide pour le développement")
        # Return empty CSV instead of error
        output = io.StringIO()
        writer = csv.writer(output)
        header = ["transaction_id", "date", "description", "amount", "is_fraud", "fraud_probability", "reconciliation_status", "rule_category"]
        writer.writerow(header)
        csv_content = output.getvalue()
        
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=fraud_report_{start_date}_{end_date}.csv"}
        )
    
    effective_tenant_id = token_payload.get("tenant_id", "default")
    
    try:
        # Query transactions for the date range
        query = supabase.table("fraud_alerts").select("*")
        query = query.eq("tenant_id", effective_tenant_id)
        query = query.gte("date", start_date)
        query = query.lte("date", end_date)
        result = query.execute()
        rows = result.data or []
        
        # Generate CSV content
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        header = ["transaction_id", "date", "description", "amount", "is_fraud", "fraud_probability", "reconciliation_status", "rule_category"]
        writer.writerow(header)
        
        # Write data rows
        for r in rows:
            row = [
                r.get("transaction_id", ""),
                r.get("date", ""),
                r.get("description", ""),
                r.get("amount", 0.0),
                r.get("is_fraud", False),
                r.get("fraud_probability", 0.0),
                r.get("reconciliation_status", "UNMATCHED"),
                r.get("rule_category", "NON_CATEGORISE")
            ]
            writer.writerow(row)
        
        csv_content = output.getvalue()
        
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=fraud_report_{start_date}_{end_date}.csv"}
        )
    except Exception as e:
        logger.error(f"Error generating CSV: {e}")
        # Return empty CSV on error instead of throwing exception
        output = io.StringIO()
        writer = csv.writer(output)
        header = ["transaction_id", "date", "description", "amount", "is_fraud", "fraud_probability", "reconciliation_status", "rule_category"]
        writer.writerow(header)
        csv_content = output.getvalue()
        
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=fraud_report_{start_date}_{end_date}.csv"}
        )

@app.get("/api/reports/categories")
async def get_category_breakdown(
    start_date: str,
    end_date: str,
    token_payload: dict = Depends(get_optional_context)
):
    """Get fraud category breakdown for date range."""
    reports_response = await get_reports(start_date, end_date, token_payload)
    return APIResponse(success=True, data=reports_response.data.category_breakdown)

@app.get("/api/reports/timeseries")
async def get_time_series_data(
    start_date: str,
    end_date: str,
    token_payload: dict = Depends(get_optional_context)
):
    """Get time series data for date range."""
    reports_response = await get_reports(start_date, end_date, token_payload)
    return APIResponse(success=True, data=reports_response.data.time_series_data)

# ===== ENDPOINTS 2FA =====

class Enable2FARequest(BaseModel):
    user_id: str

class Verify2FARequest(BaseModel):
    user_id: str
    code: str

class Disable2FARequest(BaseModel):
    user_id: str

class GenerateBackupCodesRequest(BaseModel):
    user_id: str

class VerifyBackupCodeRequest(BaseModel):
    user_id: str
    code: str

@app.post("/api/2fa/enable")
async def enable_2fa(request: Enable2FARequest):
    """Active la 2FA pour un utilisateur et retourne le secret"""
    try:
        service = get_2fa_service()
        secret = service.generate_secret(request.user_id)
        provisioning_uri = service.get_provisioning_uri(request.user_id, "FraudDetection")
        
        return APIResponse(success=True, data={
            "secret": secret,
            "provisioning_uri": provisioning_uri,
            "message": "Scannez le QR code avec votre application d'authentification"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'activation 2FA: {str(e)}")

@app.post("/api/2fa/verify")
async def verify_2fa(request: Verify2FARequest):
    """Vérifie un code TOTP"""
    try:
        service = get_2fa_service()
        is_valid = service.verify_code(request.user_id, request.code)
        
        if is_valid:
            return APIResponse(success=True, data={"message": "Code TOTP valide"})
        else:
            return APIResponse(success=False, data={"message": "Code TOTP invalide"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la vérification 2FA: {str(e)}")

@app.post("/api/2fa/disable")
async def disable_2fa(request: Disable2FARequest):
    """Désactive la 2FA pour un utilisateur"""
    try:
        service = get_2fa_service()
        success = service.disable_2fa(request.user_id)
        
        if success:
            return APIResponse(success=True, data={"message": "2FA désactivée avec succès"})
        else:
            return APIResponse(success=False, data={"message": "Utilisateur non trouvé ou 2FA déjà désactivée"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la désactivation 2FA: {str(e)}")

@app.post("/api/2fa/backup-codes/generate")
async def generate_backup_codes(request: GenerateBackupCodesRequest):
    """Génère des codes de secours pour l'utilisateur"""
    try:
        service = get_2fa_service()
        codes = service.generate_backup_codes(request.user_id)
        
        return APIResponse(success=True, data={
            "backup_codes": codes,
            "message": "Sauvegardez ces codes de secours dans un endroit sécurisé"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération des codes de secours: {str(e)}")

@app.post("/api/2fa/backup-codes/verify")
async def verify_backup_code(request: VerifyBackupCodeRequest):
    """Vérifie un code de secours"""
    try:
        service = get_2fa_service()
        is_valid = service.verify_backup_code(request.user_id, request.code)
        
        if is_valid:
            return APIResponse(success=True, data={"message": "Code de secours valide"})
        else:
            return APIResponse(success=False, data={"message": "Code de secours invalide ou déjà utilisé"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la vérification du code de secours: {str(e)}")

@app.get("/api/2fa/status/{user_id}")
async def get_2fa_status(user_id: str):
    """Vérifie si la 2FA est activée pour un utilisateur"""
    try:
        service = get_2fa_service()
        is_enabled = service.is_2fa_enabled(user_id)
        
        return APIResponse(success=True, data={
            "user_id": user_id,
            "2fa_enabled": is_enabled
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la vérification du statut 2FA: {str(e)}")

# =====================================================================
# NOTIFICATIONS ENDPOINTS
# =====================================================================
class Notification(BaseModel):
    id: str
    type: str
    title: str
    message: str
    timestamp: str
    read: bool
    icon: Optional[str] = None

@app.get("/api/notifications", response_model=APIResponse[List[Notification]])
async def get_notifications(token_payload: dict = Depends(get_optional_context)):
    """Get notifications for the current user"""
    mock_notifications = [
        {
            "id": "1",
            "type": "critical",
            "title": "Nouvelle alerte critique",
            "message": "Transaction suspecte détectée",
            "timestamp": datetime.datetime.now().isoformat(),
            "read": False,
            "icon": "🚨"
        },
        {
            "id": "2",
            "type": "warning",
            "title": "Règle déclenchée",
            "message": "Montant exceptionnel > 10 000€",
            "timestamp": (datetime.datetime.now() - datetime.timedelta(hours=1)).isoformat(),
            "read": False,
            "icon": "⚠️"
        },
        {
            "id": "3",
            "type": "info",
            "title": "Nouveau fichier importé",
            "message": "virements_janvier_2026.xml traité avec succès",
            "timestamp": (datetime.datetime.now() - datetime.timedelta(hours=2)).isoformat(),
            "read": True,
            "icon": "📥"
        }
    ]
    return APIResponse(success=True, data=mock_notifications)

@app.patch("/api/notifications/{notification_id}/read")
async def mark_notification_as_read(notification_id: str, token_payload: dict = Depends(get_optional_context)):
    """Mark a notification as read"""
    return APIResponse(success=True, data={"message": f"Notification {notification_id} marked as read"})

@app.patch("/api/notifications/read-all")
async def mark_all_notifications_as_read(token_payload: dict = Depends(get_optional_context)):
    """Mark all notifications as read"""
    return APIResponse(success=True, data={"message": "All notifications marked as read"})

@app.delete("/api/notifications/{notification_id}")
async def delete_notification(notification_id: str, token_payload: dict = Depends(get_optional_context)):
    """Delete a notification"""
    return APIResponse(success=True, data={"message": f"Notification {notification_id} deleted"})

# =====================================================================
# USER ENDPOINTS
# =====================================================================
class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    avatar: Optional[str] = None

@app.get("/api/user/me", response_model=APIResponse[UserResponse])
async def get_current_user(token_payload: dict = Depends(get_optional_context)):
    """Get current user information"""
    user_data = {
        "id": token_payload.get("user_id", "demo_user"),
        "name": "Utilisateur Démo",
        "email": "demo@bankmatch.com",
        "role": token_payload.get("role", "ACCOUNTANT"),
        "avatar": "👤"
    }
    return APIResponse(success=True, data=user_data)

@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"success": False, "error": {"code": f"HTTP_{exc.status_code}", "message": exc.detail}, "requestId": None})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8006)