# Configuration des Seuils - Guide d'Utilisation

## Résumé des Modifications

### 1. Données de Test Générées
- **808 transactions bancaires** dans `sample_data/bank_statement_lines.csv`
- **808 écritures comptables** dans `sample_data/accounting_entries.csv`
- **3 anomalies injectées** pour tester les règles de détection

### 2. Ajustements des Seuils Backend (thresholds.json)

| Paramètre | Ancienne Valeur | Nouvelle Valeur | Justification |
|-----------|----------------|-----------------|----------------|
| SEUIL_APPROCHE_RATIO | 0.9 (90%) | 0.85 (85%) | Détection plus précoce des approches de seuil |
| SEUIL_CASH_OUT | 5 000€ | 3 000€ | Surveillance plus stricte des retraits cash |
| SEUIL_MONTANT_ABERRANT | 1 milliard € | 500 000€ | Seuil plus réaliste pour les montants aberrants |
| RATIO_MONTANT_INHABITUEL | 8.0 | 6.0 | Détection plus sensible des montants inhabituels |
| SEUIL_JOURS_COMPTE_DORMANT | 90 jours | 60 jours | Détection plus rapide des comptes dormants |
| MOTS_CLES_SENSIBLES | 5 mots-clés | 10 mots-clés | Ajout de termes liés aux crypto-monnaies et offshore |

### 3. Ajustements des Seuils Frontend (Simulateur)

| Paramètre | Ancienne Valeur | Nouvelle Valeur |
|-----------|----------------|-----------------|
| mlProbability (Seuil ML) | 47.58% | 50.0% |
| criticalAmountThreshold | 5 000€ | 3 000€ |

## Différence entre les Deux Systèmes de Seuils

### Backend (thresholds.json)
- **Règles métier réglementaires** automatiques
- **Portée globale** sur tout le système
- **Persistant** (sauvegardé dans le fichier)
- **Impact réel** sur la détection automatique

### Frontend (Simulateur)
- **Simulation what-if** interactive
- **Portée locale** pour tests visuels
- **Temporaire** (reset au rechargement)
- **Impact visuel** sur les affichages uniquement

## Comment Voir les Effets des Modifications

### Pour les Seuils Backend:
1. Les modifications sont déjà appliquées dans `thresholds.json`
2. Redémarrez le backend si nécessaire
3. Lancez une analyse - les règles métier utiliseront les nouveaux seuils
4. Les anomalies seront détectées avec plus de sensibilité

### Pour les Seuils Frontend (Simulateur):
1. Allez dans l'onglet "Config Seuils" de l'interface
2. Utilisez le composant "Simulateur de Seuils"
3. Ajustez "Seuil ML (%)" et "Montant Anormal (€)"
4. Observez les KPIs et graphiques se mettre à jour en temps réel

## Importation des Données de Test

### Option 1: Via l'Interface Web
1. Allez dans l'onglet "Vue d'ensemble"
2. Cliquez sur "📁 Choisir un CSV"
3. Sélectionnez `sample_data/bank_statement_lines.csv`
4. Les transactions seront analysées avec les nouveaux seuils

### Option 2: Via le Script d'Import
```bash
cd fraud-detection/backend
python load_sample_data_to_supabase.py
```

### Option 3: Données de Démo Intégrées
1. Cliquez sur "🚀 Utiliser données de démo"
2. Les données mockées avec les nouveaux seuils seront affichées

## Anomalies Injectées dans les Données de Test

Les 3 anomalies suivantes ont été générées dans les 3 derniers jours:

1. **Nouvel IBAN + montant élevé**: Premier virement vers un nouveau bénéficiaire avec montant 6x la moyenne
2. **Montant très supérieur à la moyenne**: Transaction 8x la moyenne historique du compte
3. **Compte dormant réveillé**: Compte inutilisé depuis longtemps avec gros montant soudain

## Monitoring des Résultats

Après avoir appliqué les nouveaux seuils, surveillez:

- **Taux de fraude détecté**: Devrait augmenter légèrement (seuils plus sensibles)
- **Alertes critiques**: Plus de détections précoces (seuil d'approche réduit)
- **Retraits cash**: Plus d'alertes sur les retraits > 3 000€
- **Comptes dormants**: Détection après 60 jours au lieu de 90

## Revenir aux Valeurs Précédentes

Si nécessaire, restaurez les valeurs originales dans `thresholds.json`:

```json
{
  "SEUIL_REGLEMENTAIRE": 10000.0,
  "SEUIL_APPROCHE_RATIO": 0.9,
  "SEUIL_CASH_OUT": 5000.0,
  "SEUIL_MONTANT_ABERRANT": 1000000000.0,
  "RATIO_MONTANT_INHABITUEL": 8.0,
  "SEUIL_JOURS_COMPTE_DORMANT": 90,
  "MOTS_CLES_SENSIBLES": [
    "CASINO",
    "PARIS",
    "POKER",
    "BET",
    "PARI"
  ]
}
```

## Prochaines Étapes Recommandées

1. **Tester les nouveaux seuils** avec les données générées
2. **Surveiller les faux positifs** potentiels
3. **Ajuster itérativement** selon les besoins métier
4. **Documenter les décisions** de seuil dans le fichier AGENTS.md
