import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface APIResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ThresholdsConfig {
  SEUIL_REGLEMENTAIRE: number;
  SEUIL_APPROCHE_RATIO: number;
  SEUIL_CASH_OUT: number;
  SEUIL_MONTANT_ABERRANT: number;
  RATIO_MONTANT_INHABITUEL: number;
  SEUIL_JOURS_COMPTE_DORMANT: number;
  MOTS_CLES_SENSIBLES: string[];
}

export type ThresholdsModel = ThresholdsConfig;

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private readonly apiUrl = '/api/config';

  constructor(private http: HttpClient) {}

  getThresholds(): Observable<ThresholdsConfig> {
    return this.http
      .get<APIResponse<ThresholdsConfig>>(`${this.apiUrl}/thresholds`)
      .pipe(
        map(res => res.data),
        catchError(this.handleError)
      );
  }

  updateThresholds(patch: Partial<ThresholdsConfig>): Observable<ThresholdsConfig> {
    return this.http
      .put<APIResponse<ThresholdsConfig>>(`${this.apiUrl}/thresholds`, patch)
      .pipe(
        map(res => res.data),
        catchError(this.handleError)
      );
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'Erreur lors de la gestion de la configuration.';
    if (error.error?.detail) {
      errorMessage = `Erreur backend (${error.status}) : ${error.error.detail}`;
    }
    console.error('[ConfigService]', errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}