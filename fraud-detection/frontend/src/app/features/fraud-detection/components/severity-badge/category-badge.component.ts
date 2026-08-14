import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-category-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span [class]="'category-badge category-' + categoryClass()">
      {{ categoryLabel() }}
    </span>
  `,
  styles: [`
    .category-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
      background: #f5f5f5;
      color: #666;
      border: 1px solid #ddd;
    }
    .category-SEUIL_REGLEMENTAIRE {
      background: #ffebee;
      color: #c62828;
      border-color: #ef9a9a;
    }
    .category-SEUIL_APPROCHE {
      background: #fff3e0;
      color: #ef6c00;
      border-color: #ffcc80;
    }
    .category-RETRAIT_CASH_IMPORTANT {
      background: #fff8e1;
      color: #f57f17;
      border-color: #ffe082;
    }
    .category-MOTCLE_SENSIBLE {
      background: #fce4ec;
      color: #c2185b;
      border-color: #f48fb1;
    }
    .category-RESEAU_FRAUDE {
      background: #e3f2fd;
      color: #1565c0;
      border-color: #90caf9;
    }
    .category-NON_CATEGORISE {
      background: #f5f5f5;
      color: #757575;
      border-color: #bdbdbd;
    }
  `]
})
export class CategoryBadgeComponent {
  category = input.required<string>();

  categoryClass(): string {
    return this.category().replace(/[^a-zA-Z0-9_]/g, '_');
  }

  categoryLabel(): string {
    const cat = this.category();
    const labels: Record<string, string> = {
      'SEUIL_REGLEMENTAIRE': 'Seuil TRACFIN',
      'SEUIL_APPROCHE': 'Approche Seuil',
      'RETRAIT_CASH_IMPORTANT': 'Retrait Cash',
      'MOTCLE_SENSIBLE': 'Mot-clé Sensible',
      'MONTANT_EXCEPTIONNEL': 'Montant Exceptionnel',
      'COMPTE_RAREMENT_UTILISE': 'Compte Dormant',
      'NOUVEL_IBAN': 'Nouvel IBAN',
      'PAIEMENT_DUPLIQUE': 'Paiement Dupliqué',
      'PAIEMENT_REPETITIF': 'Paiement Répétitif',
      'FRACTIONNEMENT_SUSPECT': 'Fractionnement',
      'RESEAU_FRAUDE': 'Réseau Fraude',
      'PAIEMENT_CIRCULAIRE': 'Paiement Circulaire',
      'COLLUSION_SUSPECTE': 'Collusion',
      'DONNEE_INVALIDE': 'Donnée Invalide',
      'NON_CATEGORISE': 'Non Catégorisé'
    };
    return labels[cat] || cat;
  }
}
