import { Component, signal, inject, effect, PLATFORM_ID, DestroyRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TransactionsService, TransactionListItem } from './transactions.service';

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
  private readonly transactionsService = inject(TransactionsService);

  statusFilter = signal('tous');
  dateFrom = signal('');
  dateTo = signal('');
  searchQuery = signal('');

  transactions = signal<TransactionListItem[]>([]);
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    effect((onCleanup) => {
      const status = this.statusFilter();
      const from = this.dateFrom();
      const to = this.dateTo();
      const search = this.searchQuery();

      const timer = setTimeout(() => {
        this.fetchTransactions({ status, from, to, search });
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
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (response: TransactionListItem[]) => {
          const dataList = Array.isArray(response) ? response : [];
          this.transactions.set(dataList);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.transactions.set([]);
          this.loading.set(false);
          const message = err instanceof Error ? err.message : 'Impossible de charger les transactions';
          this.errorMessage.set(`Erreur: ${message}`);
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
}