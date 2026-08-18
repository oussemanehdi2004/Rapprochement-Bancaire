# Documentation d'Intégration - BankMatch Platform

## 📋 Vue d'ensemble

Ce document fournit les informations nécessaires pour l'intégration des modules **Multi-Banking** et **Fraud Detection** dans la plateforme BankMatch. Il contient les contrats API, les DTOs, et les guides d'intégration pour les développeurs.

**Version**: 2.0.0  
**Dernière mise à jour**: 2026-08-18

## 🏗️ Architecture des Services

### Services Principaux

1. **Multi-Banking Service** (`http://localhost:8005/banking`)
   - Ingestion de fichiers bancaires multi-format
   - Parsing et validation de transactions
   - Intégration avec le service de détection de fraude
   - Gestion des métadonnées et statistiques

2. **Fraud Detection Service** (`http://localhost:8005`)
   - Analyse de fraude par Machine Learning (XGBoost, Isolation Forest)
   - Règles métier et analyse de graphe (Neo4j)
   - Génération de rapports et notifications temps réel
   - Explicabilité des décisions (SHAP)

### Flux de Données

```
Fichier Bancaire → Multi-Banking Service → Parsing → Validation → Ingestion
                                                              ↓
Fraud Detection Service ← Transactions ← Fraud Analysis ← ML + Rules + Graph
                                                              ↓
                                                      Notifications & Reports
```

## 📚 Contrats API (OpenAPI/Swagger)

### Multi-Banking API

**Spécification**: `multi-banking/api-spec.yaml`
**Version**: 1.1.0
**Base URL**: `http://localhost:8005/banking`

#### Endpoints Principaux

| Méthode | Endpoint | Description | Authentification |
|---------|----------|-------------|------------------|
| GET | `/health` | Health check | Non |
| POST | `/api/multi-banking/parse` | Parser un fichier bancaire | Bearer Token |
| POST | `/api/multi-banking/validate` | Valider un fichier bancaire | Bearer Token |
| POST | `/api/multi-banking/ingest` | Ingestion complète | Bearer Token |
| GET | `/stats` | Statistiques d'ingestion | Bearer Token |
| GET | `/uploads` | Liste des téléchargements | Bearer Token |

#### Formats Supportés

- `csv` - Fichiers CSV bancaires
- `camt053` - Format ISO 20022 CAMT.053
- `mt940` - Format SWIFT MT940
- `pain.001` - Format ISO 20022 PAIN.001
- `pain001` - Alias pour pain.001

### Fraud Detection API

**Spécification**: `fraud-detection/backend/api-spec.yaml`
**Version**: 2.2.0
**Base URL**: `http://localhost:8005`

#### Endpoints Principaux

| Méthode | Endpoint | Description | Authentification |
|---------|----------|-------------|------------------|
| GET | `/health` | Health check | Non |
| POST | `/api/analyze` | Analyser des transactions | Bearer Token |
| POST | `/api/analyze-demo` | Analyse mode démo | Non |
| GET | `/api/config/thresholds` | Récupérer les seuils | Bearer Token |
| PUT | `/api/config/thresholds` | Mettre à jour les seuils | Bearer Token |
| GET | `/api/graph/top-accounts` | Comptes les plus signalés | Bearer Token |
| GET | `/api/graph/mule-accounts` | Détecter les comptes mules | Bearer Token |
| GET | `/api/graph/pagerank` | Calculer le PageRank | Bearer Token |
| GET | `/api/graph/communities` | Détecter les communautés | Bearer Token |
| GET | `/api/notifications/stream` | Stream SSE notifications | Bearer Token |
| GET | `/api/reports` | Générer un rapport | Bearer Token |
| GET | `/api/reports/categories` | Répartition par catégorie | Bearer Token |
| GET | `/api/reports/timeseries` | Données temporelles | Bearer Token |
| GET | `/api/reports/pdf` | Exporter en PDF | Bearer Token |
| GET | `/api/reports/csv` | Exporter en CSV | Bearer Token |
| GET | `/api/notifications` | Récupérer les notifications | Bearer Token |
| PATCH | `/api/notifications/{id}/read` | Marquer comme lu | Bearer Token |
| PATCH | `/api/notifications/read-all` | Tout marquer comme lu | Bearer Token |
| DELETE | `/api/notifications/{id}` | Supprimer une notification | Bearer Token |

