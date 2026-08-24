# Guide de Raccordement UI — Modules IA Fraud Detection & Multi-Banking

**Date :** 24 Août 2026  
**Auteur :** Oussema Nehdi (Équipe IA)  
**Destinataire :** Dhirar (Intégration BankMatch Central)  
**Statut :** Prêt pour intégration Frontend - Interface Complète et Production-Ready

---

## 1. Résumé Exécutif

Ce document décrit le raccordement des composants UI/Interface des modules IA dans BankMatch centralisé. Il couvre l'intégration des composants Angular, les routes, les services API, et l'adaptation au design system existant.

**Modules concernés :**
- **Multi-Banking** : Interface d'upload, parsing, et visualisation des transactions
- **Fraud Detection** : Dashboard d'alertes, graphe de réseau, configuration des seuils

**État actuel du frontend :**
- ✅ Interface Angular complète et moderne avec Tailwind CSS
- ✅ 6 onglets fonctionnels dans le module Fraud Detection
- ✅ Composants UI réutilisables et design system cohérent
- ✅ Simulateur de seuils What-If interactif
- ✅ Visualisation de graphes interactifs avec vis-network
- ✅ Import CSV avancé avec parsing intelligent
- ✅ Export PDF/CSV intégré
- ✅ Système de notifications temps réel
- ✅ Multi-tenant avec authentification intégrée

---

## 🎯 Partie 1 : Guide Fonctionnel de l'Interface

Cette partie guide l'utilisateur à travers les fonctionnalités de l'interface pour comprendre comment elle fonctionne.

### 1.1 Introduction à l'Interface

**Page d'accueil et navigation :**
- Accès aux deux modules principaux : Multi-Banking et Fraud Detection
- Design moderne et responsive avec Tailwind CSS
- Navigation intuitive entre les différentes fonctionnalités
- Interface cohérente avec le design system BankMatch

**État actuel :**
- Interface Angular complète et production-ready
- Tous les composants UI sont fonctionnels
- Design system unifié et responsive
- Prête pour l'intégration dans BankMatch central

### 1.2 Module Multi-Banking

**Fonctionnalités principales :**

1. **Interface d'upload de fichiers**
   - Support de plusieurs formats : CSV, CAMT.053, MT940, PAIN.001
   - Drag & drop ou sélection de fichier classique
   - Validation en temps réel du format sélectionné
   - Feedback visuel immédiat sur le fichier sélectionné

2. **Parsing et visualisation des données**
   - Affichage des transactions parsées en temps réel
   - Statistiques d'ingestion (nombre de transactions, erreurs détectées)
   - Prévisualisation des données normalisées
   - Indicateurs de qualité des données

3. **Historique des uploads**
   - Liste chronologique des fichiers importés
   - Statuts de traitement (en cours, terminé, erreur)
   - Accès aux détails de chaque import
   - Possibilité de re-télécharger les données parsées

**Workflow utilisateur typique :**
1. Sélectionner le format de fichier
2. Choisir le fichier à importer (drag & drop ou sélection)
3. Lancer l'upload et le parsing automatique
4. Visualiser les résultats et les statistiques
5. Consulter l'historique des imports précédents

### 1.3 Module Fraud Detection - Vue d'ensemble

**Tableau de bord principal :**

1. **Statistiques en temps réel**
   - Nombre total d'alertes de fraude
   - Répartition par sévérité (critique, élevé, moyen, faible)
   - Montant total à risque
   - Alertes sous investigation

2. **Import direct de transactions**
   - Upload de fichiers CSV pour analyse immédiate
   - Parsing intelligent des données
   - Analyse automatique avec les trois couches de détection
   - Affichage des résultats en temps réel

3. **Liste des alertes récentes**
   - Affichage des alertes les plus récentes
   - Filtres par statut, sévérité, et catégorie
   - Recherche textuelle dans les alertes
   - Accès rapide aux détails de chaque alerte

**Système d'onglets :**
L'interface est organisée en 6 onglets fonctionnels :
- **Vue d'ensemble** : Tableau de bord principal et import CSV
- **Détection Hybride** : Analyse combinée règles métier + ML
- **Réseaux & Graphe** : Visualisation Neo4j des réseaux de fraude
- **Explicabilité SHAP** : Analyse détaillée des contributions ML
- **Règles Métier** : Liste et statistiques des règles TRACFIN
- **Configuration des Seuils** : Interface de configuration des paramètres

