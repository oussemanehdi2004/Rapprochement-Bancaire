# Diagramme d'Architecture - Système de Rapprochement Bancaire

## 🏗️ Architecture Globale

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Angular)                             │
│                    ┌───────────────────────────┐                          │
│                    │   Fraud Dashboard UI       │                          │
│                    │   - Upload CSV             │                          │
│                    │   - Visualisation Alertes   │                          │
│                    │   - Configuration Seuils    │                          │
│                    │   - Analyse Graphe Neo4j    │                          │
│                    └─────────────┬─────────────┘                          │
│                                  │ HTTP/REST                               │
│                                  ▼                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
┌───────────────────────────────┐   ┌───────────────────────────────────────┐
│     BANKMATCH (Node.js)      │   │     API GATEWAY (NGINX)               │
│     - Validation JWT          │   │     - Reverse Proxy                   │
│     - Orchestration           │   │     - Load Balancing                  │
│     - Gestion Sessions        │   │     - SSL/TLS                         │
└───────────┬───────────────────┘   └───────────────┬───────────────────────┘
            │                                      │
            │ JWT Interne                          │ Route vers services
            ▼                                      ▼
┌───────────────────────────────┐   ┌───────────────────────────────────────┐
│   MULTI-BANKING (FastAPI)     │   │   FRAUD DETECTION (FastAPI)           │
│   Port: 8010                  │   │   Port: 8005                          │
│                               │   │                                       │
│   ┌─────────────────────────┐ │   │   ┌─────────────────────────────────┐ │
│   │  PARSERS               │ │   │   │  DÉTECTION HYBRIDE               │ │
│   │  - CSV Bank            │ │   │   │  ┌─────────────────────────────┐ │ │
│   │  - CAMT.053 (ISO 20022)│ │   │   │  │ 1. Règles Métiers           │ │ │
│   │  - MT940 (SWIFT)       │ │   │   │  │    - Seuils réglementaires  │ │ │
│   └───────────┬─────────────┘ │   │   │  │    - Patterns suspects      │ │ │
│               │               │   │   │  │    - Cash-out, mots-clés     │ │ │
│               ▼               │   │   │  └────────────┬────────────────┘ │ │
│   ┌─────────────────────────┐ │   │   │               │                  │ │
│   │  VALIDATORS             │ │   │   │  ┌────────────▼────────────────┐ │ │
│   │  - IBAN, Date, Montant  │ │   │   │  │ 2. Feature Engineering       │ │ │
│   │  - Détection Doublons   │ │   │   │  │    - 9 features ML           │ │ │
│   └───────────┬─────────────┘ │   │   │  │    - Erreurs de solde       │ │ │
│               │               │   │   │  └────────────┬────────────────┘ │ │
│               ▼               │   │   │               │                  │ │
│   ┌─────────────────────────┐ │   │   │  ┌────────────▼────────────────┐ │ │
│   │  PIVOT TRANSACTION      │ │   │   │  │ 3. Modèle ML (Random Forest)│ │ │
│   │  - Format Normalisé     │ │   │   │  │    - Score 0-100            │ │ │
│   │  - Hash SHA-256         │ │   │   │  │    - Explicabilité SHAP    │ │ │
│   └───────────┬─────────────┘ │   │   │  └────────────┬────────────────┘ │ │
│               │               │   │   │               │                  │ │
└───────────────┼───────────────┘   └───┼───────────────┼──────────────────┘
                │                       │               │
                │ HTTP/REST              │               │
                ▼                       │               │
        ┌───────────────┐               │               │
        │ BENCHMARKING  │               │               │
        │ & TESTS       │               │               │
        └───────────────┘               │               │
                                        │               │
                          ┌─────────────┴───────────────┐ │
                          │                             │ │
                          ▼                             ▼ │
                  ┌──────────────────┐         ┌──────────────────┐
                  │  SUPABASE        │         │   NEO4J          │
                  │  - fraud_alerts  │         │   - Comptes      │
                  │  - Transactions   │         │   - Transactions  │
                  │  - Configuration  │         │   - Réseaux      │
                  └──────────────────┘         └──────────────────┘
