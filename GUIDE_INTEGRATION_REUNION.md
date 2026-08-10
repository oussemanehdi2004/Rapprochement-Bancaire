# Guide d'Intégration - Réunion Technique

## 🎯 Objectif de la Réunion
Présenter l'architecture technique, les rôles de chaque fichier et les interrelations entre les composants du système de rapprochement bancaire avec détection de fraude par IA.

---

## 📐 Architecture Globale du Système

### Vue d'Ensemble
Le système est composé de **3 microservices** indépendants qui communiquent via des APIs REST :

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   BankMatch     │────▶│ Multi-Banking  │
│   (Angular)     │     │   (Node.js)     │     │   (FastAPI)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                      │
                                                      ▼
                                            ┌─────────────────┐
                                            │ Fraud Detection│
                                            │   (FastAPI)     │
                                            └─────────────────┘
```

### Technologies Principales
- **Backend** : Python FastAPI
- **Frontend** : Angular 17+
- **Base de données** : Neo4j (graphes), Supabase (persistance)
- **ML** : Random Forest + SHAP (explicabilité)
- **Authentication** : JWT (service-to-service)
- **Containerisation** : Docker Compose

---

## 📁 Structure du Projet

```
rapprochement-bancaire/
├── fraud-detection/          # Service principal de détection de fraude
│   ├── backend/              # API FastAPI
│   ├── frontend/             # Application Angular
│   ├── docs/                 # Documentation
│   └── docker-compose.yml    # Orchestration Docker
├── multi-banking/            # Service d'ingestion multi-bancaire
│   ├── parsers/              # Parseurs de fichiers bancaires
│   ├── tests/                # Tests unitaires
│   └── main.py               # API FastAPI
└── ARCHITECTURE_DECISIONS.md # Décisions d'architecture
```

---

## 🔧 MODULE 1 : Fraud Detection (Principal)

### Fichiers Principaux et Rôles

#### 1. **main.py** - Point d'entrée API FastAPI
**Rôle** : Cœur de l'API de détection de fraude
**Fonctionnalités** :
- Configuration FastAPI et middleware CORS
- Authentification JWT (utilisateur et service-to-service)
- Endpoints principaux : `/api/analyze`, `/api/transactions`, `/api/alerts`
- Intégration du modèle ML (Random Forest)
- Persistance des alertes dans Supabase
- Logging structuré avec request ID

**Endpoints clés** :
```python
POST /api/analyze              # Analyse batch de transactions
GET  /api/transactions         # Récupération des transactions
GET  /api/alerts               # Récupération des alertes de fraude
POST /api/config/thresholds    # Mise à jour des seuils
GET  /api/graph/network       # Analyse de graphe Neo4j
```

**Interrelations** :
- Utilise `rules_engine.py` pour les règles métiers
- Utilise `features.py` pour le feature engineering
- Utilise `graph_engine.py` pour l'analyse de graphe
- Utilise `auth.py` pour l'authentification
- Utilise `config_store.py` pour la configuration

---

#### 2. **rules_engine.py** - Moteur de Règles Métiers
**Rôle** : Implémente les règles de détection de fraude basées sur la réglementation
**Fonctionnalités** :
- **Phase 1** : Règles réglementaires (seuils TRACFIN >10k€, cash-out >5k€)
- **Phase 2** : Règles avancées (montants inhabituels, comptes dormants, nouveaux IBAN)
- **Phase 3** : Règles batch (doublons, paiements répétitifs, fractionnement)

**Règles implémentées** :
```python
- SEUIL_REGLEMENTAIRE (>10k€)        # Déclaration TRACFIN
- SEUIL_APPROCHE (90% du seuil)      # Contournement suspect
- SEUIL_CASH_OUT (>5k€)              # Retrait cash suspect
- MOTS_CLES_SENSIBLES (CASINO, PARIS, POKER, etc.)
- MONTANT_EXCEPTIONNEL (x8 moyenne du compte)
- COMPTE_RAREMENT_UTILISE (>90 jours inactif)
- NOUVEL_IBAN (premier virement vers un nouveau bénéficiaire)
- PAIEMENT_DUPLIQUE (transactions identiques)
- PAIEMENT_REPETITIF (3+ transactions identiques)
- FRACTIONNEMENT (détection de structuring)
```

**Interrelations** :
- Utilise `config_store.py` pour les seuils configurables
- Appelé par `main.py` pour chaque transaction
- Dépend du schéma `TransactionInput`

---

#### 3. **features.py** - Feature Engineering ML
**Rôle** : Prépare les données pour le modèle Machine Learning
**Fonctionnalités** :
- Définit les features utilisées par le modèle Random Forest
- Calcule les erreurs de solde (émetteur/destinataire)
- Assure la cohérence entre entraînement et inférence

**Features ML** :
```python
FEATURE_NAMES = [
    "amount",                    # Montant de la transaction
    "oldbalanceOrg",            # Solde avant émetteur
    "newbalanceOrig",           # Solde après émetteur
    "oldbalanceDest",           # Solde avant destinataire
    "newbalanceDest",           # Solde après destinataire
    "sender_balance_error",     # Écart solde émetteur
    "receiver_balance_error",   # Écart solde destinataire
    "is_transfer",              # Type de transaction
    "is_cash_out",              # Indicateur cash-out
]
```

**Interrelations** :
- Utilisé par `main.py` pour préparer les données ML
- Utilisé par `benchmark_fraud.py` pour l'entraînement
- Formules partagées entre entraînement et production

---

#### 4. **auth.py** - Authentification JWT
**Rôle** : Gère l'authentification JWT pour les appels API
**Fonctionnalités** :
- Chargement du secret JWT depuis l'environnement
- Génération de tokens internes (service-to-service)
- Validation des tokens utilisateur

**Interrelations** :
- Utilisé par `main.py` pour la dépendance `get_current_user_context`
- Partagé avec `test_token.py` pour les tests
- Secret stocké dans `JWT_SECRET` (variable d'environnement)

---

#### 5. **graph_engine.py** - Moteur de Graphe Neo4j (Phase 3)
**Rôle** : Analyse les réseaux de fraude et les patterns suspects
**Fonctionnalités** :
- Détection de réseaux de fraude (comptes avec 3+ alertes)
- Détection de paiements circulaires (money laundering)
- Détection de collusion (flux réciproques suspects)
- Visualisation des réseaux de comptes

**Requêtes Neo4j** :
```cypher
# Réseau de fraude
MATCH (acc:Account {iban: $iban})<-[:FLAGS]-(a:Alert)
WHERE count(a) >= $min_alerts
RETURN acc.iban, count(a)

