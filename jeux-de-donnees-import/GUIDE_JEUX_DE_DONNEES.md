# Guide des Jeux de Données — Import Fraud Detection & Multi-Banking

> **Objectif** : tester **tous les scénarios métier** implémentés dans le backend `fraud-detection/rules_engine.py` et les 4 parsers `multi-banking/parsers/*.py`, et valider **tout le frontend** (KPIs, charts, tables, filtres, pagination, colonne bénéficiaire, badges).

Tous les fichiers sont **cohérents avec le code** : séparateurs, colonnes obligatoires, seuils (`thresholds.json`), scores, catégories.

---

## 1. Où importer quoi ?

| Module frontend | Onglet / Zone | Bouton | Format attendu | Paramètres UI |
|---|---|---|---|---|
| **Fraud Detection** | `Vue d'ensemble` > `Importer des transactions` | `Choisir CSV` → analyse auto | `CSV` avec `id, amount` obligatoires ; header en minuscules ; `,` ou `;` + virgule décimale OK | Aucun — le `tenant_id` du CSV est conservé en `/api/analyze-demo`, écrasé par le token en `/api/analyze` |
| **Multi-Banking** | `Télécharger un fichier bancaire` | `Télécharger et traiter` | `CSV`, `CAMT.053`, `MT940`, `PAIN.001` | **Banque** = `BNP Paribas` (ou autre), **Format** = choisir selon fichier, **Tenant ID** = `default` ou `tenant-123` |

> **Astuce** : pour Multi-Banking, le `Tenant ID` et `Banque` du formulaire écrasent les valeurs du fichier. Utilisez `default` pour voir les données dans `Transactions` et `Rapports`.

---

## 2. Fraude Detection — 15 CSVs (`01-fraud-detection-csv/`)

### Header complet utilisé
```
id,tenant_id,transaction_reference,date,description,amount,
sender_balance_before,sender_balance_after,receiver_balance_before,receiver_balance_after,
transaction_type,account_iban,beneficiary_iban,device_fingerprint,country,city
```
- `REQUIRED_COLUMNS = ['id','amount']` (frontend `fraud-dashboard.component.ts:164`)
- `NUMERIC_COLUMNS = ['amount','sender_balance_before',...]` gère `,` décimale
- `transaction_type` = `TRANSFER` ou `CASH_OUT` (impacte `RETRAIT_CASH_IMPORTANT`)
- `device_fingerprint`/`country`/`city` testent `CHANGEMENT_DEVICE` / `CHANGEMENT_GEOLOC`

### Seuils (`thresholds.json`)
```
SEUIL_REGLEMENTAIRE=10000, SEUIL_APPROCHE_RATIO=0.90 (=> 9000), SEUIL_CASH_OUT=5000,
RATIO_MONTANT_INHABITUEL=8, SEUIL_JOURS_DORMANT=90
RULE_WEIGHTS: SEUIL_REGLEMENTAIRE 100, MOTCLE_SENSIBLE 100, FRACTIONNEMENT 90, RETRAIT 80, MONTANT_EXCEPTIONNEL 60, COMPTE_RARE 50, SEUIL_APPROCHE 40, etc.
Action: >=70 BLOCKED, 40-69 REVIEW_NEEDED, <40 APPROVED
ML + règles fusionnés par fuse_scores() + IsolationForest
```

