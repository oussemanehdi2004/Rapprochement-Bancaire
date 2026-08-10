# BankMatch — Guide d'Intégration des Modules IA

**Objectif :** ce document est la référence commune pour chaque équipe développant
un microservice IA pour BankMatch. Il définit les contrats, les conventions et
les frontières nécessaires pour une intégration propre par la suite — sans
nécessiter d'accès au backend BankMatch ni au code source du moteur de
rapprochement, qui restent privés conformément à l'organisation du projet.

---

## 1. Vue d'ensemble de l'architecture

```
Votre microservice IA (dépôt indépendant, votre propre stack)
        │
        │  appelle, en HTTP, avec un Bearer token
        ▼
Backend Node.js BankMatch  (privé — authentification, isolation multi-tenant, logique métier)
        │
        ▼
MongoDB (données de production — jamais accédées directement par les microservices IA)
```

Votre microservice ne communique jamais directement avec la base de données ou
le code source de BankMatch. Il s'authentifie comme n'importe quel client API
externe et appelle des endpoints documentés. L'intégration frontend se fait
séparément (voir Section 7) — vous n'avez besoin d'aucun accès au code source
backend ou frontend pour développer ou tester votre module.

---

## 2. Authentification — Identifier l'utilisateur courant

BankMatch utilise du JWT (HS256, secret symétrique). **N'attendez pas et ne
demandez pas le secret de signature** — un service externe ne doit jamais le
détenir, cela lui permettrait de forger des tokens.

**Pattern correct :** authentifiez-vous normalement, puis appelez l'endpoint
d'identité pour obtenir un contexte utilisateur à jour et fiable à chaque
requête qui en a besoin :

```
POST /api/auth/login
  { "username": "...", "password": "..." }
  → { accessToken, refreshToken, expiresIn, user: { id, username, roles, tenantId, ... } }

GET /api/users/me
  Header: Authorization: Bearer <accessToken>
  → id, username, roles, tenantId, email de l'utilisateur courant
```

Les access tokens expirent au bout de **15 minutes**. Ne mettez pas en cache
une décision de rôle/permission au-delà de cette durée — rappelez
`/api/users/me` plutôt que de faire confiance à un token décodé qui pourrait
être obsolète, en particulier pour toute décision importante (un changement de
rôle prend effet immédiatement de notre côté, mais pas dans un ancien token).

---

## 3. Contexte tenant

`tenantId` est une simple chaîne de caractères, au format `tenant_<id>`. Il
provient de l'utilisateur authentifié — **vous n'avez jamais besoin de le
transmettre explicitement** dans vos requêtes vers l'API BankMatch ; le
backend le déduit automatiquement du token/de la session.

Si votre microservice stocke ses propres données (scores de fraude, historique
de conversation, ou tout autre besoin propre à votre module), **associez
chaque enregistrement au `tenantId`** reçu via `/api/users/me` ou la réponse
de login, et filtrez systématiquement vos requêtes par ce champ. C'est une
règle stricte de notre côté également — chaque collection contenant des
données propres à une entreprise est scopée par tenant, et c'est le point le
plus important à respecter dans un produit multi-tenant.

---

## 4. Rôles & Permissions (pour référence — l'application des règles se fait de notre côté)

| Rôle | Signification | Peut écrire des transactions/matches ? |
|---|---|---|
| `SUPER_ADMIN` | Opérateur de la plateforme | N/A — portée plateforme |
| `ADMIN` | Administrateur de l'entreprise | Oui |
| `ACCOUNTANT` | Effectue le rapprochement | Oui |
| `USER` | Utilisateur standard | Lecture + import uniquement |
| `VIEWER` | Rôle historique, lecture seule | Non (déprécié, ne pas développer en ciblant ce rôle) |

Vous n'avez pas besoin de réimplémenter cette logique — appelez l'endpoint
dont vous avez besoin, et si l'utilisateur courant n'a pas la permission
requise, vous recevrez une erreur `403` (voir Section 6). Gérez ce cas
proprement plutôt que d'essayer de prédire les permissions côté client.

---

## 5. Référence des données principales

Vous lirez principalement ces données via l'API — jamais par accès direct à
la base :

**Transaction** (ligne de relevé bancaire) : `amount`, `currency`,
`bookingDate`, `label`, `reference`, `status` (UNMATCHED/MATCHED/etc.),
`tenantId`

