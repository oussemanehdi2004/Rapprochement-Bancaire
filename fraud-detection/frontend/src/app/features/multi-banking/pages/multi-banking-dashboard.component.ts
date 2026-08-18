import { Component, OnInit, AfterViewInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiBankingService } from '../services/multi-banking.service';
import { IngestionStatsDTO, FileUploadDTO, IngestResponseDTO } from '../models';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import type { BankFileFormat } from '../../../core/types/index';
import { ChangeDetectorRef } from '@angular/core';

@Component({
  selector: 'app-multi-banking-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './multi-banking-dashboard.component.html',
  styleUrls: ['./multi-banking-dashboard.component.css']
})
export class MultiBankingDashboardComponent implements OnInit, AfterViewInit {
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
  selectedFormat: BankFileFormat = 'csv';
  tenantId = 'default';

  constructor(
    private multiBankingService: MultiBankingService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Use setTimeout to ensure SSR stabilization is not affected
    setTimeout(() => {
      this.loadStats();
      this.loadRecentUploads();
    }, 100);
  }

  ngAfterViewInit() {
    // Force UI refresh after component is fully loaded
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 50);
  }

  loadStats() {
    this.loading = true;
    this.error = null;
    
    this.multiBankingService.getStats().subscribe({
      next: (data: IngestionStatsDTO) => {
        this.stats = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading stats:', err);
        this.error = 'Impossible de charger les statistiques. Veuillez vérifier la connexion au service.';
        this.loading = false;
        this.toastService.warning('Attention', 'Impossible de charger les statistiques');
        this.stats = {
          total_files: 0,
          successful: 0,
          failed: 0,
          pending: 0,
          total_transactions: 0
        };
        this.cdr.detectChanges();
      }
    });
  }

  loadRecentUploads() {
    this.multiBankingService.getRecentUploads().subscribe({
      next: (data: FileUploadDTO[]) => {
        this.recentUploads = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading recent uploads:', err);
        this.recentUploads = [];
        this.cdr.detectChanges();
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
    this.cdr.detectChanges(); // Force immediate UI update
    
    try {
      const response: IngestResponseDTO = await firstValueFrom(this.multiBankingService.ingestFile(
        this.selectedFile,
        this.selectedFormat as BankFileFormat,
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

        // Force multiple UI updates for better responsiveness
        this.cdr.detectChanges();
        setTimeout(() => this.cdr.detectChanges(), 10);

        this.toastService.success('Succès', `Fichier traité avec succès - ${response.parsed_count} transactions extraites`);

        this.selectedFile = null;
        this.selectedBank = '';
        this.selectedFormat = 'csv';
      } else {
        throw new Error('Échec du traitement du fichier');
      }
    } catch (error: any) {
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
      this.cdr.detectChanges();
    } finally {
      this.uploading = false;
      this.cdr.detectChanges(); // Force UI update after completion
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