| # | Fichier | Contenu volontaire | Règle(s) déclenchée(s) — `apply_business_rules()` | Score / Catégorie | Résultat attendu frontend |
|---|---|---|---|---|
| 1 | **FD_01_seuil_reglementaire.csv** | 3 tx >10k (15000,12000,10001) + 1 normale 2500 | `SEUIL_REGLEMENTAIRE` | 100 / `BLOCKED` chaque tx >10k ; 1 APPROVED | KPIs: 75% fraude (3/4), `Règles les plus déclenchées` = Seuil réglementaire 3, table `Statut=new`, `Bénéficiaire` IBAN visible, jauge rouge |
| 2 | **FD_02_approche_seuil.csv** | 9500 (95%), 9000 (90% pile), 8999 (<90%), 45 | `SEUIL_APPROCHE` pour 9500 & 9000, 8999 non | 40 / `REVIEW_NEEDED` pour 2 | 50% fraude si seuil 50, 2 `Approche du seuil`, tri par score |
| 3 | **FD_03_retrait_cash.csv** | `CASH_OUT` 6000+8000 (DBIT), 2000 (sous seuil), + payment 85 | `RETRAIT_CASH_IMPORTANT` pour 6000/8000 | 80 / `BLOCKED` | 2 BLOCKED, test `transaction_type` sensible à la casse (upper) |
| 4 | **FD_04_mot_cle_sensible.csv** | Descriptions `CASINO`, `POKER`, `PARIS BET`, `OFFSHORE CRYPTO BITCOIN`, `HAVEN` + 1 neutre | `MOTCLE_SENSIBLE` regex `(?i)CASINO|PARIS|POKER|BET|PARI|OFFSHORE|CRYPTO|BITCOIN|HAVEN` | 100 / `BLOCKED` | 5 BLOCKED, `Facteurs` = "Mot-clé sensible (LAB/FT)", `Explicabilité SHAP` + facteurs |
| 5 | **FD_05_donnee_invalide.csv** | amount 0, -500, 2 000 000 000 (>1e9) + 100 ok | `DONNEE_INVALIDE` via `validate_transaction_sanity` | 100 / `BLOCKED` | Toujours BLOCKED même si description clean — test `Règle Phase 0` |
| 6 | **FD_06_horaire_atypique.csv** | Dates `01:15`, `02:30`, `04:45` + `12:00` + `15:30` | `HORAIRE_ATYPIQUE` (`1<=hour<5`) | 25 / `APPROVED` mais `Factors` visible | Seul facteur horaire → score faible mais visible dans `Horaire atypique`, test `Heatmap horaire des alertes` (barres 1-4h hautes) |
| 7 | **FD_07_velocite_anormale.csv** | Même `account_iban=FR7611111222233334444555555`, 4 tx en 10 min (10:00,10:02,10:05,10:10) + autre compte + 1 lente | `VELOCITE_ANORMALE` après 4e tx (>3 en 15 min) — cache `_velocity_cache` | 40 / `REVIEW_NEEDED` à partir de tx4 | Tx4 a `Vélocité anormale`, `Heatmap` + `Évolution` groupés, test isolation compte |
| 8 | **FD_08_changement_device_geoloc.csv** | Même compte `FR763333...7777`, device `abc123`→`xyz999`→`xyz999` DE, + autre compte | `CHANGEMENT_DEVICE` (70) à tx2, `CHANGEMENT_GEOLOC` (85) à tx3 | Vars | Tx2: "Changement device", Tx3: "Changement géolocalisation ... DE", caches `_device_cache`/`_geo_cache` — 2 règles cumulables |
| 9 | **FD_09_paiement_duplique.csv** | 2 tx identiques (`tenant-123`,2500,`Paiement Fournisseur ABC`) + 1 unique | `PAIEMENT_DUPLIQUE` via `apply_batch_rules` `_detect_paiements_dupliques` (occurrences==2) | 30 | Les 2 tx ont `Paiement dupliqué` + `Doublon potentiel`, 1 Normal |
| 10 | **FD_10_paiement_repetitif.csv** | 3 tx identiques `800, Abonnement Service X` + 1 normale | `PAIEMENT_REPETITIF` (occ>=3) | 60 / `REVIEW/BLOCKED` | 3 tx avec `Paiement répétitif : 3 transactions...` |
| 11 | **FD_11_fractionnement.csv** | Même `tenant+date=2026-08-24`, 4 tx 3000+4000+3500+3000 =13500 >10k, chacun <=10k | `FRACTIONNEMENT_SUSPECT` via `_detect_fractionnement` | 90 / `BLOCKED` | 4 tx avec même message "Fractionnement suspect : 4 paiements totalisant 13500..." — test cumul journalier |
| 12 | **FD_12_nouvel_iban.csv** | Même `account_iban=FR765555...9999`, 3 `beneficiary_iban` inconnus | `NOUVEL_IBAN` (30) si `beneficiary_history` vide (cas demo local) → 30 | 30 | Sans Supabase seed, tout IBAN est nouveau → 3× `Premier virement vers ce nouvel IBAN` — avec Supabase history, seul premier est nouveau |
| 13 | **FD_13_clean_approved.csv** | 5 tx petites, descriptions neutres, heures diurnes, montants <500 | `NON_CATEGORISE` | 0 / `APPROVED` | 0 fraude, KPIs 0%, `Score de risque global` faible vert, tables vides → "Aucune alerte détectée" |
| 14 | **FD_14_semicolon_separator.csv** | 3 lignes `;` + virgules décimales `1500,50` | Test parseur `separator = ';'` + `replace(',', '.')` | Mix | Doit parser sans erreur, `importError` ne s'affiche pas — teste `splitCsvLine` |
| 15 | **FD_15_mix_complet.csv** | 14 tx mixant les 12 règles : seuil 15000, approche 9500, cash 6000, casino 250, dupliqué 2500×2, répétitif 800×3, fractionnement 4000×3 même jour, horaire 02:30 + device change DE/Berlin + 1 clean | Toutes | Scores 25-100, `BLOCKED`/`REVIEW`/`APPROVED` mixtes | **Fichier démo complet** : KPIs ~85% fraude (12/14), `Répartition par sévérité` donut (critical/high...), `Règles les plus déclenchées` top 6, `Évolution du taux de fraude` 28/08 point, `Heatmap` pique à 10-13h + 02h, table triée par `fraudScore` décroissant, pagination, filtres, export CSV/PDF, `Bénéficiaire` jamais `—` (IBAN réels), `Montant`/`Statut` bien séparés |