```

---

## 🔄 Flux de Traitement Détaillé

### Étape 1 : Upload et Parsing

```
Utilisateur
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Frontend Angular                                              │
│ - Sélection fichier (CSV/CAMT.053/MT940)                      │
│ - Upload vers Multi-Banking                                   │
└────────────────────┬────────────────────────────────────────┘
                     │ POST /api/multi-banking/ingest
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Multi-Banking API (FastAPI)                                  │
│                                                              │
│ 1. Parsing selon format                                       │
│    ├── csv_bank.py      → PivotTransaction                   │
│    ├── camt053.py       → PivotTransaction                   │
│    └── mt940.py         → PivotTransaction                   │
│                                                              │
│ 2. Validation (validators.py)                                 │
│    ├── Vérification IBAN                                      │
│    ├── Validation date ISO 8601                              │
│    ├── Montant non nul                                        │
│    └── Détection doublons (hash SHA-256)                      │
│                                                              │
│ 3. Conversion pour Fraud Detection                           │
│    └── build_fraud_payload()                                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
```

### Étape 2 : Analyse de Fraude

```
┌─────────────────────────────────────────────────────────────┐
│ Fraud Detection API (FastAPI)                                 │
│                                                              │
│ POST /api/analyze                                            │
│                                                              │
│ 1. Règles Métiers (rules_engine.py)                          │
│    ├── Phase 1 : Réglementaire                               │
│    │   ├── Seuil TRACFIN (>10k€)                             │
│    │   ├── Approche seuil (90%)                              │
│    │   ├── Cash-out (>5k€)                                   │
│    │   └── Mots-clés sensibles                               │
│    │                                                          │
│    ├── Phase 2 : Historique compte                           │
│    │   ├── Montant exceptionnel (x8 moyenne)                 │
│    │   ├── Compte dormant (>90 jours)                        │
│    │   └── Nouvel IBAN bénéficiaire                          │
│    │                                                          │
│    └── Phase 3 : Batch                                       │
│        ├── Paiements dupliqués                               │
│        ├── Paiements répétitifs                              │
│        └── Fractionnement (structuring)                      │
│                                                              │
│ 2. Feature Engineering (features.py)                         │
│    ├── amount                                                 │
│    ├── oldbalanceOrg, newbalanceOrig                         │
│    ├── oldbalanceDest, newbalanceDest                         │
│    ├── sender_balance_error                                  │
│    ├── receiver_balance_error                                │
│    ├── is_transfer, is_cash_out                              │
│                                                              │
│ 3. Modèle ML (Random Forest)                                 │
│    ├── Prédiction probabilité fraude                         │
│    ├── Score 0-100                                            │
│    └── Explicabilité SHAP                                     │
│                                                              │
│ 4. Analyse Graphe (graph_engine.py)                          │
│    ├── Détection réseaux de fraude                           │
│    ├── Paiements circulaires                                 │
│    └── Flux réciproques (collusion)                          │
│                                                              │
│ 5. Calcul de Confiance                                       │
│    ├── HIGH ≥ 85                                             │
│    ├── MEDIUM 70-84                                          │
│    └── LOW < 70                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
```

### Étape 3 : Persistance

```
┌─────────────────────────────────────────────────────────────┐
│ Persistance des Résultats                                   │
│                                                              │
│ SUPABASE (PostgreSQL)                                        │
│ ├── Table fraud_alerts                                       │
│ │   ├── tenant_id                                           │
│ │   ├── transaction_reference                               │
│ │   ├── isFraud                                              │
│ │   ├── fraudProbability                                     │
│ │   ├── score, confidence                                    │
│ │   ├── ruleCategory                                         │
│ │   └── explainability (SHAP)                                │
│ │                                                          │
│ └── Configuration                                            │
│     └── thresholds.json                                      │
│                                                              │
│ NEO4J (Graph Database)                                       │
│ ├── Nœuds : Account, Transaction, Alert                      │
│ ├── Relations : SENT, RECEIVED_BY, FLAGS                    │
│ └── Use cases :                                              │
│     ├── Réseaux de fraude                                    │
│     ├── Paiements circulaires                               │
│     └── Collusion (flux réciproques)                        │
└─────────────────────────────────────────────────────────────┘
```

### Étape 4 : Intégration BankMatch (Optionnel)

```
┌─────────────────────────────────────────────────────────────┐
│ Intégration BankMatch                                         │
│                                                              │
│ 1. Génération Token JWT (bankmatch_client.py)               │
│    ├── Service: multi-banking                                │
│    ├── Type: internal                                        │
│    └── Expiration: 30 minutes                                │
│                                                              │
│ 2. Import Transactions                                       │
│    POST BankMatch /api/import                                │
│    ├── Header: Authorization Bearer {token}                  │
│    └── Body: {transactions: [...]}                           │
│                                                              │
│ 3. Lancement Rapprochement                                   │
│    POST /reconciliation/sessions/:id/matching/start         │
│    ├── Header: Authorization Bearer {token}                  │
│    └── Déclenche le processus de matching                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Flux d'Authentification

