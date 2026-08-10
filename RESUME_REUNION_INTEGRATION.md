# Résumé Réunion Intégration - Présentation Technique

## 🎯 Objectif de la Réunion
Présenter l'architecture technique du système de rapprochement bancaire avec détection de fraude par IA pour faciliter l'intégration de l'équipe.

---

## 📐 Architecture en 3 Microservices

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Angular)                        │
│                  Dashboard Fraude Detection                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              BANKMATCH (Node.js - Backend Central)          │
│              Validation JWT + Orchestration                  │
└──────┬──────────────────────┬───────────────────────────────┘
       │                      │
       ▼                      ▼
┌─────────────────┐   ┌─────────────────┐
│  MULTI-BANKING  │   │ FRAUD DETECTION │
│  (FastAPI)      │   │  (FastAPI)      │
│  Port: 8010     │   │  Port: 8005     │
└────────┬────────┘   └────────┬────────┘
         │                      │
         └──────────┬───────────┘
                    ▼
         ┌─────────────────────┐
         │   BASES DE DONNÉES   │
         │  • Neo4j (Graphes)   │
         │  • Supabase (Alertes)│
         └─────────────────────┘
```

---

## 🔧 MODULE 1 : Fraud Detection (Backend Principal)

### Fichiers Clés et Rôles

| Fichier | Rôle | Importance |
|---------|------|------------|
| **main.py** | API FastAPI principale, endpoints, authentification | ⭐⭐⭐⭐⭐ |
| **rules_engine.py** | Moteur de règles métiers (réglementation, patterns) | ⭐⭐⭐⭐⭐ |
| **features.py** | Feature engineering pour ML (9 features) | ⭐⭐⭐⭐ |
| **graph_engine.py** | Analyse de graphes Neo4j (réseaux de fraude) | ⭐⭐⭐⭐ |
| **auth.py** | Gestion JWT (authentification) | ⭐⭐⭐⭐ |
| **config_store.py** | Configuration seuils (JSON atomique) | ⭐⭐⭐ |
| **internal_auth.py** | Validation tokens internes service-to-service | ⭐⭐⭐⭐ |

### Fonctionnalités Principales

**1. Détection Hybride (3 couches)**
```
Règles Métiers ──> Modèle ML (Random Forest) ──> Analyse Graphe (Neo4j)
     │                    │                          │
     ▼                    ▼                          ▼
Seuils réglementaires   Score de probabilité     Réseaux de fraude
Patterns suspects       Explicabilité SHAP       Paiements circulaires
```

**2. Règles Métiers Implémentées**
- ✅ Seuil réglementaire TRACFIN (>10k€)
- ✅ Approche du seuil (90%)
- ✅ Retrait cash suspect (>5k€)
- ✅ Mots-clés sensibles (CASINO, PARIS, POKER, etc.)
- ✅ Montant exceptionnel (x8 moyenne)
- ✅ Compte dormant (>90 jours)
- ✅ Nouvel IBAN bénéficiaire
- ✅ Paiements dupliqués/répétitifs
- ✅ Fractionnement (structuring)

**3. Modèle Machine Learning**
- **Algorithme** : Random Forest
- **Features** : 9 variables (montant, soldes, erreurs, types)
- **Explicabilité** : SHAP values pour comprendre les décisions
- **Score** : 0-100 avec niveaux de confiance (HIGH ≥85, MEDIUM 70-84, LOW <70)

### Endpoints API Principaux

```python
POST /api/analyze              # Analyse batch de transactions
GET  /api/transactions         # Récupération des transactions
GET  /api/alerts               # Récupération des alertes
POST /api/config/thresholds    # Mise à jour des seuils
GET  /api/graph/network       # Analyse de graphe Neo4j
GET  /health                   # Health check
```

---

## 🏦 MODULE 2 : Multi-Banking

### Fichiers Clés et Rôles

| Fichier | Rôle | Importance |
|---------|------|------------|
| **main.py** | API FastAPI ingestion, orchestration parsing | ⭐⭐⭐⭐⭐ |
| **bankmatch_client.py** | Client BankMatch (JWT service-to-service) | ⭐⭐⭐⭐ |
| **models.py** | Schéma de données pivot (format commun) | ⭐⭐⭐⭐ |
| **internal_auth.py** | Validation tokens internes | ⭐⭐⭐⭐ |
| **parsers/csv_bank.py** | Parseur CSV bancaire | ⭐⭐⭐ |
| **parsers/camt053.py** | Parseur ISO 20022 CAMT.053 | ⭐⭐⭐ |
| **parsers/mt940.py** | Parseur SWIFT MT940 | ⭐⭐⭐ |
| **validators.py** | Validation transactions (IBAN, date, doublons) | ⭐⭐⭐ |

### Fonctionnalités Principales

**1. Parsing Multi-Formats**
```
Fichier Bancaire
    ├── CSV ──> PivotTransaction
    ├── CAMT.053 (ISO 20022) ──> PivotTransaction
    └── MT940 (SWIFT) ──> PivotTransaction
