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
import 'chartjs-adapter-date-fns';

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

export interface TimeSeriesData {
  date: string;
  fraudCount: number;
  totalCount: number;
}

export interface HourlyData {
  hour: number;
  count: number;
}

@Component({
  selector: 'app-fraud-charts',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grid grid-cols-1 gap-4 w-full">
      <!-- Evolution temporelle -->
      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <h3 class="text-sm font-semibold text-gray-700 mb-1">Évolution du taux de fraude</h3>
        <p class="text-xs text-gray-400 mb-3">Tendance sur les 7 derniers jours</p>
        <div class="relative h-56 w-full overflow-hidden">
          @if (getTimeSeriesData().length === 0) {
            <div class="h-full flex items-center justify-center text-xs text-gray-400">Aucune donnée temporelle</div>
          }
          <canvas #timeSeriesCanvas class="block w-full h-full"></canvas>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Répartition par sévérité -->
        <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Répartition par sévérité</h3>
          <p class="text-xs text-gray-400 mb-3">{{ totalAlerts() }} alerte(s) au total</p>
          <div class="relative h-56 w-full overflow-hidden">
            @if (totalAlerts() === 0) {
              <div class="h-full flex items-center justify-center text-xs text-gray-400">Aucune donnée</div>
            }
            <canvas #severityCanvas class="block w-full h-full"></canvas>
          </div>
        </div>

        <!-- Règles les plus déclenchées -->
        <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Règles les plus déclenchées</h3>
          <p class="text-xs text-gray-400 mb-3">Top {{ Math.min(categoryStats.length, 6) }} catégorie(s)</p>
          <div class="relative h-56 w-full overflow-hidden">
            @if (categoryStats.length === 0) {
              <div class="h-full flex items-center justify-center text-xs text-gray-400">Aucune règle déclenchée</div>
            }
            <canvas #categoryCanvas class="block w-full h-full"></canvas>
          </div>
        </div>
      </div>

      <!-- Heatmap horaire -->
      <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <h3 class="text-sm font-semibold text-gray-700 mb-1">Heatmap horaire des alertes</h3>
        <p class="text-xs text-gray-400 mb-3">Distribution par heure de la journée</p>
        <div class="relative h-40 w-full overflow-hidden">
          @if (getHourlyData().length === 0) {
            <div class="h-full flex items-center justify-center text-xs text-gray-400">Aucune donnée horaire</div>
          }
          <canvas #hourlyCanvas class="block w-full h-full"></canvas>
        </div>
      </div>
    </div>
  `,
})
export class FraudChartsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() severityCounts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  @Input() categoryStats: CategoryCount[] = [];
  @Input() timeSeriesData: TimeSeriesData[] = [];
  @Input() hourlyData: HourlyData[] = [];

  // Computed properties for safer access
  protected getTimeSeriesData = () => Array.isArray(this.timeSeriesData) ? this.timeSeriesData : [];
  protected getHourlyData = () => Array.isArray(this.hourlyData) ? this.hourlyData : [];

  @ViewChild('severityCanvas') severityCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryCanvas') categoryCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('timeSeriesCanvas') timeSeriesCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('hourlyCanvas') hourlyCanvasRef?: ElementRef<HTMLCanvasElement>;

  protected readonly Math = Math;

  private severityChart?: Chart;
  private categoryChart?: Chart;
  private timeSeriesChart?: Chart;
  private hourlyChart?: Chart;
  private isInitialized = false;

  ngAfterViewInit(): void {
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.isInitialized = true;
        this.renderCharts();
      }, 150);
    }
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.isInitialized && typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        this.renderCharts();
      });
    }
  }

  ngOnDestroy(): void {
    this.severityChart?.destroy();
    this.categoryChart?.destroy();
    this.timeSeriesChart?.destroy();
    this.hourlyChart?.destroy();
  }

  totalAlerts(): number {
    const c = this.severityCounts;
    return (c?.critical || 0) + (c?.high || 0) + (c?.medium || 0) + (c?.low || 0);
  }

  private renderCharts(): void {
    this.renderSeverityChart();
    this.renderCategoryChart();
    this.renderTimeSeriesChart();
    this.renderHourlyChart();
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

  private renderTimeSeriesChart(): void {
    const canvas = this.timeSeriesCanvasRef?.nativeElement;
    if (!canvas) return;

    const data = this.getTimeSeriesData();
    const labels = data.map(d => d.date);
    const fraudRates = data.map(d => (d.totalCount > 0 ? (d.fraudCount / d.totalCount) * 100 : 0));

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Taux de fraude (%)',
            data: fraudRates,
            borderColor: '#dc2626',
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (value) => value + '%'
            }
          },
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 45
            }
          }
        }
      }
    };

    if (this.timeSeriesChart) {
      this.timeSeriesChart.data = config.data;
      this.timeSeriesChart.update();
    } else {
      this.timeSeriesChart = new Chart(canvas, config);
    }
  }

  private renderHourlyChart(): void {
    const canvas = this.hourlyCanvasRef?.nativeElement;
    if (!canvas) return;

    const data = this.getHourlyData();
    const hours = data.map(d => d.hour);
    const counts = data.map(d => d.count);
    
    // Color gradient based on intensity
    const maxCount = Math.max(...counts, 1);
    const colors = counts.map(count => {
      const intensity = count / maxCount;
      return `rgba(220, 38, 38, ${0.3 + intensity * 0.7})`;
    });

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: hours.map(h => `${h}h`),
        datasets: [
          {
            label: 'Alertes par heure',
            data: counts,
            backgroundColor: colors,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 }
          },
          x: {
            ticks: { font: { size: 10 } }
          }
        }
      }
    };

    if (this.hourlyChart) {
      this.hourlyChart.data = config.data;
      this.hourlyChart.update();
    } else {
      this.hourlyChart = new Chart(canvas, config);
    }
  }
}