## 🔧 DTOs TypeScript

### Structure des DTOs

Les DTOs (Data Transfer Objects) sont organisés par module dans le frontend :

#### Multi-Banking DTOs
**Emplacement**: `fraud-detection/frontend/src/app/features/multi-banking/models/`

- `ingestion-stats.dto.ts` - Statistiques d'ingestion
- `file-upload.dto.ts` - Informations de téléchargement
- `parsed-transaction.dto.ts` - Transaction parsée
- `fraud-analysis-result.dto.ts` - Résultat d'analyse de fraude
- `parse-response.dto.ts` - Réponse de parsing
- `parse-metadata.dto.ts` - Métadonnées de parsing
- `validation-result.dto.ts` - Résultat de validation
- `validate-response.dto.ts` - Réponse de validation
- `ingest-metadata.dto.ts` - Métadonnées d'ingestion
- `ingest-response.dto.ts` - Réponse d'ingestion complète

#### Fraud Detection DTOs
**Emplacement**: `fraud-detection/frontend/src/app/features/fraud-detection/models/`

- `shap-contribution.dto.ts` - Contributions SHAP
- `explainability.dto.ts` - Explicabilité des décisions
- `transaction-input.dto.ts` - Entrée de transaction
- `transaction-output.dto.ts` - Sortie de transaction analysée
- `analyze-response.dto.ts` - Réponse d'analyse
- `thresholds.dto.ts` - Seuils de configuration
- `graph.dto.ts` - Résultats d'analyse de graphe
- `reports.dto.ts` - Données de rapports
- `notification.dto.ts` - Notifications de fraude

#### Types Partagés
**Emplacement**: `fraud-detection/frontend/src/app/core/types/`

- `common.types.ts` - Types partagés communs
  - `APIResponse<T>` - Réponse API standardisée
  - `PaginatedResponse<T>` - Réponse paginée
  - `APIError` - Erreur API standardisée
  - `BaseMetadata` - Métadonnées communes
  - `ProcessingStatus` - Statuts de traitement
  - `BankFileFormat` - Formats de fichiers bancaires
  - `AuthConfig` - Configuration d'authentification
  - `RealtimeConfig` - Configuration temps réel

## 🔐 Authentification

### Configuration

Tous les endpoints sécurisés utilisent l'authentification Bearer Token :

```typescript
// Headers d'authentification
{
  'Authorization': 'Bearer <token>',
  'Content-Type': 'application/json'
}
```

### Gestion des Tokens

Les tokens sont stockés dans `localStorage` avec la clé `auth_token` :

```typescript
const token = localStorage.getItem('auth_token');
const headers = new HttpHeaders({
  'Authorization': `Bearer ${token}`
});
```

## 🚀 Guide d'Intégration Rapide

### 1. Configuration de l'Environnement

Créer un fichier `.env` dans le frontend en copiant `.env.example` :

```bash
cp .env.example .env
```

Puis ajuster les valeurs selon votre environnement :

```env
# API Endpoints
API_BASE_URL=http://localhost:8005
MULTI_BANKING_URL=http://localhost:8005/banking
FRAUD_DETECTION_URL=http://localhost:8005

# Authentification
AUTH_TOKEN_KEY=auth_token
DEFAULT_AUTH_TOKEN=your-token-here

# Features
BANKMATCH_INTEGRATION_ENABLED=true
REALTIME_NOTIFICATIONS_ENABLED=true
GRAPH_ANALYSIS_ENABLED=true
ML_FRAUD_DETECTION_ENABLED=true
DEMO_MODE_ENABLED=true
```

