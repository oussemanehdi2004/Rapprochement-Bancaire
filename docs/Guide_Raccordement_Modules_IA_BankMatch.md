# Guide de Raccordement — Modules IA Fraud Detection & Multi-Banking

**Date :** 23 Août 2026  
**Auteur :** Oussema Nehdi (Équipe IA)  
**Destinataire :** Dhirar (Intégration BankMatch Central)  
**Statut :** Prêt pour intégration

---

## 1. Résumé Exécutif

Ce document décrit le mécanisme de raccordement entre les deux modules IA développés par mon équipe :

| Module | Rôle | Port |
|--------|------|------|
| **Multi-Banking** | Ingestion, parsing et normalisation de fichiers bancaires multi-formats (CSV, CAMT.053, MT940, PAIN.001) | `8010` |
| **Fraud Detection** | Analyse hybride de fraude (ML XGBoost + Isolation Forest + Règles métier + Neo4j graphe) | `8005` |

**Flux principal :**  
`Frontend BankMatch → Backend Node.js → Multi-Banking → Fraud Detection → retour agrégé`

---

## 2. Architecture de Raccordement

```
┌─────────────────────────────────────────────────────────────────┐
│                    BANKMATCH CENTRALISÉ                          │
│  ┌──────────────┐     ┌──────────────────┐     ┌────────────┐  │
│  │ Frontend     │────▶│ Backend Node.js  │────▶│ MongoDB    │  │
│  │ Angular      │◀────│ (Auth + RBAC)    │◀────│ Atlas      │  │
│  └──────────────┘     └────────┬─────────┘     └────────────┘  │
│                                │                                │
└────────────────────────────────┼────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   MULTI-BANKING         │
                    │   FastAPI (port 8010)   │
                    │                         │
                    │  • Parse CSV/CAMT/MT940 │
                    │  • Normalisation        │
                    │  • Validation           │
                    │  • Appel Fraud + BM     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   FRAUD DETECTION       │
                    │   FastAPI (port 8005)   │
                    │                         │
                    │  • ML (XGBoost)         │
                    │  • Règles métier        │
                    │  • Neo4j (graphe)       │
                    │  • SSE notifications    │
                    └─────────────────────────┘
```

---

## 3. Mécanisme d'Authentification Inter-Services (S2S)

### 3.1 Principe

Les modules communiquent entre eux via des **tokens JWT signés avec un secret partagé** (`FRAUD_INTERNAL_SECRET`). Ce n'est PAS le JWT BankMatch principal — c'est un circuit d'authentification isolé pour les appels service-à-service.

### 3.2 Secret Partagé

```env
FRAUD_INTERNAL_SECRET=fraud_dev_secret_123
```

Ce secret est utilisé par :
- **Multi-Banking** pour SIGNER les tokens envoyés à Fraud Detection
- **Fraud Detection** pour VERIFIER les tokens reçus

### 3.3 Flow d'Authentification

```
Multi-Banking                          Fraud Detection
      │                                       │
      │  1. Génère token JWT                  │
      │     payload: {                       │
      │       service: "multi-banking",      │
      │       type: "internal",              │
      │       tenant_id: "tenant_xxx"        │
      │     }                                │
      │     signé avec FRAUD_INTERNAL_SECRET │
      │                                       │
      │  ──── POST /api/analyze ────────────▶ │
      │       Header: Authorization: Bearer  │
      │                                       │
      │                          2. Vérifie   │
      │                             le token  │
      │                             avec le   │
      │                             même      │
      │                             secret    │
      │                                       │
      │  ◀──── 200 OK + résultats ────────── │
```

### 3.4 Code Correspondant

**Multi-Banking** (génération du token) — `multi-banking/main.py:415-420` :
```python
fraud_token_payload = {
    "service": "multi-banking",
    "type": "internal",
    "tenant_id": tenant_id,
}
fraud_token = jwt.encode(fraud_token_payload, FRAUD_INTERNAL_SECRET, algorithm="HS256")
```

**Fraud Detection** (vérification du token) — `fraud-detection/backend/main.py:401-432` :
```python
async def get_service_context(credentials = Depends(security)):
    payload = jwt.decode(token, FRAUD_INTERNAL_SECRET, algorithms=["HS256"])
    return {
        "user_id": payload.get("service", "internal"),
        "tenant_id": payload.get("tenant_id", "default"),
        "is_internal": True,
    }
```

---

## 4. Contrats API

### 4.1 Multi-Banking → Fraud Detection

**Endpoint :** `POST http://localhost:8005/api/analyze`

**Headers :**
```
Authorization: Bearer <token_jwt_fraud_internal>
Content-Type: application/json
```