# Paiements circulaires
MATCH path = (start)-[:SENT|RECEIVED_BY*]->(start)
RETURN nodes(path)

# Flux réciproques
MATCH (a)-[:SENT]->(t1)-[:RECEIVED_BY]->(b)
MATCH (b)-[:SENT]->(t2)-[:RECEIVED_BY]->(a)
RETURN b, count(t1), count(t2)
```

**Interrelations** :
- Utilisé par `main.py` pour les endpoints de graphe
- Dépend de Neo4j (optionnel)
- Appelé après l'analyse ML pour enrichir les résultats

---

#### 6. **config_store.py** - Gestion de Configuration
**Rôle** : Stocke et gère les seuils réglementaires configurables
**Fonctionnalités** :
- Persistance JSON atomique (thresholds.json)
- Mise en cache en mémoire avec validation mtime
- Protection contre la corruption de fichier
- Thread-safe pour les accès concurrents

**Seuils configurables** :
```json
{
  "SEUIL_REGLEMENTAIRE": 10000.0,
  "SEUIL_APPROCHE_RATIO": 0.90,
  "SEUIL_CASH_OUT": 5000.0,
  "SEUIL_MONTANT_ABERRANT": 1000000000.0,
  "RATIO_MONTANT_INHABITUEL": 8.0,
  "SEUIL_JOURS_COMPTE_DORMANT": 90,
  "MOTS_CLES_SENSIBLES": ["CASINO", "PARIS", "POKER", ...]
}
```

**Interrelations** :
- Utilisé par `rules_engine.py` pour récupérer les seuils
- Endpoint `/api/config/thresholds` dans `main.py`
- Fichier `thresholds.json` pour la persistance

---

#### 7. **internal_auth.py** - Authentification Interne
**Rôle** : Validation des tokens JWT internes (service-to-service)
**Fonctionnalités** :
- Vérification des tokens internes avec `INTERNAL_SERVICE_SECRET`
- Support du mode développement (`DISABLE_INTERNAL_AUTH`)
- Extraction du `tenant_id` et `user_id`
- Forward du token brut vers d'autres services

**Interrelations** :
- Utilisé comme dépendance FastAPI dans les endpoints
- Partagé entre fraud-detection et multi-banking
- Compatible avec le pattern d'authentification BankMatch

---

### Fichiers de Test et Utilitaires

#### 8. **tests/** - Tests Unitaires
- `test_api.py` : Tests des endpoints API
- `test_auth.py` : Tests d'authentification
- `test_rules_engine.py` : Tests du moteur de règles
- `test_graph_engine.py` : Tests du moteur de graphe
- `test_ml_fusion.py` : Tests de la fusion ML + règles
- `test_preprocess.py` : Tests de prétraitement

#### 9. **generate_sample_banking_data.py**
**Rôle** : Génère des données bancaires synthétiques pour les tests
**Fonctionnalités** :
- Crée des transactions réalistes avec patterns de fraude
- Utile pour le développement et les tests

#### 10. **benchmark_fraud.py**
**Rôle** : Entraînement et évaluation du modèle ML
**Fonctionnalités** :
- Entraîne un modèle Random Forest sur des données historiques
- Génère des visualisations SHAP pour l'explicabilité
- Sauvegarde le modèle dans `model_fraud.pkl`

---

## 🏦 MODULE 2 : Multi-Banking

### Fichiers Principaux et Rôles

#### 1. **main.py** - API FastAPI Multi-Banking
**Rôle** : Service d'ingestion de fichiers bancaires multi-formats
**Fonctionnalités** :
- Parsing de fichiers (CSV, CAMT.053, MT940)
- Validation des transactions
- Intégration avec Fraud Detection
- Intégration avec BankMatch (optionnelle)

**Endpoints clés** :
```python
POST /api/multi-banking/parse    # Parsing de fichier
POST /api/multi-banking/validate # Validation de transactions
POST /api/multi-banking/ingest   # Ingestion complète (parsing + fraud analysis)
GET  /health                     # Health check
```

**Interrelations** :
- Utilise les parseurs dans `parsers/`
- Utilise `validators.py` pour la validation
- Appelle Fraud Detection via `FRAUD_SERVICE_URL`
- Appelle BankMatch via `bankmatch_client.py`

---

#### 2. **bankmatch_client.py** - Client BankMatch
**Rôle** : Communication avec l'API BankMatch
**Fonctionnalités** :
- Génération de tokens JWT service-to-service
- Import de transactions vers BankMatch
- Lancement du processus de rapprochement

**Flux d'intégration** :
```python
1. generate_service_token()  # Génère un JWT interne
2. import_transactions()     # POST /api/import
3. start_matching()          # POST /reconciliation/sessions/:id/matching/start
```

**Interrelations** :
- Utilisé par `main.py` dans l'endpoint `/ingest`
- Dépend de `BANKMATCH_BASE_URL` et `MULTI_BANKING_SERVICE_SECRET`
- Activé/désactivé via `BANKMATCH_INTEGRATION_ENABLED`

---

#### 3. **models.py** - Modèles de Données
**Rôle** : Définit le schéma de données pivot (format commun)
**Fonctionnalités** :
- `PivotTransaction` : Format normalisé pour tous les parseurs
- Calcul de hash SHA-256 pour la déduplication
- Support des champs optionnels (soldes, contreparties)

**Schéma Pivot** :
```python
class PivotTransaction:
    tenant_id: str
    bank_id: str
    account_iban: str
    value_date: str
    label: str
    amount: float
    currency: str = "EUR"
    counterparty_iban: Optional[str]
    reference: Optional[str]
    source_format: str
    source_line_hash: Optional[str]
    balance_before: Optional[float]
    balance_after: Optional[float]
