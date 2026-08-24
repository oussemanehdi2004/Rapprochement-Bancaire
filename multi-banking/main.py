import asyncio
import datetime
import json
import logging
import os
import time
import uuid
import jwt

import httpx
from prometheus_fastapi_instrumentator import Instrumentator
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
)

from bankmatch_client import (
    generate_service_token,
    import_transactions,
    start_matching,
)
from internal_auth import verify_internal_token
from parsers import camt053, csv_bank, mt940
from validators import validate_transactions

# Load environment variables from .env file
# IMPORTANT: Ensure .env file exists with proper configuration
# CRITICAL: DISABLE_INTERNAL_AUTH must be false in production
# CRITICAL: Use strong secrets (32+ characters) in production
from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger("multi-banking")
# TODO: Remove these logs in production - they expose configuration
logger.info(f"DISABLE_INTERNAL_AUTH: {os.getenv('DISABLE_INTERNAL_AUTH')}")
logger.info(f"INTERNAL_SERVICE_SECRET: {os.getenv('INTERNAL_SERVICE_SECRET')}")


FRAUD_SERVICE_URL = os.getenv(
    "FRAUD_SERVICE_URL",
    "http://localhost:8005",
)

FRAUD_INTERNAL_SECRET = os.getenv(
    "FRAUD_INTERNAL_SECRET",
    "fraud_dev_secret_123"
)

BANKMATCH_INTEGRATION_ENABLED = (
    os.getenv("BANKMATCH_INTEGRATION_ENABLED", "false").lower() == "true"
)

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

DEBUG_PAYLOAD = os.getenv("DEBUG_PAYLOAD", "false").lower() == "true"


app = FastAPI(
    title="Multi-Banking Ingestion Service",
    version="0.2.0",
)
Instrumentator().instrument(app).expose(app)


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


def parse_content(
    content: bytes,
    normalized_format: str,
    tenant_id: str,
    bank_id: str,
):
    """Parse le contenu selon le format demandé (csv, camt053, mt940, pain001)."""

    if normalized_format == "csv":
        return csv_bank.parse_csv(
            content,
            tenant_id,
            bank_id,
        )

    if normalized_format == "camt053":
        return camt053.parse_camt053(
            content,
            tenant_id,
            bank_id,
        )

    if normalized_format == "mt940":
        return mt940.parse_mt940(
            content,
            tenant_id,
            bank_id,
        )

    if normalized_format in ("pain001", "pain.001"):
        try:
            from parsers import pain001

            return pain001.parse_pain001(
                content,
                tenant_id,
                bank_id,
            )
        except ImportError:
            raise HTTPException(
                status_code=400,
                detail="Le parser ISO 20022 pain.001 n'est pas encore disponible.",
            )

    raise HTTPException(
        status_code=400,
        detail=(
            f"Format non supporté : {normalized_format}. "
            "Formats acceptés : csv, camt053, mt940, pain.001"
        ),
    )


def build_fraud_payload(transactions: list) -> list[dict]:
    """Convertit les transactions pivot vers le format attendu par Fraud Detection.

    Reconstruit dynamiquement les soldes si certaines valeurs manquent afin d'éviter
    de pousser systématiquement des valeurs 0.0 au moteur de fraude.
    """

    payload = []

    for transaction in transactions:
        amount = getattr(transaction, "amount", 0.0)
        raw_before = getattr(transaction, "balance_before", None)
        raw_after = getattr(transaction, "balance_after", None)
        account_bal = getattr(transaction, "account_balance", None)

        # Déduction intelligente des soldes manquants
        if raw_before is not None and raw_after is not None:
            sender_balance_before = raw_before
            sender_balance_after = raw_after
        elif raw_before is not None:
            sender_balance_before = raw_before
            sender_balance_after = raw_before + amount
        elif raw_after is not None:
            sender_balance_before = raw_after - amount
            sender_balance_after = raw_after
        elif account_bal is not None:
            sender_balance_before = account_bal
            sender_balance_after = account_bal + amount
        else:
            sender_balance_before = 0.0
            sender_balance_after = 0.0

        payload.append(
            {
                "tenant_id": transaction.tenant_id,
                "transaction_reference": transaction.source_line_hash,
                "id": (transaction.reference or transaction.source_line_hash),
                "date": transaction.value_date,
                "description": transaction.label,
                "amount": abs(amount),
                "sender_balance_before": sender_balance_before,
                "sender_balance_after": sender_balance_after,
                "receiver_balance_before": 0.0,
                "receiver_balance_after": 0.0,
                "transaction_type": "TRANSFER",
                "account_iban": transaction.account_iban,
                "beneficiary_iban": transaction.counterparty_iban,
                "sender_account": transaction.account_iban,
                "receiver_account": transaction.counterparty_iban,
            }
        )

    return payload