```

**2. Validation**
- ✅ Vérification IBAN
- ✅ Validation date ISO 8601
- ✅ Montant non nul
- ✅ Détection doublons (hash SHA-256)

**3. Intégration**
- **Fraud Detection** : Appel automatique après parsing
- **BankMatch** : Import des transactions (optionnel)

### Endpoints API Principaux

```python
POST /api/multi-banking/parse    # Parsing de fichier
POST /api/multi-banking/validate # Validation de transactions
POST /api/multi-banking/ingest   # Ingestion complète
GET  /health                     # Health check
```

---

## 🎨 MODULE 3 : Frontend Angular

### Fichiers Clés et Rôles

| Fichier | Rôle | Importance |
|---------|------|------------|
| **fraud-dashboard.component.ts** | Dashboard principal, orchestration UI | ⭐⭐⭐⭐⭐ |
| **fraud-alerts.service.ts** | Service API Fraud Detection | ⭐⭐⭐⭐⭐ |
| **graph.service.ts** | Service analyse de graphe Neo4j | ⭐⭐⭐⭐ |
| **config.service.ts** | Service configuration seuils | ⭐⭐⭐ |
| **api/** | Client TypeScript généré (OpenAPI) | ⭐⭐⭐⭐ |

### Interface Utilisateur (6 Onglets)

```
┌─────────────────────────────────────────┐
│ 📊 Overview       Vue d'ensemble KPIs │
│ 🔍 Hybrid         Détection hybride     │
│ 🕸️ Graph          Réseaux & Graphe      │
│ 📈 SHAP           Explicabilité ML      │
│ 📋 Rules          Règles métiers       │
│ ⚙️ Config         Configuration seuils  │
└─────────────────────────────────────────┘
```

### Fonctionnalités UI

- ✅ Upload CSV pour analyse
- ✅ Visualisation des alertes de fraude
- ✅ Exploration des réseaux de comptes
- ✅ Configuration dynamique des seuils
- ✅ Visualisation SHAP (explicabilité ML)

---

## 🔗 Interrelations Entre Modules

### Flux de Données Complet

```
1. UPLOAD FICHIER
   Utilisateur ──> Frontend Angular
                    └─> Multi-Banking API
                       ├─> Parsing (CSV/CAMT.053/MT940)
                       ├─> Validation
                       └─> PivotTransaction

2. ANALYSE FRAUDE
   PivotTransaction ──> Fraud Detection API
                        ├─> Règles Métiers
                        ├─> Feature Engineering
                        ├─> Modèle ML (Random Forest)
                        ├─> SHAP (Explicabilité)
                        └─> Graphe Neo4j

3. PERSISTANCE
   Résultats ──> Supabase (Alertes)
              └─> Neo4j (Réseaux)

4. INTEGRATION BANKMATCH (optionnel)
   Transactions ──> BankMatch /api/import
                  └─> Rapprochement automatique
```

### Communication Service-to-Service

```
┌─────────────────┐    JWT interne     ┌─────────────────┐
│ Multi-Banking   │ ────────────────> │ Fraud Detection │
│   (FastAPI)     │                   │   (FastAPI)     │
└────────┬────────┘                   └─────────────────┘
         │
         │ JWT service
         ▼
