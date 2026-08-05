# 🛡️ API de Détection de Fraude & Rapprochement Bancaire (FastAPI)

Bienvenue sur le service Backend de détection de fraude hybride et de rapprochement bancaire.

---

## 🚀 Fonctionnalités Clés

1. **Détection Hybride :**
   * **Moteur de règles métiers (Phases 1 & 2) :** Seuils réglementaires, détection de cash-out, mots-clés sensibles, etc.
   * **Modèle ML (Random Forest + SHAP) :** Calcul de la probabilité de fraude et explicabilité des caractéristiques.
   * **Analyse de Graphe (Neo4j - Phase 3) :** Détection de réseaux de fraude, paiements circulaires et flux réciproques.
2. **Persistance des alertes (Phase 4) :**
   * Sauvegarde automatique des résultats d'analyse dans **Supabase** (`fraud_alerts`).
3. **Sécurisation & Performance :**
   * Validation de token JWT avec support multi-tenant (`tenant_id`).
   * Wrapper universel de réponse `APIResponse[T]`.

---

## 📥 Format des Réponses API (`APIResponse`)

Toutes les réponses de l'API suivent la structure normalisée suivante :

### En cas de succès (`HTTP 200`)
```json
{
  "success": true,
  "data": [
    {
      "tenant_id": "tenant-123",
      "mongo_transaction_id": "507f1f77bcf86cd799439011",
      "id": "TX-10024",
      "date": "2026-07-16",
      "description": "ACHAT SUPERMARCHE",
      "amount": 100.0,
      "isFraud": false,
      "fraudProbability": 0.0,
      "score": 0,
      "confidence": "LOW",
      "reconciliationStatus": "MATCHED",
      "ruleCategory": "NON_CATEGORISE",
      "explainability": {
        "summary": "Aucune anomalie détectée par l'IA ou les filtres métiers.",
        "factors": [],
        "shap_contributions": []
      }
    }
  ]
}