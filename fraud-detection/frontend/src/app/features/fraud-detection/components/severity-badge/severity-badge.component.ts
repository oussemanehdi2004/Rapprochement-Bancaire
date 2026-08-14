import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-severity-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span [class]="'severity-badge severity-' + severityClass()">
      {{ severityLabel() }}
    </span>
  `,
  styles: [`
    .severity-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .severity-critical {
      background: #ffebee;
      color: #c62828;
      border: 1px solid #ef9a9a;
    }
    .severity-high {
      background: #fff3e0;
      color: #ef6c00;
      border: 1px solid #ffcc80;
    }
    .severity-medium {
      background: #fff8e1;
      color: #f57f17;
      border: 1px solid #ffe082;
    }
    .severity-low {
      background: #e8f5e9;
      color: #2e7d32;
      border: 1px solid #a5d6a7;
    }
  `]
})
export class SeverityBadgeComponent {
  severity = input.required<string>();

  severityClass(): string {
    const sev = this.severity().toUpperCase();
    if (sev === 'CRITICAL' || sev === 'CRITIQUE') return 'critical';
    if (sev === 'HIGH' || sev === 'ÉLEVÉ') return 'high';
    if (sev === 'MEDIUM' || sev === 'MOYEN') return 'medium';
    return 'low';
  }

  severityLabel(): string {
    const sev = this.severity().toUpperCase();
    if (sev === 'CRITICAL' || sev === 'CRITIQUE') return 'Critique';
    if (sev === 'HIGH' || sev === 'ÉLEVÉ') return 'Élevé';
    if (sev === 'MEDIUM' || sev === 'MOYEN') return 'Moyen';
    return 'Faible';
  }
}
