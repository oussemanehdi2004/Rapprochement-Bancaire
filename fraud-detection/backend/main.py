import datetime
import json
import logging
import os
import time
import uuid
from typing import Any, Generic, List, Optional, TypeVar, Union

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import httpx
import joblib
import jwt
import numpy as np
from pydantic import BaseModel
import shap
from supabase import create_client

from auth import create_internal_token, get_jwt_secret
# IMPORT MODIFIE: on importe les nouvelles variables de configuration
from config_store import get_thresholds, update_thresholds, DISABLE_INTERNAL_AUTH, FRAUD_INTERNAL_SECRET
from features import FEATURE_NAMES, receiver_balance_error, sender_balance_error

# Retrait de l'import obsolète (internal_auth.py ne sera plus nécessaire pour les routes S2S principales)
# from internal_auth import verify_internal_token

from rules_engine import (
    TransactionInput,
    apply_batch_rules,
    apply_business_rules,
)
from prometheus_fastapi_instrumentator import Instrumentator
load_dotenv()

NODE_BACKEND_URL = os.environ.get("NODE_BACKEND_URL", "http://localhost:3000")

try:
    from graph_engine import create_graph_engine
    graph_engine = create_graph_engine()
except Exception as e:
    logger.warning(f"Impossible de connecter Neo4j: {e}")
    graph_engine = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("fraud_api")

ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT in ("production", "prod")

app = FastAPI(
    title="API de Rapprochement Bancaire, Fraude Hybride et Persistance",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
    root_path="/fraud",
)
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
model = None
explainer = None
feature_names = FEATURE_NAMES

if os.path.exists(MODEL_PATH):
    try:
        model = joblib.load(MODEL_PATH)
        tree_model = model
        if hasattr(model, "calibrated_classifiers_") and model.calibrated_classifiers_:
            first_cal = model.calibrated_classifiers_[0]
            tree_model = getattr(first_cal, "estimator", getattr(first_cal, "base_estimator", model))
        explainer = shap.TreeExplainer(tree_model)
    except Exception:
        model = None
        explainer = None

RULE_SEVERITY_WEIGHTS = {
    "SEUIL_REGLEMENTAIRE": 0.95, "MOTCLE_SENSIBLE": 0.90, "FRACTIONNEMENT_SUSPECT": 0.85,
    "RETRAIT_CASH_IMPORTANT": 0.80, "MONTANT_EXCEPTIONNEL": 0.75, "PAIEMENT_DUPLIQUE": 0.60,
    "NOUVEL_IBAN": 0.55, "COMPTE_RAREMENT_UTILISE": 0.50, "SEUIL_APPROCHE": 0.45,
}

def fuse_scores(ml_probability: float, rule_category: Optional[str], is_blocked: bool) -> float:
    if not is_blocked or not rule_category:
        return ml_probability
    rule_score = RULE_SEVERITY_WEIGHTS.get(rule_category, 0.70)
    return round(1.0 - ((1.0 - ml_probability) * (1.0 - rule_score)), 4)

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

def preprocess_transaction(tx: TransactionInput) -> list:
    tx_type = tx.transaction_type.upper()
    is_transfer = 1 if tx_type == "TRANSFER" else 0
    is_cash_out = 1 if tx_type == "CASH_OUT" else 0

    # --- Features V2 (Granularité accrue) ---
    # Extraction de l'heure depuis la date ISO (ex: "2026-08-14T14:30:00Z")
    try:
        hour_of_day = int(tx.date[11:13]) if tx.date and "T" in tx.date else 12
    except (ValueError, IndexError):
        hour_of_day = 12

    # Valeurs par défaut pour les autres métriques (pourront être connectées à Supabase plus tard)
    amount_to_avg_ratio = 1.0
    days_since_last_tx = 5.0
    beneficiary_tx_count = 0

    return [
        tx.amount, 
        tx.sender_balance_before, 
        tx.sender_balance_after,
        tx.receiver_balance_before, 
        tx.receiver_balance_after,
        sender_balance_error(tx.amount, tx.sender_balance_before, tx.sender_balance_after),
        receiver_balance_error(tx.amount, tx.receiver_balance_before, tx.receiver_balance_after),
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

    if model is not None and explainer is not None:
        features_vector = preprocess_transaction(tx)
        probabilities = model.predict_proba([features_vector])[0]
        raw_ml_probability = float(probabilities[1])
        model_flag = raw_ml_probability >= 0.4758

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

    is_fraud = model_flag or rule_flag
    final_fraud_probability = fuse_scores(raw_ml_probability, rule_category, rule_flag)

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
async def health_check():
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
    return results

# =====================================================================
# ENDPOINT D'ANALYSE HYBRIDE (Nettoyé des doubles auth)
# =====================================================================
@app.post("/api/analyze", response_model=APIResponse[List[TransactionOutput]])
async def analyze_transactions_secure(
    transactions: List[TransactionInput],
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

ENABLE_TEST_TOKEN_ENDPOINT = os.environ.get("ENABLE_TEST_TOKEN_ENDPOINT", "false").lower() == "true"

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
    return {"status": "production_ready", "service": "Fraud API", "model_loaded": model is not None, "database_connected": supabase is not None}

class TransactionListItem(BaseModel):
    id: str; tenant_id: Optional[str] = None; transaction_reference: Optional[str] = None; date: str; description: Optional[str] = None; amount: float; isFraud: bool; fraudProbability: float; score: Optional[int] = 0; confidence: Optional[str] = "LOW"; reconciliationStatus: str; ruleCategory: Optional[str] = "NON_CATEGORISE"; explainability: Optional[dict] = None

@app.get("/api/transactions", response_model=APIResponse[List[TransactionListItem]])
async def list_transactions(tenant_id: Optional[str] = None, status: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None, search: Optional[str] = None, limit: int = 100, offset: int = 0, token_payload: dict = Depends(get_optional_context)):
    if supabase is None: raise HTTPException(status_code=503, detail="Supabase non disponible.")
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
    except Exception: raise HTTPException(status_code=502, detail="Impossible de récupérer les transactions.")

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

@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"success": False, "error": {"code": f"HTTP_{exc.status_code}", "message": exc.detail}, "requestId": None})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)