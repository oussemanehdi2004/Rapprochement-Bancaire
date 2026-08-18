import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
  // Route relative : passe par le proxy Express (/api/*) en SSR comme en dev,
  // au lieu de pointer en dur sur un host/port du backend FastAPI.
  // L'authentification est ajoutée automatiquement par `authInterceptor`
  // (voir app.config.ts / auth.interceptor.ts) : aucun token en dur ici.
  private apiUrl = '/api';

  constructor(private http: HttpClient) {}

  getReports(startDate: string, endDate: string): Observable<ReportsDataDTO> {
    return this.http.get<ReportsDataDTO>(`${this.apiUrl}/reports`, {
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