"""
Utilitaires partagés d'authentification (JWT interne).

Centralise le chargement/validation du secret JWT et la génération du token
interne, afin d'éviter la duplication entre l'API (`main.py`) et le script de
génération de token (`test_token.py`).
"""

import os

import jwt
from dotenv import load_dotenv

# Charge automatiquement le fichier .env à l'import du module.
load_dotenv()

# Payload standard du token interne (appels service-à-service).
INTERNAL_TOKEN_PAYLOAD = {
    "service": "express_backend",
    "purpose": "internal_api_call",
}


def get_jwt_secret() -> str:
    """Récupère le secret JWT depuis l'environnement, ou lève une erreur."""
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET n'est pas défini dans l'environnement.")
    return secret


def create_internal_token(secret: str | None = None) -> str:
    """Génère un token JWT interne signé en HS256."""
    secret = secret or get_jwt_secret()
    return jwt.encode(INTERNAL_TOKEN_PAYLOAD, secret, algorithm="HS256")
