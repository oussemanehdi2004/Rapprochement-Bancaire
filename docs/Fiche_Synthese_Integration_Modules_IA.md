# Fiche de Synthèse — Modules IA pour Intégration BankMatch

**Date :** 23 Août 2026  
**Pour :** Dhirar (Intégration BankMatch Central)

---

## Module 1 : Multi-Banking (Ingestion Multi-Formats)

### Ce qu'il fait
- Parse et normalise les fichiers bancaires de **4 formats** : CSV, CAMT.053, MT940, PAIN.001
- Valide la structure des données avant ingestion
- Appelle automatiquement Fraud Detection pour analyser les transactions
- Optionnellement pousse les données vers BankMatch pour le rapprochement

### Acteurs / Utilisateurs
| Rôle | Peut utiliser | Permission |
|------|---------------|------------|
| `ADMIN` | Upload + ingestion complète | Écriture |
| `ACCOUNTANT` | Upload + ingestion complète | Écriture |
| `USER` | Upload seul | Import uniquement |
| `VIEWER` | Lecture stats | Lecture seule |

### Fonctionnement général
```
1. L'utilisateur upload un fichier bancaire via l'interface
2. Multi-Banking parse le fichier selon le format détecté
3. Les transactions sont normalisées en format pivot
4. (Optionnel) Validation des données
5. Appel automatique vers Fraud Detection pour analyse
6. (Optionnel) Push vers BankMatch pour rapprochement
7. Retour des résultats (transactions + scores fraude)
```

### Besoins d'intégration Backend
- **Port :** 8010
- **Auth S2S :** Token JWT signé avec `FRAUD_INTERNAL_SECRET`
- **Endpoint principal :** `POST /banking/api/multi-banking/ingest`
- **Variables requises :** `FRAUD_SERVICE_URL`, `FRAUD_INTERNAL_SECRET`, `BANKMATCH_BASE_URL`

### Besoins d'intégration Frontend
- Composant d'upload de fichier (drag & drop)
- Sélection du format (CSV, CAMT.053, MT940, PAIN.001)
- Sélection de la banque (`bank_id`)
- Affichage des résultats (nombre de transactions, erreurs, scores fraude)
- Historique des uploads récents

---

## Module 2 : Fraud Detection (Analyse Hybride)

### Ce qu'il fait
- Analyse chaque transaction avec **4 moteurs** :
  1. **ML XGBoost** — Classification supervisée (probabilité de fraude)
  2. **Isolation Forest** — Détection d'anomalies non supervisée
  3. **Règles métier** — Seuils réglementaires, mots-clés sensibles, vélocité
  4. **Neo4j (graphe)** — Réseaux de fraude, comptes mules, PageRank
- Génère des alertes avec **explicabilité** (SHAP values)
- Notifie en temps réel via **SSE** (Server-Sent Events)
- Persiste les alertes dans **Supabase**

### Acteurs / Utilisateurs
| Rôle | Peut utiliser | Permission |
|------|---------------|------------|
| `SUPER_ADMIN` | Tous endpoints + config seuils | Plateforme |
| `ADMIN` | Dashboard + rapports + config | Écriture |
| `ACCOUNTANT` | Dashboard alertes + rapports | Lecture |
| `USER` | Lecture alertes | Lecture seule |

### Fonctionnement général
```
1. Réception d'un array de transactions (via S2S ou API demo)
2. Pour chaque transaction :
   a. Extraction des features (montant, soldes, heure, ratio, etc.)
   b. Prédiction ML (XGBoost) → probabilité 0.0-1.0
   c. Évaluation des règles métier → flag + catégorie
   d. Isolation Forest → score d'anomalie
   e. Analyse de graphe (si Neo4j disponible)
   f. Fusion des scores → score final
3. Génération de l'explicabilité (SHAP + facteurs règles)
4. Insertion en base Supabase (si disponible)
5. Broadcast SSE pour notifications temps réel
6. Retour des résultats avec score, confiance, statut
```

### Besoins d'intégration Backend
- **Port :** 8005
- **Auth S2S :** Token JWT signé avec `FRAUD_INTERNAL_SECRET`
- **Endpoint principal :** `POST /api/analyze` (S2S) ou `/api/analyze-demo` (dev)
- **Variables requises :** `FRAUD_INTERNAL_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY`
- **Modèles ML requis :** `model_fraud_calibrated.pkl`, `model_isolation_forest.pkl`, `model_metadata.pkl`

### Besoins d'intégration Frontend
- Dashboard des alertes fraude (liste, filtres, stats)
- Détail d'une transaction suspecte (explicabilité, SHAP)
- Carte de graphe (réseau de comptes connectés)
- Configuration des seuils (admin)
- Notifications temps réel (SSE)
- Rapports exportables (PDF, CSV)

---

## Flux de Raccordement Complet

```
┌─────────────────────────────────────────────────────────────────┐
│  UTILISATEUR                                                    │
│  Upload fichier bancaire (.csv, .xml, .mt940)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  MULTI-BANKING (port 8010)                                      │
│  1. Parse le fichier selon le format                            │
│  2. Normalise en format pivot                                   │
│  3. Valide les données                                          │
│  4. Génère un token S2S (FRAUD_INTERNAL_SECRET)                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  FRAUD DETECTION (port 8005)                                    │
│  1. Vérifie le token S2S                                        │
│  2. ML XGBoost → probabilité fraude                             │
│  3. Règles métier → flag + catégorie                            │
│  4. Isolation Forest → anomalie                                 │
│  5. Neo4j → réseaux, mules, PageRank                            │
│  6. Fusion des scores → score final                             │
│  7. Explicabilité SHAP                                          │
│  8. Insert Supabase + broadcast SSE                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  RETOUR À MULTI-BANKING                                         │
│  { transactions parsées + résultats fraude }                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  BANKMATCH (optionnel, si BANKMATCH_INTEGRATION_ENABLED=true)  │
│  POST /api/import → import transactions                         │
│  POST /api/reconciliation/start → lancement matching            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Résumé des Ports et Services

| Service | Port | URL Health Check |
|---------|------|------------------|
| Multi-Banking | 8010 | `http://localhost:8010/health` |
| Fraud Detection | 8005 | `http://localhost:8005/health` |
| BankMatch Backend | 4090 | `http://localhost:4090/api/health` |
| Frontend Angular | 4200 | `http://localhost:4200` |

---

## Variables d'Environnement Critiques

| Variable | Valeur (dev) | Utilisé par |
|----------|--------------|-------------|
| `FRAUD_INTERNAL_SECRET` | `fraud_dev_secret_123` | Les deux modules |
| `FRAUD_SERVICE_URL` | `http://localhost:8005` | Multi-Banking |
| `BANKMATCH_BASE_URL` | `http://localhost:4090/api` | Multi-Banking |
| `BANKMATCH_INTEGRATION_ENABLED` | `false` | Multi-Banking |
| `DISABLE_INTERNAL_AUTH` | `false` | Les deux modules |

---

## Statut des Modules

| Module | Backend | Frontend | Tests | Statut |
|--------|---------|----------|-------|--------|
| Multi-Banking | Prêt | En cours d'amélioration | Prêts | **Intégrable** |
| Fraud Detection | Prêt | En cours d'amélioration | Prêts | **Intégrable** |

**Note :** Les composants UI ont été améliorés et les détails fonctionnels affinés avant envoi. Les branches `module-fraud-detection` et `module-multi-banking` contiennent la version prête pour intégration.

---

*Fiche de synthèse v1.0 — 23 août 2026*