> **Notes backend**
> - `MONTANT_EXCEPTIONNEL` (×8 moyenne) et `COMPTE_RAREMENT_UTILISE` (>90j) nécessitent `account_aggregate` venant de `Supabase: account_aggregates`. En **local demo** (`/api/analyze-demo` sans supabase), ces 2 règles **ne se déclenchent pas** → `NON_CATEGORISE`. Pour les tester, seed Supabase via `load_sample_data_to_supabase.py` ou injecter un `account_aggregate` factice.
> - `beneficiary` désormais persisté : `TransactionOutput.beneficiary/beneficiary_iban` renvoyé par `POST /api/analyze-demo` et stocké en `fraud_alerts.beneficiary` → colonne **Bénéficiaire** n’est plus `—`.

#### Où voir quoi dans le frontend après import fraud CSV
- **KPIs haut** : `Transactions analysées` = nb lignes, `Taux de fraude détecté` (score>=`appliedMlThreshold` 50% par défaut), `Montant total à risque`, `Score de risque global` (couleur `gaugeColor()`)
- **Visualisations & Tendances** (Chart.js) : ne doivent plus être vides — doughnut sévérité, bar horizontale règles, line `Évolution` (dates `2026-08-xx`), `Heatmap horaire`
- **Statistiques de Détection** : `TOTAL ALERTES / CRITIQUES / ÉLEVÉES / EN INVESTIGATION / RÉSOLUES`
- **Table Alertes** : `Score` jauge, `Criticité` badge, `Description`, `Règle` badge, `Bénéficiaire` (IBAN, sinon `—`), `Montant` à droite, `Statut` badge coloré (new=rose, dismissed=emerald)
- **Onglets** : `Détection Hybride`, `Réseaux & Graphe` (Neo4j), `Explicabilité SHAP` (contributions `amount`, `device`, etc.), `Règles Métier`, `Config Seuils`

