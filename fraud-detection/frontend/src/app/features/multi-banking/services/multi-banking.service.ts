import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
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
  private apiUrl = 'http://localhost:8005/banking';
  private headers = new HttpHeaders({
    'Content-Type': 'application/json'
  });

  constructor(private http: HttpClient) {}

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('auth_token');
    if (token) {
      return this.headers.set('Authorization', `Bearer ${token}`);
    }
    return this.headers;
  }

  getStats(): Observable<IngestionStatsDTO> {
    return this.http.get<IngestionStatsDTO>(`${this.apiUrl}/stats`, {
      headers: this.getAuthHeaders()
    }).pipe(
      catchError(error => {
        console.error('Error fetching stats:', error);
        return throwError(() => error);
      })
    );
  }

  getRecentUploads(): Observable<FileUploadDTO[]> {
    return this.http.get<FileUploadDTO[]>(`${this.apiUrl}/uploads`, {
      headers: this.getAuthHeaders()
    }).pipe(
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

    return this.http.post<ParseResponseDTO>(`${this.apiUrl}/api/multi-banking/parse`, formData, {
      headers: this.getAuthHeaders().delete('Content-Type'), // Let browser set multipart boundary
    }).pipe(
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

    return this.http.post(`${this.apiUrl}/api/multi-banking/validate`, formData, {
      headers: this.getAuthHeaders().delete('Content-Type'),
    }).pipe(
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

    return this.http.post<IngestResponseDTO>(`${this.apiUrl}/api/multi-banking/ingest`, formData, {
      headers: this.getAuthHeaders().delete('Content-Type'),
    }).pipe(
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