### 1.4 Fonctionnalités Avancées Fraud Detection

#### Onglet Détection Hybride
- **Combinaison intelligente** : Fusion des résultats règles métier + ML + graphe
- **Explications détaillées** : Chaque alerte est accompagnée d'une explication en français
- **Classification par confiance** : 3 niveaux (HIGH ≥85%, MEDIUM ≥70%, LOW)
- **Catégorisation automatique** : Classification par type de fraude (montant exceptionnel, duplication, etc.)
- **Score de fraude** : Indicateur de probabilité de fraude pour chaque transaction

#### Onglet Réseaux & Graphe
- **Visualisation Neo4j** : Graphe interactif des relations entre comptes
- **Top comptes signalés** : Liste des comptes les plus suspects
- **Analyse de patterns** : Détection automatique des cycles et comptes mules
- **Graphe interactif** : Navigation fluide avec vis-network
- **Filtrage par tenant** : Isolation stricte des données par client
- **Détails des relations** : Informations sur chaque transaction et relation

#### Onglet Explicabilité SHAP
- **Contributions ML** : Analyse des facteurs qui ont influencé la décision
- **Graphiques visuels** : Représentation graphique des contributions
- **Explications naturelles** : Descriptions en français compréhensibles
- **Comparaison alertes** : Comparaison des facteurs entre différentes alertes
- **Feature importance** : Classement des facteurs par importance

### 1.5 Configuration et Simulation

#### Simulateur de seuils What-If
- **Sliders interactifs** : Modification des seuils ML et réglementaires
- **Prévisualisation immédiate** : Impact visible en temps réel sur les alertes
- **Mise à jour automatique** : Statistiques et graphes se mettent à jour instantanément
- **Scénarios de test** : Possibilité de tester différents scénarios
- **Comparaison avant/après** : Visualisation des changements

#### Configuration des seuils
- **Interface de modification** : Formulaire intuitif pour modifier les paramètres
- **Sauvegarde automatique** : Les changements sont sauvegardés automatiquement
- **Configuration par tenant** : Chaque client peut avoir ses propres seuils
- **Validation** : Contrôle de la cohérence des paramètres
- **Historique** : Suivi des modifications de configuration

#### Règles métier
- **Liste complète** : Toutes les règles TRACFIN appliquées
- **Statistiques par catégorie** : Nombre d'alertes par type de règle
- **Configuration des mots-clés** : Personnalisation des mots-clés LAB/FT
- **Activation/désactivation** : Possibilité d'activer/désactiver certaines règles
- **Priorité des règles** : Gestion de l'ordre de priorité

### 1.6 Fonctionnalités Techniques et Export

#### Export de rapports
- **Export PDF** : Génération de rapports PDF avec jspdf
- **Export CSV** : Export des données pour analyse externe
- **Rapports personnalisés** : Formats et contenus configurables
- **Rapports de conformité** : Exports pour audits réglementaires

#### Notifications temps réel
- **SSE (Server-Sent Events)** : Notifications en temps réel des nouvelles alertes
- **Alertes visuelles** : Indicateurs visuels pour les nouvelles alertes
- **Filtrage par tenant** : Notifications spécifiques à chaque client
- **Gestion des abonnements** : Contrôle des notifications actives

#### Gestion multi-tenant
- **Isolation stricte** : Séparation complète des données par tenant
- **Configuration par tenant** : Paramètres spécifiques à chaque client
- **Authentification intégrée** : Gestion des droits d'accès par rôle
- **Audit trail** : Traçabilité des actions par utilisateur et tenant

#### Responsive design et accessibilité
- **Adaptatif** : Interface fonctionnelle sur mobile, tablette et desktop
- **Accessibilité** : Contraste suffisant, navigation clavier, lecteur d'écran
- **Performance** : Chargement rapide et interactions fluides
- **Internationalisation** : Préparation pour multi-langue (si nécessaire)

---

## 🔧 Partie 2 : Aspects Techniques d'Intégration (Pour Dhirar)

### 2.1 Architecture Frontend Simplifiée

