import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface APIResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  amount: number;
  is_fraud: boolean;
  tx_id: string;
}

export interface GraphNetworkResponse {
  center_iban: string;
  nodes: string[];
  edges: GraphEdge[];
}

export interface TopAccount {
  iban: string;
  alert_count: number;
  categories: string[];
}

// Alias de type pour compatibilité avec d'autres vues
export type GraphAccountNode = TopAccount;

@Injectable({
  providedIn: 'root'
})
export class GraphService {
  private readonly apiUrl = '/api/graph';

  constructor(private http: HttpClient) {}

  /**
   * Supporte la signature (iban, depth) ou (tenantId, iban, depth)
   */
  getAccountNetwork(ibanOrTenant: string, ibanOrDepth?: string | number, depth = 2): Observable<GraphNetworkResponse> {
    let iban = ibanOrTenant;
    let actualDepth = depth;
    let tenantId: string | undefined;

    if (typeof ibanOrDepth === 'string') {
      // Signature: (tenantId, iban, depth)
      tenantId = ibanOrTenant;
      iban = ibanOrDepth;
    } else if (typeof ibanOrDepth === 'number') {
      // Signature: (iban, depth)
      actualDepth = ibanOrDepth;
    }

    let params = new HttpParams()
      .set('iban', iban)
      .set('depth', actualDepth.toString());

    if (tenantId) {
      params = params.set('tenant_id', tenantId);
    }

    return this.http
      .get<APIResponse<GraphNetworkResponse>>(`${this.apiUrl}/network`, { params })
      .pipe(
        map(res => res.data),
        catchError(this.handleError)
      );
  }

  getTopFlaggedAccounts(tenantId?: string, limit = 10): Observable<TopAccount[]> {
    let params = new HttpParams().set('limit', limit.toString());

    if (tenantId) {
      params = params.set('tenant_id', tenantId);
    }

    return this.http
      .get<APIResponse<TopAccount[]>>(`${this.apiUrl}/top-accounts`, { params })
      .pipe(
        map(res => res.data),
        catchError(this.handleError)
      );
  }

  /**
   * Alias de compatibilité
   */
  getTopAccounts(tenantId?: string | number, limit = 10): Observable<TopAccount[]> {
    const actualLimit = typeof tenantId === 'number' ? tenantId : limit;
    const actualTenantId = typeof tenantId === 'string' ? tenantId : undefined;
    return this.getTopFlaggedAccounts(actualTenantId, actualLimit);
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'Erreur lors de la récupération des données de graphe Neo4j.';
    if (error.error?.detail) {
      errorMessage = `Erreur backend Graphe (${error.status}) : ${error.error.detail}`;
    }
    console.error('[GraphService]', errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}