**LedgerEntry** (écriture comptable) : `date`, `amount`, `label`,
`reference`, `accountNumber`, `journalCode`, `status`, `tenantId`

**Match** : `transactionId`, `ledgerEntryId`, `score` (0-100), `confidence`
(HIGH/MEDIUM/LOW), `scoreBreakdown`, `status`
(SUGGESTED/CONFIRMED/REJECTED), `tenantId`

**MatchHistory** : piste d'audit de chaque décision de match (`action`,
`previousStatus`, `newStatus`, `userId`, `createdAt`) — c'est le jeu de
données labellisé (confirmé vs. rejeté) si un module a besoin de données
d'entraînement pour une approche supervisée.

Le schéma détaillé champ par champ est disponible sur demande — cette section
couvre ce qui est pertinent pour une consommation type par un module IA, pas
le schéma interne complet.

---

## 6. Conventions API

- **URL de base (dev) :** `http://localhost:4090/api` — une URL stable de
  dev/staging sera fournie pour un usage partagé une fois l'environnement
  Atlas en place.
- **Pas de versioning** — les routes sont directement sous `/api/...`. Ne
  prévoyez pas de préfixe de version.
- **Réponse en cas de succès :**
  ```json
  { "success": true, "data": { ... } }
  ```
  En cas de pagination, un objet `pagination: { page, limit, total, totalPages }` est ajouté.
- **Réponse en cas d'erreur :**
  ```json
  { "success": false, "error": { "code": "SOME_CODE", "message": "..." }, "requestId": "..." }
  ```
  Utilisez `error.code` pour un traitement programmatique, `error.message`
  pour l'affichage.
- **Codes de statut courants :** `401` (token absent/invalide/expiré), `403`
  (permission insuffisante ou tenant inactif), `402` (quota épuisé), `429`
  (limite de requêtes atteinte), `500` (erreur serveur).
- **Merci d'utiliser ce même format pour l'API de votre propre
  microservice** — c'est ce qu'attend le reste de la plateforme, et cela
  rendra l'intégration de vos endpoints directe plutôt qu'un exercice de
  traduction.

---

## 7. Intégration Frontend (pas d'accès direct au code — voici ce que vous recevrez à la place)

