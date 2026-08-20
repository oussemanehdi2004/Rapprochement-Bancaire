import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportsService } from '../services/reports.service';
import { FraudSummaryDTO, CategoryBreakdownDTO, TimeSeriesDataDTO } from '../../fraud-detection/models';
import { ToastService } from '../../../core/services/toast.service';
import { Chart } from 'chart.js/auto';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6">
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Rapports de Détection de Fraude</h1>
        <p class="text-gray-600 dark:text-gray-400 mt-2">Vue d'ensemble des statistiques et tendances de fraude</p>
      </div>

      <!-- Date Range Filter -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
        <div class="flex flex-wrap gap-4 items-end">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date de début</label>
            <input type="date" [(ngModel)]="startDate" class="border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date de fin</label>
            <input type="date" [(ngModel)]="endDate" class="border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
          </div>
          <button (click)="loadReports()" [disabled]="loading" class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded transition">
            @if (loading) {
              <span class="flex items-center gap-2">
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Chargement...
              </span>
            } @else {
              Générer le rapport
            }
          </button>
          <button (click)="exportPDF()" [disabled]="loading || exportingPDF" class="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded transition">
            @if (exportingPDF) {
              <span class="flex items-center gap-2">
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Export en cours...
              </span>
            } @else {
              Exporter PDF
            }
          </button>
          <button (click)="exportCSV()" [disabled]="loading || exportingCSV" class="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-2 rounded transition">
            @if (exportingCSV) {
              <span class="flex items-center gap-2">
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Export en cours...
              </span>
            } @else {
              Exporter CSV
            }
          </button>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6" *ngIf="summary">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 class="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Transactions</h3>
          <p class="text-3xl font-bold text-gray-900 dark:text-white mt-2">{{ summary.total_transactions | number }}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 class="text-gray-500 dark:text-gray-400 text-sm font-medium">Fraudes Détectées</h3>
          <p class="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">{{ summary.fraud_detected | number }}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 class="text-gray-500 dark:text-gray-400 text-sm font-medium">Taux de Fraude</h3>
          <p class="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-2">{{ summary.fraud_rate | number:'1.2' }}%</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 class="text-gray-500 dark:text-gray-400 text-sm font-medium">Montant Bloqué</h3>
          <p class="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">{{ summary.blocked_amount | currency:'EUR' }}</p>
        </div>
      </div>

      <!-- Category Breakdown -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6" *ngIf="categoryBreakdown.length > 0">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Répartition par Catégorie</h2>
        <div class="space-y-3">
          <div *ngFor="let cat of categoryBreakdown" class="flex items-center">
            <span class="w-48 text-sm text-gray-700 dark:text-gray-300">{{ cat.category }}</span>
            <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-4 mx-4">
              <div class="bg-blue-600 h-4 rounded-full" [style.width.%]="cat.percentage || 0"></div>
            </div>
            <span class="text-sm text-gray-600 dark:text-gray-400 w-20 text-right">{{ cat.count }} ({{ (cat.percentage || 0) | number:'1.1' }}%)</span>
          </div>
        </div>
      </div>

      <!-- Time Series Chart -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6" *ngIf="timeSeriesData.length > 0">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Tendance Temporelle</h2>
        <div class="h-64">
          <canvas #timeSeriesChart></canvas>
        </div>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p class="mt-4 text-gray-600 dark:text-gray-400">Chargement des rapports...</p>
      </div>

      <!-- Error State -->
      <div *ngIf="error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p class="text-red-600 dark:text-red-400">{{ error }}</p>
      </div>
    </div>
  `
})
export class ReportsComponent implements OnInit, AfterViewInit {
  @ViewChild('timeSeriesChart', { static: false }) chartCanvas!: ElementRef<HTMLCanvasElement>;
  private timeSeriesChart: Chart | null = null;
  startDate = '';
  endDate = '';
  summary: FraudSummaryDTO | null = null;
  categoryBreakdown: CategoryBreakdownDTO[] = [];
  timeSeriesData: TimeSeriesDataDTO[] = [];
  loading = false;
  exportingPDF = false;
  exportingCSV = false;
  error: string | null = null;

  constructor(
    private reportsService: ReportsService,
    private toastService: ToastService,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    this.endDate = today.toISOString().split('T')[0];
    this.startDate = thirtyDaysAgo.toISOString().split('T')[0];
    this.loadReports();
  }

  loadReports() {
    this.ngZone.run(() => {
      this.loading = true;
      this.error = '';
      this.toastService.info('Chargement', 'Génération du rapport en cours...');
    });

    const timeout = setTimeout(() => {
      this.ngZone.run(() => {
        if (this.loading) {
          this.loading = false;
          this.error = 'Délai dépassé lors du chargement des rapports. Veuillez réessayer.';
          this.toastService.warning('Attention', 'Délai dépassé lors du chargement des rapports');
          this.summary = null;
          this.categoryBreakdown = [];
          this.timeSeriesData = [];
        }
      });
    }, 8000);

      this.reportsService.getReports(this.startDate, this.endDate).subscribe({
        next: (data: any) => {
          clearTimeout(timeout);
          if (data && typeof data === 'object') {
            const d = data.data || data;
            this.summary = {
              total_transactions: d.total_transactions ?? 0,
              fraud_detected: d.fraud_count ?? 0,
              fraud_rate: d.fraud_rate ?? 0,
              total_amount: d.blocked_amount ?? 0,
              blocked_amount: d.blocked_amount ?? 0,
            };
            this.categoryBreakdown = d.category_breakdown || d.categoryBreakdown || [];
            this.timeSeriesData = (d.time_series_data || d.timeSeriesData || []).map((ts: any) => ({
              date: ts.date,
              fraud_count: ts.fraud_count ?? 0,
              total_count: ts.total_transactions ?? ts.total_count ?? 0,
            }));
          } else {
            this.summary = null;
            this.categoryBreakdown = [];
            this.timeSeriesData = [];
          }
          this.loading = false;
          
          if (this.summary && this.summary.total_transactions > 0) {
            this.toastService.success('Succès', 'Rapport chargé avec succès');
            setTimeout(() => this.renderTimeSeriesChart(), 100);
          } else if (this.summary && this.summary.total_transactions === 0) {
            this.toastService.warning('Attention', 'Aucune transaction trouvée pour la période sélectionnée');
          } else {
            this.toastService.error('Erreur', 'Impossible de charger les données du rapport');
          }
        },
        error: (err: any) => {
          clearTimeout(timeout);
          // Enhanced error handling
          console.error('Error loading reports:', err);
          this.error = 'Erreur lors du chargement des rapports. Veuillez vérifier la connexion au service.';
          this.loading = false;
          this.toastService.error('Erreur', 'Erreur lors du chargement des rapports');
          
          // Fallback to empty state
          this.summary = null;
          this.categoryBreakdown = [];
          this.timeSeriesData = [];
        }
      });
  }

  exportPDF() {
    this.ngZone.run(() => {
      this.exportingPDF = true;
      this.error = null;
      this.toastService.info('Export', 'Génération du PDF en cours...');
    });
    
    const timeout = setTimeout(() => {
      this.ngZone.run(() => {
        if (this.exportingPDF) {
          this.exportingPDF = false;
          this.error = 'Délai dépassé lors de l\'export PDF. Veuillez réessayer.';
          this.toastService.error('Erreur d\'export', 'Délai dépassé lors de l\'export PDF.');
        }
      });
    }, 10000);
    
    this.reportsService.exportPDF(this.startDate, this.endDate).subscribe({
      next: (blob: Blob) => {
        clearTimeout(timeout);
        this.ngZone.run(() => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          const contentType = blob.type || 'application/pdf';
          const extension = contentType.includes('html') ? 'html' : 'pdf';
          link.download = `fraud_report_${this.startDate}_to_${this.endDate}.${extension}`;
          link.click();
          this.exportingPDF = false;
          
          if (extension === 'html') {
            this.toastService.success('Export réussi', 'Le rapport HTML a été téléchargé. Vous pouvez l\'ouvrir et l\'enregistrer en PDF via votre navigateur.');
          } else {
            this.toastService.success('Export réussi', 'Le rapport PDF a été téléchargé');
          }
        });
      },
      error: (err: any) => {
        clearTimeout(timeout);
        this.ngZone.run(() => {
          console.error('Error exporting PDF:', err);
          this.error = 'Erreur lors de l\'export PDF. Veuillez réessayer.';
          this.exportingPDF = false;
          this.toastService.error('Erreur d\'export', 'Erreur lors de l\'export PDF. Le service peut être indisponible.');
        });
      }
    });
  }

  exportCSV() {
    this.ngZone.run(() => {
      this.exportingCSV = true;
      this.error = null;
      this.toastService.info('Export', 'Génération du CSV en cours...');
    });
    
    const timeout = setTimeout(() => {
      this.ngZone.run(() => {
        if (this.exportingCSV) {
          this.exportingCSV = false;
          this.error = 'Délai dépassé lors de l\'export CSV. Génération côté client en cours...';
          this.generateClientSideCSV();
          this.toastService.success('Export réussi', 'Le rapport CSV a été généré côté client');
        }
      });
    }, 8000);
    
    this.reportsService.exportCSV(this.startDate, this.endDate).subscribe({
      next: (blob: Blob) => {
        clearTimeout(timeout);
        this.ngZone.run(() => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `fraud_report_${this.startDate}_to_${this.endDate}.csv`;
          link.click();
          this.exportingCSV = false;
          this.toastService.success('Export réussi', 'Le rapport CSV a été téléchargé');
        });
      },
      error: (err: any) => {
        clearTimeout(timeout);
        this.ngZone.run(() => {
          console.error('Error exporting CSV:', err);
          this.error = 'Erreur lors de l\'export CSV. Génération côté client en cours...';
          this.toastService.warning('Export CSV', 'Erreur serveur, génération côté client en cours...');
          
          if (this.timeSeriesData.length) {
            this.generateClientSideCSV();
            this.toastService.success('Export réussi', 'Le rapport CSV a été généré côté client');
          } else {
            this.toastService.error('Erreur', 'Aucune donnée disponible pour l\'export CSV');
          }
          this.exportingCSV = false;
        });
      }
    });
  }

  private generateClientSideCSV() {
    // Use time series data if available, otherwise use summary data
    if (this.timeSeriesData.length > 0) {
      const headers = ['Date', 'Fraudes Détectées', 'Total Transactions'];
      const csvContent = [
        headers.join(','),
        ...this.timeSeriesData.map(row => `${row.date},${row.fraud_count},${row.total_count}`)
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `fraud_report_${this.startDate}_to_${this.endDate}.csv`;
      link.click();
    } else if (this.summary) {
      // Fallback to summary data
      const headers = ['Métrique', 'Valeur'];
      const csvContent = [
        headers.join(','),
        `Total Transactions,${this.summary.total_transactions}`,
        `Fraudes Détectées,${this.summary.fraud_detected}`,
        `Taux de Fraude,${this.summary.fraud_rate}%`,
        `Montant Bloqué,${this.summary.blocked_amount}`
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `fraud_report_${this.startDate}_to_${this.endDate}.csv`;
      link.click();
    } else {
      // Generate empty CSV with headers
      const headers = ['Date', 'Fraudes Détectées', 'Total Transactions'];
      const csvContent = headers.join(',');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `fraud_report_${this.startDate}_to_${this.endDate}.csv`;
      link.click();
    }
  }

  ngAfterViewInit() {
    // Initialize chart if data is already loaded
    if (this.timeSeriesData.length > 0) {
      this.renderTimeSeriesChart();
    }
  }

  private renderTimeSeriesChart() {
    if (!this.chartCanvas || this.timeSeriesData.length === 0) {
      return;
    }

    // Destroy existing chart if it exists
    if (this.timeSeriesChart) {
      this.timeSeriesChart.destroy();
    }

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) {
      return;
    }

    const labels = this.timeSeriesData.map(data => data.date);
    const fraudData = this.timeSeriesData.map(data => data.fraud_count);
    const totalData = this.timeSeriesData.map(data => data.total_count);

    console.log('Chart data:', { labels, fraudData, totalData }); // Debug log

    this.timeSeriesChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Fraudes Détectées',
            data: fraudData,
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            tension: 0.4,
            fill: true,
            borderWidth: 2
          },
          {
            label: 'Total Transactions',
            data: totalData,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4,
            fill: true,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: 'rgb(71, 85, 105)'
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Date',
              color: 'rgb(71, 85, 105)'
            },
            ticks: {
              color: 'rgb(71, 85, 105)'
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'Nombre de Transactions',
              color: 'rgb(71, 85, 105)'
            },
            ticks: {
              color: 'rgb(71, 85, 105)'
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            }
          }
        }
      }
    });
  }
}
