#!/usr/bin/env bash
# Script de démo pour le compte rendu d'avancement — multi-banking.
# Lance chaque appel un par un, avec des pauses, pour faciliter la capture
# d'écran/vidéo. À exécuter depuis la racine du dossier multi-banking,
# service déjà démarré (uvicorn ou docker) sur le port 8010.

set -e
BASE_URL="http://localhost:8010"

echo "=== 1) Génération d'un token interne de test ==="
TOKEN=$(python scripts/gen_internal_token.py)
echo "Token: $TOKEN"
read -p "Appuie sur Entrée pour continuer..."

echo ""
echo "=== 2) Health check ==="
curl -s "$BASE_URL/health" | python -m json.tool
read -p "Appuie sur Entrée pour continuer..."

echo ""
echo "=== 3) Parse d'un fichier CSV ==="
curl -s -X POST "$BASE_URL/api/multi-banking/parse" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@data/sample.csv" \
  -F "format=csv" \
  -F "tenant_id=demo_retail" \
  -F "bank_id=bank-a" | python -m json.tool
read -p "Appuie sur Entrée pour continuer..."

echo ""
echo "=== 4) Validation métier du même fichier ==="
curl -s -X POST "$BASE_URL/api/multi-banking/validate" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@data/sample.csv" \
  -F "format=csv" \
  -F "tenant_id=demo_retail" \
  -F "bank_id=bank-a" | python -m json.tool
read -p "Appuie sur Entrée pour continuer..."

echo ""
echo "=== 5) Parse d'un fichier CAMT.053 ==="
curl -s -X POST "$BASE_URL/api/multi-banking/parse" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@data/sample_camt.xml" \
  -F "format=camt053" \
  -F "tenant_id=demo_retail" \
  -F "bank_id=bank-a" | python -m json.tool
read -p "Appuie sur Entrée pour continuer..."

echo ""
echo "=== 6) Pipeline complet : ingest -> Fraud Detection ==="
echo "(nécessite que fraud-service tourne aussi, ex: via banking-platform/docker-compose.yml)"
curl -s -X POST "$BASE_URL/api/multi-banking/ingest" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@data/sample.csv" \
  -F "format=csv" \
  -F "tenant_id=demo_retail" \
  -F "bank_id=bank-a" | python -m json.tool

echo ""
echo "=== Démo terminée ==="