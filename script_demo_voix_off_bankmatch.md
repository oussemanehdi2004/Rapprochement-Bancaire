# Script de démo voix-off — BankMatch (Multi-Banking + Fraud Detection)

Durée cible : 6-8 minutes. Chaque bloc = "ce que tu dis" (voix off, à lire tel quel ou à adapter) + "ce que tu fais" (action à l'écran).

---

## 0. Avant d'enregistrer — checklist environnement

Fais un passage à blanc complet, dans cet ordre, puis seulement enregistre.

```bash
# 1. Fraud Detection (backend)
cd fraud-detection/backend
pip install -r requirements.txt
python benchmark_fraud.py          # entraîne model_fraud.pkl s'il est absent
export JWT_SECRET="demo-secret-key"
export ENABLE_TEST_TOKEN_ENDPOINT=true
export DISABLE_INTERNAL_AUTH=true  # simplifie la démo (pas de token interne à gérer)
uvicorn main:app --reload --port 8005
```

```bash
# 2. Neo4j (pour la partie graphe)
cd fraud-detection
docker-compose up neo4j_db -d
```

```bash
# 3. Multi-Banking (backend d'ingestion)
cd multi-banking
pip install -r requirements.txt
export INTERNAL_SERVICE_SECRET="internal_dev_secret"
export DISABLE_INTERNAL_AUTH=true
export FRAUD_SERVICE_URL="http://localhost:8005"
uvicorn main:app --reload --port 8010
```

```bash
# 4. Frontend Angular
cd fraud-detection/frontend
npm install
ng serve
# http://localhost:4200
```

Vérifications rapides avant d'enregistrer :
```bash
curl http://localhost:8005/          # Fraud Detection health
curl http://localhost:8010/health    # Multi-Banking health
```

Garde ces onglets ouverts et prêts :
- Terminal (grand, police lisible)
- `http://localhost:4200/fraud-detection` (frontend)
- `http://127.0.0.1:8005/docs` (Swagger Fraud Detection)

---

## A. Introduction (30-45 sec)

*(Voix seule, ou sur une slide de titre "BankMatch — AI Fraud Detection & Multi-Banking")*

> "Bonjour, je vais vous présenter l'état d'avancement de deux modules du projet BankMatch : le module **Multi-Banking**, qui ingère et normalise les relevés bancaires quel que soit leur format, et le module **AI Fraud Detection**, qui détecte les transactions frauduleuses en combinant un moteur de règles métier, un modèle de Machine Learning explicable par SHAP, et une analyse de graphe Neo4j pour repérer les réseaux de fraude. Je vais vous montrer le pipeline complet : de l'import d'un fichier bancaire jusqu'à l'alerte de fraude affichée dans le dashboard."

---

## B. Module Multi-Banking — ingestion et normalisation

### B.1 Health check

```bash
curl http://localhost:8010/health
```

> "Le service Multi-Banking tourne sur le port 8010. Il expose trois endpoints principaux : parse, validate, et ingest. Son rôle est de transformer n'importe quel format de relevé bancaire — CSV, CAMT.053 au format ISO 20022, ou MT940 au format SWIFT — vers un schéma pivot unique, avant de le transmettre au service de détection de fraude."

### B.2 Génération d'un token interne

```bash
python multi-banking/scripts/gen_internal_token.py
```

> "Comme c'est un service interne, il attend un token JWT signé avec un secret partagé — je le génère ici avec le script fourni. En développement on peut aussi désactiver cette vérification avec `DISABLE_INTERNAL_AUTH=true`, ce que j'ai fait pour la démo."

### B.3 Parsing d'un fichier CSV

```bash
TOKEN=$(python multi-banking/scripts/gen_internal_token.py)

curl -s -X POST http://localhost:8010/api/multi-banking/parse \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@multi-banking/data/sample.csv" \
  -F "format=csv" \
  -F "tenant_id=demo_retail" \
  -F "bank_id=bank-a" | python -m json.tool
```

> "Je lui envoie un fichier CSV contenant deux transactions — un virement salaire et un paiement de loyer. Il les normalise vers le schéma pivot commun : IBAN du compte, date de valeur, montant signé, devise, contrepartie, et un hash de déduplication pour éviter les doublons."

### B.4 Parsing d'un fichier CAMT.053 (optionnel si le temps le permet)

```bash
curl -s -X POST http://localhost:8010/api/multi-banking/parse \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@multi-banking/data/sample_camt.xml" \
  -F "format=camt053" \
  -F "tenant_id=demo_retail" \
  -F "bank_id=bank-a" | python -m json.tool
```

> "Même résultat, mais cette fois à partir d'un fichier CAMT.053 au format XML ISO 20022 — le format standard européen. Le parseur extrait l'IBAN du compte, les entrées de crédit et de débit, et calcule le solde après chaque écriture."

### B.5 Validation métier

```bash
curl -s -X POST http://localhost:8010/api/multi-banking/validate \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@multi-banking/data/sample.csv" \
  -F "format=csv" \
  -F "tenant_id=demo_retail" \
  -F "bank_id=bank-a" | python -m json.tool
```

> "Avant transmission, chaque transaction passe une validation : IBAN obligatoire, date au format ISO 8601, montant non nul, et détection de doublons par hash. C'est ce qui garantit la qualité des données avant qu'elles n'entrent dans le pipeline de détection de fraude."

### B.6 Pipeline complet : ingest → Fraud Detection

```bash
curl -s -X POST http://localhost:8010/api/multi-banking/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@multi-banking/data/sample.csv" \
  -F "format=csv" \
  -F "tenant_id=demo_retail" \
  -F "bank_id=bank-a" | python -m json.tool
```

> "Et voici le vrai enjeu : l'endpoint `ingest` fait tout en une seule requête — il parse le fichier, puis transmet directement chaque transaction au service Fraud Detection pour analyse. Vous voyez dans la réponse le champ `fraud_result`, qui contient le verdict de chaque transaction. C'est le pont entre les deux modules."

---

## C. Module Fraud Detection — détection hybride

### C.1 Génération d'un token de test

```bash
curl http://localhost:8005/api/token
```

> "Côté Fraud Detection, je génère de la même façon un token JWT — en production ce token viendrait du backend BankMatch central."

### C.2 Cas d'usage n°1 — Seuil réglementaire

```bash
curl -X POST http://localhost:8005/api/analyze \
  -H "Content-Type: application/json" \
  -d '[{
    "tenant_id": "tenant-123",
    "transaction_reference": "demo-001",
    "id": "TX-DEMO-1",
    "date": "2026-08-06",
    "description": "VIREMENT FOURNISSEUR",
    "amount": 15000.0,
    "sender_balance_before": 50000.0,
    "sender_balance_after": 35000.0,
    "receiver_balance_before": 0.0,
    "receiver_balance_after": 15000.0,
    "transaction_type": "TRANSFER"
  }]' | python -m json.tool
```

> "Cette transaction dépasse le seuil réglementaire de 10 000 euros — elle est automatiquement bloquée et classée en catégorie `SEUIL_REGLEMENTAIRE`, conformément à l'obligation de déclaration TRACFIN."

### C.3 Cas d'usage n°2 — Mot-clé sensible

```bash
curl -X POST http://localhost:8005/api/analyze \
  -H "Content-Type: application/json" \
  -d '[{
    "tenant_id": "tenant-123",
    "transaction_reference": "demo-002",
    "id": "TX-DEMO-2",
    "date": "2026-08-06",
    "description": "VIREMENT CASINO EN LIGNE",
    "amount": 250.0,
    "sender_balance_before": 2000.0,
    "sender_balance_after": 1750.0,
    "receiver_balance_before": 0.0,
    "receiver_balance_after": 250.0,
    "transaction_type": "TRANSFER"
  }]' | python -m json.tool
```

> "Ici, c'est le libellé qui déclenche l'alerte, même sur un petit montant — c'est la détection de mots-clés sensibles liés à la lutte anti-blanchiment et financement du terrorisme, LAB/FT."

### C.4 Cas d'usage n°3 — Détection IA et explicabilité SHAP

```bash
curl -X POST http://localhost:8005/api/analyze \
  -H "Content-Type: application/json" \
  -d '[{
    "tenant_id": "tenant-123",
    "transaction_reference": "demo-003",
    "id": "TX-DEMO-3",
    "date": "2026-08-06",
    "description": "ACHAT EN LIGNE",
    "amount": 1200.0,
    "sender_balance_before": 1500.0,
    "sender_balance_after": 900.0,
    "receiver_balance_before": 0.0,
    "receiver_balance_after": 300.0,
    "transaction_type": "TRANSFER"
  }]' | python -m json.tool
```

> "Cette transaction ne déclenche aucune règle métier, mais regardez l'écart de solde émetteur : après le virement, le solde ne correspond pas à ce qu'il devrait être. C'est ce genre de pattern anormal que le modèle Random Forest capte. Le champ `explainability.shap_contributions` dans la réponse JSON nous montre quelles variables ont le plus pesé dans la décision — c'est ce qui rend le score de l'IA transparent et auditable, plutôt qu'une boîte noire."

---

## D. Démo Frontend (bascule navigateur — `http://localhost:4200/fraud-detection`)

> "Passons maintenant à l'interface utilisateur, qui consomme cette même API."

**Onglet Vue d'ensemble**
- Clique sur **"Utiliser données de démo"**.
> "En un clic, on lance l'analyse sur un jeu de transactions de démonstration, et les indicateurs clés se mettent à jour en temps réel : nombre de transactions analysées, taux de fraude détecté, montant total à risque, et score de risque global."

**Onglet Détection Hybride**
> "Ici on voit, transaction par transaction, la décision finale qui combine le résultat de la règle métier et le score du modèle ML — c'est le principe de fusion hybride : dès qu'une des deux couches signale un risque, la transaction est marquée suspecte."

**Onglet Explicabilité SHAP**
> "Cet onglet agrège les contributions SHAP sur l'ensemble du lot analysé, pour visualiser quelles variables reviennent le plus souvent dans les décisions de l'IA."

**Onglet Réseaux & Graphe**
- Lance une recherche de comptes suspects.
> "Ici on interroge Neo4j pour visualiser les réseaux de comptes liés à plusieurs alertes, détecter les paiements circulaires, et les flux réciproques suspects entre deux comptes — un signe classique de collusion."

**Onglets Règles Métier et Config Seuils**
> "Enfin, ces deux onglets montrent que rien n'est figé dans le code : les règles déclenchées sur le lot sont listées ici, et tous les seuils — seuil réglementaire, ratio de montant inhabituel, mots-clés sensibles — sont paramétrables directement depuis l'interface, sans redéploiement."

---

## E. Conclusion (15-20 sec)

> "En résumé : le module Multi-Banking normalise n'importe quel relevé bancaire vers un format pivot commun et le transmet automatiquement à la détection de fraude ; le module Fraud Detection combine règles métier, intelligence artificielle explicable et analyse de graphe pour une détection multicouche ; et le tout est piloté depuis un dashboard opérationnel connecté en temps réel. Merci de votre attention."

---

## Conseils pratiques

- Parle lentement, une phrase = une action à l'écran.
- Teste le micro avant (niveau sonore, pas de bruit de fond).
- Vise 6-8 minutes avec les deux modules — coupe la partie C.3 ou D si tu dois raccourcir.
- Si tu bafouilles, ne recommence pas tout : relance juste la phrase, tu couperas au montage (CapCut / DaVinci Resolve, gratuits).
- Exporte en MP4, upload sur Slack ou un lien Drive/Loom.