### Mode Développement (Actuel)

```
Client
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ DISABLE_INTERNAL_AUTH=true                                   │
│                                                              │
│ Multi-Banking     Fraud Detection                            │
│     │                   │                                     │
│     └───── bypass ──────┘                                     │
│     (pas de validation)                                       │
└─────────────────────────────────────────────────────────────┘
```

### Mode Production (Cible)

```
Utilisateur
    │
    ▼ JWT User
┌─────────────────────────────────────────────────────────────┐
│ Frontend Angular                                            │
│ └─> Stocke token dans localStorage                           │
└────────────────────┬────────────────────────────────────────┘
                     │ Authorization Bearer
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ BankMatch (Node.js)                                          │
│ - Valide JWT utilisateur                                     │
│ - Génère JWT interne (30s validité)                         │
│ └─> INTERNAL_TOKEN (service-to-service)                     │
└────────────────────┬────────────────────────────────────────┘
                     │ Internal Token
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Multi-Banking (FastAPI)                                      │
│ - Valide INTERNAL_TOKEN                                      │
│ - Vérifie tenant_id, user_id                                 │
│ - Traite la requête                                          │
└────────────────────┬────────────────────────────────────────┘
                     │ Forward Internal Token
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Fraud Detection (FastAPI)                                   │
│ - Valide INTERNAL_TOKEN                                      │
│ - Vérifie tenant_id                                          │
│ - Analyse les transactions                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Schéma de Données

### PivotTransaction (Format Commun)

```python
class PivotTransaction:
    tenant_id: str              # Identifiant tenant
    bank_id: str                # Identifiant banque
    account_iban: str           # IBAN du compte
    value_date: str             # Date de valeur (ISO 8601)
    label: str                  # Libellé transaction
    amount: float               # Montant (signé)
    currency: str = "EUR"       # Devise
    counterparty_iban: str      # IBAN contrepartie
    reference: str              # Référence transaction
    source_format: str          # Format source (csv/camt053/mt940)
    source_line_hash: str       # Hash SHA-256 (déduplication)
    balance_before: float       # Solde avant
    balance_after: float        # Solde après
```

### TransactionOutput (Format Fraud Detection)

```python
class TransactionOutput:
    tenant_id: str
    transaction_reference: str  # Hash SHA-256
    id: str
    date: str
    description: str
    amount: float
    isFraud: bool
    fraudProbability: float
    score: int                  # 0-100
    confidence: str            # HIGH/MEDIUM/LOW
    reconciliationStatus: str
    ruleCategory: str
    explainability: {
        summary: str,
        factors: List[str],
        shap_contributions: List[ShapContribution]
    }
```

---

## 🗄️ Schéma de Base de Données

### Supabase (PostgreSQL)

```sql
-- Table fraud_alerts
CREATE TABLE fraud_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    transaction_reference VARCHAR(255) NOT NULL,
    transaction_id VARCHAR(255),
    date TIMESTAMP NOT NULL,
    description TEXT,
    amount DECIMAL(15,2) NOT NULL,
    is_fraud BOOLEAN DEFAULT false,
    fraud_probability DECIMAL(5,4),
    score INTEGER,
    confidence VARCHAR(10),
    reconciliation_status VARCHAR(50),
    rule_category VARCHAR(100),
    explainability JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour performances
