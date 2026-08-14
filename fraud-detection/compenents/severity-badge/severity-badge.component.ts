import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BadgeSeverity = 'critical' | 'high' | 'medium' | 'low' | string;

interface BadgeStyle {
  classes: string;
  dot: string;
  label: string;
}

@Component({
  selector: 'app-severity-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
      [ngClass]="style().classes"
    >
      <span class="h-1.5 w-1.5 rounded-full" [ngClass]="style().dot"></span>
      {{ style().label }}
    </span>
  `,
})
export class SeverityBadgeComponent {
  @Input() severity: BadgeSeverity = 'low';

  private readonly MAP: Record<string, BadgeStyle> = {
    critical: { classes: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500', label: 'Critique' },
    high: { classes: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500', label: 'Élevée' },
    medium: { classes: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'Moyenne' },
    low: { classes: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500', label: 'Faible' },
  };

  private readonly DEFAULT: BadgeStyle = {
    classes: 'bg-gray-50 text-gray-600 border-gray-200',
    dot: 'bg-gray-400',
    label: 'Inconnu',
  };

  style(): BadgeStyle {
    const key = (this.severity ?? '').toLowerCase();
    const found = this.MAP[key];
    return found ?? { ...this.DEFAULT, label: this.severity || this.DEFAULT.label };
  }
}