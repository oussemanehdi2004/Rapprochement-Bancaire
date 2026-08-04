import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

type Statut = 'implemente' | 'partiel' | 'prevu';
type Module = 'fraud' | 'accounting';

interface UseCase {
  titre: string;
  description: string;
  module: Module;
  statut: Statut;
  source: string; // fichier / mécanisme technique qui le porte
}

@Component({
  selector: 'app-use-cases',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './use-cases.component.html'
})
export class UseCasesComponent {
  // Filtre actif : 'all' | 'fraud' | 'accounting'
  filtre = signal<'all' | Module>('all');

  readonly useCases: UseCase[] = [
    // ===================== MODULE AI FRAUD DETECTION =====================
    {
      titre: 'Seuil réglementaire TRACFIN (> 10 000 €)',
      description: "Toute transaction dépassant 10 000 € est automatiquement bloquée et déclarée suspecte, conformément à l'Article L561-15 du Code monétaire et financier.",
      module: 'fraud', statut: 'implemente', source: 'rules_engine.py — SEUIL_REGLEMENTAIRE'
    },
    {
      titre: 'Approche de seuil (90% du seuil)',
      description: "Détecte les tentatives de contournement du seuil réglementaire (montants proches de 9 000 € à 10 000 €).",
      module: 'fraud', statut: 'implemente', source: 'rules_engine.py — SEUIL_APPROCHE'
    },
    {
      titre: 'Retrait cash important (> 5 000 €)',
      description: "Signale les retraits CASH_OUT dépassant 5 000 €, indicateur classique de blanchiment.",
      module: 'fraud', statut: 'implemente', source: 'rules_engine.py — RETRAIT_CASH_IMPORTANT'
    },
    {
      titre: 'Mots-clés sensibles LAB/FT',
      description: "Détecte les libellés contenant CASINO, PARIS, POKER, BET… (surveillance des activités à risque).",
      module: 'fraud', statut: 'implemente', source: 'rules_engine.py — MOTCLE_SENSIBLE'
    },
    {
      titre: 'Montant exceptionnel vs historique du compte',
      description: "Compare le montant à la moyenne historique du compte (ratio x8) via les agrégats Supabase.",
      module: 'fraud', statut: 'implemente', source: 'rules_engine.py — MONTANT_EXCEPTIONNEL'
    },
    {
      titre: 'Compte rarement utilisé qui se réveille',
      description: "Signale un compte inactif depuis plus de 90 jours qui effectue soudain une transaction.",
      module: 'fraud', statut: 'implemente', source: 'rules_engine.py — COMPTE_RAREMENT_UTILISE'
    },
    {
      titre: 'Nouvel IBAN bénéficiaire',
      description: "Premier virement jamais effectué vers cet IBAN pour ce compte émetteur.",
      module: 'fraud', statut: 'implemente', source: 'rules_engine.py — NOUVEL_IBAN'
    },
    {
      titre: 'Paiement dupliqué / répétitif',
      description: "Détecte 2 (doublon) ou 3+ (répétitif) transactions identiques (montant + libellé) dans le même lot.",
      module: 'fraud', statut: 'implemente', source: 'rules_engine.py — PAIEMENT_DUPLIQUE / PAIEMENT_REPETITIF'
    },
    {
      titre: 'Fractionnement de paiements (structuring)',
      description: "Détecte plusieurs paiements sous le seuil réglementaire qui, cumulés sur une journée, le dépassent.",
      module: 'fraud', statut: 'implemente', source: 'rules_engine.py — FRACTIONNEMENT_SUSPECT'
    },
    {
      titre: 'Score de fraude par IA (Random Forest + SHAP)',
      description: "Modèle ML entraîné sur PaySim (AUC-PR 0.9992) donnant une probabilité de fraude et les facteurs SHAP explicatifs.",
      module: 'fraud', statut: 'implemente', source: 'main.py — model / explainer'
    },
    {
      titre: 'Détection de réseaux de fraude (graphe)',
      description: "Identifie un compte relié à ≥3 alertes distinctes via le graphe Neo4j (comptes ↔ transactions ↔ alertes).",
      module: 'fraud', statut: 'implemente', source: 'graph_engine.py — detect_fraud_network'
    },
    {
      titre: 'Paiements circulaires / en cascade',
      description: "Détecte un cycle de virements qui revient vers le compte émetteur d'origine (A→B→C→A).",
      module: 'fraud', statut: 'implemente', source: 'graph_engine.py — detect_circular_payment'
    },
    {
      titre: 'Flux réciproque suspect (collusion)',
      description: "Repère des allers-retours d'argent répétés entre deux comptes, signe possible de collusion.",
      module: 'fraud', statut: 'implemente', source: 'graph_engine.py — detect_reciprocal_flow'
    },
    {
      titre: 'Explicabilité des alertes',
      description: "Chaque alerte est accompagnée d'un résumé et d'une liste de facteurs explicatifs (règles + SHAP + graphe).",
      module: 'fraud', statut: 'implemente', source: 'main.py — ExplainabilityOutput'
    },
    {
      titre: 'Priorisation automatique des alertes',
      description: "Classement des alertes par sévérité (critical/high/medium/low) déduite de la probabilité de fraude.",
      module: 'fraud', statut: 'implemente', source: 'fraud-alerts.service.ts — scoreToSeverity'
    },
    {
      titre: 'Détection de comportement utilisateur atypique',
      description: "Analyse comportementale (horaires, fréquence de validation) — infrastructure prête, règle à activer.",
      module: 'fraud', statut: 'prevu', source: 'À implémenter (Behavior Analytics)'
    },

    // =================== MODULE AI ACCOUNTING INTELLIGENCE ===================
    {
      titre: 'Écritures comptables en doublon',
      description: "Identification des écritures identiques (montant, compte, date) saisies plusieurs fois.",
      module: 'accounting', statut: 'prevu', source: 'À développer avec le binôme Accounting'
    },
    {
      titre: 'Champs obligatoires manquants',
      description: "Contrôle de complétude des écritures avant validation comptable.",
      module: 'accounting', statut: 'prevu', source: 'À développer avec le binôme Accounting'
    },
    {
      titre: 'Incohérences Débit/Crédit',
      description: "Vérifie l'équilibre des écritures et la cohérence des sens comptables.",
      module: 'accounting', statut: 'prevu', source: 'À développer avec le binôme Accounting'
    },
    {
      titre: 'Écarts de TVA',
      description: "Détecte les taux de TVA incorrects, négatifs ou incohérents avec la nature de l'opération.",
      module: 'accounting', statut: 'prevu', source: 'À développer avec le binôme Accounting'
    },
    {
      titre: 'Proposition automatique du compte comptable',
      description: "Suggestion IA du compte comptable le plus probable selon le libellé de l'opération.",
      module: 'accounting', statut: 'prevu', source: 'À développer avec le binôme Accounting'
    },
    {
      titre: 'Matching intelligent (rapprochement approximatif)',
      description: "Suggestion de rapprochement bancaire quand la correspondance exacte n'est pas trouvée.",
      module: 'accounting', statut: 'prevu', source: 'À développer avec le binôme Accounting'
    },
    {
      titre: 'Score de qualité des écritures',
      description: "Note globale de fiabilité des écritures comptables, avec explication des anomalies.",
      module: 'accounting', statut: 'prevu', source: 'À développer avec le binôme Accounting'
    },
  ];

  filtered = computed(() => {
    const f = this.filtre();
    return f === 'all' ? this.useCases : this.useCases.filter(u => u.module === f);
  });

  compte(module: Module | 'all') {
    return module === 'all' ? this.useCases.length : this.useCases.filter(u => u.module === module).length;
  }

  badgeColor(s: Statut) {
    switch (s) {
      case 'implemente': return { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', label: '✅ Implémenté' };
      case 'partiel': return { bg: '#fffbeb', text: '#92400e', border: '#fde68a', label: '🟡 Partiel' };
      default: return { bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb', label: '🔜 Prévu (collab. Accounting)' };
    }
  }
}