**Payload (array de transactions) :**
```json
[
  {
    "tenant_id": "tenant_123",
    "transaction_reference": "hash_ligne_source",
    "id": "TX-001",
    "date": "2026-08-23",
    "description": "VIREMENT ENTREPRISE",
    "amount": 15000.00,
    "sender_balance_before": 50000.00,
    "sender_balance_after": 35000.00,
    "receiver_balance_before": 0.0,
    "receiver_balance_after": 0.0,
    "transaction_type": "TRANSFER",
    "account_iban": "FR7612345678901234567890123",
    "beneficiary_iban": "FR7698765432109876543210987"
  }
]
```

**Réponse (200 OK) :**
```json
{
  "success": true,
  "data": [
    {
      "tenant_id": "tenant_123",
      "transaction_reference": "hash_ligne_source",
      "id": "TX-001",
      "date": "2026-08-23",
      "description": "VIREMENT ENTREPRISE",
      "amount": 15000.00,
      "isFraud": false,
      "fraudProbability": 0.12,
      "score": 12,
      "confidence": "LOW",
      "reconciliationStatus": "MATCHED",
      "ruleCategory": "NON_CATEGORISE",
      "explainability": {
        "summary": "Aucune anomalie détectée par l'IA ou les filtres métiers.",
        "factors": [],
        "shap_contributions": []
      }
    }
  ]
}
```

### 4.2 Multi-Banking → BankMatch Backend (Optionnel)

**Activation :** `BANKMATCH_INTEGRATION_ENABLED=true`

**Endpoints appelés :**
- `POST {BANKMATCH_BASE_URL}/import` — Import des transactions normalisées
- `POST {BANKMATCH_BASE_URL}/reconciliation/start` — Lancement du matching

**Token :** Généré via `generate_service_token(tenant_id)` dans `bankmatch_client.py`

---

## 5. Endpoints Multi-Banking Exposés

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Health check |
| `/banking/api/multi-banking/parse` | POST | Parser un fichier (retourne les transactions extraites) |
| `/banking/api/multi-banking/validate` | POST | Valider un fichier (détection erreurs) |
| `/banking/api/multi-banking/ingest` | POST | Ingestion complète (parse → validate → fraud → bankmatch) |
| `/banking/stats` | GET | Statistiques d'ingestion |
| `/banking/uploads` | GET | Liste des uploads récents |

**Request commune pour parse/validate/ingest :**
```
Content-Type: multipart/form-data

file: <fichier_bancaire>
format: csv | camt053 | mt940 | pain.001
tenant_id: tenant_xxx
bank_id: bank_xxx
```

---

## 6. Endpoints Fraud Detection Exposés

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Health check |
| `/api/analyze` | POST | Analyse de fraude (S2S auth) |
| `/api/analyze-demo` | POST | Analyse démo (sans auth — dev uniquement) |
| `/api/config/thresholds` | GET/PUT | Configuration des seuils |
| `/api/graph/top-accounts` | GET | Comptes les plus signalés |
| `/api/graph/mule-accounts` | GET | Détection comptes mules |
| `/api/graph/pagerank` | GET | Score PageRank des comptes |
| `/api/graph/communities` | GET | Détection communautés |
| `/api/notifications/stream` | GET | Stream SSE temps réel |
| `/api/reports` | GET | Rapports (PDF/CSV) |

---

## 7. Variables d'Environnement Requises

### Multi-Banking (`multi-banking/.env`)

```env
# Auth S2S
INTERNAL_SERVICE_SECRET=internal_dev_secret
DISABLE_INTERNAL_AUTH=false

# Connexion Fraud Detection
FRAUD_SERVICE_URL=http://localhost:8005
FRAUD_INTERNAL_SECRET=fraud_dev_secret_123

# Connexion BankMatch (optionnel)
BANKMATCH_BASE_URL=http://localhost:4090/api
BANKMATCH_INTEGRATION_ENABLED=false

# Environnement
ENVIRONMENT=development
DEBUG_PAYLOAD=false
```

### Fraud Detection (`fraud-detection/backend/.env`)

```env
# Secret S2S (MÊME valeur que Multi-Banking)
FRAUD_INTERNAL_SECRET=fraud_dev_secret_123

# Désactiver l'auth en dev (pour tests)
DISABLE_INTERNAL_AUTH=false

# Supabase (persistance des alertes fraude)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# Neo4j (analyse de graphe — optionnel)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=xxx

# Backend Node.js BankMatch
NODE_BACKEND_URL=http://localhost:3000

# CORS
ALLOWED_ORIGINS=http://localhost:4200,http://localhost:8005

# Rate limiting
RATE_LIMIT_REQUESTS=30
RATE_LIMIT_PERIOD=60

# Environnement
ENVIRONMENT=development
```