┌─────────────────┐
│   BankMatch     │
│   (Node.js)     │
└─────────────────┘
```

---

## 🔐 Sécurité et Authentification

### Pattern d'Authentification

**Mode Développement** (actuel) :
```bash
DISABLE_INTERNAL_AUTH=true  # Contourne l'authentification
```

**Mode Production** (cible) :
```
Utilisateur ──JWT utilisateur──> Frontend
                           │
                           └─JWT interne──> BankMatch
                                         │
                                         └─JWT interne──> Multi-Banking
                                                       │
                                                       └─JWT interne──> Fraud Detection
```

### Variables d'Environnement Clés

```bash
# Authentification
JWT_SECRET=secret_jwt
INTERNAL_SERVICE_SECRET=secret_interne
MULTI_BANKING_SERVICE_SECRET=secret_bankmatch

# Services
FRAUD_SERVICE_URL=http://localhost:8005
BANKMATCH_BASE_URL=http://localhost:4090/api
BANKMATCH_INTEGRATION_ENABLED=false

# Bases de données
SUPABASE_URL=...
SUPABASE_KEY=...
NEO4J_URI=bolt://neo4j_db:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=...
```

---

## 🚀 Déploiement Docker

### Services Conteneurisés

```yaml
Services:
  - neo4j_db        : Base de données graphe (port 7474, 7687)
  - fraud-service   : API Fraud Detection (port 8005)
  - multi-banking   : API Multi-Banking (port 8010)
  - api-gateway     : NGINX reverse proxy (port 80)
```

### Commandes de Déploiement

```bash
# Lancement complet
cd fraud-detection
docker-compose up --build

# Health checks
curl http://localhost:8005/health    # Fraud Detection
curl http://localhost:8010/health    # Multi-Banking
```

---

## 📊 Points Techniques Importants

### 1. Format de Données
- **Champ clé** : `transaction_reference` (ex-`mongo_transaction_id`)
- **Type** : Hash SHA-256 (pas de vrai MongoDB ObjectId)
- **Raison** : Sémantique correcte des données

### 2. Communication API
- **Format réponse** : `APIResponse[T]` (normalisé)
- **Headers** : Authorization Bearer + X-Request-ID
- **Erreurs** : Structurées avec codes HTTP

### 3. Configuration
- **Seuils** : Configurables via API (`/api/config/thresholds`)
- **Persistance** : JSON atomique (thresholds.json)
- **Thread-safe** : Accès concurrents protégés

### 4. Mode Dégradé
- **Neo4j** : Optionnel (si non configuré, pas d'erreur)
- **Supabase** : Optionnel (si non configuré, pas de persistance)
- **Modèle ML** : Optionnel (si absent, règles uniquement)

---

## 🎯 Checklist Intégration

### Pour l'Équipe Backend
- [ ] Comprendre le flux Multi-Banking → Fraud Detection
- [ ] Configurer les variables d'environnement
- [ ] Tester les endpoints API
- [ ] Vérifier l'authentification JWT
- [ ] Valider le format de données `transaction_reference`

### Pour l'Équipe Frontend
- [ ] Mettre à jour les types TypeScript
- [ ] Adapter l'UI aux nouveaux champs
- [ ] Tester les flux utilisateur complets
- [ ] Valider l'intégration authentification

### Pour l'Équipe DevOps
- [ ] Configurer Docker Compose
- [ ] Définir les secrets de production
- [ ] Mettre en place les backups
- [ ] Configurer le monitoring

---

## 📚 Documentation Disponible

- **GUIDE_INTEGRATION_REUNION.md** : Guide complet détaillé
- **ARCHITECTURE_DECISIONS.md** : Décisions d'architecture
- **RAPPORT_IMPLEMENTATION.md** : Rapport d'implémentation
- **backend_README.md** : Documentation API Fraud Detection
- **README.md** : Documentation projet globale

---

## 🆘 Points de Contact

**Questions techniques** :
- Architecture : Voir `ARCHITECTURE_DECISIONS.md`
- API Fraud Detection : Voir `backend_README.md`
- Integration : Voir `GUIDE_INTEGRATION_REUNION.md`

**Support développement** :
- Tests : `pytest` dans chaque module
- Logs : Logging structuré JSON avec request ID
- Health checks : `/health` sur chaque service

---

**Préparé pour la réunion d'intégration technique - Lundi**
**Date** : 2026-08-08
**Version** : v0.1.0
**Statut** : Prêt pour intégration