```
┌─────────────────────────────────────────────────────────────────┐
│                    BANKMATCH FRONTEND (Angular)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Layout Principal (Sidebar + Header)                     │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │ Dashboard    │  │ Multi-Banking│  │ Fraud Detect │  │  │
│  │  │ BankMatch    │  │ Module       │  │ Module       │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Services API (HttpClient + Interceptors)               │  │
│  │  • MultiBankingService                                   │  │
│  │  • FraudDetectionService                                │  │
│  │  • AuthService (JWT BankMatch)                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Backend Services (Node.js + Microservices)             │  │
│  │  • BankMatch API (port 4090)                             │  │
│  │  • Multi-Banking (port 8010)                            │  │
│  │  • Fraud Detection (port 8005)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Configuration des Routes Essentielles

```typescript
// src/app/app-routing.module.ts

const routes: Routes = [
  // ... routes existantes BankMatch
  
  {
    path: 'multi-banking',
    loadChildren: () => import('./modules/multi-banking/multi-banking.module')
      .then(m => m.MultiBankingModule),
    canActivate: [AuthGuard],
    data: { roles: ['ADMIN', 'ACCOUNTANT', 'USER'] }
  },
  {
    path: 'fraud-detection',
    loadChildren: () => import('./modules/fraud-detection/fraud-detection.module')
      .then(m => m.FraudDetectionModule),
    canActivate: [AuthGuard],
    data: { roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] }
  }
];
```

### 2.3 Services API Principaux

#### MultiBankingService (Endpoints clés)

```typescript
@Injectable({ providedIn: 'root' })
export class MultiBankingService {
  private baseUrl = environment.multiBankingUrl || 'http://localhost:8010/banking/api/multi-banking';
  
  // Upload et parsing d'un fichier
  uploadFile(file: File, format: string, tenantId: string, bankId: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', format);
    formData.append('tenant_id', tenantId);
    formData.append('bank_id', bankId);
    return this.http.post(`${this.baseUrl}/ingest`, formData);
  }

  // Validation seule (sans ingestion)
  validateFile(file: File, format: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', format);
    return this.http.post(`${this.baseUrl}/validate`, formData);
  }

  // Récupérer l'historique des uploads
  getUploadHistory(tenantId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/uploads`, {
      params: { tenant_id: tenantId }
    });
  }
}
```

#### FraudDetectionService (Endpoints clés)

```typescript
@Injectable({ providedIn: 'root' })
export class FraudDetectionService {
  private baseUrl = environment.fraudDetectionUrl || 'http://localhost:8005/api';
  
  // Analyse de fraude (S2S - appelé par Multi-Banking)
  analyzeTransactions(transactions: any[]): Observable<any> {
    return this.http.post(`${this.baseUrl}/analyze`, transactions);
  }

  // Récupérer les alertes fraude
  getAlerts(tenantId: string, filters?: any): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/alerts`, {
      params: { tenant_id: tenantId, ...filters }
    });
  }

  // Configuration des seuils
  getThresholds(): Observable<any> {
    return this.http.get(`${this.baseUrl}/config/thresholds`);
  }

  updateThresholds(thresholds: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/config/thresholds`, thresholds);
  }

  // Graph endpoints
  getTopAccounts(tenantId: string, limit: number = 10): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/graph/top-accounts`, {
      params: { tenant_id: tenantId, limit }
    });
  }
}
```

### 2.4 Configuration Environment

```typescript
// src/environments/environment.ts (Développement)
export const environment = {
  production: false,
  apiUrl: 'http://localhost:4090/api',
  multiBankingUrl: 'http://localhost:8010',
  fraudDetectionUrl: 'http://localhost:8005',
  enableSSE: true
};

// src/environments/environment.prod.ts (Production)
export const environment = {
  production: true,
  apiUrl: 'https://api.bankmatch.com/api',
  multiBankingUrl: 'https://multibanking.bankmatch.com',
  fraudDetectionUrl: 'https://fraud.bankmatch.com',
  enableSSE: true
};
```

### 2.5 Intégration dans le Sidebar

```typescript
// src/app/layout/components/sidebar/sidebar.component.ts