@app.get("/banking/health")
async def health():
    return {
        "status": "ok",
        "service": "multi-banking",
        "environment": ENVIRONMENT,
    }


@app.get("/health")
async def health_alias():
    return {
        "status": "ok",
        "service": "multi-banking",
        "environment": ENVIRONMENT,
    }


# In-memory storage for upload statistics (in production, use a database)
upload_stats = {
    "total_files": 0,
    "successful": 0,
    "failed": 0,
    "pending": 0,
    "total_transactions": 0
}

recent_uploads = []


@app.get("/banking/stats")
async def get_stats():
    """Get ingestion statistics."""
    return upload_stats


@app.get("/banking/uploads")
async def get_recent_uploads(
    limit: int = 50,
    status: str = None
):
    """Get recent uploads with optional filtering."""
    filtered_uploads = recent_uploads
    
    if status:
        filtered_uploads = [u for u in recent_uploads if u.get("status") == status]
    
    return filtered_uploads[:limit]


@app.post("/banking/api/multi-banking/parse")
async def parse_file(
    file: UploadFile = File(...),
    format: str = Form(...),
    tenant_id: str = Form(...),
    bank_id: str = Form(...),
    ctx: dict = Depends(verify_internal_token),
):
    normalized_format = format.lower().strip()

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Le fichier est vide",
        )

    try:
        transactions = parse_content(
            content=content,
            normalized_format=normalized_format,
            tenant_id=tenant_id,
            bank_id=bank_id,
        )
    except HTTPException:
        raise
    except KeyError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Colonne manquante dans le fichier : {e}. Vérifiez que le CSV contient les colonnes requises (account_iban, value_date, label, amount).",
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erreur lors de l'analyse du fichier : {e}",
        )

    return {
        "success": True,
        "count": len(transactions),
        "data": [transaction.model_dump() for transaction in transactions],
        "metadata": {
            "filename": file.filename,
            "format": normalized_format,
            "tenant_id": tenant_id,
            "bank_id": bank_id,
            "authenticated_tenant": ctx.get("tenantId"),
            "authenticated_user": ctx.get("userId"),
        },
    }


@app.post("/banking/api/multi-banking/validate")
async def validate_file(
    file: UploadFile = File(...),
    format: str = Form(...),
    tenant_id: str = Form(...),
    bank_id: str = Form(...),
    ctx: dict = Depends(verify_internal_token),
):
    normalized_format = format.lower().strip()

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Le fichier est vide",
        )

    try:
        transactions = parse_content(
            content=content,
            normalized_format=normalized_format,
            tenant_id=tenant_id,
            bank_id=bank_id,
        )
    except HTTPException:
        raise
    except KeyError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Colonne manquante dans le fichier : {e}. Vérifiez que le CSV contient les colonnes requises (account_iban, value_date, label, amount).",
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erreur lors de l'analyse du fichier : {e}",
        )

    validation_result = validate_transactions(transactions)

    return {
        "success": True,
        "count": len(transactions),
        "validation": validation_result,
    }


