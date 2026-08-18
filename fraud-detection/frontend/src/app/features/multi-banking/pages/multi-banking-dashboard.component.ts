import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiBankingService } from '../services/multi-banking.service';
import { IngestionStatsDTO, FileUploadDTO, IngestResponseDTO } from '../models';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-multi-banking-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './multi-banking-dashboard.component.html',
  styleUrls: ['./multi-banking-dashboard.component.css']
})
export class MultiBankingDashboardComponent implements OnInit {
  darkMode = signal(false);
  loading = false;
  uploading = false;
  error: string | null = null;
  
  stats: IngestionStatsDTO = {
    total_files: 0,
    successful: 0,
    failed: 0,
    pending: 0,
    total_transactions: 0
  };
  
  recentUploads: FileUploadDTO[] = [];
  
  selectedFile: File | null = null;
  selectedBank = '';
  selectedFormat = '';
  tenantId = 'default';

  constructor(
    private multiBankingService: MultiBankingService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    this.loadStats();
    this.loadRecentUploads();
  }

  loadStats() {
    this.loading = true;
    this.error = null;
    
    this.multiBankingService.getStats().subscribe({
      next: (data: IngestionStatsDTO) => {
        this.stats = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading stats:', err);
        this.error = 'Impossible de charger les statistiques. Veuillez vérifier la connexion au service.';
        this.loading = false;
        this.stats = {
          total_files: 0,
          successful: 0,
          failed: 0,
          pending: 0,
          total_transactions: 0
        };
      }
    });
  }

  loadRecentUploads() {
    this.multiBankingService.getRecentUploads().subscribe({
      next: (data: FileUploadDTO[]) => {
        this.recentUploads = data;
      },
      error: (err) => {
        console.error('Error loading recent uploads:', err);
        this.recentUploads = [];
      }
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    }
  }

  async uploadFile() {
    if (!this.selectedFile || !this.selectedBank || !this.selectedFormat) {
      this.toastService.warning('Information manquante', 'Veuillez sélectionner un fichier, une banque et un format');
      this.error = 'Veuillez sélectionner un fichier, une banque et un format';
      return;
    }

    this.uploading = true;
    this.error = null;
    
    try {
      const response: IngestResponseDTO = await firstValueFrom(this.multiBankingService.ingestFile(
        this.selectedFile,
        this.selectedFormat,
        this.tenantId,
        this.selectedBank
      ));
      
      if (response.success) {
        this.recentUploads.unshift({
          id: Date.now().toString(),
          filename: this.selectedFile.name,
          bank: this.selectedBank,
          format: this.selectedFormat,
          status: 'completed',
          transaction_count: response.parsed_count,
          uploaded_at: new Date().toISOString()
        });

        this.stats.total_files++;
        this.stats.successful++;
        this.stats.total_transactions += response.parsed_count;

        this.toastService.success('Succès', `Fichier traité avec succès - ${response.parsed_count} transactions extraites`);

        this.selectedFile = null;
        this.selectedBank = '';
        this.selectedFormat = '';
      } else {
        throw new Error('Échec du traitement du fichier');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      this.error = `Erreur lors du téléchargement: ${error.message || 'Erreur inconnue'}`;
      this.stats.failed++;
      
      this.toastService.error('Erreur', `Échec du téléchargement: ${error.message || 'Erreur inconnue'}`);
      
      this.recentUploads.unshift({
        id: Date.now().toString(),
        filename: this.selectedFile?.name || 'Inconnu',
        bank: this.selectedBank,
        format: this.selectedFormat,
        status: 'failed',
        transaction_count: 0,
        uploaded_at: new Date().toISOString(),
        error_message: error.message || 'Erreur inconnue'
      });
    } finally {
      this.uploading = false;
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'completed':
        return 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400';
      case 'failed':
        return 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400';
      case 'pending':
        return 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400';
      default:
        return 'bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'completed':
        return 'Réussi';
      case 'failed':
        return 'Échoué';
      case 'pending':
        return 'En cours';
      default:
        return status;
    }
  }
}
