import { Component, OnInit, AfterViewInit, signal, inject, PLATFORM_ID, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { MultiBankingService } from '../services/multi-banking.service';
import { IngestionStatsDTO, FileUploadDTO, IngestResponseDTO } from '../models';
import { ToastService } from '../../../core/services/toast.service';
import type { BankFileFormat } from '../../../core/types/index';

@Component({
  selector: 'app-multi-banking-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './multi-banking-dashboard.component.html',
  styleUrls: ['./multi-banking-dashboard.component.css']
})
export class MultiBankingDashboardComponent implements OnInit, AfterViewInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly multiBankingService = inject(MultiBankingService);
  private readonly toastService = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

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

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.loadStats();
    this.loadRecentUploads();
  }

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    setTimeout(() => this.cdr.detectChanges(), 50);
  }

  // Separate loading flags: stats loading should not block uploads table
  statsLoading = false;
  uploadsLoading = false;

  loadStats() {
    this.statsLoading = true;
    this.loading = true;
    this.error = null;

    this.multiBankingService.getStats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: IngestionStatsDTO) => {
          this.stats = data;
          this.statsLoading = false;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err: unknown) => {
          console.error('Error loading stats:', err);
          this.error = 'Impossible de charger les statistiques. Veuillez vérifier la connexion au service.';
          this.statsLoading = false;
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
    this.uploadsLoading = true;
    this.multiBankingService.getRecentUploads()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data: FileUploadDTO[]) => {
          this.recentUploads = data;
          this.uploadsLoading = false;
          // Keep legacy loading flag in sync for template compatibility
          if (!this.statsLoading) this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err: unknown) => {
          console.error('Error loading recent uploads:', err);
          this.recentUploads = [];
          this.uploadsLoading = false;
          if (!this.statsLoading) this.loading = false;
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      this.error = `Erreur lors du téléchargement: ${message}`;
      this.stats.failed++;

      this.toastService.error('Erreur', `Échec du téléchargement: ${message}`);
      
      this.recentUploads.unshift({
        id: Date.now().toString(),
        filename: this.selectedFile?.name || 'Inconnu',
        bank: this.selectedBank,
        format: this.selectedFormat,
        status: 'failed',
        transaction_count: 0,
        uploaded_at: new Date().toISOString(),
        error_message: message
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