---

## 3. Multi-Banking — 10 fichiers (`02-multi-banking/`)

### Principe
`multi-banking/parsers/*.py` → `PivotTransaction` (`tenant_id,bank_id,account_iban,value_date,label,amount,currency,counterparty_iban,reference,balance_before/after,source_line_hash`) → `POST /banking/api/multi-banking/ingest` → `build_fraud_payload()` → `POST http://fraud-service:8006/api/analyze` (avec retry 3×) → maj `upload_stats` + `recentUploads`.

Chaque parser attend :
- **CSV** (`csv_bank.py`) : `account_iban,value_date,label,amount,currency,counterparty_iban,reference,balance_before,balance_after` (lève 400 si vide)
- **CAMT.053** (`camt053.py`) : XML `urn:iso:std:iso:20022:tech:xsd:camt.053.001.02`, `Acct/Id/IBAN`, `Ntry/Amt`, `CdtDbtInd`, `ValDt/Dt`, `AddtlNtryInf`, `AcctSvcrRef`, balances `OPBD` optionnelles
- **MT940** (`mt940.py`) : texte `:20:,:25:IBAN,:60F:CYYMMDD...,:61:YYMMDD[HHMM][C/D][lettre]montant,:86:libellé,:62F:...` — montant `,` → `.`
- **PAIN.001** (`pain001.py`) : XML `urn:iso:std:iso:20022:tech:xsd:pain.001.001.03`, `PmtInf/DbtrAcct/IBAN`, `ReqdExctnDt`, `CdtTrfTxInf/PmtId/EndToEndId`, `Amt/InstdAmt`, `CdtrAcct/IBAN`, `RmtInf/Ustrd`

