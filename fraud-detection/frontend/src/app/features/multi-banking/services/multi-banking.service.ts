import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  IngestionStatsDTO,
  FileUploadDTO,
  IngestResponseDTO,
  ParseResponseDTO
} from '../models';
import type { BankFileFormat } from '../../../core/types/index';

@Injectable({
  providedIn: 'root'
})
export class MultiBankingService {
  // Route relative : passe par le proxy Express (/api/*) en SSR comme en dev,
  // au lieu de pointer en dur sur un host/port du backend FastAPI.
  // L'authentification est ajoutée automatiquement par `authInterceptor`
  // (voir app.config.ts / auth.interceptor.ts) : aucun token en dur ici.
  private apiUrl = '/api/banking';

  constructor(private http: HttpClient) {}

  getStats(): Observable<IngestionStatsDTO> {
    return this.http.get<IngestionStatsDTO>(`${this.apiUrl}/stats`).pipe(
      catchError(error => {
        console.error('Error fetching stats:', error);
        return throwError(() => error);
      })
    );
  }

  getRecentUploads(): Observable<FileUploadDTO[]> {
    return this.http.get<FileUploadDTO[]>(`${this.apiUrl}/uploads`).pipe(
      catchError(error => {
        console.error('Error fetching recent uploads:', error);
        return throwError(() => error);
      })
    );
  }

  parseFile(file: File, format: BankFileFormat, tenantId: string, bankId: string): Observable<ParseResponseDTO> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', format);
    formData.append('tenant_id', tenantId);
    formData.append('bank_id', bankId);

    return this.http.post<ParseResponseDTO>(`${this.apiUrl}/api/multi-banking/parse`, formData).pipe(
      catchError(error => {
        console.error('Error parsing file:', error);
        return throwError(() => error);
      })
    );
  }

  validateFile(file: File, format: BankFileFormat, tenantId: string, bankId: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', format);
    formData.append('tenant_id', tenantId);
    formData.append('bank_id', bankId);

    return this.http.post(`${this.apiUrl}/api/multi-banking/validate`, formData).pipe(
      catchError(error => {
        console.error('Error validating file:', error);
        return throwError(() => error);
      })
    );
  }

  ingestFile(file: File, format: BankFileFormat, tenantId: string, bankId: string): Observable<IngestResponseDTO> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', format);
    formData.append('tenant_id', tenantId);
    formData.append('bank_id', bankId);

    return this.http.post<IngestResponseDTO>(`${this.apiUrl}/api/multi-banking/ingest`, formData).pipe(
      catchError(error => {
        console.error('Error ingesting file:', error);
        return throwError(() => error);
      })
    );
  }

  checkHealth(): Observable<any> {
    return this.http.get(`${this.apiUrl}/health`).pipe(
      catchError(error => {
        console.error('Health check failed:', error);
        return throwError(() => error);
      })
    );
  }
}