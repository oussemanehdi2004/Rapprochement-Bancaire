import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  FraudSummaryDTO,
  CategoryBreakdownDTO,
  TimeSeriesDataDTO,
  ReportsDataDTO
} from '../../fraud-detection/models';
import type { APIResponse } from '../../../core/types/index';

@Injectable({
  providedIn: 'root'
})
export class ReportsService {
  private apiUrl = '/api';

  constructor(private http: HttpClient) {}

  getReports(startDate: string, endDate: string): Observable<ReportsDataDTO> {
    return this.http.get<APIResponse<ReportsDataDTO>>(`${this.apiUrl}/reports`, {
      params: {
        start_date: startDate,
        end_date: endDate
      }
    }).pipe(
      map(response => response?.data || response as any),
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
    return this.http.get<APIResponse<CategoryBreakdownDTO[]>>(`${this.apiUrl}/reports/categories`, {
      params: {
        start_date: startDate,
        end_date: endDate
      }
    }).pipe(
      map(response => (response as any)?.data || (response as any) || []),
      catchError(error => {
        console.error('Error fetching category breakdown:', error);
        return throwError(() => error);
      })
    );
  }

  getTimeSeriesData(startDate: string, endDate: string): Observable<TimeSeriesDataDTO[]> {
    return this.http.get<APIResponse<TimeSeriesDataDTO[]>>(`${this.apiUrl}/reports/timeseries`, {
      params: {
        start_date: startDate,
        end_date: endDate
      }
    }).pipe(
      map(response => (response as any)?.data || (response as any) || []),
      catchError(error => {
        console.error('Error fetching time series data:', error);
        return throwError(() => error);
      })
    );
  }
}