| Fichier | Format UI | Banque à choisir (ex) | Tenant | Contenu | Nb tx attendues | Détection fraude attendue (après ingest) | Test frontend |
|---|---|---|---|---|---|---|---|
| `csv/MB_CSV_01_clean.csv` | `CSV` | `BNP Paribas` | `default` | 5 tx clean (salaire, loyer, supermarché) | 5 | 0 BLOCKED → `RÉUSSIS` 5, `TOTAL TRANSACTIONS` 5 | Liste `Téléchargements récents` ligne verte `Réussi`, KPIs `2/2 → 3/3` après 3 imports, `Transactions` page 5 lignes |
| `csv/MB_CSV_02_doublons_et_repetitions.csv` | `CSV` | `BNP Paribas` | `default` | 2× identical `PAIEMENT FOURNISSEUR ABC -2500` + 3× `ABONNEMENT SERVICE X -800` | 6 | 2 → `PAIEMENT_DUPLIQUE` 30, 3 → `PAIEMENT_REPETITIF` 60 → 5/6 `SUSPICIOUS` | Vérifie `fraud_alerts` dedup, `Règles les plus déclenchées` monte |
| `csv/MB_CSV_03_fractionnement_et_seuils.csv` | `CSV` | `BNP Paribas` | `default` | 4× fractionnement même compte/val_date `2026-08-18` (4000+4000+3500+3000=14500) + 15000 seuil + casino 250 | 6 | 4 `FRACTIONNEMENT` 90 + 1 `SEUIL` 100 + 1 `MOTCLE` 100 | Test somme journalière ; `TOTAL TRANSACTIONS` +6 |
| `camt053/MB_CAMT053_01_simple.xml` | `CAMT.053` | `BNP Paribas` | `default` | 3 Ntry propres (2500 CRDT, 900 DBIT, 85 DBIT) + `OPBD` 10000 | 3 | 0 fraude | Vérifie balances `balance_before/after` calculés |
| `camt053/MB_CAMT053_02_fraude_avancee.xml` | `CAMT.053` | `BNP Paribas` | `default` | 1×15000 DBIT seuil + 2×2500 dupliqué + casino 250 + 3×4000/3500 fractionnement | 7 | 1 SEUIL 100, 2 DUPLIQUE 30, 1 CASINO 100, 3 FRACTION 90 | Test `CdtrAcct`/`DbtrAcct` IBAN parsing |
| `mt940/MB_MT940_01_simple.txt` | `MT940` | `BNP Paribas` | `default` | `:25:FR763...`, `60F` 10000, 3× `:61:` (2500C, 900D, 150D) + `:86:` | 3 | 0 fraude | Vérifie `value_date` `20YYMMDD` → `YYYY-MM-DD`, `:60F:` solde |
| `mt940/MB_MT940_02_fraude.txt` | `MT940` | `BNP Paribas` | `default` | 7× `:61:` : 15000 seuil, 2500×2 dupliqué, casino, 4000×2+3500 fractionnement | 7 | Idem CAMT2 | Test regex fix `([A-Za-z])?` vs `(\w)?` |
| `pain001/MB_PAIN001_01_simple.xml` | `PAIN.001` | `BNP Paribas` | `default` | 1 `PmtInf` avec 3 `CdtTrfTxInf` (2500,900,90) | 3 | 0 fraude | Vérifie `DbtrAcct`, `CdtrAcct`, `RmtInf/Ustrd` |
| `pain001/MB_PAIN001_02_fraude.xml` | `PAIN.001` | `BNP Paribas` | `default` | 1 `PmtInf` avec 7 tx : 15000 seuil, 2500×2 dupliqué, 800×3 répétitif, casino 250 | 7 | 1 SEUIL, 2 DUPLIQUE, 3 REPETITIF, 1 CASINO | Test `EndToEndId`, `ReqdExctnDt` |
| _(Bonus)_ `sample.csv` + `sample_camt.xml` déjà présents dans `multi-banking/data/` | — | — | — | Historiques fournis — servent de référence `clean` | 5 / 2 | Clean | Comparer nos fichiers vs samples |

#### Flow attendu Multi-Banking
1. `POST /banking/api/multi-banking/ingest` renvoie `{success:true, parsed_count, fraud_result, bankmatch_result}` ou `502` si `fraud-service` down (retry 3× 0.5s backoff).
2. `upload_stats` (`/banking/stats`) incrémente `total_files/ successful/ total_transactions`; `recent_uploads` (`/banking/uploads`) ajoute ligne avec `filename,bank,format,status,transaction_count,uploaded_at`.
3. Frontend `GET /api/transactions` (dédupliqué par `transaction_reference`) alimente page **Transactions** (pagination 10/ligne, filtres `IMPORT/STATUT/DATE/RECHERCHE` sans emoji qui chevauche).
4. Page **Rapports** (`/api/reports?start_date&end_date`) montre `total_transactions/fraud_count/fraud_rate/blocked_amount`, `category_breakdown`, `time_series`.

---

## 4. Scénarios de test recommandés (pas à pas)

### A. Validation Fraud Detection
1. Ouvrir `http://localhost:4200/fraud-detection` → **KPIs 0** au premier chargement, spinner bref, puis demo 13 tx si backend down (fallback mock).
2. Importer **FD_13_clean_approved.csv** → `13? non 5` → KPIs `5 analysées / 0% fraude / 0€ risque / score ~12` → Mur vert, table vide "Aucune alerte".
3. Importer **FD_01_seuil...** → 3 BLOCKED rouges, progress barre 75% rouge, `Règles les plus déclenchées: Seuil réglementaire 3`.
4. Enchaîner **FD_04_mot_cle**, **FD_07_velocite**, **FD_08_device** → vérifier que `Heatmap horaire`, `Évolution`, `SHAP` se remplissent (plus de vides).
5. Importer **FD_15_mix_complet.csv** → test complet 14 lignes, `Bénéficiaire` jamais `—`, `Montant`/`Statut` colonnes séparées avec bordures, `Répartition par sévérité` donut 13/...
6. Tester **FD_14_semicolon** → parsing `;` doit réussir (même résultat que mix).
7. Onglet **Config Seuils** → changer `SEUIL_REGLEMENTAIRE` à 5000 → ré-importer FD_01 → maintenant 4e tx (2500) reste APPROVED mais 10001 devient plus critique.
8. Exporter **CSV/PDF/Synthèse PDF** → fichiers `alertes-fraude-*.csv` avec BOM `;`.