@app.post("/banking/api/multi-banking/ingest")
async def ingest_file(
    file: UploadFile = File(...),
    format: str = Form(...),
    tenant_id: str = Form(...),
    bank_id: str = Form(...),
    ctx: dict = Depends(verify_internal_token),
):
    normalized_format = format.lower().strip()

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Le fichier est vide",
        )

    try:
        transactions = parse_content(
            content=content,
            normalized_format=normalized_format,
            tenant_id=tenant_id,
            bank_id=bank_id,
        )
    except HTTPException:
        raise
    except KeyError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Colonne manquante dans le fichier : {e}. Vérifiez que le CSV contient les colonnes requises (account_iban, value_date, label, amount).",
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erreur lors de l'analyse du fichier : {e}",
        )

    if not transactions:
        raise HTTPException(
            status_code=400,
            detail="Aucune transaction n'a pu être extraite du fichier",
        )

    fraud_payload = build_fraud_payload(transactions)

    if DEBUG_PAYLOAD:
        logger.info(
            json.dumps(
                {
                    "event": "fraud_payload_debug",
                    "count": len(fraud_payload),
                    "payload": fraud_payload,
                }
            )
        )

    # Generate token for Fraud Detection service using FRAUD_INTERNAL_SECRET
    fraud_token_payload = {
        "service": "multi-banking",
        "type": "internal",
        "tenant_id": tenant_id,
    }
    fraud_token = jwt.encode(fraud_token_payload, FRAUD_INTERNAL_SECRET, algorithm="HS256")

    # Appel vers Fraud Detection avec Retry & Backoff exponentiel
    max_retries = 3
    backoff_seconds = 0.5
    response = None
    fraud_error_msg = None

    async with httpx.AsyncClient() as client:
        for attempt in range(1, max_retries + 1):
            try:
                response = await client.post(
                    f"{FRAUD_SERVICE_URL}/api/analyze",
                    json=fraud_payload,
                    headers={"Authorization": f"Bearer {fraud_token}"},
                    timeout=30.0,
                )
                if response.status_code == 200:
                    break

                if (
                    response.status_code in (502, 503, 504)
                    and attempt < max_retries
                ):
                    logger.warning(
                        f"Fraud service returned {response.status_code}. Retry {attempt}/{max_retries}..."
                    )
                    await asyncio.sleep(backoff_seconds * (2 ** (attempt - 1)))
                    continue

            except (httpx.RequestError, httpx.TimeoutException) as exc:
                if attempt == max_retries:
                    fraud_error_msg = f"Service de fraude indisponible après {max_retries} tentatives"
                    logger.error(f"Fraud service unreachable: {exc}")
                    break
                logger.warning(
                    f"Fraud service request failed ({exc}). Retry {attempt}/{max_retries}..."
                )
                await asyncio.sleep(backoff_seconds * (2 ** (attempt - 1)))

    fraud_result = None
    upload_status = "completed"

    if response is not None and response.status_code == 200:
        try:
            fraud_result = response.json()
        except ValueError:
            fraud_error_msg = "Réponse invalide du service de fraude"
    elif fraud_error_msg is None:
        # Service returned non-200 status
        if response is not None:
            try:
                error_body = response.json()
                fraud_error_msg = (
                    error_body.get("detail")
                    or (error_body.get("error", {}).get("message") if isinstance(error_body.get("error"), dict) else None)
                    or f"Erreur HTTP {response.status_code} du service de fraude"
                )
            except (ValueError, AttributeError):
                fraud_error_msg = f"Erreur HTTP {response.status_code} du service de fraude"
        else:
            fraud_error_msg = "Aucune réponse du service de fraude"

    bankmatch_result = None

    if BANKMATCH_INTEGRATION_ENABLED:
        try:
            service_token = generate_service_token(tenant_id)

            transactions_for_bankmatch = [
                transaction.model_dump() for transaction in transactions
            ]

            import_response = await import_transactions(
                transactions_for_bankmatch, service_token
            )

            bankmatch_result = import_response

            if import_response.get("session_id"):
                session_id = import_response["session_id"]
                matching_response = await start_matching(
                    session_id, service_token
                )
                bankmatch_result["matching"] = matching_response

        except Exception as exc:
            logger.error(
                json.dumps(
                    {
                        "event": "bankmatch_integration_error",
                        "error": str(exc),
                        "tenant_id": tenant_id,
                    }
                )
            )
            bankmatch_result = {"error": str(exc)}

    # Update statistics (always, regardless of fraud service result)
    upload_stats["total_files"] += 1
    upload_stats["total_transactions"] += len(transactions)

    if fraud_error_msg:
        upload_status = "failed"
        upload_stats["failed"] += 1
    elif fraud_result and isinstance(fraud_result, dict):
        if fraud_result.get("error"):
            upload_status = "failed"
            upload_stats["failed"] += 1
        else:
            upload_stats["successful"] += 1
    else:
        upload_stats["successful"] += 1

    upload_record = {
        "id": str(uuid.uuid4()),
        "filename": file.filename,
        "bank": bank_id,
        "format": normalized_format,
        "status": upload_status,
        "transaction_count": len(transactions),
        "uploaded_at": datetime.datetime.now().isoformat(),
        "error_message": fraud_error_msg,
    }

    recent_uploads.insert(0, upload_record)
    if len(recent_uploads) > 100:
        recent_uploads.pop()

    if fraud_error_msg:
        raise HTTPException(
            status_code=502,
            detail=fraud_error_msg,
        )

    return {
        "success": True,
        "parsed_count": len(transactions),
        "fraud_result": fraud_result,
        "bankmatch_result": bankmatch_result,
        "metadata": {
            "filename": file.filename,
            "format": normalized_format,
            "tenant_id": tenant_id,
            "bank_id": bank_id,
            "bankmatch_integration_enabled": BANKMATCH_INTEGRATION_ENABLED,
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)