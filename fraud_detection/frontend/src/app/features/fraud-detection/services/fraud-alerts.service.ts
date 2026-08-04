import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

export interface APIResponse<T=any> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ShapContribution {
  feature: string;
  value: number;
  direction: 'positive' | 'negative' | string;
}

export interface ExplainabilityOutput {
  summary: string;
  factors: string[];
  shap_contributions: ShapContribution[];
  shapContributions?: ShapContribution[];
}

export interface TransactionOutput {
  tenant_id?: string;
  tenantId?: string;
  mongo_transaction_id?: string;
  id?: string;
  transactionId?: string;
  date: string;
  description: string;
  amount: number;
  isFraud: boolean;
  fraudProbability: number;
  score: number;
  fraudScore?: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | string;
  reconciliationStatus: string;
  ruleCategory?: string;
  category?: string;
  sender_account?: string;
  receiver_account?: string;
  beneficiary?: string;
  status?: string;
  explainability: ExplainabilityOutput;
}

// Alias de compatibilité pour FraudDashboardComponent
export type FraudAlert = TransactionOutput;

@Injectable({
  providedIn: 'root'
})
export class FraudAlertsService {
  
  // L'URL pointe désormais vers la route standardisée sécurisée
  private apiUrl = '/api';

  public alerts = signal<TransactionOutput[]>([]);
  public loading = signal<boolean>(false);
  public stats = signal<{
    totalAlerts: number;
    critical: number;
    high: number;
    underInvestigation: number;
    totalAmountAtRisk: number;
  }>({
    totalAlerts: 0,
    critical: 0,
    high: 0,
    underInvestigation: 0,
    totalAmountAtRisk: 0
  });

  constructor(private http: HttpClient) {}

  // Injection du Token pour la validation Node.js demandée par Dhirar
  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token'); 
    return new HttpHeaders({
      'Authorization': `Bearer ${token || ''}`
    });
  }

  private mapTransactionData(items: TransactionOutput[]): TransactionOutput[] {
    return items.map(tx => {
      const score = tx.fraudScore ?? tx.score ?? 0;
      
      // Application stricte des seuils de confiance de Dhirar
      let derivedConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      if (score >= 85) derivedConfidence = 'HIGH';
      else if (score >= 70) derivedConfidence = 'MEDIUM';
      else derivedConfidence = 'LOW';

      return {
        ...tx,
        transactionId: tx.transactionId || tx.id || tx.mongo_transaction_id,
        category: tx.category || tx.ruleCategory || 'NON_CATEGORISE',
        confidence: derivedConfidence, // On écrase avec la règle métier stricte
        severity: tx.severity || (derivedConfidence === 'HIGH' ? 'CRITICAL' : derivedConfidence === 'MEDIUM' ? 'HIGH' : 'LOW'),
        beneficiary: tx.beneficiary || tx.receiver_account || '—',
        fraudScore: score,
        explainability: {
          ...tx.explainability,
          shapContributions: tx.explainability?.shapContributions || tx.explainability?.shap_contributions || []
        }
      };
    });
  }

  // La route analyze-demo a été supprimée pour respecter le CR v3.
  // Toutes les requêtes (y compris la démo) doivent passer par cette méthode sécurisée.
  analyzeTransactions(transactions?: any[]): Observable<any> {
  this.loading.set(true);

  // Utilise les transactions reçues en paramètre (ou un tableau vide par défaut)
  const payload = transactions || [];

  return this.http.post<APIResponse>(`${this.apiUrl}/analyze`, payload).pipe(
    map((res) => this.mapTransactionData(res.data)),
    tap((data) => {
      const newAlerts = Array.isArray(data) ? data : [data];
      this.alerts.set([...newAlerts, ...this.alerts()]);
      this.updateStats(this.alerts());
      this.loading.set(false);
    }),
    catchError((err: any) => {
      this.loading.set(false);
      return throwError(() => err);
    })
  );
}

// Alias pour conserver la compatibilité
analyze(transactions?: any[]): Observable<any> {
  return this.analyzeTransactions(transactions);
}
  getTransactions(filters?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Observable<TransactionOutput[]> {
    this.loading.set(true);
    let params = new HttpParams();
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.search) params = params.set('search', filters.search);
    if (filters?.limit) params = params.set('limit', filters.limit.toString());
    if (filters?.offset) params = params.set('offset', filters.offset.toString());

    return this.http
      .get<APIResponse<TransactionOutput[]>>(`${this.apiUrl}/transactions`, { params, headers: this.getHeaders() })
      .pipe(
        map(res => this.mapTransactionData(res.data)),
        tap(data => {
          this.alerts.set(data);
          this.updateStats(data);
          this.loading.set(false);
        }),
        catchError(err => {
          this.loading.set(false);
          return this.handleError(err);
        })
      );
  }

  private updateStats(data: TransactionOutput[]): void {
    const totalAlerts = data.length;
    
    // Application des seuils de Dhirar pour les KPIs
    // HIGH ≥ 85, MEDIUM 70-84
    const critical = data.filter(d => (d.fraudScore ?? d.score ?? 0) >= 85).length;
    const high = data.filter(d => {
      const score = d.fraudScore ?? d.score ?? 0;
      return score >= 70 && score < 85;
    }).length;
    
    const underInvestigation = data.filter(d => d.isFraud).length;
    const totalAmountAtRisk = data.reduce((sum, d) => sum + (d.isFraud ? d.amount : 0), 0);

    this.stats.set({
      totalAlerts,
      critical,
      high,
      underInvestigation,
      totalAmountAtRisk
    });
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'Une erreur réseau ou serveur est survenue.';
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Erreur côté client : ${error.error.message}`;
    } else if (error.error?.detail) {
      errorMessage = `Erreur backend (${error.status}) : ${error.error.detail}`;
    } else {
      errorMessage = `Erreur serveur HTTP ${error.status} : ${error.message}`;
    }
    console.error('[FraudAlertsService]', errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}