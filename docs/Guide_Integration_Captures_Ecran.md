# Guide d'Intégration — Captures d'Écran (Avant/Après)

**Date :** 23 Août 2026  
**Auteur :** Oussema Nehdi (Équipe IA)  
**Destinataire :** Dhirar (Intégration BankMatch Central)  
**Statut :** Prêt pour intégration

---

## 1. Objectif

Ce document définit les captures d'écran requises pour documenter l'intégration des modules IA dans BankMatch. Il précise ce qui doit être capturé **avant** l'intégration (état initial) et **après** l'intégration (état final) pour chaque module.

---

## 2. Module Multi-Banking — Captures Requises

### 2.1 CAPTURE 1 : Avant Intégration (État Initial)

**Contexte :** Interface BankMatch SANS module Multi-Banking

**Éléments à capturer :**
- [ ] **Page d'accueil BankMatch** — Montrer que le module Multi-Banking n'existe pas dans le menu
- [ ] **Sidebar/Navigation** — Absence du lien "Multi-Banking"
- [ ] **Page upload existante** (si applicable) — Interface d'upload basique sans support multi-format
- [ ] **Liste des formats supportés** — Montrer les limites actuelles (ex: CSV uniquement)

**Annotation à ajouter sur la capture :**
```
┌─────────────────────────────────────────┐
│  BANKMATCH - ÉTAT INITIAL               │
│  ❌ Module Multi-Banking NON INTÉGRÉ     │
│  ❌ Support CSV uniquement               │
│  ❌ Pas de parsing CAMT/MT940/PAIN      │
└─────────────────────────────────────────┘
```

---

### 2.2 CAPTURE 2 : Après Intégration (État Final)

**Contexte :** Interface BankMatch AVEC module Multi-Banking intégré

**Éléments à capturer :**
- [ ] **Sidebar/Navigation** — Lien "Multi-Banking" visible et accessible
- [ ] **Page Multi-Banking** — Interface complète avec :
  - Zone de drag & drop pour upload
  - Sélecteur de format (CSV, CAMT.053, MT940, PAIN.001)
  - Sélecteur de banque
  - Bouton d'upload
- [ ] **Résultat d'upload réussi** — Affichage des statistiques :
  - Nombre de transactions parsées
  - Nombre d'erreurs
  - Scores de fraude (si intégration Fraud Detection active)
- [ ] **Historique des uploads** — Tableau des fichiers uploadés avec statut
- [ ] **Prévisualisation des transactions** — Tableau des transactions parsées avec colonnes normalisées

**Annotation à ajouter sur la capture :**
```
┌─────────────────────────────────────────┐
│  BANKMATCH - ÉTAT FINAL                 │
│  ✅ Module Multi-Banking INTÉGRÉ         │
│  ✅ Support 4 formats (CSV/CAMT/MT940)   │
│  ✅ Parsing et normalisation automatique │
│  ✅ Historique et statistiques           │
└─────────────────────────────────────────┘
```

---

### 2.3 CAPTURE 3 : Flux Complet d'Upload

**Contexte :** Démonstration du flux utilisateur complet

**Éléments à capturer (séquence) :**
- [ ] **Étape 1** — Fichier sélectionné dans le drag & drop
- [ ] **Étape 2** — Format CAMT.053 sélectionné
- [ ] **Étape 3** — Banque sélectionnée
- [ ] **Étape 4** — Upload en cours (spinner/progress bar)
- [ ] **Étape 5** — Résultat affiché (transactions parsées + scores fraude)
- [ ] **Étape 6** — Transaction dans l'historique

---

## 3. Module Fraud Detection — Captures Requises

### 3.1 CAPTURE 4 : Avant Intégration (État Initial)

**Contexte :** Interface BankMatch SANS module Fraud Detection

**Éléments à capturer :**
- [ ] **Page d'accueil BankMatch** — Montrer que le module Fraud Detection n'existe pas dans le menu
- [ ] **Sidebar/Navigation** — Absence du lien "Fraud Detection"
- [ ] **Dashboard existant** (si applicable) — Dashboard basique sans alertes fraude
- [ ] **Absence de graphe** — Pas de visualisation de réseau de comptes

**Annotation à ajouter sur la capture :**
```
┌─────────────────────────────────────────┐
│  BANKMATCH - ÉTAT INITIAL               │
│  ❌ Module Fraud Detection NON INTÉGRÉ   │
│  ❌ Pas d'alertes fraude                │
│  ❌ Pas d'analyse de graphe             │
│  ❌ Pas de configuration de seuils      │
└─────────────────────────────────────────┘
```

---

### 3.2 CAPTURE 5 : Après Intégration (État Final)

**Contexte :** Interface BankMatch AVEC module Fraud Detection intégré

**Éléments à capturer :**
- [ ] **Sidebar/Navigation** — Lien "Fraud Detection" visible et accessible
- [ ] **Dashboard Fraud Detection** — Interface complète avec :
  - Cartes de statistiques (alertes haute/moyenne/basse)
  - Graphique d'évolution des alertes
  - Liste des alertes récentes
  - Filtres par sévérité, date, compte