---

## 8. Docker Compose (Développement Local)

### 8.1 Multi-Banking seul

```yaml
# multi-banking/docker-compose.multibanking.yml
version: "3.9"
services:
  multi-banking:
    build: .
    container_name: multi_banking_standalone
    ports:
      - "8020:8010"
    environment:
      - INTERNAL_SERVICE_SECRET=${MULTIBANKING_INTERNAL_SECRET:-multibanking_dev_secret_456}
      - DISABLE_INTERNAL_AUTH=false
      - FRAUD_SERVICE_URL=http://fraud-service-unavailable:8005
      - ENVIRONMENT=development
    volumes:
      - ./data:/app/data
```

### 8.2 Stack complète (Multi-Banking + Fraud Detection)

```yaml
version: "3.9"
services:
  fraud-detection:
    build: ../fraud-detection/backend
    container_name: fraud_detection
    ports:
      - "8005:8005"
    environment:
      - FRAUD_INTERNAL_SECRET=fraud_dev_secret_123
      - DISABLE_INTERNAL_AUTH=false
      - ENVIRONMENT=development
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
    volumes:
      - ../fraud-detection/backend:/app

  multi-banking:
    build: ../multi-banking
    container_name: multi_banking
    ports:
      - "8010:8010"
    environment:
      - INTERNAL_SERVICE_SECRET=internal_dev_secret
      - DISABLE_INTERNAL_AUTH=false
      - FRAUD_SERVICE_URL=http://fraud-detection:8005
      - FRAUD_INTERNAL_SECRET=fraud_dev_secret_123
      - BANKMATCH_INTEGRATION_ENABLED=false
      - ENVIRONMENT=development
    depends_on:
      - fraud-detection
    volumes:
      - ../multi-banking/data:/app/data
```

---

## 9. Mapping des Champs de Transaction

### 9.1 Format Multi-Banking (sortie parsing)

```python
{
    "tenant_id": str,
    "source_line_hash": str,      # Hash SHA256 de la ligne source
    "reference": str,             # Référence transaction
    "value_date": str,            # Date (YYYY-MM-DD)
    "label": str,                 # Libellé
    "amount": float,              # Montant
    "balance_before": float,      # Solde avant (nullable)
    "balance_after": float,       # Solde après (nullable)
    "account_iban": str,          # IBAN compte émetteur
    "counterparty_iban": str,     # IBAN contrepartie (nullable)
}
```

### 9.2 Format Fraud Detection (entrée analyse)

```python
{
    "tenant_id": str,              # Identique
    "transaction_reference": str,  # = source_line_hash
    "id": str,                     # = reference ou source_line_hash
    "date": str,                   # = value_date
    "description": str,            # = label
    "amount": float,               # = amount (valeur absolue)
    "sender_balance_before": float,# = balance_before
    "sender_balance_after": float, # = balance_after
    "receiver_balance_before": 0.0,# Fixé à 0.0
    "receiver_balance_after": 0.0, # Fixé à 0.0
    "transaction_type": "TRANSFER",
    "account_iban": str,           # = account_iban
    "beneficiary_iban": str,       # = counterparty_iban
}
```

### 9.3 Mapping Automatique

Le mapping est assuré par `build_fraud_payload()` dans `multi-banking/main.py:152-204`.

La fonction gère intelligemment les soldes manquants :
- Si `balance_before` et `balance_after` existent → utilisation directe
- Si seul `balance_before` existe → déduit `after = before + amount`
- Si seul `balance_after` existe → déduit `before = after - amount`
- Si `account_balance` existe → utilise comme base
- Sinon → 0.0

---

## 10. Mécanisme de Retry & Résilience

Multi-Banking intègre un mécanisme de retry avec backoff exponentiel vers Fraud Detection :

```python
max_retries = 3
backoff_seconds = 0.5

# Retry sur :
# - Status 502, 503, 504 (erreurs transitoires)
# - Timeout HTTP
# - Erreurs de connexion
```

**Cas d'erreur gérés :**
- Fraud Detection indisponible → l'ingestion continue sans analyse fraude
- Timeout → retry avec backoff (0.5s → 1s → 2s)
- Erreur HTTP 4xx → pas de retry (erreur client)

---

## 11. Isolation Multi-Tenant

**Règle fondamentale :** Chaque transaction est associée à un `tenant_id` qui doit être cohérent sur toute la chaîne.

