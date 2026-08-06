import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

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

    return this.http.get<TransactionListItem[]>(this.baseUrl, { params });
  }
}