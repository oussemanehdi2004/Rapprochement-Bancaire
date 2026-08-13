"""
Stockage et accès aux seuils réglementaires configurables,
ainsi que le chargement des variables d'environnement de sécurité.
"""

from __future__ import annotations

import copy
import json
import logging
import os
import tempfile
import threading
from typing import Any

logger = logging.getLogger("fraud_api.config")

# =====================================================================
# VARIABLES D'ENVIRONNEMENT & SÉCURITÉ INTER-SERVICES (Points 1 & 2)
# =====================================================================
# Par défaut à False pour imposer l'auth (aligné avec Docker)
DISABLE_INTERNAL_AUTH = os.getenv("DISABLE_INTERNAL_AUTH", "false").lower() == "true"
# Secret unique isolé pour le service Fraud-Detection
FRAUD_INTERNAL_SECRET = os.getenv("FRAUD_INTERNAL_SECRET", os.getenv("INTERNAL_SERVICE_SECRET", "default_fraud_secret"))


# =====================================================================
# CONFIGURATION DES SEUILS METIER
# =====================================================================
# Permet de surcharger le chemin via une variable d'environnement (pratique pour les volumes Docker)
DEFAULT_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "thresholds.json")
CONFIG_PATH = os.getenv("THRESHOLDS_CONFIG_PATH", DEFAULT_CONFIG_PATH)

DEFAULT_THRESHOLDS: dict[str, Any] = {
    "SEUIL_REGLEMENTAIRE": 10_000.0,
    "SEUIL_APPROCHE_RATIO": 0.90,
    "SEUIL_CASH_OUT": 5_000.0,
    "SEUIL_MONTANT_ABERRANT": 1_000_000_000.0,
    "RATIO_MONTANT_INHABITUEL": 8.0,
    "SEUIL_JOURS_COMPTE_DORMANT": 90,
    "MOTS_CLES_SENSIBLES": [
        "CASINO", "PARIS", "POKER", "BET", "PARI",
        "OFFSHORE", "CRYPTO", "BITCOIN", "HAVEN"
    ],
}

_lock = threading.Lock()
_cached_thresholds: dict[str, Any] | None = None
_last_mtime: float = 0.0


def _read_file_unlocked() -> dict[str, Any]:
    """Lit le fichier avec gestion du cache basé sur la date de modification du fichier (mtime)."""
    global _cached_thresholds, _last_mtime

    if not os.path.exists(CONFIG_PATH):
        _cached_thresholds = copy.deepcopy(DEFAULT_THRESHOLDS)
        _last_mtime = 0.0
        return _cached_thresholds

    try:
        current_mtime = os.path.getmtime(CONFIG_PATH)
        if _cached_thresholds is not None and current_mtime == _last_mtime:
            return _cached_thresholds

        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        merged = copy.deepcopy(DEFAULT_THRESHOLDS)
        if isinstance(data, dict):
            merged.update({k: v for k, v in data.items() if k in DEFAULT_THRESHOLDS})

        _cached_thresholds = merged
        _last_mtime = current_mtime
        return merged

    except (OSError, json.JSONDecodeError):
        logger.exception("Impossible de lire thresholds.json, retour aux valeurs par défaut.")
        if _cached_thresholds is None:
            _cached_thresholds = copy.deepcopy(DEFAULT_THRESHOLDS)
        return _cached_thresholds


def _write_file_atomic_unlocked(data: dict[str, Any]) -> None:
    """Écriture atomique dans un fichier temporaire puis remplacement."""
    dir_name = os.path.dirname(CONFIG_PATH) or "."
    os.makedirs(dir_name, exist_ok=True)

    fd, temp_path = tempfile.mkstemp(dir=dir_name, prefix="thresholds_", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(temp_path, CONFIG_PATH)
    except Exception:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise


def get_thresholds() -> dict[str, Any]:
    """Retourne une copie indépendante des seuils configurés."""
    with _lock:
        return copy.deepcopy(_read_file_unlocked())


def update_thresholds(patch: dict[str, Any]) -> dict[str, Any]:
    """Met à jour les seuils en filtrant et en vérifiant les types puis persiste sur disque."""
    with _lock:
        current = copy.deepcopy(_read_file_unlocked())

        valid_updates: dict[str, Any] = {}
        for key, val in patch.items():
            if key in DEFAULT_THRESHOLDS and val is not None:
                expected_type = type(DEFAULT_THRESHOLDS[key])
                if expected_type is float:
                    valid_updates[key] = float(val)
                elif expected_type is int:
                    valid_updates[key] = int(val)
                elif expected_type is list:
                    valid_updates[key] = list(val)
                else:
                    valid_updates[key] = val

        if not valid_updates:
            return copy.deepcopy(current)

        current.update(valid_updates)

        try:
            _write_file_atomic_unlocked(current)
            global _cached_thresholds, _last_mtime
            _cached_thresholds = current
            _last_mtime = os.path.getmtime(CONFIG_PATH) if os.path.exists(CONFIG_PATH) else 0.0
            
            logger.info("Seuils mis à jour avec succès : %s", valid_updates)
        except Exception:
            logger.exception("Échec lors de la sauvegarde des seuils sur disque.")
            raise

        return copy.deepcopy(current)