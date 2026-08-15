import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface IngestionStats {
  total_files: number;
  successful: number;
  failed: number;
  pending: number;
  total_transactions: number;
}

interface FileUpload {
  id: string;
  filename: string;
  bank: string;
  format: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transaction_count: number;
  uploaded_at: string;
  error_message?: string;
}

@Component({
  selector: 'app-multi-banking-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6">
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Dashboard Multi-Banking</h1>
        <p class="text-gray-600 dark:text-gray-400 mt-2">Ingestion et traitement des fichiers bancaires (PAIN.001, CAMT.053, MT940, CSV)</p>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 class="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Fichiers</h3>
          <p class="text-3xl font-bold text-gray-900 dark:text-white mt-2">{{ stats.total_files }}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 class="text-gray-500 dark:text-gray-400 text-sm font-medium">Réussis</h3>
          <p class="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">{{ stats.successful }}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 class="text-gray-500 dark:text-gray-400 text-sm font-medium">Échoués</h3>
          <p class="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">{{ stats.failed }}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 class="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Transactions</h3>
          <p class="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">{{ stats.total_transactions | number }}</p>
        </div>
      </div>

      <!-- File Upload Section -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Télécharger un fichier</h2>
        <div class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
          <input type="file" (change)="onFileSelected($event)" #fileInput class="hidden">
          <div (click)="fileInput.click()" class="cursor-pointer">
            <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Cliquez pour sélectionner ou glissez-déposez un fichier
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-500 mt-2">
              Formats supportés: PAIN.001, CAMT.053, MT940, CSV
            </p>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Banque</label>
            <select [(ngModel)]="selectedBank" class="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              <option value="">Sélectionner une banque</option>
              <option value="bnp">BNP Paribas</option>
              <option value="societe_generale">Société Générale</option>
              <option value="credit_agricole">Crédit Agricole</option>
              <option value="lcl">LCL</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Format</label>
            <select [(ngModel)]="selectedFormat" class="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              <option value="">Sélectionner un format</option>
              <option value="pain001">PAIN.001 (Virement)</option>
              <option value="camt053">CAMT.053 (Relevé)</option>
              <option value="mt940">MT940 (Swift)</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tenant ID</label>
            <input type="text" [(ngModel)]="tenantId" placeholder="default" class="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
          </div>
        </div>

        <button (click)="uploadFile()" [disabled]="!selectedFile || uploading" 
                class="mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded transition">
          {{ uploading ? 'Traitement en cours...' : 'Télécharger et traiter' }}
        </button>
      </div>

      <!-- Recent Uploads Table -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Téléchargements récents</h2>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fichier</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Banque</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Format</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Transactions</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Statut</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              <tr *ngFor="let file of recentUploads" class="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{{ file.filename }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ file.bank }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ file.format }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{{ file.transaction_count }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span [class]="'px-2 py-1 text-xs rounded-full ' + getStatusClass(file.status)">
                    {{ file.status }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {{ file.uploaded_at | date:'short' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p class="mt-4 text-gray-600 dark:text-gray-400">Chargement...</p>
      </div>
    </div>
  `
})
export class MultiBankingDashboardComponent implements OnInit {
  stats: IngestionStats = {
    total_files: 0,
    successful: 0,
    failed: 0,
    pending: 0,
    total_transactions: 0
  };
  
  recentUploads: FileUpload[] = [];
  selectedFile: File | null = null;
  selectedBank = '';
  selectedFormat = '';
  tenantId = 'default';
  uploading = false;
  loading = false;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadStats();
    this.loadRecentUploads();
  }

  loadStats() {
    this.loading = true;
    // Mock data - replace with actual API call to multi-banking service
    setTimeout(() => {
      this.stats = {
        total_files: 156,
        successful: 142,
        failed: 8,
        pending: 6,
        total_transactions: 45230
      };
      this.loading = false;
    }, 500);
  }

  loadRecentUploads() {
    // Mock data - replace with actual API call
    this.recentUploads = [
      {
        id: '1',
        filename: 'virements_janvier_2026.xml',
        bank: 'bnp',
        format: 'pain001',
        status: 'completed',
        transaction_count: 234,
        uploaded_at: new Date().toISOString()
      },
      {
        id: '2',
        filename: 'releve_compte_0206.camt',
        bank: 'societe_generale',
        format: 'camt053',
        status: 'completed',
        transaction_count: 156,
        uploaded_at: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: '3',
        filename: 'swift_mt940_0106.txt',
        bank: 'credit_agricole',
        format: 'mt940',
        status: 'failed',
        transaction_count: 0,
        uploaded_at: new Date(Date.now() - 172800000).toISOString(),
        error_message: 'Format MT940 invalide'
      }
    ];
  }

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
  }

  async uploadFile() {
    if (!this.selectedFile || !this.selectedBank || !this.selectedFormat) {
      alert('Veuillez sélectionner un fichier, une banque et un format');
      return;
    }

    this.uploading = true;
    
    try {
      const formData = new FormData();
      formData.append('file', this.selectedFile);
      formData.append('bank', this.selectedBank);
      formData.append('format', this.selectedFormat);
      formData.append('tenant_id', this.tenantId);

      // Mock upload - replace with actual API call to multi-banking service
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Add to recent uploads
      this.recentUploads.unshift({
        id: Date.now().toString(),
        filename: this.selectedFile.name,
        bank: this.selectedBank,
        format: this.selectedFormat,
        status: 'completed',
        transaction_count: Math.floor(Math.random() * 100) + 50,
        uploaded_at: new Date().toISOString()
      });

      this.stats.total_files++;
      this.stats.successful++;
      this.stats.total_transactions += this.recentUploads[0].transaction_count;

      alert('Fichier téléchargé et traité avec succès');
      this.selectedFile = null;
      this.selectedBank = '';
      this.selectedFormat = '';
    } catch (error) {
      alert('Erreur lors du téléchargement: ' + error);
      this.stats.failed++;
    } finally {
      this.uploading = false;
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }
}
