import { Component, signal, inject, effect, PLATFORM_ID, DestroyRef, NgZone, ChangeDetectorRef, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TransactionsService, TransactionListItem } from './transactions.service';
import { ToastService } from '../../../../core/services/toast.service';
import { DataRefreshService } from '../../../../core/services/data-refresh.service';

@Component({
  selector: 'app-transactions-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transactions-list.component.html',
  styleUrls: ['./transactions-list.component.css']
})
export class TransactionsListComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly transactionsService = inject(TransactionsService);
  private readonly toastService = inject(ToastService);
  private readonly dataRefreshService = inject(DataRefreshService);

  statusFilter = signal('tous');
  dateFrom = signal('');
  dateTo = signal('');
  searchQuery = signal('');

  transactions = signal<TransactionListItem[]>([]);
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  // Pagination
  currentPage = signal(1);
  pageSize = signal(10);
  // Computed total pages based on full list length and pageSize
  totalPages = computed(() => Math.max(1, Math.ceil(this.transactions().length / this.pageSize())));
  paginatedTransactions = computed(() => {
    const all = this.transactions();
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return all.slice(start, start + size);
  });
  // Display helpers
  displayFrom = computed(() => {
    const total = this.transactions().length;
    if (total === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });
  displayTo = computed(() => {
    const total = this.transactions().length;
    const to = this.currentPage() * this.pageSize();
    return Math.min(to, total);
  });
  canGoPrev = computed(() => this.currentPage() > 1);
  canGoNext = computed(() => this.currentPage() < this.totalPages());

  // Modal d'édition / création
  showEditModal = signal(false);
  editingId = signal<string | null>(null);
  editDescription = signal('');
  editAmount = signal<number>(0);
  editStatus = signal<'MATCHED' | 'UNMATCHED' | 'SUSPICIOUS'>('UNMATCHED');
  editDate = signal('');
  isCreating = signal(false);
  saving = signal(false);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Rafraîchissement automatique après un import multi-banking ou fraud
    this.dataRefreshService.refresh$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.ngZone.run(() => {
          const f = { status: this.statusFilter(), from: this.dateFrom(), to: this.dateTo(), search: this.searchQuery() };
          this.fetchTransactions(f);
        });
      });

    effect((onCleanup) => {
      const status = this.statusFilter();
      const from = this.dateFrom();
      const to = this.dateTo();
      const search = this.searchQuery();

      const timer = setTimeout(() => {
        this.ngZone.run(() => this.fetchTransactions({ status, from, to, search }));
      }, 300);

      onCleanup(() => clearTimeout(timer));
    });
  }

  private fetchTransactions(f: { status: string; from: string; to: string; search: string }) {
    this.loading.set(true);
    this.errorMessage.set(null);

    const statusParam = f.status !== 'tous' ? this.mapStatus(f.status) : undefined;

    this.transactionsService
      .getTransactions({
        status: statusParam,
        date_from: f.from || undefined,
        date_to: f.to || undefined,
        search: f.search || undefined,
        limit: 500,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response: TransactionListItem[]) => {
          this.ngZone.run(() => {
            const dataList = Array.isArray(response) ? response : [];
            this.transactions.set(dataList);
            this.currentPage.set(1);
            this.loading.set(false);
            this.errorMessage.set(null);
            this.cdr.detectChanges();
          });
        },
        error: (err: unknown) => {
          this.ngZone.run(() => {
            this.transactions.set([]);
            this.currentPage.set(1);
            this.loading.set(false);
            const message = this.extractErrorMessage(err);
            this.errorMessage.set(`Erreur: ${message}`);
            this.cdr.detectChanges();
          });
        }
      });
  }

  private mapStatus(uiStatus: string): string | undefined {
    switch (uiStatus) {
      case 'rapproche': return 'MATCHED';
      case 'non-rapproche': return 'UNMATCHED';
      case 'attente': return 'SUSPICIOUS';
      default: return undefined;
    }
  }

  resetFilters() {
    this.statusFilter.set('tous');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.searchQuery.set('');
    this.currentPage.set(1);
  }

  nextPage() {
    if (this.canGoNext()) {
      this.currentPage.update(v => v + 1);
      this.cdr.detectChanges();
    }
  }

  prevPage() {
    if (this.canGoPrev()) {
      this.currentPage.update(v => v - 1);
      this.cdr.detectChanges();
    }
  }

  goToPage(page: number) {
    const total = this.totalPages();
    if (page >= 1 && page <= total) {
      this.currentPage.set(page);
      this.cdr.detectChanges();
    }
  }

  getStatusBgColor(status: string): string {
    switch (status) {
      case 'UNMATCHED': return '#fff7ed';
      case 'MATCHED': return '#f0fdf4';
      case 'SUSPICIOUS': return '#fef2f2';
      default: return '#f3f4f6';
    }
  }

  getStatusTextColor(status: string): string {
    switch (status) {
      case 'UNMATCHED': return '#ea580c';
      case 'MATCHED': return '#16a34a';
      case 'SUSPICIOUS': return '#dc2626';
      default: return '#374151';
    }
  }

  // ===== ACTIONS ÉDITION / SUPPRESSION / CRÉATION =====
  openCreateModal(): void {
    this.isCreating.set(true);
    this.editingId.set(null);
    this.editDescription.set('');
    this.editAmount.set(0);
    this.editStatus.set('UNMATCHED');
    this.editDate.set(new Date().toISOString().slice(0, 10));
    this.showEditModal.set(true);
    this.cdr.detectChanges();
  }

  openEditModal(tx: TransactionListItem): void {
    this.isCreating.set(false);
    this.editingId.set(tx.id);
    this.editDescription.set(tx.description || '');
    this.editAmount.set(tx.amount);
    this.editStatus.set(tx.reconciliationStatus as any);
    this.editDate.set(tx.date ? tx.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    this.showEditModal.set(true);
    this.cdr.detectChanges();
  }

  closeModal(): void {
    this.showEditModal.set(false);
    this.editingId.set(null);
    this.cdr.detectChanges();
  }

  private extractErrorMessage(err: unknown): string {
    console.error('[Transactions] Raw error:', err);

    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;

      // Case 1: Angular HttpErrorResponse with parsed JSON body
      if (e['error'] && typeof e['error'] === 'object') {
        const errorBody = e['error'] as Record<string, unknown>;
        // FastAPI default: { detail: "..." }
        if (typeof errorBody['detail'] === 'string' && errorBody['detail']) {
          return errorBody['detail'];
        }
        // Custom handler: { success: false, error: { code, message } }
        if (errorBody['error'] && typeof errorBody['error'] === 'object') {
          const nested = errorBody['error'] as Record<string, unknown>;
          if (typeof nested['message'] === 'string' && nested['message']) {
            return nested['message'];
          }
        }
        // Top-level message
        if (typeof errorBody['message'] === 'string' && errorBody['message']) {
          return errorBody['message'];
        }
      }

      // Case 2: Angular HttpErrorResponse where error is a raw string body
      if (typeof e['error'] === 'string' && e['error']) {
        try {
          const parsed = JSON.parse(e['error']);
          if (parsed?.detail) return String(parsed.detail);
          if (parsed?.error?.message) return String(parsed.error.message);
          if (parsed?.message) return String(parsed.message);
        } catch {
          const raw = (e['error'] as string).trim();
          if (raw.length > 0 && raw.length < 500) return raw;
        }
      }

      // Case 3: Angular HttpErrorResponse.message (generic "Http failure response for…")
      if (typeof e['message'] === 'string' && e['message'] && !e['message'].startsWith('Http failure')) {
        return e['message'];
      }

      // Case 4: plain Error
      if (e instanceof Error) {
        return e.message;
      }
    }

    if (err instanceof Error) {
      return err.message;
    }
    return 'Erreur lors de la sauvegarde';
  }

  saveEdit(): void {
    const desc = this.editDescription().trim();
    const amt = Number(this.editAmount());
    if (!desc) {
      this.toastService.warning('Validation', 'La description est obligatoire');
      return;
    }
    if (isNaN(amt)) {
      this.toastService.warning('Validation', 'Montant invalide');
      return;
    }
    this.saving.set(true);
    const payload: Partial<TransactionListItem> = {
      description: desc,
      amount: amt,
      reconciliationStatus: this.editStatus(),
      date: this.editDate() ? new Date(this.editDate()).toISOString() : new Date().toISOString(),
    };

    const id = this.editingId();
    const originalList = [...this.transactions()];
    
    // Optimistic UI update
    if (this.isCreating()) {
      const tempId = `temp-${Date.now()}`;
      const tempItem = { id: tempId, ...payload, transaction_reference: `REF-${Date.now()}`, tenant_id: 'default', isFraud: false, fraudProbability: 0 } as TransactionListItem;
      this.transactions.update(list => [tempItem, ...list]);
    } else if (id) {
      this.transactions.update(list => list.map(t => t.id === id ? { ...t, ...payload } as TransactionListItem : t));
    }
    
    const req$ = this.isCreating() ? this.transactionsService.createTransaction(payload) : this.transactionsService.updateTransaction(id!, payload);

    req$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.ngZone.run(() => {
          this.saving.set(false);
          if (this.isCreating()) {
            // Replace temp item with real data from server
            const newItem = saved as TransactionListItem;
            this.transactions.update(list => {
              const filtered = list.filter(t => !t.id.startsWith('temp-'));
              return [newItem, ...filtered];
            });
            this.toastService.success('Succès', 'Transaction créée et sauvegardée');
          } else {
            // Update with real data from server
            const updatedItem = saved as TransactionListItem;
            this.transactions.update(list => list.map(t => t.id === id ? updatedItem : t));
            this.toastService.success('Succès', 'Transaction mise à jour et sauvegardée');
          }
          this.showEditModal.set(false);
          this.cdr.detectChanges();
        });
      },
      error: (err: unknown) => {
        this.ngZone.run(() => {
          this.saving.set(false);
          // Revert optimistic update on error
          this.transactions.set(originalList);
          const msg = this.extractErrorMessage(err);
          this.toastService.error('Erreur', msg);
          this.cdr.detectChanges();
        });
      }
    });
  }

  deleteTransaction(tx: TransactionListItem): void {
    if (typeof window !== 'undefined' && !window.confirm(`Supprimer la transaction "${tx.description}" (${tx.amount} €) ?`)) {
      return;
    }
    // Optimistic UI update - remove immediately
    const originalList = [...this.transactions()];
    this.transactions.update(list => list.filter(t => t.id !== tx.id));
    
    this.transactionsService.deleteTransaction(tx.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.ngZone.run(() => {
          // Ajuste la pagination si page vide
          if (this.paginatedTransactions().length === 0 && this.currentPage() > 1) {
            this.currentPage.update(v => v - 1);
          }
          this.toastService.success('Supprimé', 'Transaction supprimée avec succès');
          this.cdr.detectChanges();
        });
      },
      error: (err: unknown) => {
        this.ngZone.run(() => {
          // Revert optimistic update on error
          this.transactions.set(originalList);
          const msg = this.extractErrorMessage(err);
          this.toastService.error('Erreur', msg);
          this.cdr.detectChanges();
        });
      }
    });
  }
}