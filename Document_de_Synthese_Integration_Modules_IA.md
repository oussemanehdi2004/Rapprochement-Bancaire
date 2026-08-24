#  Note de Synthèse --- Intégration Modules IA (Fraud Detection & Multi-Banking)

**À l\'attention de :** Dhirar (Backend BankMatch)

**De :** Équipe Fraud Detection / Multi-Banking

**Objet :** Préparation à l\'intégration centralisée

## 1. Ce que font les modules côté produit

### 🛡️ AI Fraud Detection

Service de détection de fraude bancaire en temps réel qui analyse chaque
transaction et retourne un verdict (fraude/légitime) accompagné d\'une
explication compréhensible pour un opérateur métier. Il combine trois
couches de détection complémentaires :

- **Règles métier réglementaires :** seuils TRACFIN, mots-clés LAB/FT,
  retraits cash importants, fractionnement de paiements.

- **Machine Learning :** Random Forest calibré + explicabilité SHAP pour
  détecter les patterns anormaux non couverts par les règles.

- **Analyse de graphe (Neo4j) :** pour identifier les réseaux de fraude,
  paiements circulaires, comptes mules et collusions entre comptes.

**Valeur métier :** réduction du risque de fraude, conformité
réglementaire automatisée, traçabilité et explicabilité des décisions
(auditable, pas une boîte noire).

### 🏦 Multi-Banking

Service d\'ingestion et de normalisation de relevés bancaires
multi-formats (CSV, CAMT.053/ISO 20022, MT940/SWIFT, PAIN.001). Il
transforme n\'importe quel format bancaire vers un schéma pivot unique,
valide la qualité des données (IBAN, dates, doublons), puis transmet
automatiquement les transactions au module Fraud Detection.

**Valeur métier :** point d\'entrée unique et fiable pour tous les
formats bancaires, garantissant la qualité des données en amont du
pipeline de détection.

## 2. Acteurs / utilisateurs concernés

  -----------------------------------------------------------------------
  Acteur                              Interaction
  ----------------------------------- -----------------------------------
  **Backend BankMatch                 Consommateur principal des APIs,
  (Node.js/Express)**                 orchestrateur du contexte
                                      utilisateur

  **Comptables / Analystes fraude**   Consultent le dashboard,
                                      investiguent les alertes,
                                      configurent les seuils

  **Administrateurs tenant**          Gèrent la configuration des seuils
                                      réglementaires

  **Autres microservices**            Multi-Banking → Fraud Detection
                                      (S2S) ; futur AI Accounting
                                      Intelligence

  **Systèmes externes bancaires**     Sources des fichiers de relevés
                                      (indirect, via upload)
  -----------------------------------------------------------------------

## 3. Permissions / droits d\'accès nécessaires

- **Authentification service-to-service (S2S) :** chaque microservice
  dispose de son propre secret interne (FRAUD_INTERNAL_SECRET,
  INTERNAL_SERVICE_SECRET pour Multi-Banking) --- pas de secret partagé
  entre modules, conformément au principe de moindre confiance.

- **Isolation tenant stricte :** tenant_id dérivé du token interne côté
  serveur (jamais fait confiance à une valeur envoyée par le client) ---
  filtre systématique sur toutes les requêtes de lecture (transactions,
  alertes, graphe).

- **Rôles applicatifs (à confirmer avec BankMatch) :**

  - Lecture des alertes/transactions → rôle **ACCOUNTANT** / **ANALYST**

  - Modification des seuils de configuration → rôle **ADMIN**

  - Endpoints d\'analyse (/api/analyze) → réservés aux appels
    service-to-service

- **Pas d\'accès direct à MongoDB de production :** aucun des deux
  modules ne se connecte à la base BankMatch ; toute donnée transite par
  API.

- **Mode développement :** DISABLE_INTERNAL_AUTH=true permet de
  fonctionner en standalone (à désactiver en production).

## 4. Fonctionnement général (logique métier)

### Architecture microservices

