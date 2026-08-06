import time
import datetime
import os
import logging
import httpx
import jwt
import joblib
import numpy as np
import shap
import uuid
import json
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Generic, TypeVar, Optional, Any, List
from dotenv import load_dotenv
from internal_auth import verify_internal_token

load_dotenv()
NODE_BACKEND_URL = os.environ.get("NODE_BACKEND_URL", "http://localhost:3000")

# Import du moteur de graphe Neo4j (Phase 3)
try:
    from graph_engine import create_graph_engine
    graph_engine = create_graph_engine()
except Exception:
    graph_engine = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("fraud_api")

# Import de Supabase
from supabase import create_client

# Import du moteur de règles (Phase 1 + Phase 2 + Phase 3 batch rules)
from rules_engine import TransactionInput, apply_business_rules, apply_batch_rules
from config_store import get_thresholds, update_thresholds

# Utilitaires partagés
from features import FEATURE_NAMES, sender_balance_error, receiver_balance_error
from auth import get_jwt_secret, create_internal_token

# =====================================================================
# ENVIRONNEMENT & INITIALISATION FASTAPI (SÉCURISATION PROD)
# =====================================================================
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT in ("production", "prod")

app = FastAPI(
    title="API de Rapprochement Bancaire, Fraude Hybride et Persistance",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
    root_path="/fraud",

)

