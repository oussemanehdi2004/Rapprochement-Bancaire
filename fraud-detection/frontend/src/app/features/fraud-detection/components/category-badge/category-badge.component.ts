import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

const CATEGORY_LABELS: Record<string, string> = {
  SEUIL_REGLEMENTAIRE: 'Seuil réglementaire',
  SEUIL_APPROCHE: 'Approche du seuil',
  RETRAIT_CASH_IMPORTANT: 'Retrait cash important',
  MOTCLE_SENSIBLE: 'Mot-clé sensible',
  MONTANT_EXCEPTIONNEL: 'Montant exceptionnel',
  COMPTE_RAREMENT_UTILISE: 'Compte rarement utilisé',
  NOUVEL_IBAN: 'Nouvel IBAN',
  PAIEMENT_DUPLIQUE: 'Paiement dupliqué',
  PAIEMENT_REPETITIF: 'Paiement répétitif',
  FRACTIONNEMENT_SUSPECT: 'Fractionnement suspect',
  RESEAU_FRAUDE: 'Réseau de fraude',
  PAIEMENT_CIRCULAIRE: 'Paiement circulaire',
  COLLUSION_SUSPECTE: 'Collusion suspecte',
  COMPTE_MULE: 'Compte mule',
  DONNEE_INVALIDE: 'Donnée invalide',
  NON_CATEGORISE: 'Non catégorisé',
  montant_exceptionnel: 'Montant exceptionnel',
};

@Component({
  selector: 'app-category-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium
      bg-blue-50 text-blue-700 border border-blue-100
      dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
      <span class="mr-1.5 h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400"></span>
      {{ label }}
    </span>
  `
})
export class CategoryBadgeComponent {
  label = 'Non catégorisé';

  @Input()
  set category(value: string) {
    const key = value || 'NON_CATEGORISE';
    this.label = CATEGORY_LABELS[key] ?? this.humanize(key);
  }

  private humanize(raw: string): string {
    return raw
      .toLowerCase()
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}