Le frontend réel de BankMatch est fortement couplé à son backend (sidebar
dynamique selon le rôle, contexte tenant, état d'authentification) — vous
transmettre le code Angular réel ne vous permettrait pas de construire quoi
que ce soit d'exploitable de manière isolée, et ce n'est de toute façon pas
nécessaire. Vous recevrez à la place un **kit d'intégration frontend**,
préparé séparément, contenant :

- Les conventions d'architecture Angular utilisées dans l'application
  (composants standalone, structure de dossiers, nommage) afin que vos
  composants s'intègrent naturellement plutôt que de créer des conflits.
- Les interfaces/modèles TypeScript partagés (User, Match, Transaction,
  etc.) correspondant aux structures de données réelles.
- Les contrats API décrits dans ce document, prêts à être appelés.
- Des données mockées/d'exemple pour construire et démontrer votre
  interface sans avoir besoin d'une connexion en direct au backend partagé
  à chaque étape.

**Votre rôle :** construire l'interface de votre fonctionnalité comme un
composant autonome et bien structuré, en respectant ces conventions.
**Notre rôle (intégration, réalisée de manière centralisée, pas par chaque
équipe) :** brancher votre composant terminé dans l'application réelle avec
l'authentification, le contexte tenant et le routage effectifs. Vous n'avez
pas besoin de traiter cette partie — essayer de le faire reviendrait à
reconstruire l'authentification et le RBAC depuis zéro, ce qui n'est pas un
bon usage de votre temps.

---

## 8. Convention des scores de confiance

Le moteur de rapprochement de BankMatch utilise une échelle **0-100
(entier)**, avec :
- **HIGH** ≥ 85 (auto-confirmable)
- **MEDIUM** 70-84 (nécessite une revue)
- **LOW** 65-69 (faible, signalé pour revue)

**Si votre module produit une probabilité (0.0-1.0)** — par exemple la
confiance d'un classifieur — convertissez-la avec `score = round(probability
* 100)` puis appliquez les mêmes seuils HIGH/MEDIUM/LOW ci-dessus avant de
l'afficher. Cela garantit que l'indicateur de confiance de chaque module
reste visuellement et sémantiquement cohérent sur toute la plateforme,
plutôt que chaque module invente sa propre échelle.

---

## 9. MongoDB Atlas — Environnement de développement partagé (clarification)

La base Atlas en cours de mise en place est un **jeu de données de référence
partagé** — des données synthétiques et réalistes de transactions/écritures/
matches que chacun peut utiliser pour développer et tester, afin qu'on ne
travaille pas chacun sur des données locales différentes ou incomplètes. Ce
n'est **pas** une obligation que le stockage opérationnel de votre module
(résultats, scores, historique de conversation, ou tout ce que vous
persistez) soit également en MongoDB — gardez ce qui convient le mieux à
votre module (Supabase, etc. convient très bien pour vos propres données).
Lisez depuis Atlas pour obtenir des données de test réalistes ; écrivez vos
propres résultats là où cela a du sens pour votre module.

---

## 10. Conventions de déploiement (pour le moment où votre module sera prêt à être intégré)

- Fournir un **Dockerfile** (multi-stage si pertinent) exposant un seul
  port, avec un endpoint `GET /health` retournant un statut 200.
- Lire toute la configuration depuis des variables d'environnement — pas
  d'URL ni de secrets codés en dur.
- Logger vers stdout (Docker collecte automatiquement ces logs), dans un
  format structuré si possible.
- Documenter vos endpoints (une spécification Swagger/OpenAPI est idéale,
  car elle rend le branchement de votre service quasi mécanique) ainsi
  qu'un README court : ce que fait le service, comment le lancer, quelles
  variables d'environnement il nécessite.

---

## 11. Frontières spécifiques par module

**AI Fraud Detection :** BankMatch ne dispose pas de détection de fraude —
aucun chevauchement. Vous pouvez développer librement. Un point à régler
avant l'intégration : le JWT est actuellement désactivé en développement
pour ce module — il faudra le réactiver pour que le pattern
d'authentification de la Section 2 fonctionne.

**AI Accounting Intelligence :** Vos cas d'usage (détection de doublons,
écarts de TVA, proposition de compte comptable, etc.) ne chevauchent pas le
moteur de rapprochement — c'est bien. Une remarque d'architecture : le
backend BankMatch appellera directement votre service FastAPI ; il n'est
pas nécessaire de maintenir votre propre couche Node.js entre Angular et
FastAPI sur le long terme, puisque le backend principal remplira ce rôle
une fois l'intégration réalisée.

**AI Financial Copilot :** BankMatch dispose déjà d'exports complets
CSV/Excel/PDF, de tableaux de bord par rôle, de KPIs, d'analyses de
tendances, de gestion des exceptions et de pistes d'audit (voir
`/api/enterprise-reporting/*` et `/api/dashboard/*`). La valeur ajoutée du
Copilot réside dans l'insight en langage naturel **par-dessus** ces données
existantes — pas dans un nouveau générateur d'exports ou de rapports. Merci
de ne pas reconstruire la génération PDF/Excel ni le calcul des KPIs ;
appuyez-vous sur les endpoints existants et concentrez-vous sur la couche
conversationnelle/explicative.

**Rapprochement Multi-Banques :** le moteur de rapprochement existant gère
déjà le matching one-to-one, one-to-many et many-to-one avec un scoring
complet — merci de ne pas le reconstruire. Concentrez-vous sur la
normalisation des formats bancaires (CAMT.053, MT940, variantes CSV par
banque) et l'agrégation multi-banques en un flux unifié, puis appelez les
endpoints existants `/api/import` et `/api/reconciliation` pour la partie
matching elle-même.

---

## 12. Points encore en cours de finalisation

- URL stable de développement/staging partagée (actuellement en local
  uniquement)
- Identifiants et détails de connexion MongoDB Atlas
- Export OpenAPI/Swagger complet pour faciliter la génération de clients
- Kit d'intégration frontend (Section 7) — en préparation

Pour toute question ou tout point de ce document qui ne correspondrait pas
à ce que vous développez — merci de le signaler dans le canal plutôt que de
faire une supposition, ce document sera amené à évoluer au fur et à mesure
que l'intégration démarre réellement.