### 2. Installation des Dépendances

```bash
cd fraud-detection/frontend
npm install
```

### 3. Démarrage du Serveur de Développement

```bash
npm run dev
```

Le frontend sera accessible sur `http://localhost:4200` (ou le port configuré).

### 4. Utilisation des Services

#### Multi-Banking Service

```typescript
import { MultiBankingService } from './features/multi-banking/services/multi-banking.service';

constructor(private multiBankingService: MultiBankingService) {}

// Parser un fichier
this.multiBankingService.parseFile(file, 'csv', 'tenant-123', 'bank-456')
  .subscribe(response => {
    console.log('Transactions parsées:', response.data);
  });

// Ingestion complète
this.multiBankingService.ingestFile(file, 'camt053', 'tenant-123', 'bank-456')
  .subscribe(response => {
    console.log('Ingestion terminée:', response);
  });
```

#### Fraud Detection Service

```typescript
import { FraudAlertsService } from './features/fraud-detection/services/fraud-alerts.service';

constructor(private fraudAlertsService: FraudAlertsService) {}

// Analyser des transactions
const transactions = [
  {
    tenant_id: "tenant-123",
    transaction_reference: "TX-10024",
    id: "TX-10024",
    date: "2026-07-16T14:30:00Z",
    description: "VIREMENT ENTRANT CASINO",
    amount: 1500.50,
    sender_balance_before: 5000.0,
    sender_balance_after: 3499.5,
    receiver_balance_before: 200.0,
    receiver_balance_after: 1700.5,
    transaction_type: "TRANSFER"
  }
];

this.fraudAlertsService.analyzeTransactions(transactions)
  .subscribe(results => {
    console.log('Résultats d\'analyse:', results);
  });
```

#### Reports Service

```typescript
import { ReportsService } from './features/reports/services/reports.service';

constructor(private reportsService: ReportsService) {}

// Générer un rapport
this.reportsService.getReports('2026-01-01', '2026-12-31')
  .subscribe(report => {
    console.log('Rapport:', report);
  });

// Exporter en PDF
this.reportsService.exportPDF('2026-01-01', '2026-12-31')
  .subscribe(blob => {
    // Télécharger le fichier
    const url = window.URL.createObjectURL(blob);
    window.open(url);
  });
```

## 📊 Exemples de Réponses API

### Multi-Banking - Parse Response

```json
{
  "success": true,
  "count": 150,
  "data": [
    {
      "tenant_id": "tenant-123",
      "source_line_hash": "abc123",
      "reference": "REF-001",
      "value_date": "2026-01-15",
      "label": "VIREMENT ENTRANT",
      "amount": 1500.50,
      "balance_before": 5000.0,
      "balance_after": 3499.5,
      "account_iban": "FR7612345678901234567890123",
      "counterparty_iban": "FR7698765432109876543210987"
    }
  ],
  "metadata": {
    "filename": "transactions.csv",
    "format": "csv",
    "tenant_id": "tenant-123",
    "bank_id": "bank-456",
    "authenticated_tenant": "tenant-123",
    "authenticated_user": "user@example.com"
  }
}
```

### Fraud Detection - Analyze Response

```json
{
  "success": true,
  "data": [
    {
      "transaction_reference": "TX-10024",
      "id": "TX-10024",
      "date": "2026-07-16T14:30:00Z",
      "description": "VIREMENT ENTRANT CASINO",
      "amount": 1500.50,
      "isFraud": true,
      "fraudProbability": 0.85,
      "score": 85,
      "confidence": "HIGH",
      "reconciliationStatus": "SUSPICIOUS",
      "ruleCategory": "MOTCLE_SENSIBLE",
      "explainability": {
        "summary": "Bloqué par conformité : Mot-clé sensible détecté (LAB/FT).",
        "factors": [
          "Mot-clé sensible détecté (LAB/FT)",
          "amount a contribué positivement"
        ],
        "shap_contributions": [
          {
            "feature": "amount",
            "value": 0.23,
            "direction": "positive"
          }
        ]
      }
    }
  ]
}
```