menuItems = [
  // ... items existants
  {
    label: 'Multi-Banking',
    icon: 'bank',
    routerLink: '/multi-banking',
    roles: ['ADMIN', 'ACCOUNTANT', 'USER']
  },
  {
    label: 'Fraud Detection',
    icon: 'shield-alert',
    routerLink: '/fraud-detection',
    roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']
  }
];
```

### 2.6 Checklist d'Intégration Prioritaire

#### Phase 1 - Structure et Routes (Priorité Haute)
- [ ] Créer les dossiers modules `multi-banking/` et `fraud-detection/`
- [ ] Ajouter les routes dans `app-routing.module.ts`
- [ ] Configurer les variables environment
- [ ] Ajouter les liens dans le sidebar

#### Phase 2 - Services API (Priorité Haute)
- [ ] Créer `MultiBankingService` avec endpoints clés
- [ ] Créer `FraudDetectionService` avec endpoints clés
- [ ] Configurer l'interceptor HTTP pour JWT BankMatch
- [ ] Tester les services avec les backend

#### Phase 3 - Composants UI (Priorité Moyenne)
- [ ] Intégrer les composants Multi-Banking (upload, historique)
- [ ] Intégrer les composants Fraud Detection (dashboard, alertes)
- [ ] Adapter le design system BankMatch
- [ ] Tests fonctionnels de base

#### Phase 4 - Tests et Déploiement (Priorité Moyenne)
- [ ] Build production et test staging
- [ ] Déploiement en production
- [ ] Monitoring et observabilité

---

## 2. Architecture Frontend

```
┌─────────────────────────────────────────────────────────────────┐
│                    BANKMATCH FRONTEND (Angular)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Layout Principal (Sidebar + Header)                     │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │ Dashboard    │  │ Multi-Banking│  │ Fraud Detect │  │  │
│  │  │ BankMatch    │  │ Module       │  │ Module       │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Services API (HttpClient + Interceptors)               │  │
│  │  • MultiBankingService                                   │  │
│  │  • FraudDetectionService                                │  │
│  │  • AuthService (JWT BankMatch)                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Backend Services (Node.js + Microservices)             │  │
│  │  • BankMatch API (port 4090)                             │  │
│  │  • Multi-Banking (port 8010)                            │  │
│  │  • Fraud Detection (port 8005)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2.7 Points d'Attention Critiques

1. **JWT BankMatch** : Doit être injecté dans tous les appels API via l'interceptor HTTP
2. **Tenant ID** : Doit être cohérent entre frontend et backend (récupéré du JWT)
3. **Design System** : Les composants doivent respecter le design system BankMatch existant
4. **SSE Cleanup** : Le SSE doit être déconnecté lors de la destruction du composant (ngOnDestroy)
5. **Rôles** : Les guards doivent vérifier les rôles avant d'accéder aux pages sensibles
6. **Tests** : Les tests E2E doivent couvrir les flux critiques (upload, alertes, configuration)

### 2.8 Dépannage Rapide

#### Erreur CORS
```json
// src/proxy.conf.json
{
  "/banking/*": {
    "target": "http://localhost:8010",
    "secure": false,
    "changeOrigin": true
  },
  "/api/*": {
    "target": "http://localhost:8005",
    "secure": false,
    "changeOrigin": true
  }
}
```

#### SSE ne se connecte pas
- Vérifier `enableSSE: true` dans environment
- Vérifier l'accessibilité du backend Fraud Detection
- Consulter les logs console pour erreurs EventSource

#### Upload fichier échoue
- Vérifier la taille du fichier (limite backend)
- Vérifier le format sélectionné
- Vérifier les headers Content-Type multipart/form-data

---

## 📞 Contact et Support

Pour toute question sur ce guide ou l'intégration frontend :

- **Oussema Nehdi** — Équipe IA (Fraud Detection & Multi-Banking)
- **Canal :** #tous-rapprochement-bancaire

---

## 📚 Ressources Complémentaires

- **Document de synthèse** : `Document_de_Synthese_Integration_Modules_IA.md`
- **API Documentation** : OpenAPI specs disponibles dans `/documents/specifications/`
- **Code frontend** : `/fraud-detection/frontend/src/app/`
- **Tests** : `/fraud-detection/frontend/src/app/features/*/services/*.integration.spec.ts`

---

*Document mis à jour le 24 août 2026 — BankMatch IA Frontend Integration Guide v2.0*
*Version adaptée pour présentation vidéo et intégration technique*