> Fichier bancaire → Multi-Banking (FastAPI, port 8010)\
> ├─ Parsing (CSV / CAMT.053 / MT940 / PAIN.001)\
> ├─ Normalisation → schéma pivot commun\
> └─ Validation (IBAN, dates, doublons ±2 centimes)\
> │\
> ▼ JWT interne\
> Fraud Detection (FastAPI, port 8005)\
> ├─ Règles métier (rules_engine.py, seuils configurables)\
> ├─ Feature engineering (13 variables)\
> ├─ Modèle XGBoost/Random Forest calibré + SHAP\
> ├─ Isolation Forest (détection d\'anomalies complémentaire)\
> └─ Analyse de graphe Neo4j (réseaux, cycles, mules)\
> │\
> ▼\
> Persistance Supabase (alertes) + Neo4j (comptes/relations)\
> Notifications SSE temps réel

### Stack technique

- **Backend :** Python / FastAPI, rate limiting (slowapi),
  instrumentation Prometheus

- **ML :** scikit-learn (Random Forest calibré), XGBoost, SHAP
  (explicabilité), Isolation Forest

- **Bases de données :** Supabase/PostgreSQL (alertes, agrégats de
  comptes), Neo4j (graphe de transactions)

- **Auth :** JWT service-to-service (HS256), secret isolé par service,
  expiration courte

- **Observabilité :** logging structuré JSON avec request_id, header
  X-Request-ID, health checks Docker

### Fusion des scores

Le score final combine probabilité ML, sévérité de la règle métier
déclenchée et score d\'anomalie Isolation Forest, avec un système de
confiance à 3 niveaux (HIGH ≥85 / MEDIUM ≥70 / LOW).

## 5. Besoins d\'intégration backend / frontend

### Endpoints principaux à exposer au backend central

  ---------------------------------------------------------------------------
  Endpoint                    Méthode                 Description
  --------------------------- ----------------------- -----------------------
  /api/analyze                POST                    Analyse batch de
                                                      transactions (S2S, JWT
                                                      interne requis)

  /api/transactions           GET                     Liste des
                                                      transactions/alertes
                                                      (filtrable par
                                                      tenant/statut/date)

  /api/config/thresholds      GET / PUT               Lecture/mise à jour des
                                                      seuils réglementaires

  /api/graph/\*               GET                     Endpoints d\'analyse de
  (top-accounts, network,                             graphe Neo4j
  pagerank, etc.)                                     

  /api/notifications/stream   GET (SSE)               Notifications temps
                                                      réel de fraude détectée

  /health                     GET                     Health check (déjà avec
                                                      HEALTHCHECK Docker)

  /api/multi-banking/\*       POST                    Parsing, validation,
  (parse, validate, ingest)                           pipeline complet vers
                                                      Fraud Detection
  ---------------------------------------------------------------------------

### Format de réponse normalisé

Toutes les réponses suivent le contrat APIResponse\[T\] : { success:
bool, data: T, message?: string }, avec gestion d\'erreur structurée
(error.code, error.message).

### Point d\'attention important --- nommage des identifiants

Le champ historiquement nommé mongo_transaction_id a été renommé en
transaction_reference car il s\'agit d\'un hash SHA-256 de
déduplication, pas d\'un véritable ObjectId MongoDB. Si Fraud Detection
a besoin d\'un identifiant BankMatch réel, il faudra utiliser celui
retourné par l\'API /api/import de BankMatch plutôt qu\'un identifiant
généré localement.

### Dépendances / prérequis côté BankMatch

- Confirmation du contrat exact des claims JWT interne
  (issuer/audience/expiration)

- Contrat finalisé de /api/import et
  /api/reconciliation/sessions/:id/matching/start (actuellement
  BANKMATCH_INTEGRATION_ENABLED=false)

- Variables d\'environnement de production à définir :
  INTERNAL_SERVICE_SECRET (dédié), SUPABASE_URL/KEY,
  NEO4J_URI/USER/PASSWORD, ALLOWED_ORIGINS

- Le rôle d\'orchestration actuellement joué par le proxy Express/SSR
  (server.ts) sera repris par le backend BankMatch central --- cette
  couche intermédiaire pourra être supprimée après intégration

## 📌 Note amicale

- Le code des deux modules (Fraud Detection et Multi-Banking) sera
  poussé très prochainement sur une branche dédiée nommée
  module-fraud-detection (ou équivalent, à confirmer selon la convention
  retenue par l\'équipe).

- **Côté backend**, la base d\'intégration est prête : authentification
  S2S, endpoints documentés (OpenAPI), tests unitaires et d\'intégration
  en place, logging structuré et health checks Docker opérationnels.

- **Côté frontend (Angular)**, l\'interface utilisateur est maintenant
  entièrement fonctionnelle et production-ready avec les améliorations
  suivantes :
  
  - **Interface moderne et responsive** avec Tailwind CSS et design système cohérent
  - **Système d\'onglets complet** (6 onglets fonctionnels : Vue d\'ensemble, Détection Hybride, Réseaux & Graphe, Explicabilité SHAP, Règles Métier, Config Seuils)
  - **Simulateur de seuils What-If** interactif en temps réel avec sliders et prévisualisation immédiate
  - **Visualisation de graphes interactifs** avec vis-network pour l\'analyse Neo4j (réseaux de fraude, comptes mules, cycles)
  - **Import CSV avancé** avec parsing intelligent, validation de colonnes, gestion d\'erreurs détaillée
  - **Système de configuration de seuils** dynamique via API avec sauvegarde en temps réel
  - **Support complet pour l\'analyse SHAP** avec visualisation des contributions de features
  - **Gestion des erreurs robuste** avec messages d\'erreur utilisateur-friendly et mécanismes de retry
  - **Données de démonstration** multi-dates pour les séries temporelles et tests
  - **Système de notifications** et rafraîchissement automatique des données
  - **Multi-tenant avec authentification** intégrée et isolation stricte des données
  - **Export PDF** intégré avec jspdf pour les rapports d\'analyse
  - **Composants UI réutilisables** (badges de sévérité/catégorie, charts, skeleton loaders, etc.)
  
  Ces améliorations n\'impactent pas le contrat d\'API exposé --- l\'intégration
  backend peut donc démarrer en parallèle sans attendre.

## 6. Corrections spécifiques et améliorations fonctionnelles apportées

### Corrections de bugs et problèmes détectés

- **Correction du système de gestion des seuils** : Synchronisation correcte entre l\'interface utilisateur et l\'API backend avec re-analyse automatique des données après modification des seuils
- **Amélioration de la gestion des erreurs** : Messages d\'erreur plus explicites pour l\'utilisateur, mécanismes de retry automatiques, et gestion gracieuse des erreurs de chargement
- **Correction de l\'isolation tenant** : Gestion stricte du tenant_id dérivé du token d\'authentification côté serveur avec filtrage systématique sur toutes les requêtes
- **Optimisation du rafraîchissement des données** : Implémentation d\'un service de rafraîchissement global qui notifie automatiquement les composants concernés lors de nouveaux imports
- **Correction de l\'affichage des graphes** : Rechargement automatique du graphe lors de l\'ouverture de l\'onglet pour éviter les données mises en cache
- **Amélioration du parsing CSV** : Gestion robuste des différents séparateurs (virgule/point-virgule), validation des colonnes requises, et conversion correcte des valeurs numériques

### Améliorations de l\'expérience utilisateur

- **Ajout de données de démonstration multi-dates** : Transactions réparties sur plusieurs jours pour permettre des tests réalistes des séries temporelles
- **Optimisation du simulateur What-If** : Mise à jour en temps réel des statistiques et des graphiques lors de la modification des seuils
- **Amélioration de l\'accessibilité** : Labels clairs, messages d\'état, et feedback visuel pour toutes les actions utilisateur
- **Performance améliorée** : Utilisation de signaux Angular pour une réactivité optimale et détection de changement automatique
- **Support multi-tenant complet** : Gestion transparente des différents tenants avec isolation stricte des données et configurations

### Améliorations techniques

- **Architecture de composants modulaire** : Séparation claire entre présentation, logique métier et services
- **TypeScript strict** : Typage complet des interfaces et modèles pour éviter les erreurs à l\'exécution
- **Tests unitaires** : Couverture de test pour les services et composants critiques
- **Gestion d\'état réactive** : Utilisation de signaux Angular pour une gestion d\'état performante et prévisible
- **Observabilité** : Logging structuré et métriques pour le monitoring en production

## 7. Améliorations des composants UI et de l\'affichage

### Composants UI réutilisables

- **SeverityBadgeComponent** : Badge de sévérité avec couleurs dynamiques (critique/élevé/moyen/faible)
- **CategoryBadgeComponent** : Badge de catégorie pour les différents types de fraude détectés
- **SkeletonLoaderComponent** : Loader de squelette pour améliorer la perception de performance
- **FraudChartsComponent** : Composant de graphiques intégrant Chart.js pour les visualisations
- **InteractiveGraphComponent** : Composant de graphe interactif avec vis-network
- **ThresholdSimulatorComponent** : Simulateur de seuils avec sliders et prévisualisation

### Améliorations de l\'affichage

- **Design système cohérent** : Utilisation de Tailwind CSS avec palette de couleurs unifiée
- **Responsive design** : Interface adaptée pour mobile, tablette et desktop
- **Statistiques en temps réel** : Tableaux de bord avec KPIs mis à jour automatiquement
- **Visualisation des données** : Graphiques interactifs, heatmaps, et visualisations de réseaux
- **Feedback utilisateur** : Notifications, messages de succès/erreur, et indicateurs de chargement
- **Accessibilité** : Contraste suffisant, taille de police lisible, et navigation clavier

### Onglets fonctionnels

1. **Vue d\'ensemble** : Tableau de bord principal avec statistiques, import CSV, et alertes récentes
2. **Détection Hybride** : Analyse combinée règles métier + ML avec explications détaillées
3. **Réseaux & Graphe** : Visualisation Neo4j des réseaux de fraude et relations entre comptes
4. **Explicabilité SHAP** : Analyse détaillée des contributions de features ML
5. **Règles Métier** : Liste et statistiques des règles réglementaires TRACFIN
6. **Config Seuils** : Interface de configuration des seuils réglementaires et ML

## 8. Améliorations des détails fonctionnels

### Détection de fraude améliorée

- **Système de scoring hybride** : Combinaison intelligente des scores ML, règles métier et analyse de graphe
- **Classification à 3 niveaux de confiance** : HIGH (≥85%), MEDIUM (≥70%), LOW avec couleurs visuelles distinctes
- **Catégorisation automatique** : Classification des alertes par type de fraude (montant exceptionnel, duplication, fractionnement, etc.)
- **Auto-blocage configurable** : Possibilité de bloquer automatiquement les transactions dépassant certains seuils
- **Explicabilité enrichie** : Explications naturelles en français pour les opérateurs métier

### Fonctionnalités d\'import et d\'analyse

- **Import CSV flexible** : Support de différents séparateurs, validation de colonnes, et gestion des erreurs
- **Parsing multi-format** : Gestion des champs optionnels et valeurs par défaut intelligentes
- **Validation de données** : Vérification des IBAN, dates, montants, et cohérence des soldes
- **Mode démo** : Données de démonstration réalistes pour les tests et présentations
- **Historique des imports** : Conservation des transactions importées pour réanalyse après modification des seuils

### Configuration et seuils

- **Seuils configurables** : Interface utilisateur pour modifier les seuils ML et réglementaires
- **Simulation What-If** : Prévisualisation immédiate de l\'impact des changements de seuils
- **Persistance des configurations** : Sauvegarde automatique des paramètres par tenant
- **Mots-clés sensibles** : Configuration personnalisable des mots-clés LAB/FT
- **Validation en temps réel** : Contrôle de la cohérence des paramètres de configuration

### Analyse de graphe

- **Top comptes signalés** : Identification automatique des comptes les plus suspects
- **Visualisation de réseaux** : Graphe interactif des relations entre comptes
- **Détection de patterns** : Identification des cycles, comptes mules, et collusions
- **Analyse Neo4j** : Utilisation de bases de données graphes pour des analyses complexes
- **Filtrage par tenant** : Isolation stricte des données par client

## 9. Fonctionnalités d\'export et de reporting

### Export PDF

- **Rapports d\'analyse** : Génération de rapports PDF avec jspdf et jspdf-autotable
- **Tableaux de bord** : Export des tableaux de bord statistiques
- **Alertes détaillées** : Export des alertes avec explications et recommandations
- **Personnalisation** : Formats et contenus personnalisables selon les besoins

### Export CSV

- **Transactions exportées** : Export des transactions analysées avec tous les détails
- **Alertes filtrées** : Export des alertes selon les filtres appliqués
- **Rapports de conformité** : Exports pour les audits réglementaires
- **Formats standards** : Compatible avec Excel et autres outils d\'analyse

## 10. État actuel du projet

### Statut de développement

- **Backend** : Production-ready avec authentification S2S, endpoints documentés, tests en place
- **Frontend** : Interface complète et fonctionnelle avec tous les onglets opérationnels
- **Tests** : Tests unitaires et d\'intégration couvrant les fonctionnalités critiques
- **Documentation** : OpenAPI complète pour les endpoints backend
- **Déploiement** : Health checks Docker, logging structuré, instrumentation Prometheus

### Prêt pour l\'intégration

- **Contrat API stable** : Endpoints définis et documentés
- **Authentification** : JWT S2S opérationnel avec isolation tenant
- **Base de données** : Schémas Supabase et Neo4j prêts
- **Configuration** : Variables d\'environnement documentées
- **Monitoring** : Observabilité en place pour la production

---

**Document mis à jour le :** 24 août 2026  
**Version actuelle du projet :** Frontend Angular production-ready avec toutes les fonctionnalités UI/UX implémentées
