import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

@Component({
  selector: 'app-fraud-charts',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="display: grid; grid-template-columns: 1fr; gap: 1rem; width: 100%;">
      <div style="background-color: white; border-radius: 0.75rem; border: 1px solid #e5e7eb; padding: 1rem; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05);">
        <h3 style="font-size: 0.875rem; font-weight: 600; color: #374151; margin-bottom: 0.25rem;">Répartition par sévérité</h3>
        <p style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.75rem;">{{ totalAlerts() }} alerte(s) au total</p>
        <div style="position: relative; height: 14rem; width: 100%; overflow: hidden;">
          @if (totalAlerts() === 0) {
            <div style="height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #9ca3af;">Aucune donnée</div>
          }
          <canvas #severityCanvas style="display: block; width: 100%; height: 100%;"></canvas>
        </div>
      </div>
      <div style="background-color: white; border-radius: 0.75rem; border: 1px solid #e5e7eb; padding: 1rem; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05);">
        <h3 style="font-size: 0.875rem; font-weight: 600; color: #374151; margin-bottom: 0.25rem;">Règles les plus déclenchées</h3>
        <p style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.75rem;">Top {{ Math.min(categoryStats.length, 6) }} catégorie(s)</p>
        <div style="position: relative; height: 14rem; width: 100%; overflow: hidden;">
          @if (categoryStats.length === 0) {
            <div style="height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #9ca3af;">Aucune règle déclenchée</div>
          }
          <canvas #categoryCanvas style="display: block; width: 100%; height: 100%;"></canvas>
        </div>
      </div>
    </div>
  `,
})
export class FraudChartsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() severityCounts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  @Input() categoryStats: CategoryCount[] = [];

  @ViewChild('severityCanvas') severityCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryCanvas') categoryCanvasRef?: ElementRef<HTMLCanvasElement>;

  protected readonly Math = Math;

  private severityChart?: Chart;
  private categoryChart?: Chart;
  private isInitialized = false;

  ngAfterViewInit(): void {
    // S'assure qu'on est strictement dans le navigateur
    if (typeof window !== 'undefined') {
      // Initial render with delay to ensure DOM is ready
      setTimeout(() => {
        this.isInitialized = true;
        this.renderCharts();
      }, 150);
    }
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.isInitialized && typeof window !== 'undefined') {
      // Use requestAnimationFrame to ensure the DOM has updated before rendering
      requestAnimationFrame(() => {
        this.renderCharts();
      });
    }
  }

  ngOnDestroy(): void {
    this.severityChart?.destroy();
    this.categoryChart?.destroy();
  }

  totalAlerts(): number {
    const c = this.severityCounts;
    return (c?.critical || 0) + (c?.high || 0) + (c?.medium || 0) + (c?.low || 0);
  }

  private renderCharts(): void {
    this.renderSeverityChart();
    this.renderCategoryChart();
  }

  private renderSeverityChart(): void {
    const canvas = this.severityCanvasRef?.nativeElement;
    if (!canvas) return;

    const data = [
      this.severityCounts.critical,
      this.severityCounts.high,
      this.severityCounts.medium,
      this.severityCounts.low,
    ];

    const config: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels: ['Critique', 'Élevée', 'Moyenne', 'Faible'],
        datasets: [
          {
            data,
            backgroundColor: ['#dc2626', '#ea580c', '#d97706', '#16a34a'],
            borderWidth: 0,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
        },
      },
    };

    if (this.severityChart) {
      this.severityChart.data = config.data;
      this.severityChart.update();
    } else {
      this.severityChart = new Chart(canvas, config);
    }
  }

  private renderCategoryChart(): void {
    const canvas = this.categoryCanvasRef?.nativeElement;
    if (!canvas) return;

    const top = [...this.categoryStats].sort((a, b) => b.count - a.count).slice(0, 6);

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: top.map((t) => t.category),
        datasets: [
          {
            data: top.map((t) => t.count),
            backgroundColor: '#4f46e5',
            borderRadius: 4,
            maxBarThickness: 24,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { ticks: { font: { size: 11 } } },
        },
      },
    };

    if (this.categoryChart) {
      this.categoryChart.data = config.data;
      this.categoryChart.update();
    } else {
      this.categoryChart = new Chart(canvas, config);
    }
  }
}