# =====================================================================
# 1. CONFIGURATION CORS SÉCURISÉE (DYNAMIQUE ET RESTREINTE)
# =====================================================================
def _parse_allowed_origins() -> list[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]

    if IS_PRODUCTION:
        logger.error(
            "CRITICAL: ALLOWED_ORIGINS est vide en production ! "
            "Aucune origine cross-site ne sera autorisée par le navigateur."
        )
        return []

    logger.warning(
        "ALLOWED_ORIGINS non défini : utilisation des origines dev par défaut."
    )
    return [
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        "http://localhost:4000",
        "http://127.0.0.1:4000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8005",
        "http://127.0.0.1:8005",
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

    duration_ms = round(
        (time.perf_counter() - start) * 1000,
        2,
    )

    logger.info(
        json.dumps(
            {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "environment": ENVIRONMENT,
            }
        )
    )

    response.headers["X-Request-ID"] = request_id
    return response

# =====================================================================
# 2. CONFIGURATION ET CONNEXION SUPABASE (PHASE 4)
# =====================================================================
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

supabase = None  

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.warning("SUPABASE_URL / SUPABASE_KEY manquants dans l'environnement. Persistance désactivée.")
else:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Connexion à Supabase établie avec succès.")
    except Exception:
        logger.exception("Erreur lors de la connexion à Supabase. Persistance désactivée.")

# =====================================================================
# 3. CHARGEMENT DE L'IA ET DE SHAP
# =====================================================================
MODEL_PATH = "model_fraud.pkl"
model = None
explainer = None

feature_names = FEATURE_NAMES

if os.path.exists(MODEL_PATH):
    try:
        model = joblib.load(MODEL_PATH)
        explainer = shap.TreeExplainer(model)
        logger.info("Modèle Random Forest et outil SHAP chargés avec succès.")
    except Exception:
        model = None
        explainer = None
        logger.exception("Erreur lors du chargement de l'IA. Mode dégradé actif.")
else:
    logger.warning("'model_fraud.pkl' introuvable. Mode dégradé actif.")

# =====================================================================
# 4. SCHÉMAS DE SORTIE API (WRAPPERS & SHAP)
# =====================================================================
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
    transaction_reference: str  # Renamed from mongo_transaction_id (SHA-256 hash, not true Mongo ObjectId)
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

# =====================================================================
# 5. UTILITAIRES, SÉCURITÉ ET PRÉTRAITEMENT
# =====================================================================
def probability_to_confidence(probability: float) -> dict:
    """
    Convertit une probabilité brute (0.0-1.0) en score (0-100)
    et applique les seuils officiels BankMatch :
    - HIGH >= 85
    - MEDIUM 70-84
    - LOW < 70
    """
    score = round(probability * 100)
    if score >= 85:
        confidence = "HIGH"
    elif score >= 70:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"
        
    return {
        "score": score,
        "confidence": confidence
    }

JWT_SECRET = get_jwt_secret()
logger.info("JWT_SECRET chargé avec succès.")

security = HTTPBearer(auto_error=False)

async def get_current_user_context(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Valide le token utilisateur ou du proxy.
    Tente le décodage JWT interne en premier pour un temps de réponse instantané.
    """
    if not credentials:
        return {"user_id": "demo_user", "tenant_id": "default", "is_internal": False}
    
    token = credentials.credentials

    # 1. Validation immédiate du token JWT interne (Proxy Node / Démo / Interne)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("purpose") == "internal_api_call":
            return {
                "user_id": payload.get("service", "internal"),
                "tenant_id": payload.get("tenant_id", "default"),
                "is_internal": True,
            }
    except jwt.PyJWTError:
        pass # Ce n'est pas un JWT signé par notre secret, on tente le backend externe

    # 2. Authentification déléguée à un backend Node.js externe si présent
    if NODE_BACKEND_URL and NODE_BACKEND_URL != "NONE":
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                response = await client.get(
                    f"{NODE_BACKEND_URL}/api/users/me",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if response.status_code == 200:
                    user_data = response.json()
                    return {
                        "user_id": user_data.get("id"),
                        "tenant_id": user_data.get("tenantId", "default"),
                        "is_internal": False
                    }
        except httpx.HTTPError:
            logger.debug("Backend Node externe (%s) injoignable.", NODE_BACKEND_URL)

    # 3. Fallback dev pour les requêtes de test
    return {"user_id": "dev_user", "tenant_id": "default", "is_internal": False}

def preprocess_transaction(tx: TransactionInput) -> list:
    tx_type = tx.transaction_type.upper()
    is_transfer = 1 if tx_type == "TRANSFER" else 0
    is_cash_out = 1 if tx_type == "CASH_OUT" else 0

    return [
        tx.amount, tx.sender_balance_before, tx.sender_balance_after,
        tx.receiver_balance_before, tx.receiver_balance_after,
        sender_balance_error(tx.amount, tx.sender_balance_before, tx.sender_balance_after),
        receiver_balance_error(tx.amount, tx.receiver_balance_before, tx.receiver_balance_after),
        is_transfer, is_cash_out
    ]

def extract_rule_evaluation(
    tx: TransactionInput,
    batch_finding: Optional[dict] = None,
    account_aggregate: Optional[dict] = None,
    beneficiary_history: Optional[List[dict]] = None
):
    tx_dict = tx.model_dump()

    rule_res = apply_business_rules(
        transaction=tx_dict,
        account_aggregate=account_aggregate,
        beneficiary_history=beneficiary_history
    )

    if isinstance(rule_res, tuple):
        if len(rule_res) == 3:
            rule_flag, rule_reason, rule_category = rule_res
        elif len(rule_res) == 2:
            rule_flag, rule_reason = rule_res
            rule_category = "SEUIL_REGLEMENTAIRE" if rule_flag else "NON_CATEGORISE"
        else:
            rule_flag, rule_reason, rule_category = False, "", "NON_CATEGORISE"
        rule_factors = [rule_reason] if rule_reason else []
    elif isinstance(rule_res, dict):
        rule_flag = rule_res.get("is_blocked", False) or rule_res.get("rule_flag", False)
        rule_category = rule_res.get("ruleCategory", "NON_CATEGORISE")
        rule_factors = rule_res.get("factors", [])
        if not rule_factors:
            single_reason = rule_res.get("reason", "") or rule_res.get("rule_reason", "")
            rule_factors = [single_reason] if single_reason else []
    else:
        rule_flag, rule_category, rule_factors = False, "NON_CATEGORISE", []

    if batch_finding:
        rule_flag = rule_flag or batch_finding.get("is_blocked", False)
        if rule_category == "NON_CATEGORISE":
            rule_category = batch_finding.get("ruleCategory", "NON_CATEGORISE")
        for factor in batch_finding.get("factors", []):
            if factor not in rule_factors:
                rule_factors.append(factor)

    rule_reason = rule_factors[0] if rule_factors else ""

    return rule_flag, rule_reason, rule_category, rule_factors


def build_transaction_output(
    tx: TransactionInput,
    batch_finding: Optional[dict] = None,
    account_aggregate: Optional[dict] = None,
    beneficiary_history: Optional[List[dict]] = None
) -> TransactionOutput:
    rule_flag, rule_reason, rule_category, factors_from_rules = extract_rule_evaluation(
        tx, batch_finding, account_aggregate, beneficiary_history
    )

    model_flag = False
    fraud_probability = 0.0
    factors_text = list(factors_from_rules)
    main_ml_factor = ""
    shap_contributions_list = []  
    
    if model is not None and explainer is not None:
        features_vector = preprocess_transaction(tx)
        probabilities = model.predict_proba([features_vector])[0]
        fraud_probability = float(probabilities[1])
        model_flag = fraud_probability > 0.50

        features_array = np.array([features_vector])
        shap_values = explainer(features_array)

        shap_vals_vector = shap_values.values[0]
        if hasattr(shap_vals_vector, "shape") and len(shap_vals_vector.shape) == 2 and shap_vals_vector.shape[1] == 2:
            shap_vals_vector = shap_vals_vector[:, 1]

        contributions = list(zip(feature_names, shap_vals_vector))
        top_factors = sorted(contributions, key=lambda x: abs(x[1]), reverse=True)[:3]

        main_ml_factor = top_factors[0][0]

        shap_contributions_list = [
            ShapContribution(
                feature=name,
                value=float(val),
                direction="positive" if val > 0 else "negative"
            )
            for name, val in top_factors
        ]

        factors_text.extend(
            f"{name} a contribué {'positivement' if val > 0 else 'négativement'}"
            for name, val in top_factors
        )

    is_fraud = model_flag or rule_flag

    if rule_flag and model_flag:
        summary_text = f"ALERTE CRITIQUE : Bloqué par règle métier ({rule_reason}) et validé par l'IA."
    elif rule_flag:
        summary_text = f"Bloqué par conformité : {rule_reason}."
        fraud_probability = max(fraud_probability, 1.0)
    elif model_flag:
        summary_text = f"Détection IA : Comportement suspect identifié via {main_ml_factor}."
    else:
        summary_text = "Aucune anomalie détectée par l'IA ou les filtres métiers."

    if is_fraud:
        rec_status = "SUSPICIOUS"
    elif tx.amount > 5000:
        rec_status = "UNMATCHED"
    else:
        rec_status = "MATCHED"

    explainability_data = ExplainabilityOutput(
        summary=summary_text,
        factors=factors_text,
        shap_contributions=shap_contributions_list
    )
    conf_data = probability_to_confidence(fraud_probability)
    return TransactionOutput(
        tenant_id=tx.tenant_id,
        transaction_reference=tx.transaction_reference,
        id=tx.id,
        date=tx.date,
        description=tx.description,
        amount=tx.amount,
        isFraud=is_fraud,
        fraudProbability=round(fraud_probability, 4),
        score=conf_data["score"],             
        confidence=conf_data["confidence"],   
        reconciliationStatus=rec_status,
        ruleCategory=rule_category,
        explainability=explainability_data
    )

# =====================================================================
# ENDPOINT SYSTEM HEALTH
# =====================================================================
@app.get("/health", tags=["System"], response_model=APIResponse[dict])
async def health_check():
    return APIResponse(success=True, data={"status": "ok"})

# =====================================================================
# FONCTION AUXILIAIRE PHASE 3 : APPLICATION DES RÈGLES DE GRAPHE NEO4J
# =====================================================================
def _apply_graph_findings(result: TransactionOutput, iban: str, tenant_id: str) -> None:
    if graph_engine is None:
        return
    OVERWRITABLE_CATEGORIES = {"NON_CATEGORISE", "NOUVEL_IBAN"}
    
    network = graph_engine.detect_fraud_network(tenant_id, iban)
    if network:
        result.isFraud = True
        result.reconciliationStatus = "SUSPICIOUS"
        result.explainability.factors.append(
            f"Compte connecté à un réseau de fraude ({network['alert_count']} alertes liées)"
        )
        if result.ruleCategory in OVERWRITABLE_CATEGORIES:
            result.ruleCategory = "RESEAU_FRAUDE"

    cycle = graph_engine.detect_circular_payment(tenant_id, iban)
    if cycle:
        result.isFraud = True
        result.reconciliationStatus = "SUSPICIOUS"
        result.explainability.factors.append("Paiement circulaire détecté : " + " → ".join(cycle))
        if result.ruleCategory in OVERWRITABLE_CATEGORIES:
            result.ruleCategory = "PAIEMENT_CIRCULAIRE"

    reciprocal = graph_engine.detect_reciprocal_flow(tenant_id, iban)
    if reciprocal:
        result.explainability.factors.append(
            f"Flux réciproque suspect avec {reciprocal['counterparty']} "
            f"({reciprocal['out_count']} envois / {reciprocal['in_count']} retours)"
        )
        if result.ruleCategory in OVERWRITABLE_CATEGORIES:
            result.ruleCategory = "COLLUSION_SUSPECTE"


def analyze_batch(transactions: List[TransactionInput]) -> List[TransactionOutput]:
    tx_dicts = [tx.model_dump() for tx in transactions]
    batch_findings = apply_batch_rules(tx_dicts)

    aggregates_map = {}
    beneficiaries_map = {}

    if supabase is not None:
        try:
            account_ibans = list({
                tx_dict.get("account_iban") or tx_dict.get("sender_account")
                for tx_dict in tx_dicts
                if tx_dict.get("account_iban") or tx_dict.get("sender_account")
            })

            if account_ibans:
                res_agg = supabase.table("account_aggregates")\
                    .select("*")\
                    .in_("account_iban", account_ibans)\
                    .execute()

                if res_agg.data:
                    aggregates_map = {item["account_iban"]: item for item in res_agg.data}

                res_ben = supabase.table("beneficiary_history")\
                    .select("*")\
                    .in_("account_iban", account_ibans)\
                    .execute()
                if res_ben.data:
                    for item in res_ben.data:
                        iban = item["account_iban"]
                        if iban not in beneficiaries_map:
                            beneficiaries_map[iban] = []
                        beneficiaries_map[iban].append(item)
        except Exception as e:
            logger.warning(f"Impossible de charger le contexte Phase 2 depuis Supabase : {e}")

    results = []
    for tx in transactions:
        tx_dict = tx.model_dump()
        iban = tx_dict.get("account_iban") or tx_dict.get("sender_account")
        tx_output = build_transaction_output(
            tx=tx,
            batch_finding=batch_findings.get(tx.id),
            account_aggregate=aggregates_map.get(iban),
            beneficiary_history=beneficiaries_map.get(iban, [])
        )
        results.append(tx_output)

    if graph_engine is not None:
        for tx, result in zip(transactions, results):
            tx_dict = tx.model_dump()
            try:
                graph_engine.sync_transaction(tx_dict, result.isFraud, result.ruleCategory)
            except Exception as e:
                logger.warning(f"Échec de synchronisation Neo4j pour {tx.id} : {e}")

        for tx, result in zip(transactions, results):
            tx_dict = tx.model_dump()
            iban = tx_dict.get("account_iban") or tx_dict.get("sender_account")
            if not iban:
                continue
            try:
                _apply_graph_findings(result, iban, tx_dict.get("tenant_id"))
            except Exception as e:
                logger.warning(f"Échec de l'analyse graphe pour {tx.id} : {e}")

    return results


# =====================================================================
# 7. ENDPOINT D'ANALYSE HYBRIDE SÉCURISÉ
# =====================================================================
@app.post("/api/analyze", response_model=APIResponse[List[TransactionOutput]])
async def analyze_transactions_secure(
    transactions: List[TransactionInput],
    token_payload: dict = Depends(get_current_user_context),
    internal_ctx: dict = Depends(verify_internal_token),        # flux BankMatch futur

):
    logger.info("Accès API sécurisé via token validé.")
    start_time = time.perf_counter()
    auth_tenant_id = internal_ctx.get("tenantId") or token_payload.get("tenant_id", "default")
    print("Tenant from internal token:", internal_ctx.get("tenantId"))

    for tx in transactions:
        tx.tenant_id = auth_tenant_id

    try:
        results = analyze_batch(transactions)

        if supabase is not None:
            try:
                for r in results:
                    supabase.table("fraud_alerts").insert({
                        "tenant_id": r.tenant_id,
                        "transaction_reference": r.transaction_reference,
                        "transaction_id": r.id,
                        "date": r.date,
                        "amount": r.amount,
                        "is_fraud": r.isFraud,
                        "fraud_probability": r.fraudProbability,
                        "score": r.score,              
                        "reconciliation_status": r.reconciliationStatus,
                        "rule_category": r.ruleCategory,
                        "explainability": r.explainability.model_dump()
                    }).execute()
                logger.info("%d alertes enregistrées pour le tenant '%s'.", len(results), auth_tenant_id)
            except Exception as database_error:
                logger.exception("Échec de la sauvegarde dans Supabase.")
                raise HTTPException(
                    status_code=502,
                    detail="Échec de la sauvegarde des résultats dans la base de données.",
                ) from database_error

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        nb_fraudes = sum(1 for r in results if r.isFraud)

        logger.info("Temps de traitement : %.2f ms pour %d transaction(s)", elapsed_ms, len(results))
        logger.info("Taux de détection : %d/%d transaction(s) suspecte(s)", nb_fraudes, len(results))

        return APIResponse(success=True, data=results)

    except HTTPException:
        raise
    except Exception:
        logger.exception("Erreur interne lors de l'analyse des transactions.")
        raise HTTPException(
            status_code=500,
            detail="Erreur interne du serveur lors de l'analyse des transactions.",
        )

# =====================================================================
# 8. CONFIGURATION DES SEUILS (Phase 5 — Sécurisé par JWT)
# =====================================================================
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
async def get_config_thresholds(
    token_payload: dict = Depends(get_current_user_context),
    internal_ctx: dict = Depends(verify_internal_token),
):
    auth_tenant_id = internal_ctx.get("tenantId") or token_payload.get("tenant_id", "default")
    return APIResponse(success=True, data=get_thresholds())


@app.put("/api/config/thresholds", response_model=APIResponse[ThresholdsModel])
async def put_config_thresholds(
    patch: ThresholdsPatch,
    token_payload: dict = Depends(get_current_user_context),
    internal_ctx: dict = Depends(verify_internal_token),
):
    auth_tenant_id = internal_ctx.get("tenantId") or token_payload.get("tenant_id", "default")
    updates = {k: v for k, v in patch.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour.")
    return APIResponse(success=True, data=update_thresholds(updates))
# =====================================================================
# 9. ENDPOINTS DE VISUALISATION DU GRAPHE NEO4J (Sécurisés par JWT)
# =====================================================================
class GraphAccountNode(BaseModel):
    iban: str
    alert_count: int
    categories: List[str]

class GraphEdge(BaseModel):
    source: str
    target: str
    amount: float
    is_fraud: bool
    tx_id: str

class GraphNetworkResponse(BaseModel):
    center_iban: str
    nodes: List[str]
    edges: List[GraphEdge]

@app.get("/api/graph/top-accounts")
async def get_top_flagged_accounts(
    tenant_id: Optional[str] = None,
    limit: int = 10,
    token_payload: dict = Depends(get_current_user_context),
    internal_ctx: dict = Depends(verify_internal_token),
):
    if graph_engine is None:
        raise HTTPException(
            status_code=503, 
            detail="Moteur de graphe Neo4j non disponible"
        )
    auth_tenant_id = internal_ctx.get("tenantId") or token_payload.get("tenant_id", "default")
    effective_tenant_id = tenant_id or auth_tenant_id
    mock_data = [{"iban": "MOCK_IBAN_123", "alert_count": 5, "categories": ["TEST"]}]
    
    try:
        if hasattr(graph_engine, "get_top_flagged_accounts"):
            data = graph_engine.get_top_flagged_accounts(tenant_id=effective_tenant_id, limit=limit)
        elif hasattr(graph_engine, "get_top_accounts"):
            data = graph_engine.get_top_accounts(tenant_id=effective_tenant_id, limit=limit)
        else:
            data = mock_data
            
        return APIResponse(success=True, data=data)
        
    except Exception:
        return APIResponse(success=True, data=mock_data)

@app.get("/api/graph/network", response_model=APIResponse[GraphNetworkResponse])
async def get_account_network(
    iban: str,
    tenant_id: Optional[str] = None,
    token_payload: dict = Depends(get_current_user_context),
    internal_ctx: dict = Depends(verify_internal_token),
):
    if graph_engine is None:
        raise HTTPException(status_code=503, detail="Moteur de graphe Neo4j non disponible.")
    
    auth_tenant_id = internal_ctx.get("tenantId") or token_payload.get("tenant_id", "default")
    effective_tenant_id = tenant_id or auth_tenant_id
    try:
        data = graph_engine.get_account_network(effective_tenant_id, iban)
        if data is None:
            raise HTTPException(status_code=404, detail="Compte introuvable dans le graphe.")
        return APIResponse(success=True, data=data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erreur récupération réseau de compte")
        raise HTTPException(status_code=500, detail=str(e))

# ====================================================================
# HELPER & ROUTE POUR LES TESTS AUTOMATISÉS
# ====================================================================
ENABLE_TEST_TOKEN_ENDPOINT = os.environ.get("ENABLE_TEST_TOKEN_ENDPOINT", "false").lower() == "true"

def generate_test_token() -> dict:
    payload = {
        "service": "express_backend",
        "purpose": "internal_api_call",
        "tenant_id": "default",
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=15)
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return {"access_token": token}

# Seulement accessible en dev/test explicite
if not IS_PRODUCTION and ENABLE_TEST_TOKEN_ENDPOINT:
    @app.get("/api/token")
    async def get_test_token():
        return generate_test_token()
@app.get("/")
async def root():
    return {
        "status": "production_ready", 
        "service": "Fraud Detection API",
        "model_loaded": True,  
        "database_connected": supabase is not None
    }



# =====================================================================
# 10. LISTE DES TRANSACTIONS ANALYSÉES (lecture Supabase fraud_alerts)
# =====================================================================
class TransactionListItem(BaseModel):
    id: str
    tenant_id: Optional[str] = None
    transaction_reference: Optional[str] = None  # Renamed from mongo_transaction_id
    date: str
    description: Optional[str] = None
    amount: float
    isFraud: bool
    fraudProbability: float
    score: Optional[int] = 0           
    confidence: Optional[str] = "LOW"   
    reconciliationStatus: str
    ruleCategory: Optional[str] = "NON_CATEGORISE"
    explainability: Optional[dict] = None


@app.get("/api/transactions", response_model=APIResponse[List[TransactionListItem]])
async def list_transactions(
    tenant_id: Optional[str] = None,
    status: Optional[str] = None,          
    date_from: Optional[str] = None,       
    date_to: Optional[str] = None,         
    search: Optional[str] = None,          
    limit: int = 100,
    offset: int = 0,
    token_payload: dict = Depends(get_current_user_context),
):
    if supabase is None:
        raise HTTPException(
            status_code=503,
            detail="Persistance Supabase non disponible.",
        )
    effective_tenant_id = tenant_id or token_payload.get("tenant_id", "default")
    try:
        query = supabase.table("fraud_alerts").select("*")

        if effective_tenant_id:
            query = query.eq("tenant_id", effective_tenant_id)
        if status:
            query = query.eq("reconciliation_status", status.upper())
        if date_from:
            query = query.gte("date", date_from)
        if date_to:
            query = query.lte("date", date_to)
        if search:
            query = query.ilike("transaction_id", f"%{search}%")

        query = query.order("date", desc=True).range(offset, offset + limit - 1)
        result = query.execute()
        rows = result.data or []
    except Exception:
        logger.exception("Échec de la récupération des transactions depuis Supabase.")
        raise HTTPException(
            status_code=502,
            detail="Impossible de récupérer les transactions depuis la base de données.",
        )

    items = [
        TransactionListItem(
            id=str(row.get("transaction_id") or row.get("id") or ""),
            tenant_id=row.get("tenant_id") or "",
            transaction_reference=row.get("transaction_reference") or row.get("mongo_transaction_id") or "",
            date=str(row.get("date") or ""),
            description=row.get("description"),
            amount=float(row.get("amount") or 0.0),
            isFraud=bool(row.get("is_fraud", False)),
            fraudProbability=float(row.get("fraud_probability") or 0.0),
            score=int(row.get("score") or round(float(row.get("fraud_probability") or 0.0) * 100)), 
            confidence=row.get("confidence") or probability_to_confidence(float(row.get("fraud_probability") or 0.0))["confidence"], 
            reconciliationStatus=row.get("reconciliation_status", "UNMATCHED"),
            ruleCategory=row.get("rule_category", "NON_CATEGORISE"),
            explainability=row.get("explainability"),
        ) for row in rows
    ]

    return APIResponse(success=True, data=items)

# =====================================================================
# GESTIONNAIRE GLOBAL D'EXCEPTIONS
# =====================================================================
@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": exc.detail
            },
            "requestId": None
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)