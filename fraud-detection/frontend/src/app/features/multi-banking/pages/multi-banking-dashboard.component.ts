import { Component, OnInit, AfterViewInit, signal, inject, PLATFORM_ID, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { MultiBankingService } from '../services/multi-banking.service';
import { IngestionStatsDTO, FileUploadDTO, IngestResponseDTO } from '../models';
import { ToastService } from '../../../core/services/toast.service';
import { DataRefreshService } from '../../../core/services/data-refresh.service';
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
  private readonly dataRefreshService = inject(DataRefreshService);
  private readonly cdr = inject(ChangeDetectorRef);

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
        // Notifier le dashboard Fraude, Transactions et Rapports pour qu'ils rechargent depuis Supabase/Neo4j
        this.dataRefreshService.trigger();

        this.selectedFile = null;
        this.selectedBank = '';
        this.selectedFormat = 'csv';
      } else {
        throw new Error('Échec du traitement du fichier');
      }
    } catch (error: unknown) {
      const raw = error instanceof Error ? error.message : String(error);
      let userMsg = 'Une erreur inattendue est survenue lors de l’ingestion.';
      if (raw.includes('Failed to fetch') || raw.includes('Http failure') || raw.includes('0 Unknown') || raw.includes('NetworkError')) {
        userMsg = 'Service d’ingestion indisponible. Vérifiez que le backend Multi-Banking est démarré et accessible, puis réessayez.';
      } else if (raw.toLowerCase().includes('format') || raw.toLowerCase().includes('parse')) {
        userMsg = 'Format de fichier non pris en charge ou fichier corrompu. Vérifiez le format sélectionné (PAIN.001, CAMT.053, MT940, CSV).';
      } else if (raw) {
        userMsg = raw;
      }
      this.error = userMsg;
      this.stats.failed++;
      this.toastService.error('Échec de l’ingestion', userMsg);
      
      this.recentUploads.unshift({
        id: Date.now().toString(),
        filename: this.selectedFile?.name || 'Inconnu',
        bank: this.selectedBank,
        format: this.selectedFormat,
        status: 'failed',
        transaction_count: 0,
        uploaded_at: new Date().toISOString(),
        error_message: userMsg
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
        return 'bg-green-50 text-green-600';
      case 'failed':
        return 'bg-red-50 text-red-600';
      case 'pending':
        return 'bg-yellow-50 text-yellow-600';
      default:
        return 'bg-gray-50 text-gray-600';
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
