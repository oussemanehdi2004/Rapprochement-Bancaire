import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface TransactionListItem {
  id: string;
  tenant_id: string;
  transaction_reference: string;
  date: string;
  description?: string;
  amount: number;
  isFraud: boolean;
  fraudProbability: number;
  reconciliationStatus: 'MATCHED' | 'UNMATCHED' | 'SUSPICIOUS';
  ruleCategory?: string;
  explainability?: { summary: string; factors: string[] } | null;
}

export interface TransactionFilters {
  tenant_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable({ providedIn: 'root' })
export class TransactionsService {
  // Route relative : passe par le proxy Express (/api/*) en SSR comme en dev,
  // au lieu de pointer en dur sur un host/port du backend FastAPI.
  // L'authentification est ajoutée automatiquement par `authInterceptor`
  // (voir app.config.ts / auth.interceptor.ts) : aucun token en dur ici.
  private baseUrl = '/api/transactions';

  constructor(private http: HttpClient) {}

  getTransactions(filters: TransactionFilters = {}): Observable<TransactionListItem[]> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    return this.http.get<{ success: boolean; data: TransactionListItem[] }>(this.baseUrl, { params }).pipe(
      map(response => {
        const items = response?.data || [];
        return this.dedupe(items);
      })
    );
  }

  private dedupe(items: TransactionListItem[]): TransactionListItem[] {
    const byRef = new Map<string, TransactionListItem>();
    for (const item of items) {
      const key = item.transaction_reference || item.id;
      byRef.set(key, item); // last write wins (assumes API returns latest last, or sort by date first)
    }
    return Array.from(byRef.values());
  }

  deleteTransaction(id: string): Observable<void> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/${id}`).pipe(
      map(() => void 0),
      catchError(err => {
        return throwError(() => err);
      })
    );
  }

  updateTransaction(id: string, patch: Partial<TransactionListItem>): Observable<TransactionListItem> {
    return this.http.put<{ success: boolean; data: TransactionListItem }>(`${this.baseUrl}/${id}`, patch).pipe(
      map(res => res.data),
      catchError(err => {
        return throwError(() => err);
      })
    );
  }

  createTransaction(payload: Partial<TransactionListItem>): Observable<TransactionListItem> {
    return this.http.post<{ success: boolean; data: TransactionListItem }>(this.baseUrl, payload).pipe(
      map(res => res.data),
      catchError(err => {
        return throwError(() => err);
      })
    );
  }
}