CREATE INDEX idx_fraud_alerts_tenant ON fraud_alerts(tenant_id);
CREATE INDEX idx_fraud_alerts_is_fraud ON fraud_alerts(is_fraud);
CREATE INDEX idx_fraud_alerts_date ON fraud_alerts(date);
```

### Neo4j (Graph Database)

```cypher
-- Nœuds
(:Account {iban: "FR76...", tenant_id: "tenant-123"})
(:Transaction {id: "tx-001", amount: 1000.0, is_fraud: false})
(:Alert {tx_id: "tx-001", category: "SEUIL_REGLEMENTAIRE"})

-- Relations
(:Account)-[:SENT]->(:Transaction)
(:Transaction)-[:RECEIVED_BY]->(:Account)
(:Alert)-[:FLAGS]->(:Account)

-- Exemple de requête réseau de fraude
MATCH (acc:Account)<-[:FLAGS]-(a:Alert)
WITH acc, count(a) AS alert_count
WHERE alert_count >= 3
RETURN acc.iban, alert_count
```

---

## 🧪 Tests et Validation

### Pyramide de Tests

```
                    ┌─────────────────┐
                    │  E2E Tests      │
                    │  (Sélénium)     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Integration     │
                    │ Tests           │
                    │ (Docker Compose)│
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼────────┐  ┌───────▼────────┐
│ Unit Tests     │  │ Unit Tests      │  │ Unit Tests     │
│ Multi-Banking │  │ Fraud Detection │  │ Frontend       │
│ (pytest)       │  │ (pytest)        │  │ (Jest/Karma)   │
└────────────────┘  └─────────────────┘  └────────────────┘
```

### Commandes de Test

```bash
# Tests Fraud Detection
cd fraud-detection/backend
pytest tests/ -v
pytest tests/test_rules_engine.py -v
pytest tests/test_graph_engine.py -v

# Tests Multi-Banking
cd multi-banking
pytest tests/ -v
pytest tests/test_csv_parser.py -v
pytest tests/test_ingest_integration.py -v

# Tests Frontend
cd fraud-detection/frontend
ng test
ng e2e
```

---

## 📈 Monitoring et Observabilité

### Logging Structuré

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-08-08T10:30:00Z",
  "level": "INFO",
  "service": "fraud-detection",
  "method": "POST",
  "path": "/api/analyze",
  "status_code": 200,
  "duration_ms": 123.45,
  "environment": "development",
  "tenant_id": "tenant-123",
  "user_id": "user-456"
}
```

### Métriques Recommandées

```
# Prometheus Metrics
fraud_detection_requests_total{endpoint="/api/analyze", status="200"}
fraud_detection_analysis_duration_seconds{quantile="0.95"}
fraud_detection_ml_predictions_total{is_fraud="true"}
fraud_detection_rules_triggered_total{category="SEUIL_REGLEMENTAIRE"}

# Health Checks
/fraud/health
/banking/health
```

---

## 🚀 Déploiement Production

### Architecture Production

```
                    ┌─────────────────┐
                    │   Load Balancer │
                    │   (AWS ALB)     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
      ┌───────▼──────┐ ┌────▼─────┐ ┌────▼─────┐
      │   Instance 1  │ │Instance 2│ │Instance 3│
      │   Docker     │ │  Docker  │ │  Docker  │
      └───────┬──────┘ └────┬─────┘ └────┬─────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
      ┌───────▼──────┐ ┌────▼─────┐ ┌────▼─────┐
      │   Neo4j      │ │ Supabase │ │  Redis   │
      │   Cluster    │ │  (RDS)   │ │  Cache   │
      └──────────────┘ └──────────┘ └──────────┘
```

### CI/CD Pipeline

```
Git Push
    │
    ▼
GitHub Actions / GitLab CI
    │
    ├──► Linting (ESLint, Pylint)
    ├──► Unit Tests (pytest, Jest)
    ├──► Build Docker Images
    ├──► Security Scan (Trivy)
    └──► Push to Registry
         │
         ▼
    Kubernetes / ECS
         │
         ▼
    Production Environment
```

---

**Document créé pour la réunion d'intégration technique**
**Date** : 2026-08-08
**Version** : v1.0