- [ ] **Détail d'une alerte** — Vue détaillée avec :
  - Informations transaction
  - Score de fraude
  - Explicabilité (facteurs SHAP)
  - Règles métier déclenchées
- [ ] **Visualisation de graphe** — Réseau de comptes connectés avec :
  - Nœuds colorés par risque
  - Liens entre comptes
  - Comptes mules identifiés
- [ ] **Configuration des seuils** — Interface admin pour ajuster les seuils
- [ ] **Notifications temps réel** — Toast/badge montrant une nouvelle alerte SSE

**Annotation à ajouter sur la capture :**
```
┌─────────────────────────────────────────┐
│  BANKMATCH - ÉTAT FINAL                 │
│  ✅ Module Fraud Detection INTÉGRÉ      │
│  ✅ Dashboard d'alertes fraude           │
│  ✅ Analyse de graphe (Neo4j)           │
│  ✅ Explicabilité SHAP                  │
│  ✅ Configuration de seuils              │
│  ✅ Notifications temps réel (SSE)       │
└─────────────────────────────────────────┘
```

---

### 3.3 CAPTURE 6 : Flux d'Analyse de Fraude

**Contexte :** Démonstration du flux d'analyse

**Éléments à capturer (séquence) :**
- [ ] **Étape 1** — Transaction normale (score faible)
- [ ] **Étape 2** — Transaction suspecte (score élevé)
- [ ] **Étape 3** — Alert générée dans le dashboard
- [ ] **Étape 4** — Détail de l'alerte avec explicabilité
- [ ] **Étape 5** — Graphe montrant le réseau de comptes
- [ ] **Étape 6** — Notification temps réel reçue

---

## 4. Intégration Combinée — Captures Requises

### 4.1 CAPTURE 7 : Flux Multi-Banking → Fraud Detection

**Contexte :** Démonstration de l'intégration entre les deux modules

**Éléments à capturer :**
- [ ] **Upload fichier** dans Multi-Banking
- [ ] **Parsing réussi** avec transactions extraites
- [ ] **Appel automatique** à Fraud Detection (indiqué dans UI)
- [ ] **Scores de fraude** affichés dans les résultats Multi-Banking
- [ ] **Alertes générées** dans le dashboard Fraud Detection
- [ ] **Vue consolidée** — Les deux modules fonctionnant ensemble

**Annotation à ajouter sur la capture :**
```
┌─────────────────────────────────────────┐
│  INTÉGRATION COMBINÉE                    │
│  ✅ Multi-Banking → Fraud Detection      │
│  ✅ Parsing → Analyse → Alertes          │
│  ✅ Flux automatisé et transparent       │
└─────────────────────────────────────────┘
```

---

### 4.2 CAPTURE 8 : Interface Utilisateur Complète

**Contexte :** Vue d'ensemble de l'interface BankMatch avec les deux modules

**Éléments à capturer :**
- [ ] **Sidebar complet** — Avec tous les modules BankMatch + Multi-Banking + Fraud Detection
- [ ] **Navigation fluide** — Montrer le changement entre les modules
- [ ] **Design cohérent** — Les deux modules respectant le design system BankMatch
- [ ] **Responsive** — Interface adaptée sur desktop et tablette

**Annotation à ajouter sur la capture :**
```
┌─────────────────────────────────────────┐
│  BANKMATCH - INTERFACE COMPLÈTE          │
│  ✅ Tous les modules intégrés            │
│  ✅ Navigation cohérente                 │
│  ✅ Design system respecté               │
│  ✅ Expérience utilisateur unifiée       │
└─────────────────────────────────────────┘
```

---

## 5. Captures Techniques — Backend/API

### 5.1 CAPTURE 9 : Health Checks

**Contexte :** Vérification que les services sont opérationnels

**Éléments à capturer :**
- [ ] **Terminal/Curl** — `GET http://localhost:8010/health` (Multi-Banking)
- [ ] **Terminal/Curl** — `GET http://localhost:8005/health` (Fraud Detection)
- [ ] **Terminal/Curl** — `GET http://localhost:4090/api/health` (BankMatch)
- [ ] **Résultat** — Tous les services retournent 200 OK

---

### 5.2 CAPTURE 10 : Appel API Multi-Banking

**Contexte :** Démonstration de l'endpoint d'ingestion

**Éléments à capturer :**
- [ ] **Postman/Insomnia** — Requête POST vers `/banking/api/multi-banking/ingest`
- [ ] **Headers** — Authorization Bearer token
- [ ] **Body** — FormData avec fichier + format + tenant_id
- [ ] **Response** — 200 OK avec transactions parsées

---

### 5.3 CAPTURE 11 : Appel API Fraud Detection

**Contexte :** Démonstration de l'endpoint d'analyse

**Éléments à capturer :**
- [ ] **Postman/Insomnia** — Requête POST vers `/api/analyze`
- [ ] **Headers** — Authorization Bearer token (S2S)
- [ ] **Body** — Array de transactions
- [ ] **Response** — 200 OK avec scores de fraude + explicabilité

---

### 5.4 CAPTURE 12 : SSE Notifications

**Contexte :** Démonstration des notifications temps réel