```

**Interrelations** :
- Utilisé par tous les parseurs (`parsers/`)
- Converti en format Fraud Detection via `build_fraud_payload()`
- Hash utilisé pour la déduplication

---

#### 4. **internal_auth.py** - Authentification Interne
**Rôle** : Identique à fraud-detection mais pour multi-banking
**Fonctionnalités** :
- Validation des tokens JWT internes
- Support du mode développement
- Extraction du contexte d'authentification

**Interrelations** :
- Partagé avec fraud-detection (même logique)
- Utilisé comme dépendance FastAPI
- Compatible avec le pattern BankMatch

---

### Parseurs de Fichiers Bancaires

#### 5. **parsers/csv_bank.py** - Parseur CSV
**Rôle** : Parse les fichiers CSV bancaires
**Fonctionnalités** :
- Lit les fichiers CSV avec colonnes standard
- Convertit en `PivotTransaction`
- Calcule le hash de chaque ligne

**Colonnes attendues** :
```csv
account_iban, value_date, label, amount, currency, counterparty_iban, reference
```

#### 6. **parsers/camt053.py** - Parseur CAMT.053
**Rôle** : Parse les fichiers ISO 20022 CAMT.053 (standard européen)
**Fonctionnalités** :
- Parse le format XML CAMT.053
- Extrait les transactions et les soldes
- Gère les transactions groupées

#### 7. **parsers/mt940.py** - Parseur MT940
**Rôle** : Parse les fichiers SWIFT MT940 (standard international)
**Fonctionnalités** :
- Parse le format SWIFT MT940
- Gère les tags et segments SWIFT
- Extrait les soldes d'ouverture/fermeture

---

#### 8. **validators.py** - Validation de Transactions
**Rôle** : Valide les transactions après parsing
**Fonctionnalités** :
- Vérifie la présence de l'IBAN
- Valide le format de date (ISO 8601)
- Vérifie que le montant n'est pas nul
- Détecte les doublons via hash

**Interrelations** :
- Utilisé par `main.py` dans l'endpoint `/validate`
- Appelé après parsing pour garantir la qualité des données

---

### Tests Multi-Banking

#### 9. **tests/** - Tests Unitaires
- `test_csv_parser.py` : Tests du parseur CSV
- `test_camt053_parser.py` : Tests du parseur CAMT.053
- `test_mt940_parser.py` : Tests du parseur MT940
- `test_ingest_integration.py` : Tests d'intégration complets

---

## 🎨 MODULE 3 : Frontend Angular

### Fichiers Principaux et Rôles

#### 1. **fraud-dashboard.component.ts** - Dashboard Principal
**Rôle** : Interface utilisateur principale pour la détection de fraude
**Fonctionnalités** :
- Analyse de transactions via upload CSV
- Visualisation des alertes de fraude
- Exploration des réseaux de graphe
- Configuration des seuils métiers
- Visualisation SHAP (explicabilité ML)

**Onglets de l'interface** :
```typescript
- overview       : Vue d'ensemble des KPIs
- hybrid         : Détection hybride (règles + ML)
- graph          : Réseaux et analyse de graphe
- shap           : Explicabilité des prédictions ML
- rules          : Détail des règles métiers
- config         : Configuration des seuils
```

**Interrelations** :
- Utilise `FraudAlertsService` pour les appels API
- Utilise `GraphService` pour l'analyse de graphe
- Utilise `ConfigService` pour la configuration
- Communique avec le backend Fraud Detection

---

#### 2. **fraud-alerts.service.ts** - Service API Fraud
**Rôle** : Service Angular pour la communication avec l'API Fraud Detection
**Fonctionnalités** :
- Analyse de transactions (`/api/analyze`)
- Récupération des transactions (`/api/transactions`)
- Gestion des états de chargement
- Mapping des données pour l'UI
- Injection du token JWT dans les headers

**Interrelations** :
- Injecté dans `FraudDashboardComponent`
- Communique avec le backend FastAPI
- Gère les erreurs HTTP

---

#### 3. **graph.service.ts** - Service Graphe
**Rôle** : Service pour l'analyse de graphe Neo4j
**Fonctionnalités** :
- Récupération des réseaux de comptes
- Détection de patterns suspects
- Préparation des données pour la visualisation

**Interrelations** :
- Utilisé par `FraudDashboardComponent` (onglet graph)
- Communique avec `/api/graph/network`
- Transforme les données Neo4j en format UI

---

#### 4. **config.service.ts** - Service Configuration
**Rôle** : Gestion de la configuration des seuils
**Fonctionnalités** :
- Récupération des seuils actuels
- Mise à jour des seuils
- Validation des valeurs

**Interrelations** :
- Utilisé par `FraudDashboardComponent` (onglet config)
- Communique avec `/api/config/thresholds`

---

### API Générée (OpenAPI)

#### 5. **api/** - API Client Généré
**Rôle** : Client TypeScript généré depuis la spécification OpenAPI
**Fonctionnalités** :
- Types TypeScript fortement typés
- Services HTTP automatiques
- Configuration de l'API

**Fichiers clés** :
- `api.ts` : Configuration et client HTTP
- `model/models.ts` : Modèles de données
- `default.service.ts` : Service par défaut

**Interrelations** :
- Généré automatiquement depuis `backend/api-spec.yaml`
- Utilisé par les composants Angular
- Assure la cohérence frontend/backend

---

## 🐳 MODULE 4 : Infrastructure Docker

### docker-compose.yml
**Rôle** : Orchestration des services conteneurisés
**Services** :
```yaml
neo4j_db        : Base de données graphe
fraud-service   : API Fraud Detection (port 8005)
multi-banking   : API Multi-Banking (port 8010)
api-gateway     : NGINX reverse proxy (port 80)
```

**Réseau** :
- `banking_net` : Réseau Docker pour la communication entre services

**Volumes** :
- `neo4j_data` : Persistance des données Neo4j

---

## 🔗 Interrelations Entre Modules

### Flux de Données Complet

```
1. Upload Fichier Bancaire
   └─> Frontend (Angular)
       └─> Multi-Banking API (/api/multi-banking/ingest)
           ├─> Parsing (CSV/CAMT.053/MT940)
           ├─> Validation
           └─> Conversion en format Fraud Detection

