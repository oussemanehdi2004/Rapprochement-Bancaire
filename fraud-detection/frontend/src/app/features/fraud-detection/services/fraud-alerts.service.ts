import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpParams, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import {
  ShapContributionDTO,
  ExplainabilityDTO,
  TransactionInputDTO,
  TransactionOutputDTO,
  AnalyzeResponseDTO
} from '../models';
import type { APIResponse } from '../../../core/types/index';

// Interface étendue pour compatibilité avec le code existant
export interface TransactionOutputExtended extends TransactionOutputDTO {
  tenantId?: string;
  transactionId?: string;
  fraudScore?: number;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | string;
  category?: string;
  sender_account?: string;
  receiver_account?: string;
  beneficiary?: string;
  status?: string;
}

// Alias de compatibilité pour FraudDashboardComponent
export type FraudAlert = TransactionOutputExtended;
export type TransactionOutput = TransactionOutputExtended;

@Injectable({
  providedIn: 'root'
})
export class FraudAlertsService {
  private readonly platformId = inject(PLATFORM_ID);
  private apiUrl = '/api';

  public alerts = signal<TransactionOutputExtended[]>([]);
  public loading = signal<boolean>(false);
  public stats = signal<{
    totalAlerts: number;
    critical: number;
    high: number;
    underInvestigation: number;
    totalAmountAtRisk: number;
  } | null>(null);

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    let token: string | null = null;
    if (isPlatformBrowser(this.platformId)) {
      token = localStorage.getItem('token');
    }
    return new HttpHeaders({
      'Authorization': `Bearer ${token || ''}`
    });
  }

  private mapTransactionData(items: TransactionOutputDTO[]): TransactionOutputExtended[] {
    if (!items) return [];
    return items.map(tx => {
      const score = tx.score ?? (tx.fraudProbability ? Math.round(tx.fraudProbability * 100) : 0);
      
      // Application stricte des seuils de confiance de Dhirar
      let derivedConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      if (score >= 85) derivedConfidence = 'HIGH';
      else if (score >= 70) derivedConfidence = 'MEDIUM';
      else derivedConfidence = 'LOW';

      // Map fraudProbability to severity for tests
      let derivedSeverity: 'critical' | 'high' | 'medium' | 'low' = 'low';
      if (tx.fraudProbability >= 0.9) derivedSeverity = 'critical';
      else if (tx.fraudProbability >= 0.7) derivedSeverity = 'high';
      else if (tx.fraudProbability >= 0.5) derivedSeverity = 'medium';
      else derivedSeverity = 'low';

      // Infer category from factors when ruleCategory is NON_CATEGORISE
      let derivedCategory = tx.ruleCategory || 'NON_CATEGORISE';
      if (derivedCategory === 'NON_CATEGORISE' && tx.explainability?.factors) {
        const factorsStr = tx.explainability.factors.join(' ').toLowerCase();
        if (factorsStr.includes('montant') && (factorsStr.includes('inhabituel') || factorsStr.includes('exceptionnel'))) {
          derivedCategory = 'montant_exceptionnel';
        }
      }

      return {
        ...tx,
        tenantId: tx.tenant_id,
        transactionId: tx.id || tx.transaction_reference,
        category: derivedCategory,
        confidence: derivedConfidence, // On écrase avec la règle métier stricte
        severity: derivedSeverity,
        beneficiary: '—',
        fraudScore: score,
        status: tx.isFraud ? 'new' : 'dismissed',
        explainability: {
          ...tx.explainability,
          shap_contributions: tx.explainability?.shap_contributions || []
        }
      };
    });
  }

  analyzeTransactions(transactions?: unknown[]): Observable<TransactionOutputExtended[]> {
    this.loading.set(true);

    const payload = transactions || [];
    const endpoint = `${this.apiUrl}/analyze-demo`;

    return this.http.post<APIResponse>(endpoint, payload).pipe(
      map((res) => this.mapTransactionData(res.data)),
      tap((data) => {
        const newAlerts = Array.isArray(data) ? data : [data];
        this.alerts.set([...newAlerts, ...this.alerts()]);
        this.updateStats(this.alerts());
        this.loading.set(false);
      }),
      catchError((err: unknown) => {
        this.loading.set(false);
        return throwError(() => err);
      })
    );
  }

  analyze(transactions?: unknown[]): Observable<TransactionOutputExtended[]> {
    return this.analyzeTransactions(transactions);
  }

  getTransactions(filters?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Observable<TransactionOutputExtended[]> {
    this.loading.set(true);
    let params = new HttpParams();
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.search) params = params.set('search', filters.search);
    if (filters?.limit) params = params.set('limit', filters.limit.toString());
    if (filters?.offset) params = params.set('offset', filters.offset.toString());

    return this.http
      .get<APIResponse<TransactionOutputDTO[]>>(`${this.apiUrl}/transactions`, { params })
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

  public updateStats(data: TransactionOutputExtended[]): void {
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

  public clearAlerts(): void {
    this.alerts.set([]);
    this.stats.set({
      totalAlerts: 0,
      critical: 0,
      high: 0,
      underInvestigation: 0,
      totalAmountAtRisk: 0
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