**Éléments à capturer :**
- [ ] **Terminal/Curl** — Connexion SSE vers `/api/notifications/stream`
- [ ] **Événements reçus** — Messages JSON en temps réel
- [ ] **Frontend** — Toast/notification affichée dans l'interface

---

## 6. Captures de Tests — E2E

### 6.1 CAPTURE 13 : Test Cypress Multi-Banking

**Contexte :** Exécution des tests E2E

**Éléments à capturer :**
- [ ] **Terminal Cypress** — Commande `npx cypress run`
- [ ] **Résultat** — Tous les tests passés (green)
- [ ] **Rapport HTML** — Screenshot des tests réussis

---

### 6.2 CAPTURE 14 : Test Cypress Fraud Detection

**Contexte :** Exécution des tests E2E

**Éléments à capturer :**
- [ ] **Terminal Cypress** — Commande `npx cypress run`
- [ ] **Résultat** — Tous les tests passés (green)
- [ ] **Rapport HTML** — Screenshot des tests réussis

---

## 7. Checklist des Captures

### Module Multi-Banking
- [ ] CAPTURE 1 : Avant intégration (navigation)
- [ ] CAPTURE 2 : Après intégration (interface complète)
- [ ] CAPTURE 3 : Flux complet d'upload (séquence)

### Module Fraud Detection
- [ ] CAPTURE 4 : Avant intégration (navigation)
- [ ] CAPTURE 5 : Après intégration (interface complète)
- [ ] CAPTURE 6 : Flux d'analyse de fraude (séquence)

### Intégration Combinée
- [ ] CAPTURE 7 : Flux Multi-Banking → Fraud Detection
- [ ] CAPTURE 8 : Interface utilisateur complète

### Technique
- [ ] CAPTURE 9 : Health checks
- [ ] CAPTURE 10 : Appel API Multi-Banking
- [ ] CAPTURE 11 : Appel API Fraud Detection
- [ ] CAPTURE 12 : SSE notifications

### Tests
- [ ] CAPTURE 13 : Test Cypress Multi-Banking
- [ ] CAPTURE 14 : Test Cypress Fraud Detection

---

## 8. Instructions pour les Captures

### 8.1 Outils Recommandés
- **Windows :** Snipping Tool, Win+Shift+S
- **Mac :** Cmd+Shift+4
- **Linux :** gnome-screenshot, flameshot
- **Navigateur :** DevTools (screenshot élément)

### 8.2 Format et Résolution
- **Format :** PNG (préféré) ou JPG
- **Résolution :** 1920x1080 minimum
- **Qualité :** 100% (pas de compression)

### 8.3 Organisation des Fichiers
```
docs/captures-integration/
├── multi-banking/
│   ├── 01-avant-integration.png
│   ├── 02-apres-integration.png
│   ├── 03-flux-upload-1.png
│   ├── 03-flux-upload-2.png
│   └── 03-flux-upload-3.png
├── fraud-detection/
│   ├── 04-avant-integration.png
│   ├── 05-apres-integration.png
│   ├── 06-flux-analyse-1.png
│   ├── 06-flux-analyse-2.png
│   └── 06-flux-analyse-3.png
├── integration-combinee/
│   ├── 07-flux-combine.png
│   └── 08-interface-complete.png
├── technique/
│   ├── 09-health-checks.png
│   ├── 10-api-multibanking.png
│   ├── 11-api-fraud.png
│   └── 12-sse-notifications.png
└── tests/
    ├── 13-cypress-multibanking.png
    └── 14-cypress-fraud.png
```

### 8.4 Annotations
Utiliser un outil d'annotation pour ajouter :
- **Flèches** — Pour indiquer les éléments clés
- **Encadrés** — Pour mettre en évidence les zones importantes
- **Texte** — Pour ajouter des légendes
- **Cercles** — Pour pointer les boutons/actions

**Outils d'annotation :**
- Windows : Paint, Snip & Sketch
- Mac : Preview, Skitch
- Linux : Shutter, Flameshot

---

## 9. Livrable Final

Une fois toutes les captures réalisées, créer un document de présentation :

**Fichier :** `docs/Presentation_Integration_Modules_IA.pptx`

**Structure :**
1. **Slide 1** — Titre + Résumé
2. **Slide 2** — Avant intégration (Multi-Banking)
3. **Slide 3** — Après intégration (Multi-Banking)
4. **Slide 4** — Flux upload Multi-Banking
5. **Slide 5** — Avant intégration (Fraud Detection)
6. **Slide 6** — Après intégration (Fraud Detection)
7. **Slide 7** — Flux analyse Fraud Detection
8. **Slide 8** — Intégration combinée
9. **Slide 9** — Interface complète
10. **Slide 10** — Tests et validation
11. **Slide 11** — Conclusion et prochaines étapes

---

## 10. Contact

Pour toute question sur ce guide ou les captures d'écran :

- **Oussema Nehdi** — Équipe IA (Fraud Detection & Multi-Banking)
- **Canal :** #tous-rapprochement-bancaire

---

*Document généré le 23 août 2026 — BankMatch IA Integration Screenshots Guide v1.0*