```
Frontend BankMatch
    ↓ (token JWT contenant tenantId)
Backend Node.js
    ↓ (passe tenant_id au microservice)
Multi-Banking
    ↓ (insère tenant_id dans chaque transaction)
Fraud Detection
    ↓ (utilise tenant_id pour isoler les données)
Supabase / Neo4j
```

**Important :** En production, le `tenant_id` est dérivé du token JWT et non transmis explicitement. En développement, il peut être passé en paramètre.

---

## 12. Checklist d'Intégration pour Dhirar

### Phase 1 — Raccordement Backend

- [ ] Cloner les branches `module-fraud-detection` et `module-multi-banking`
- [ ] Vérifier que `FRAUD_INTERNAL_SECRET` est identique dans les deux `.env`
- [ ] Démarrer Fraud Detection (port 8005)
- [ ] Démarrer Multi-Banking (port 8010)
- [ ] Tester le health check : `GET http://localhost:8005/health` et `GET http://localhost:8010/health`
- [ ] Tester l'endpoint démo : `POST http://localhost:8005/api/analyze-demo` avec un payload test
- [ ] Tester l'ingestion complète : `POST http://localhost:8010/banking/api/multi-banking/ingest` avec un fichier CSV

### Phase 2 — Raccordement BankMatch Central

- [ ] Configurer `BANKMATCH_BASE_URL` dans le `.env` Multi-Banking vers le backend Node.js
- [ ] Activer `BANKMATCH_INTEGRATION_ENABLED=true`
- [ ] Implémenter les endpoints `/api/import` et `/api/reconciliation/start` côté Node.js si non existants
- [ ] Tester le flux complet : Upload fichier → Multi-Banking → Fraud Detection → BankMatch

### Phase 3 — Intégration Frontend

- [ ] Créer les routes Angular pour Multi-Banking (upload, stats, historique)
- [ ] Créer les routes Angular pour Fraud Detection (dashboard, alertes, graphe)
- [ ] Connecter les appels API avec le token JWT BankMatch
- [ ] Implémenter le SSE pour les notifications temps réel

---

## 13. Données de Test

### 13.1 Fichier CSV de test

Un fichier exemple est disponible dans `multi-banking/data/sample.csv` :

```csv
account_iban,value_date,label,amount,balance_before,balance_after,counterparty_iban
FR7612345678901234567890123,2026-08-23,VIR SEPA ENTREPRISE,15000.00,50000.00,35000.00,FR7698765432109876543210987
FR7612345678901234567890123,2026-08-23,PRELEVEMENT EDF,-250.00,35000.00,34750.00,FR7611111111111111111111111
```

### 13.2 Payload test Fraud Detection

```json
[
  {
    "tenant_id": "tenant_test",
    "transaction_reference": "test_ref_001",
    "id": "TX-TEST-001",
    "date": "2026-08-23T14:30:00Z",
    "description": "VIREMENT ENTRANT CASINO",
    "amount": 1500.50,
    "sender_balance_before": 5000.0,
    "sender_balance_after": 3499.5,
    "receiver_balance_before": 200.0,
    "receiver_balance_after": 1700.5,
    "transaction_type": "TRANSFER",
    "account_iban": "FR7612345678901234567890123",
    "beneficiary_iban": "FR7698765432109876543210987"
  }
]
```

---

## 14. Spécifications OpenAPI

Les spécifications complètes sont disponibles dans :

| Module | Fichier |
|--------|---------|
| Multi-Banking | `multi-banking/api-spec.yaml` |
| Fraud Detection | `fraud-detection/backend/api-spec.yaml` |

Ces fichiers peuvent être importés dans Swagger UI ou Postman pour tester les endpoints.

---

## 15. Points d'Attention

1. **Le JWT BankMatch n'est PAS utilisé entre les microservices** — seul le `FRAUD_INTERNAL_SECRET` sert pour les appels S2S
2. **Le port Fraud Detection est 8005** (pas 8010 comme Multi-Banking)
3. **L'endpoint `/api/analyze-demo`** est disponible sans auth en mode développement uniquement
4. **Les modèles ML** (XGBoost, Isolation Forest) doivent être présents dans le répertoire de Fraud Detection au démarrage
5. **Neo4j est optionnel** — le système fonctionne sans, mais l'analyse de graphe sera désactivée
6. **Supabase est requis** pour la persistance des alertes fraude en base

---

## 16. Contact

Pour toute question sur ce guide ou les modules IA :

- **Oussema Nehdi** — Équipe IA (Fraud Detection & Multi-Banking)
- **Canal :** #tous-rapprochement-bancaire

---

*Document généré le 23 août 2026 — BankMatch IA Integration Guide v1.0*
