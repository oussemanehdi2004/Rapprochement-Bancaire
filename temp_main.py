import json
import logging`nimport json`nimport json`nimport json`nimport json`nimport json`nimport json
import os
import time

import httpx
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
)

from internal_auth import verify_internal_token
from parsers import camt053, csv_bank, mt940
from validators import validate_transactions


logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
)

logger = logging.getLogger("multi-banking")


FRAUD_SERVICE_URL = os.getenv(
    "FRAUD_SERVICE_URL",
    "http://localhost:8005",
)

BANKMATCH_INTEGRATION_ENABLED = (
    os.getenv("BANKMATCH_INTEGRATION_ENABLED", "false").lower() == "true"
)

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

DEBUG_PAYLOAD = (
    os.getenv("DEBUG_PAYLOAD", "false").lower() == "true"
)


app = FastAPI(
    title="Multi-Banking Ingestion Service",
    version="0.1.0",
    root_path="/banking",
)


@app.middleware("http")
async def log_requests(request, call_next):
    start = time.perf_counter()

    response = await call_next(request)

    duration_ms = round(
        (time.perf_counter() - start) * 1000,
        2,
    )

    logger.info(
        json.dumps(
            {
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            }
        )
    )

    return response


def parse_content(
    content: bytes,
    normalized_format: str,
    tenant_id: str,
    bank_id: str,
):
    """
    Parse le contenu selon le format demandÃ©.
    """

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

    raise HTTPException(
        status_code=400,
        detail=(
            f"Format non supportÃ© : {normalized_format}. "
            "Formats acceptÃ©s : csv, camt053, mt940"
        ),
    )


def build_fraud_payload(transactions: list) -> list[dict]:
    """
    Convertit les transactions pivot vers le format
    attendu par le service Fraud Detection.

    Remarque : Fraud Detection ne supporte pas les
    valeurs nulles pour les soldes. Une valeur par
    dÃ©faut 0.0 est donc utilisÃ©e lorsque le solde
    n'est pas disponible dans le fichier source.
    """

    payload = []

    for transaction in transactions:
        sender_balance_before = (
            transaction.balance_before
            if transaction.balance_before is not None
            else 0.0
        )

        sender_balance_after = (
            transaction.balance_after
            if transaction.balance_after is not None
            else 0.0
        )

        payload.append(
            {
                "tenant_id": transaction.tenant_id,
                "transaction_reference": transaction.source_line_hash,
                "id": (
                    transaction.reference
                    or transaction.source_line_hash
                ),
                "date": transaction.value_date,
                "description": transaction.label,
                "amount": abs(transaction.amount),
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


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "multi-banking",
        "environment": ENVIRONMENT,
    }


@app.post("/api/multi-banking/parse")
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

    transactions = parse_content(
        content=content,
        normalized_format=normalized_format,
        tenant_id=tenant_id,
        bank_id=bank_id,
    )

    return {
        "success": True,
        "count": len(transactions),
        "data": [
            transaction.model_dump()
            for transaction in transactions
        ],
        "metadata": {
            "filename": file.filename,
            "format": normalized_format,
            "tenant_id": tenant_id,
            "bank_id": bank_id,
            "authenticated_tenant": ctx.get("tenantId"),
            "authenticated_user": ctx.get("userId"),
        },
    }


@app.post("/api/multi-banking/validate")
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

    transactions = parse_content(
        content=content,
        normalized_format=normalized_format,
        tenant_id=tenant_id,
        bank_id=bank_id,
    )

    validation_result = validate_transactions(transactions)

    return {
        "success": True,
        "count": len(transactions),
        "validation": validation_result,
    }


@app.post("/api/multi-banking/ingest")
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

    transactions = parse_content(
        content=content,
        normalized_format=normalized_format,
        tenant_id=tenant_id,
        bank_id=bank_id,
    )

    if not transactions:
        raise HTTPException(
            status_code=400,
            detail="Aucune transaction n'a pu Ãªtre extraite du fichier",
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

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{FRAUD_SERVICE_URL}/api/analyze",
                json=fraud_payload,
                headers={
                    "Authorization": (
                        f"Bearer {ctx.get('raw_token')}"
                    )
                },
                timeout=30.0,
            )

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Fraud service unreachable: {exc}",
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Fraud service error: {response.text}",
        )

    try:
        fraud_result = response.json()

    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="Fraud service returned an invalid JSON response",
        )

    return {
        "success": True,
        "parsed_count": len(transactions),
        "fraud_result": fraud_result,
        "bankmatch_result": None,
        "metadata": {
            "filename": file.filename,
            "format": normalized_format,
            "tenant_id": tenant_id,
            "bank_id": bank_id,
            "bankmatch_integration_enabled": (
                BANKMATCH_INTEGRATION_ENABLED
            ),
        },
    }