## 🧪 Tests et Validation

### Tests Unitaires

Les DTOs et services sont testés avec les fichiers suivants :

- `*.spec.ts` - Tests unitaires Angular
- Tests de validation des DTOs
- Tests des services API

### Exécution des Tests

```bash
# Exécuter tous les tests
cd fraud-detection/frontend
npm test

# Exécuter les tests avec couverture
npm test -- --coverage

# Exécuter les tests en mode watch
npm test -- --watch
```

### Validation des Contrats

Pour valider les contrats API :

```bash
# Installer swagger-cli
npm install -g @apidevtools/swagger-cli

# Valider la spec Multi-Banking
swagger-cli validate multi-banking/api-spec.yaml

# Valider la spec Fraud Detection
swagger-cli validate fraud-detection/backend/api-spec.yaml
```

## 🔄 Mises à jour et Versioning

### Versioning des APIs

- **Multi-Banking**: Version sémantique (ex: 1.1.0)
- **Fraud Detection**: Version sémantique (ex: 2.2.0)

### Changelog

#### v1.1.0 (Multi-Banking)
- Amélioration des réponses d'erreur
- Ajout de métadonnées de version dans health check
- Standardisation des codes d'erreur

#### v2.2.0 (Fraud Detection)
- Ajout de l'endpoint `/api/analyze-demo` pour le développement
- Amélioration des réponses d'erreur
- Ajout de métadonnées de version dans health check
- Standardisation des codes d'erreur

## 📞 Support et Contact

**Email**: support@bankmatch.com
**Documentation**: Voir les fichiers API spec YAML pour plus de détails

## 📝 Notes de Développement

### Points d'Attention

1. **Authentification**: Tous les endpoints sécurisés nécessitent un Bearer Token valide
2. **Rate Limiting**: Certains endpoints ont des limites de taux (429)
3. **Formats de fichiers**: Vérifier que le format est supporté avant l'upload
4. **Timezones**: Les dates sont en UTC (ISO 8601)
5. **Validation**: Toujours valider les réponses API côté client

### Bonnes Pratiques

- Utiliser les DTOs TypeScript pour la cohérence des types
- Gérer les erreurs API de manière robuste
- Implémenter le retry pour les requêtes transitoires
- Logger les erreurs pour le debugging
- Utiliser les types partagés pour éviter la duplication

## 🔧 Dépannage

### Erreurs Courantes

#### Erreur 401 - Unauthorized
**Cause**: Token d'authentification manquant ou invalide  
**Solution**: Vérifier que le token est stocké dans localStorage et qu'il est valide

#### Erreur 403 - Forbidden
**Cause**: Permissions insuffisantes pour l'action demandée  
**Solution**: Vérifier les permissions de l'utilisateur et les scopes du token

#### Erreur 429 - Too Many Requests
**Cause**: Rate limiting dépassé  
**Solution**: Attendre avant de réessayer ou augmenter les limites dans la configuration

#### Erreur 500 - Internal Server Error
**Cause**: Erreur côté serveur  
**Solution**: Consulter les logs du serveur et vérifier la configuration

#### Erreur de parsing de fichier
**Cause**: Format de fichier non supporté ou fichier corrompu  
**Solution**: Vérifier le format du fichier et sa validité

### Logs et Debugging

Pour activer le mode debug :

```env
LOG_LEVEL=debug
ENABLE_API_LOGGING=true
ENABLE_ERROR_LOGGING=true
ENABLE_PERFORMANCE_LOGGING=true
```

Les logs seront disponibles dans la console du navigateur et dans les logs du serveur.

---

**Document généré pour l'intégration BankMatch - Dernière mise à jour: 2026-08-18**
