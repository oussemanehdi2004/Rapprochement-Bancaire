import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild, NgZone, inject, PLATFORM_ID, DestroyRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReportsService } from '../services/reports.service';
import { FraudSummaryDTO, CategoryBreakdownDTO, TimeSeriesDataDTO } from '../../fraud-detection/models';
import { ToastService } from '../../../core/services/toast.service';
import { DataRefreshService } from '../../../core/services/data-refresh.service';
import { Chart } from 'chart.js/auto';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-[#F8FAFC] p-6 transition-colors duration-300">
      <div class="max-w-[90rem] mx-auto">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div class="flex items-start gap-3">
            <span class="hidden sm:flex h-10 w-10 rounded-xl bg-slate-900 items-center justify-center text-white border border-slate-800 shadow-sm text-sm">📈</span>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-[22px] font-bold tracking-tight text-slate-900 leading-none">Rapports de Détection de Fraude</h1>
                <span class="hidden sm:inline-flex items-center rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1.5 text-[10px] leading-[1.3] font-bold tracking-widest uppercase text-indigo-700">Analytics</span>
              </div>
              <p class="text-[12.5px] text-slate-500 mt-1">Vue d'ensemble des statistiques et tendances — Chart.js / Apex</p>
            </div>
          </div>
          <span class="hidden md:inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Export PDF · CSV
          </span>
        </div>

        <!-- Date Range — unified toolbar -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
          <div class="h-1 w-full bg-gradient-to-r from-indigo-600 via-blue-500 to-violet-600"></div>
          <div class="p-4">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-[10px] font-semibold tracking-widest uppercase text-slate-500">Période & Exports</span>
              <span class="h-px flex-1 bg-slate-200"></span>
            </div>
            <div class="flex flex-wrap gap-3 items-end">
              <div class="min-w-0">
                <label class="block text-[11px] font-semibold tracking-widest uppercase text-slate-500 mb-1.5">Date de début</label>
                <input type="date" [(ngModel)]="startDate" class="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm min-w-0">
              </div>
              <div class="min-w-0">
                <label class="block text-[11px] font-semibold tracking-widest uppercase text-slate-500 mb-1.5">Date de fin</label>
                <input type="date" [(ngModel)]="endDate" class="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm min-w-0">
              </div>
              <button (click)="loadReports()" [disabled]="loading" class="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white px-4 py-2.5 rounded-xl font-semibold shadow-sm border border-slate-900 disabled:border-transparent transition-colors text-sm">
                @if (loading) {
                  <span class="flex items-center gap-2">
                    <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Chargement...
                  </span>
                } @else {
                  <span class="h-6 w-6 rounded-lg bg-white/15 border border-white/15 flex items-center justify-center text-white text-xs">↻</span>
                  Générer le rapport
                }
              </button>
              <button (click)="exportPDF()" [disabled]="loading || exportingPDF" class="inline-flex items-center gap-2 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 px-4 py-2.5 rounded-xl font-semibold shadow-sm transition-colors text-sm">
                @if (exportingPDF) {
                  <span class="flex items-center gap-2">
                    <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Export en cours...
                  </span>
                } @else {
                  <span>📄</span> Exporter PDF
                }
              </button>
              <button (click)="exportCSV()" [disabled]="loading || exportingCSV" class="inline-flex items-center gap-2 bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50 px-4 py-2.5 rounded-xl font-semibold shadow-sm transition-colors text-sm">
                @if (exportingCSV) {
                  <span class="flex items-center gap-2">
                    <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Export en cours...
                  </span>
                } @else {
                  <span>📊</span> Exporter CSV
                }
              </button>
            </div>
          </div>
        </div>

        <!-- Summary Cards — 4 elevated KPI -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5" *ngIf="summary">
          <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
            <div class="flex items-center justify-between">
              <p class="text-[10px] tracking-[0.14em] font-semibold uppercase text-slate-500">Total Transactions</p>
              <span class="h-8 w-8 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 text-sm">📊</span>
            </div>
            <p class="text-[28px] font-bold tracking-tight text-slate-900 mt-2 leading-none tabular-nums">{{ summary.total_transactions | number }}</p>
            <p class="text-[11px] text-slate-500 mt-1">volume période</p>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all relative overflow-hidden">
            <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-rose-500"></div>
            <div class="flex items-center justify-between">
              <p class="text-[10px] tracking-[0.14em] font-semibold uppercase text-slate-500">Fraudes Détectées</p>
              <span class="h-8 w-8 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 text-sm">⚠️</span>
            </div>
            <p class="text-[28px] font-bold tracking-tight text-rose-600 mt-2 leading-none tabular-nums">{{ summary.fraud_detected | number }}</p>
            <p class="text-[11px] text-slate-500 mt-1">alertes critiques</p>
          </div>
          <div class="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-[0_8px_24px_rgba(2,6,23,0.18)] relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none"></div>
            <div class="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-amber-500/20 blur-2xl"></div>
            <div class="relative flex items-center justify-between">
              <p class="text-[10px] tracking-[0.14em] font-semibold uppercase text-slate-400">Taux de Fraude</p>
              <span class="h-8 w-8 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white text-sm">%</span>
            </div>
            <p class="relative text-[28px] font-bold tracking-tight text-white mt-2 leading-none tabular-nums">{{ summary.fraud_rate | number:'1.2' }}<span class="text-[16px] font-semibold text-white/70">%</span></p>
            <p class="relative text-[11px] text-slate-400 mt-1">pondéré période</p>
          </div>
          <div class="bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-[0_8px_24px_rgba(2,6,23,0.18)] relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none"></div>
            <div class="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-emerald-500/20 blur-2xl"></div>
            <div class="relative flex items-center justify-between">
              <p class="text-[10px] tracking-[0.14em] font-semibold uppercase text-slate-400">Montant Bloqué</p>
              <span class="h-8 w-8 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white text-sm">💶</span>
            </div>
            <p class="relative text-[26px] font-bold tracking-tight text-emerald-300 mt-2 leading-none tabular-nums">{{ summary.blocked_amount | currency:'EUR' }}</p>
            <p class="relative text-[11px] text-slate-400 mt-1">exposition évitée</p>
          </div>
        </div>

        <!-- Category Breakdown — slate bars -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-5" *ngIf="categoryBreakdown.length > 0">
          <div class="flex items-center gap-2 mb-4">
            <span class="h-7 w-7 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 text-xs">◈</span>
            <h2 class="text-[13px] font-semibold tracking-tight text-slate-900">Répartition par Catégorie</h2>
            <span class="ml-auto text-[11px] font-medium text-slate-500">{{ categoryBreakdown.length }} catégorie(s)</span>
          </div>
          <div class="space-y-3">
            <div *ngFor="let cat of categoryBreakdown" class="flex items-center gap-3">
              <span class="w-48 text-[13px] font-medium text-slate-700 truncate" [title]="cat.category">{{ cat.category }}</span>
              <div class="flex-1 bg-slate-100 rounded-full h-2.5 border border-slate-200/50 overflow-hidden">
                <div class="bg-indigo-600 h-full rounded-full transition-all" [style.width.%]="cat.percentage || 0"></div>
              </div>
              <span class="text-xs font-semibold tabular-nums text-slate-700 w-28 text-right">{{ cat.count }} <span class="font-normal text-slate-500">({{ (cat.percentage || 0) | number:'1.1' }}%)</span></span>
            </div>
          </div>
        </div>

        <!-- Time Series Chart — elevated -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" *ngIf="timeSeriesData.length > 0">
          <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="h-7 w-7 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 text-xs">📈</span>
              <h2 class="text-[13px] font-semibold tracking-tight text-slate-900">Tendance Temporelle</h2>
            </div>
            <span class="text-[11px] font-medium text-slate-500">{{ timeSeriesData.length }} point(s)</span>
          </div>
          <div class="p-4 sm:p-5 bg-[#F8FAFC]">
            <div class="h-64">
              <canvas #timeSeriesChart></canvas>
            </div>
          </div>
        </div>

        <!-- Loading -->
        <div *ngIf="loading" class="text-center py-12 bg-white rounded-2xl border border-slate-200 shadow-sm mt-5">
          <div class="inline-block h-10 w-10 rounded-full border-2 border-slate-200 border-t-indigo-600 animate-spin"></div>
          <p class="mt-3 text-sm font-medium text-slate-600">Chargement des rapports...</p>
        </div>

        <!-- Error -->
        <div *ngIf="error" class="bg-rose-50 border border-rose-200 rounded-2xl p-4 mt-5 flex gap-3 shadow-sm">
          <span class="h-8 w-8 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">⚠️</span>
          <p class="text-sm font-medium text-rose-700">{{ error }}</p>
        </div>
      </div>
    </div>
  `
})
export class ReportsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('timeSeriesChart', { static: false }) chartCanvas!: ElementRef<HTMLCanvasElement>;
  private timeSeriesChart: Chart | null = null;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reportsService = inject(ReportsService);
  private readonly toastService = inject(ToastService);
  private readonly dataRefreshService = inject(DataRefreshService);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  startDate = '';
  endDate = '';
  summary: FraudSummaryDTO | null = null;
  categoryBreakdown: CategoryBreakdownDTO[] = [];
  timeSeriesData: TimeSeriesDataDTO[] = [];
  loading = false;
  exportingPDF = false;
  exportingCSV = false;
  error: string | null = null;

  private reportTimeout: ReturnType<typeof setTimeout> | undefined;
  private pdfTimeout: ReturnType<typeof setTimeout> | undefined;
  private csvTimeout: ReturnType<typeof setTimeout> | undefined;

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    this.endDate = today.toISOString().split('T')[0];
    this.startDate = thirtyDaysAgo.toISOString().split('T')[0];
    this.loadReports();
    // Rafraîchissement auto après import Multi-Banking / Fraud
    this.dataRefreshService.refresh$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.ngZone.run(() => this.loadReports());
      });
  }

  ngOnDestroy(): void {
    if (this.reportTimeout) clearTimeout(this.reportTimeout);
    if (this.pdfTimeout) clearTimeout(this.pdfTimeout);
    if (this.csvTimeout) clearTimeout(this.csvTimeout);
    if (this.timeSeriesChart) this.timeSeriesChart.destroy();
  }

  loadReports() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.ngZone.run(() => {
      this.loading = true;
      this.error = '';
      this.toastService.info('Chargement', 'Génération du rapport en cours...');
    });

    this.reportTimeout = setTimeout(() => {
      this.ngZone.run(() => {
        if (this.loading) {
          this.loading = false;
          this.error = 'Délai dépassé lors du chargement des rapports. Veuillez réessayer.';
          this.toastService.warning('Attention', 'Délai dépassé lors du chargement des rapports');
          this.summary = null;
          this.categoryBreakdown = [];
          this.timeSeriesData = [];
          this.cdr.detectChanges();
        }
      });
    }, 8000);

    this.reportsService.getReports(this.startDate, this.endDate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: unknown) => {
          this.ngZone.run(() => {
            clearTimeout(this.reportTimeout);
            if (data && typeof data === 'object') {
              const d = (data as Record<string, unknown>)['data'] || data;
              const dObj = d as Record<string, unknown>;
              this.summary = {
                total_transactions: (dObj['total_transactions'] as number) ?? 0,
                fraud_detected: (dObj['fraud_count'] as number) ?? 0,
                fraud_rate: (dObj['fraud_rate'] as number) ?? 0,
                total_amount: (dObj['blocked_amount'] as number) ?? 0,
                blocked_amount: (dObj['blocked_amount'] as number) ?? 0,
              };
              this.categoryBreakdown = (dObj['category_breakdown'] as CategoryBreakdownDTO[]) ||
                (dObj['categoryBreakdown'] as CategoryBreakdownDTO[]) || [];
              this.timeSeriesData = ((dObj['time_series_data'] as Array<Record<string, unknown>>) ||
                (dObj['timeSeriesData'] as Array<Record<string, unknown>>) || []).map((ts) => ({
                date: ts['date'] as string,
                fraud_count: (ts['fraud_count'] as number) ?? 0,
                total_count: (ts['total_transactions'] as number) ?? (ts['total_count'] as number) ?? 0,
              }));
            } else {
              this.summary = null;
              this.categoryBreakdown = [];
              this.timeSeriesData = [];
            }
            this.loading = false;
            this.cdr.detectChanges();

            if (this.summary && this.summary.total_transactions > 0) {
              this.toastService.success('Succès', 'Rapport chargé avec succès');
              if (isPlatformBrowser(this.platformId)) {
                setTimeout(() => this.renderTimeSeriesChart(), 100);
              }
            } else if (this.summary && this.summary.total_transactions === 0) {
              this.toastService.warning('Attention', 'Aucune transaction trouvée pour la période sélectionnée');
            } else {
              this.toastService.error('Erreur', 'Impossible de charger les données du rapport');
            }
          });
        },
        error: (err: unknown) => {
          this.ngZone.run(() => {
            clearTimeout(this.reportTimeout);
            console.error('Error loading reports:', err);
            this.error = 'Erreur lors du chargement des rapports. Veuillez vérifier la connexion au service.';
            this.loading = false;
            this.cdr.detectChanges();
            this.toastService.error('Erreur', 'Erreur lors du chargement des rapports');
            this.summary = null;
            this.categoryBreakdown = [];
            this.timeSeriesData = [];
          });
        }
      });
  }

  exportPDF() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.ngZone.run(() => {
      this.exportingPDF = true;
      this.error = null;
      this.toastService.info('Export', 'Génération du PDF en cours...');
    });

    this.pdfTimeout = setTimeout(() => {
      this.ngZone.run(() => {
        if (this.exportingPDF) {
          this.exportingPDF = false;
          this.error = 'Délai dépassé lors de l\'export PDF. Veuillez réessayer.';
          this.toastService.error('Erreur d\'export', 'Délai dépassé lors de l\'export PDF.');
          this.cdr.detectChanges();
        }
      });
    }, 10000);

    this.reportsService.exportPDF(this.startDate, this.endDate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob: Blob) => {
          clearTimeout(this.pdfTimeout);
          this.ngZone.run(() => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            const contentType = blob.type || 'application/pdf';
            const extension = contentType.includes('html') ? 'html' : 'pdf';
            link.download = `fraud_report_${this.startDate}_to_${this.endDate}.${extension}`;
            link.click();
            this.exportingPDF = false;
            this.cdr.detectChanges();
            if (extension === 'html') {
              this.toastService.success('Export réussi', 'Le rapport HTML a été téléchargé. Vous pouvez l\'ouvrir et l\'enregistrer en PDF via votre navigateur.');
            } else {
              this.toastService.success('Export réussi', 'Le rapport PDF a été téléchargé');
            }
          });
        },
        error: (err: unknown) => {
          clearTimeout(this.pdfTimeout);
          this.ngZone.run(() => {
            console.error('Error exporting PDF:', err);
            this.error = 'Erreur lors de l\'export PDF. Veuillez réessayer.';
            this.exportingPDF = false;
            this.cdr.detectChanges();
            this.toastService.error('Erreur d\'export', 'Erreur lors de l\'export PDF. Le service peut être indisponible.');
          });
        }
      });
  }

  exportCSV() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.ngZone.run(() => {
      this.exportingCSV = true;
      this.error = null;
      this.toastService.info('Export', 'Génération du CSV en cours...');
    });

    this.csvTimeout = setTimeout(() => {
      this.ngZone.run(() => {
        if (this.exportingCSV) {
          this.exportingCSV = false;
          this.error = 'Délai dépassé lors de l\'export CSV. Génération côté client en cours...';
          this.generateClientSideCSV();
          this.toastService.success('Export réussi', 'Le rapport CSV a été généré côté client');
          this.cdr.detectChanges();
        }
      });
    }, 8000);

    this.reportsService.exportCSV(this.startDate, this.endDate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob: Blob) => {
          clearTimeout(this.csvTimeout);
          this.ngZone.run(() => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `fraud_report_${this.startDate}_to_${this.endDate}.csv`;
            link.click();
            this.exportingCSV = false;
            this.cdr.detectChanges();
            this.toastService.success('Export réussi', 'Le rapport CSV a été téléchargé');
          });
        },
        error: (err: unknown) => {
          clearTimeout(this.csvTimeout);
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
            this.cdr.detectChanges();
          });
        }
      });
  }

  private generateClientSideCSV() {
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
    if (isPlatformBrowser(this.platformId) && this.timeSeriesData.length > 0) {
      this.renderTimeSeriesChart();
    }
  }

  private renderTimeSeriesChart() {
    if (!this.chartCanvas || this.timeSeriesData.length === 0) {
      return;
    }
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
    this.timeSeriesChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Fraudes Détectées',
            data: fraudData,
            borderColor: '#e11d48',
            backgroundColor: 'rgba(225, 29, 72, 0.08)',
            borderWidth: 2.2,
            tension: 0.38,
            fill: true,
            pointBackgroundColor: '#e11d48',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 3.5,
            pointHoverRadius: 6
          },
          {
            label: 'Total Transactions',
            data: totalData,
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79, 70, 229, 0.07)',
            borderWidth: 2.2,
            tension: 0.38,
            fill: true,
            pointBackgroundColor: '#4f46e5',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 3.5,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: '#64748b', font: { size: 11, weight: 500 }, boxWidth: 12, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', padding: 14 }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#f8fafc',
            bodyColor: '#e2e8f0',
            borderColor: '#1e293b',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 10,
            displayColors: true,
            boxPadding: 3,
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          x: {
            display: true,
            title: { display: true, text: 'Date', color: '#64748b', font: { size: 11, weight: 600 } },
            ticks: { color: '#64748b', font: { size: 11 } },
            grid: { color: '#f1f5f9' },
            border: { display: false }
          },
          y: {
            display: true,
            title: { display: true, text: 'Nombre de Transactions', color: '#64748b', font: { size: 11, weight: 600 } },
            ticks: { color: '#64748b', font: { size: 11 } },
            grid: { color: '#f1f5f9' },
            border: { display: false }
          }
        }
      }
    });
  }
}
