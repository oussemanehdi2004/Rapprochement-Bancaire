import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface FraudSummary {
  total_transactions: number;
  fraud_detected: number;
  fraud_rate: number;
  total_amount: number;
  blocked_amount: number;
}

interface CategoryBreakdown {
  category: string;
  count: number;
  percentage: number;
}

interface TimeSeriesData {
  date: string;
  fraud_count: number;
  total_count: number;
}

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
          <button (click)="loadReports()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition">
            Générer le rapport
          </button>
          <button (click)="exportPDF()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition">
            Exporter PDF
          </button>
          <button (click)="exportCSV()" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded transition">
            Exporter CSV
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
              <div class="bg-blue-600 h-4 rounded-full" [style.width.%]="cat.percentage"></div>
            </div>
            <span class="text-sm text-gray-600 dark:text-gray-400 w-20 text-right">{{ cat.count }} ({{ cat.percentage | number:'1.1' }}%)</span>
          </div>
        </div>
      </div>

      <!-- Time Series Chart Placeholder -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6" *ngIf="timeSeriesData.length > 0">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Tendance Temporelle</h2>
        <div class="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded">
          <p class="text-gray-500 dark:text-gray-400">Graphique de tendance temporelle (intégration Chart.js requise)</p>
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
export class ReportsComponent implements OnInit {
  startDate = '';
  endDate = '';
  summary: FraudSummary | null = null;
  categoryBreakdown: CategoryBreakdown[] = [];
  timeSeriesData: TimeSeriesData[] = [];
  loading = false;
  error = '';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    // Set default date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    this.endDate = today.toISOString().split('T')[0];
    this.startDate = thirtyDaysAgo.toISOString().split('T')[0];
    this.loadReports();
  }

  loadReports() {
    this.loading = true;
    this.error = '';

    // Set timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (this.loading) {
        this.loading = false;
        this.error = 'Délai dépassé lors du chargement des rapports. Veuillez réessayer.';
      }
    }, 8000);

    // Mock data for demonstration - replace with actual API calls
    setTimeout(() => {
      // Clear the timeout if data loads successfully
      clearTimeout(timeout);

      this.summary = {
        total_transactions: 15420,
        fraud_detected: 342,
        fraud_rate: 2.22,
        total_amount: 8923400,
        blocked_amount: 234500
      };

      this.categoryBreakdown = [
        { category: 'SEUIL_REGLEMENTAIRE', count: 145, percentage: 42.4 },
        { category: 'MOTCLE_SENSIBLE', count: 89, percentage: 26.0 },
        { category: 'VELOCITE_ANORMALE', count: 56, percentage: 16.4 },
        { category: 'CHANGEMENT_GEOLOC', count: 32, percentage: 9.4 },
        { category: 'HORAIRE_ATYPIQUE', count: 20, percentage: 5.8 }
      ];

      this.timeSeriesData = this.generateMockTimeSeries();
      this.loading = false;
    }, 1000);
  }

  generateMockTimeSeries(): TimeSeriesData[] {
    const data: TimeSeriesData[] = [];
    const startDate = new Date(this.startDate);
    const endDate = new Date(this.endDate);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const total = Math.floor(Math.random() * 100) + 50;
      const fraud = Math.floor(total * (Math.random() * 0.05 + 0.01));
      data.push({
        date: d.toISOString().split('T')[0],
        fraud_count: fraud,
        total_count: total
      });
    }
    return data;
  }

  exportPDF() {
    // Placeholder for PDF export functionality
    alert('Export PDF - Fonctionnalité à implémenter avec jsPDF ou similaire');
  }

  exportCSV() {
    if (!this.timeSeriesData.length) return;
    
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
  }
}
