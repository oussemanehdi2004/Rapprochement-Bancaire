import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
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
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <!-- Répartition par sévérité -->
      <div class="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <h3 class="text-sm font-semibold text-gray-700 mb-1">Répartition par sévérité</h3>
        <p class="text-xs text-gray-400 mb-3">{{ totalAlerts() }} alerte(s) au total</p>
        <div class="relative h-56">
          @if (totalAlerts() === 0) {
            <div class="h-full flex items-center justify-center text-xs text-gray-400">Aucune donnée</div>
          }
          <canvas #severityCanvas></canvas>
        </div>
      </div>

      <!-- Top catégories de règles -->
      <div class="lg:col-span-3 bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <h3 class="text-sm font-semibold text-gray-700 mb-1">Règles les plus déclenchées</h3>
        <p class="text-xs text-gray-400 mb-3">Top {{ Math.min(categoryStats.length, 6) }} catégorie(s)</p>
        <div class="relative h-56">
          @if (categoryStats.length === 0) {
            <div class="h-full flex items-center justify-center text-xs text-gray-400">Aucune règle déclenchée</div>
          }
          <canvas #categoryCanvas></canvas>
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
  private viewReady = false;

  totalAlerts(): number {
    const c = this.severityCounts;
    return c.critical + c.high + c.medium + c.low;
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderCharts();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.viewReady) {
      this.renderCharts();
    }
  }

  ngOnDestroy(): void {
    this.severityChart?.destroy();
    this.categoryChart?.destroy();
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