### B. Validation Multi-Banking
1. `http://localhost:4200/multi-banking` → `TOTAL FICHIERS 2/2` init → choisir `Banque=BNP Paribas`, `Format=CSV`, `Tenant ID=default`, glisser **MB_CSV_01_clean.csv** → `Réussi 5` → vérifier `Transactions` page 5 lignes, `Rapports` `2026-08-10→2026-08-14` génère 5.
2. Même avec **MB_CSV_02_doublons...** → `RÉUSSIS+1 / TOTAL 6` → aller en **Fraud Detection** → `Règles: Paiement dupliqué/répétitif` apparaissent (car `fraud-service` appelé en arrière-plan).
3. Tester chaque format : `CAMT.053` → choisir `CAMT.053`, `MT940`, `PAIN.001` → vérifier `parsed_count` correspond au `Nb tx attendues`.
4. Vérifier `Filtres & Recherche` sans emoji qui recouvre : `Import` select affiche `Tous les imports` entièrement, `Date du/au` type `date` avec icône non couvrante, `Réinitialiser` vide les 4 champs.
5. Tester pagination Transactions : avec >10 lignes (importer plusieurs CSVs → 16 tx), `Précédent` désactivé page1, `Suivant` actif → page2 `Affichage 11–16 sur 16`.

### C. Cohérence inter-modules
- `MB_CSV_03_fractionnement...` importé en Multi-Banking doit produire **exactement** les mêmes alertes que `FD_11_fractionnement.csv` importé direct en Fraud — car `build_fraud_payload()` mappe `amount,label,value_date,account_iban,counterparty_iban` vers `TransactionInput` fraud.
- Vérifier `beneficiary_iban` renvoyé par `POST /api/analyze-demo` = `counterparty_iban` du CSV multi → colonne **Bénéficiaire** identique.

---

## 5. Fichiers déjà présents (référence)
- `fraud-detection/sample_transactions.csv` : 15 lignes proches de FD_15 mais dates 2024
- `import_demo.csv` : 13 lignes tenant-123 2026-07-24 mix (sert de base à FD_15)
- `multi-banking/data/sample.csv` : 21 lignes avec 5 fractionnements 500×5 + 15000
- `multi-banking/data/sample_camt.xml` : 2 Ntry simple
- `fraud-detection/backend/sample_data/*` : `bank_statement_lines.csv` (100 lignes réalistes), `account_aggregates.csv` pour tester `MONTANT_EXCEPTIONNEL`/`COMPTE_DORMANT`

---

## 6. Conseils
- Toujours **Actualiser** après ingest (bouton `Actualiser` ou `RÉUSSIS` compteur).
- Si `Supabase` vide, `NOUVEL_IBAN` déclenché pour chaque tx → normal.
- Pour tester `Graph` Neo4j, importer plusieurs fois le même `account_iban` avec divers `counterparty_iban` → `Réseaux & Graphe` → `Rechercher les réseaux` → `Selectionner un compte`.
- En cas d’erreur `Http failure 0`, fallback mock s’active en 3.5s → pas de page blanche (fix `fraud-dashboard.component.ts:1165`).

---
*Généré pour `rapprochement-bancaire` — tous les fichiers sont dans `jeux-de-donnees-import/` et prêts à glisser-déposer.*