2. Analyse de Fraude
   └─> Fraud Detection API (/api/analyze)
       ├─> Moteur de Règles (rules_engine.py)
       ├─> Feature Engineering (features.py)
       ├─> Modèle ML (Random Forest)
       ├─> Explicabilité SHAP
       └─> Analyse de Graphe (Neo4j)

3. Persistance
   └─> Supabase (Alertes de fraude)
   └─> Neo4j (Réseaux de comptes)

4. Intégration BankMatch (optionnelle)
   └─> BankMatch API (/api/import)
       └─> Lancement du rapprochement
```

### Communication Service-to-Service

```
Multi-Banking ──JWT interne──> Fraud Detection
     │
     └─JWT service──> BankMatch (/api/import)
```

### Authentification

```
Utilisateur ──JWT utilisateur──> Frontend
     │
     └─JWT interne──> BankMatch
                           │
                           └─JWT interne──> Multi-Banking
                                            │
                                            └─JWT interne──> Fraud Detection
```

---

## 🔐 Sécurité et Authentification

### Pattern d'Authentification

**Mode Développement** :
```bash
DISABLE_INTERNAL_AUTH=true  # Contourne l'authentification
```

**Mode Production** :
```bash
DISABLE_INTERNAL_AUTH=false
INTERNAL_SERVICE_SECRET=secret_unique_par_service
```

### Variables d'Environnement

**Fraud Detection** :
```bash
JWT_SECRET                     # Secret JWT pour signature
INTERNAL_SERVICE_SECRET        # Secret pour authentification interne
SUPABASE_URL                  # URL Supabase
SUPABASE_KEY                  # Clé API Supabase
NEO4J_URI                     # URI Neo4j
NEO4J_USER                    # User Neo4j
NEO4J_PASSWORD                # Password Neo4j
```

**Multi-Banking** :
```bash
INTERNAL_SERVICE_SECRET        # Secret pour authentification interne
MULTI_BANKING_SERVICE_SECRET   # Secret pour communication BankMatch
BANKMATCH_BASE_URL            # URL BankMatch
BANKMATCH_INTEGRATION_ENABLED  # Activation intégration BankMatch
FRAUD_SERVICE_URL             # URL Fraud Detection
```

---

## 📊 Flux de Traitement d'une Transaction

### Étape 1 : Ingestion
```
Fichier bancaire ──> Multi-Banking Parser
                   ──> PivotTransaction
                   ──> Validation
