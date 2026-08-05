import { Component, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TransactionsService, TransactionListItem } from './transactions.service';

@Component({
  selector: 'app-transactions-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transactions-list.component.html',
  styleUrls: ['./transactions-list.component.css']
})
export class TransactionsListComponent {
  private transactionsService = inject(TransactionsService);

  statusFilter = signal('tous');
  dateFrom = signal('');
  dateTo = signal('');
  searchQuery = signal('');

  transactions = signal<TransactionListItem[]>([]);
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  constructor() {
    // Cette fonction s'exécute à chaque fois qu'un signal (filtre/recherche) change
    effect((onCleanup) => {
      const status = this.statusFilter();
      const from = this.dateFrom();
      const to = this.dateTo();
      const search = this.searchQuery();

      // On crée un délai de 300ms avant de lancer l'appel (Debounce)
      const timer = setTimeout(() => {
        this.fetchTransactions({ status, from, to, search });
      }, 300);

      // Si l'utilisateur tape une autre lettre avant les 300ms, on annule le timer précédent
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
      })
      .subscribe({
        next: (response: any) => {
          // Extraction sécurisée du tableau d'objets
          let dataList: TransactionListItem[] = [];

          if (Array.isArray(response)) {
            dataList = response;
          } else if (response && Array.isArray(response.data)) {
            dataList = response.data;
          } else if (response && Array.isArray(response.transactions)) {
            dataList = response.transactions;
          }

          this.transactions.set(dataList);
          this.loading.set(false);
        },
        error: (err: any) => {
          // En cas d'erreur, on remet un tableau vide pour éviter de faire planter le composant
          this.transactions.set([]);
          this.loading.set(false);
          this.errorMessage.set(`Erreur: ${err.message || 'Impossible de charger les transactions'}`);
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