import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface CategoryStat {
  category: string;
  count: number;
}

@Component({
  selector: 'app-fraud-charts',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fraud-charts">
      <div class="chart-container">
        <h3>Distribution par Sévérité</h3>
        <div class="donut-chart">
          <svg viewBox="0 0 200 200" class="donut-svg">
            <circle cx="100" cy="100" r="80" fill="none" stroke="#e0e0e0" stroke-width="20"/>
            <circle 
              *ngFor="let segment of severitySegments()" 
              cx="100" cy="100" r="80" 
              fill="none" 
              [attr.stroke]="segment.color"
              stroke-width="20"
              [attr.stroke-dasharray]="segment.dashArray"
              [attr.stroke-dashoffset]="segment.offset"
              transform="rotate(-90 100 100)"
            />
          </svg>
          <div class="donut-center">
            <div class="total-count">{{ totalCount() }}</div>
            <div class="total-label">Total</div>
          </div>
        </div>
        <div class="legend">
          <div class="legend-item" *ngFor="let item of legendItems()">
            <span [class]="'legend-color ' + item.class"></span>
            <span class="legend-label">{{ item.label }}</span>
            <span class="legend-value">{{ item.value }}</span>
          </div>
        </div>
      </div>
      
      <div class="chart-container" *ngIf="categoryStats().length > 0">
        <h3>Distribution par Catégorie</h3>
        <div class="bar-chart">
          <div class="bar-row" *ngFor="let stat of categoryStats()">
            <div class="bar-label">{{ stat.category }}</div>
            <div class="bar-track">
              <div class="bar-fill" [style.width.%]="getBarWidth(stat.count, maxCount())"></div>
            </div>
            <div class="bar-value">{{ stat.count }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .fraud-charts {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }
    .chart-container {
      background: #fff;
      padding: 1.5rem;
      border-radius: 8px;
      border: 1px solid #e0e0e0;
    }
    .chart-container h3 {
      margin-top: 0;
      margin-bottom: 1rem;
      color: #333;
      font-size: 1.1rem;
    }
    .donut-chart {
      position: relative;
      width: 200px;
      height: 200px;
      margin: 0 auto;
    }
    .donut-svg {
      width: 100%;
      height: 100%;
    }
    .donut-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }
    .total-count {
      font-size: 2rem;
      font-weight: bold;
      color: #333;
    }
    .total-label {
      font-size: 0.875rem;
      color: #666;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-top: 1rem;
      justify-content: center;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }
    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .legend-color.critical { background: #c62828; }
    .legend-color.high { background: #ef6c00; }
    .legend-color.medium { background: #f57f17; }
    .legend-color.low { background: #2e7d32; }
    .legend-label {
      color: #555;
    }
    .legend-value {
      font-weight: 600;
      color: #333;
    }
    .bar-chart {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .bar-row {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .bar-label {
      width: 150px;
      font-size: 0.875rem;
      color: #555;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bar-track {
      flex: 1;
      height: 24px;
      background: #f5f5f5;
      border-radius: 4px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #1976d2, #42a5f5);
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .bar-value {
      width: 40px;
      font-weight: 600;
      color: #333;
      text-align: right;
    }
  `]
})
export class FraudChartsComponent {
  severityCounts = input.required<SeverityCounts>();
  categoryStats = input<CategoryStat[]>([]);

  totalCount(): number {
    const counts = this.severityCounts();
    return counts.critical + counts.high + counts.medium + counts.low;
  }

  severitySegments() {
    const counts = this.severityCounts();
    const total = this.totalCount();
    if (total === 0) return [];

    const circumference = 2 * Math.PI * 80;
    let offset = 0;

    const segments = [
      { count: counts.critical, color: '#c62828', label: 'Critique' },
      { count: counts.high, color: '#ef6c00', label: 'Élevé' },
      { count: counts.medium, color: '#f57f17', label: 'Moyen' },
      { count: counts.low, color: '#2e7d32', label: 'Faible' }
    ];

    return segments
      .filter(s => s.count > 0)
      .map(s => {
        const percentage = s.count / total;
        const dashArray = `${percentage * circumference} ${circumference}`;
        const segment = {
          dashArray,
          offset: -offset,
          color: s.color
        };
        offset += percentage * circumference;
        return segment;
      });
  }

  legendItems() {
    const counts = this.severityCounts();
    return [
      { class: 'critical', label: 'Critique', value: counts.critical },
      { class: 'high', label: 'Élevé', value: counts.high },
      { class: 'medium', label: 'Moyen', value: counts.medium },
      { class: 'low', label: 'Faible', value: counts.low }
    ].filter(item => item.value > 0);
  }

  maxCount(): number {
    const stats = this.categoryStats();
    return Math.max(...stats.map(s => s.count), 1);
  }

  getBarWidth(count: number, max: number): number {
    return (count / max) * 100;
  }
}
