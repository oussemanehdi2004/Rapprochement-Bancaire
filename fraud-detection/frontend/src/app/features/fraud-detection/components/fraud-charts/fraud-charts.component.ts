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
    <div class="grid grid-cols-1 gap-6 w-full">
      <!-- Evolution temporelle -->
      <div [ngClass]="analysisMode === 'supabase' ? 'bg-slate-50 border-slate-300' : 'bg-white border-gray-200'" class="rounded-xl border p-4 shadow-sm">
        <div class="flex items-center justify-between mb-1">
          <h3 [ngClass]="analysisMode === 'supabase' ? 'text-slate-800' : 'text-gray-700'" class="text-sm font-semibold">Évolution du taux de fraude</h3>
          @if (analysisMode === 'supabase') {
            <span class="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">Supabase</span>
          }
        </div>
        <p class="text-xs text-gray-400 mb-3">Tendance basée sur les données analysées</p>
        <div class="relative h-56 w-full overflow-hidden">
          @if (getTimeSeriesData().length === 0) {
            <div class="h-full flex items-center justify-center text-xs text-gray-400">Aucune donnée temporelle</div>
          }
          <canvas #timeSeriesCanvas class="block w-full h-full"></canvas>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Répartition par sévérité -->
        <div [ngClass]="analysisMode === 'supabase' ? 'bg-slate-50 border-slate-300' : 'bg-white border-gray-200'" class="rounded-xl border p-4 shadow-sm">
          <div class="flex items-center justify-between mb-1">
            <h3 [ngClass]="analysisMode === 'supabase' ? 'text-slate-800' : 'text-gray-700'" class="text-sm font-semibold">Répartition par sévérité</h3>
            @if (analysisMode === 'supabase') {
              <span class="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">Supabase</span>
            }
          </div>
          <p class="text-xs text-gray-400 mb-3">{{ totalAlerts() }} alerte(s) au total</p>
          <div class="relative h-56 w-full overflow-hidden">
            @if (totalAlerts() === 0) {
              <div class="h-full flex items-center justify-center text-xs text-gray-400">Aucune donnée</div>
            }
            <canvas #severityCanvas class="block w-full h-full"></canvas>
          </div>
        </div>

        <!-- Règles les plus déclenchées -->
        <div [ngClass]="analysisMode === 'supabase' ? 'bg-slate-50 border-slate-300' : 'bg-white border-gray-200'" class="rounded-xl border p-4 shadow-sm">
          <div class="flex items-center justify-between mb-1">
            <h3 [ngClass]="analysisMode === 'supabase' ? 'text-slate-800' : 'text-gray-700'" class="text-sm font-semibold">Règles les plus déclenchées</h3>
            @if (analysisMode === 'supabase') {
              <span class="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">Supabase</span>
            }
          </div>
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
      <div [ngClass]="analysisMode === 'supabase' ? 'bg-slate-50 border-slate-300' : 'bg-white border-gray-200'" class="rounded-xl border p-4 shadow-sm">
        <div class="flex items-center justify-between mb-1">
          <h3 [ngClass]="analysisMode === 'supabase' ? 'text-slate-800' : 'text-gray-700'" class="text-sm font-semibold">Heatmap horaire des alertes</h3>
          @if (analysisMode === 'supabase') {
            <span class="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">Supabase</span>
          }
        </div>
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
  @Input() analysisMode: 'local' | 'supabase' = 'local';

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
            backgroundColor: ['#dc2626', '#ea580c', '#d97706', '#10b981'],
            borderWidth: 2,
            borderColor: '#ffffff',
            hoverOffset: 8,
            hoverBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11, weight: 500 }, color: '#64748b' } },
          tooltip: { backgroundColor: '#0f172a', titleColor: '#f8fafc', bodyColor: '#e2e8f0', borderColor: '#1e293b', borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: true, boxPadding: 3 }
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
            hoverBackgroundColor: '#4338ca',
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 26,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#0f172a', titleColor: '#f8fafc', bodyColor: '#e2e8f0', borderColor: '#1e293b', borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: false }
        },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 }, color: '#64748b' }, grid: { color: '#f1f5f9' }, border: { display: false } },
          y: { ticks: { font: { size: 11, weight: 500 }, color: '#334155' }, grid: { display: false }, border: { display: false } },
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
    
    // If no data, show empty state
    if (data.length === 0) {
      if (this.timeSeriesChart) {
        this.timeSeriesChart.destroy();
        this.timeSeriesChart = undefined;
      }
      return;
    }

    const labels = data.map(d => {
      // Format date for display (DD/MM)
      const dateParts = d.date.split('-');
      if (dateParts.length === 3) {
        return `${dateParts[2]}/${dateParts[1]}`;
      }
      return d.date;
    });
    
    const fraudRates = data.map(d => (d.totalCount > 0 ? (d.fraudCount / d.totalCount) * 100 : 0));

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Taux de fraude (%)',
            data: fraudRates,
            borderColor: '#e11d48',
            backgroundColor: 'rgba(225, 29, 72, 0.08)',
            fill: true,
            tension: 0.38,
            pointRadius: data.length === 1 ? 6 : 3.5,
            pointHoverRadius: 6,
            pointBackgroundColor: '#e11d48',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            borderWidth: 2.2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#f8fafc',
            bodyColor: '#e2e8f0',
            borderColor: '#1e293b',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 10,
            displayColors: false,
            callbacks: {
              title: (context) => {
                const index = context[0]?.dataIndex;
                if (index !== undefined && data[index]) {
                  return `Date: ${data[index].date}`;
                }
                return '';
              },
              label: (context) => {
                const index = context.dataIndex;
                if (index !== undefined && data[index]) {
                  const rate = context.parsed.y;
                  const fraudCount = data[index].fraudCount;
                  const totalCount = data[index].totalCount;
                  return `Taux: ${rate !== null ? rate.toFixed(1) : '0'}% (${fraudCount}/${totalCount} fraudes)`;
                }
                return '';
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (value) => value + '%',
              color: '#64748b',
              font: { size: 11 },
              padding: 8
            },
            grid: { color: '#f1f5f9' },
            border: { display: false }
          },
          x: {
            ticks: {
              maxRotation: 0,
              minRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8,
              color: '#64748b',
              font: { size: 10.5 }
            },
            grid: { display: false },
            border: { display: false }
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
            hoverBackgroundColor: colors.map(c => c.replace(/0\.\d+\)$/, '0.95)')),
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#0f172a', titleColor: '#f8fafc', bodyColor: '#e2e8f0', borderColor: '#1e293b', borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0, color: '#64748b', font: { size: 11 } },
            grid: { color: '#f1f5f9' },
            border: { display: false }
          },
          x: {
            ticks: { font: { size: 10 }, color: '#64748b' },
            grid: { display: false },
            border: { display: false }
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