```

### Étape 2 : Analyse de Fraude
```
PivotTransaction ──> Fraud Detection API
                   ──> Règles Métiers (Phase 1, 2, 3)
                   ──> Feature Engineering
                   ──> Modèle ML
                   ──> Score de confiance
```

### Étape 3 : Explicabilité
```
Résultat ML ──> SHAP Values
             ──> Facteurs explicatifs
             ──> Analyse de graphe (Neo4j)
```

### Étape 4 : Persistance
```
Alerte ──> Supabase (fraud_alerts)
       ──> Neo4j (réseaux de comptes)
```

### Étape 5 : Intégration BankMatch
```
Transactions ──> BankMatch /api/import
              ──> Session de rapprochement
              └─> Lancement du matching
```

---

## 🧪 Tests et Validation

### Tests Unitaires
```bash
# Fraud Detection
cd fraud-detection/backend
pytest tests/

# Multi-Banking
cd multi-banking
pytest tests/
```

### Tests d'Intégration
```bash
# Test ingestion complète
curl -X POST http://localhost:8010/api/multi-banking/ingest \
  -F "file=@test.csv" \
  -F "format=csv" \
  -F "tenant_id=test" \
  -F "bank_id=test"
```

### Tests ML
```bash
# Entraînement modèle
cd fraud-detection/backend
python benchmark_fraud.py
```

---

## 🚀 Déploiement

### Docker Compose
```bash
cd fraud-detection
docker-compose up --build
```

### Services Accessibles
- Fraud Detection : http://localhost:8005
- Multi-Banking : http://localhost:8010
- Neo4j Browser : http://localhost:7474
- API Gateway : http://localhost:80

### Health Checks
```bash
curl http://localhost:8005/health    # Fraud Detection
curl http://localhost:8010/health    # Multi-Banking
```

---

## 📈 Monitoring et Logging

### Logging Structuré
```json
{
  "request_id": "uuid",
  "method": "POST",
  "path": "/api/analyze",
  "status_code": 200,
  "duration_ms": 123.45,
  "environment": "development"
}
```

### Request ID Tracking
- Chaque requête reçoit un UUID unique
- Header `X-Request-ID` ajouté aux réponses
- Traçabilité inter-services

---

## 🎯 Points Clés pour l'Intégration

### 1. Format de Données
- Champ `transaction_reference` (ex-`mongo_transaction_id`) : hash SHA-256
- Format pivot normalisé entre parseurs
- Compatibilité ascendante assurée

### 2. Authentification
- Pattern JWT interne pour service-to-service
- Support du mode développement
- Isolation des secrets par service

### 3. Communication API
- Format de réponse normalisé (`APIResponse[T]`)
- Headers d'authentification standards
- Gestion d'erreurs structurée

### 4. Configuration
- Seuils configurables via API
- Persistance JSON atomique
- Thread-safe pour accès concurrents

### 5. Extensibilité
- Architecture modulaire
- Nouveaux parseurs facilement ajoutables
- Nouvelles règles métiers configurables

---

## 📝 Checklist de Préparation

### Pour l'Intégration BankMatch
- [ ] Finaliser le contrat API `/api/import`
- [ ] Finaliser le contrat `/reconciliation/sessions/:id/matching/start`
- [ ] Configurer les credentials de service
- [ ] Activer `BANKMATCH_INTEGRATION_ENABLED=true`
- [ ] Tester le flux complet

### Pour le Déploiement Production
- [ ] Configurer les secrets de production
- [ ] Désactiver le mode développement
- [ ] Configurer les limites de ressources Docker
- [ ] Mettre en place les backups (Supabase, Neo4j)
- [ ] Configurer le monitoring (Prometheus, Grafana)

### Pour l'Équipe Frontend
- [ ] Mettre à jour les types TypeScript
- [ ] Adapter l'UI aux nouveaux champs
- [ ] Tester les flux utilisateur complets
- [ ] Valider l'intégration authentification

---

## 🆘 Support et Dépannage

### Problèmes Courants

**Erreur d'authentification** :
```bash
# Vérifier les secrets
echo $INTERNAL_SERVICE_SECRET
echo $JWT_SECRET

# Mode dev
DISABLE_INTERNAL_AUTH=true
```

**Connexion Neo4j échoue** :
```bash
# Vérifier les credentials
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

**Modèle ML non chargé** :
```bash
# Vérifier la présence du fichier
ls backend/model_fraud.pkl

# Réentraîner si nécessaire
python backend/benchmark_fraud.py
```

---

## 📚 Documentation Complémentaire

- `ARCHITECTURE_DECISIONS.md` : Décisions d'architecture
- `RAPPORT_IMPLEMENTATION.md` : Rapport d'implémentation
- `fraud-detection/docs/` : Documentation technique détaillée
- `fraud-detection/backend/backend_README.md` : Documentation API

---

**Préparé pour la réunion d'intégration technique - Lundi**
**Date de génération** : 2026-08-08
**Version du système** : v0.1.0
