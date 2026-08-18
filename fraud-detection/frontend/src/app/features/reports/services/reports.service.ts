import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  FraudSummaryDTO,
  CategoryBreakdownDTO,
  TimeSeriesDataDTO,
  ReportsDataDTO
} from '../../fraud-detection/models';

@Injectable({
  providedIn: 'root'
})
export class ReportsService {
  private apiUrl = 'http://localhost:8005/api';
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

  getReports(startDate: string, endDate: string): Observable<ReportsDataDTO> {
    return this.http.get<ReportsDataDTO>(`${this.apiUrl}/reports`, {
      headers: this.getAuthHeaders(),
      params: {
        start_date: startDate,
        end_date: endDate
      }
    }).pipe(
      catchError(error => {
        console.error('Error fetching reports:', error);
        return throwError(() => error);
      })
    );
  }

  exportPDF(startDate: string, endDate: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/reports/pdf`, {
      headers: this.getAuthHeaders(),
      params: {
        start_date: startDate,
        end_date: endDate
      },
      responseType: 'blob'
    }).pipe(
      catchError(error => {
        console.error('Error exporting PDF:', error);
        return throwError(() => error);
      })
    );
  }

  exportCSV(startDate: string, endDate: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/reports/csv`, {
      headers: this.getAuthHeaders(),
      params: {
        start_date: startDate,
        end_date: endDate
      },
      responseType: 'blob'
    }).pipe(
      catchError(error => {
        console.error('Error exporting CSV:', error);
        return throwError(() => error);
      })
    );
  }

  getCategoryBreakdown(startDate: string, endDate: string): Observable<CategoryBreakdownDTO[]> {
    return this.http.get<CategoryBreakdownDTO[]>(`${this.apiUrl}/reports/categories`, {
      headers: this.getAuthHeaders(),
      params: {
        start_date: startDate,
        end_date: endDate
      }
    }).pipe(
      catchError(error => {
        console.error('Error fetching category breakdown:', error);
        return throwError(() => error);
      })
    );
  }

  getTimeSeriesData(startDate: string, endDate: string): Observable<TimeSeriesDataDTO[]> {
    return this.http.get<TimeSeriesDataDTO[]>(`${this.apiUrl}/reports/timeseries`, {
      headers: this.getAuthHeaders(),
      params: {
        start_date: startDate,
        end_date: endDate
      }
    }).pipe(
      catchError(error => {
        console.error('Error fetching time series data:', error);
        return throwError(() => error);
      })
    );
  }
}