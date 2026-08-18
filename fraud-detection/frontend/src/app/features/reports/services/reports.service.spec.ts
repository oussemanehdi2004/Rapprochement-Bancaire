import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ReportsService } from './reports.service';
import {
  ReportsDataDTO,
  CategoryBreakdownDTO,
  TimeSeriesDataDTO
} from '../../fraud-detection/models';

describe('ReportsService', () => {
  let service: ReportsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    // Mock localStorage
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => store[key] = value.toString(),
        removeItem: (key: string) => delete store[key],
        clear: () => store = {},
      };
    })();
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    TestBed.configureTestingModule({
      providers: [ReportsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReportsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getReports', () => {
    it('should GET reports from /api/reports endpoint', () => {
      const mockReports: ReportsDataDTO = {
        summary: {
          total_transactions: 10000,
          fraud_detected: 150,
          fraud_rate: 0.015,
          total_amount: 5_000_000,
          blocked_amount: 750_000
        },
        categoryBreakdown: [
          {
            category: 'MOTCLE_SENSIBLE',
            count: 45,
            percentage: 30.0
          }
        ],
        timeSeriesData: [
          {
            date: '2026-08-18',
            fraud_count: 15,
            total_count: 1000
          }
        ]
      };

      let result: ReportsDataDTO | undefined;
      service.getReports('2026-08-01', '2026-08-18').subscribe(reports => (result = reports));

      const req = httpMock.expectOne('http://localhost:8005/api/reports?start_date=2026-08-01&end_date=2026-08-18');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('start_date')).toBe('2026-08-01');
      expect(req.request.params.get('end_date')).toBe('2026-08-18');

      req.flush(mockReports);
      expect(result).toEqual(mockReports);
    });

    it('should include auth token when available', () => {
      localStorage.setItem('auth_token', 'test-token');

      service.getReports('2026-08-01', '2026-08-18').subscribe();

      const req = httpMock.expectOne('http://localhost:8005/api/reports?start_date=2026-08-01&end_date=2026-08-18');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');

      req.flush({
        summary: { total_transactions: 0, fraud_detected: 0, fraud_rate: 0, total_amount: 0, blocked_amount: 0 },
        categoryBreakdown: [],
        timeSeriesData: []
      });

      localStorage.removeItem('auth_token');
    });
  });

  describe('exportPDF', () => {
    it('should GET PDF from /api/reports/pdf endpoint', () => {
      const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' });

      let result: Blob | undefined;
      service.exportPDF('2026-08-01', '2026-08-18').subscribe(blob => (result = blob));

      const req = httpMock.expectOne('http://localhost:8005/api/reports/pdf?start_date=2026-08-01&end_date=2026-08-18');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('start_date')).toBe('2026-08-01');
      expect(req.request.params.get('end_date')).toBe('2026-08-18');
      expect(req.request.responseType).toBe('blob');

      req.flush(mockBlob);
      expect(result).toEqual(mockBlob);
    });

    it('should handle PDF export errors', () => {
      let caughtError: any;
      service.exportPDF('2026-08-01', '2026-08-18').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne('http://localhost:8005/api/reports/pdf?start_date=2026-08-01&end_date=2026-08-18');
      req.flush(new Blob(['Export failed'], { type: 'application/pdf' }), { status: 500, statusText: 'Internal Server Error' });

      expect(caughtError).toBeTruthy();
    });
  });

  describe('exportCSV', () => {
    it('should GET CSV from /api/reports/csv endpoint', () => {
      const mockBlob = new Blob(['CSV content'], { type: 'text/csv' });

      let result: Blob | undefined;
      service.exportCSV('2026-08-01', '2026-08-18').subscribe(blob => (result = blob));

      const req = httpMock.expectOne('http://localhost:8005/api/reports/csv?start_date=2026-08-01&end_date=2026-08-18');
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');

      req.flush(mockBlob);
      expect(result).toEqual(mockBlob);
    });
  });

  describe('getCategoryBreakdown', () => {
    it('should GET category breakdown from /api/reports/categories endpoint', () => {
      const mockBreakdown: CategoryBreakdownDTO[] = [
        {
          category: 'MOTCLE_SENSIBLE',
          count: 45,
          percentage: 30.0
        },
        {
          category: 'SEUIL_REGLEMENTAIRE',
          count: 30,
          percentage: 20.0
        }
      ];

      let result: CategoryBreakdownDTO[] | undefined;
      service.getCategoryBreakdown('2026-08-01', '2026-08-18').subscribe(breakdown => (result = breakdown));

      const req = httpMock.expectOne('http://localhost:8005/api/reports/categories?start_date=2026-08-01&end_date=2026-08-18');
      expect(req.request.method).toBe('GET');

      req.flush(mockBreakdown);
      expect(result).toEqual(mockBreakdown);
    });

    it('should handle empty category breakdown', () => {
      service.getCategoryBreakdown('2026-08-01', '2026-08-18').subscribe(breakdown => {
        expect(breakdown).toEqual([]);
      });

      const req = httpMock.expectOne('http://localhost:8005/api/reports/categories?start_date=2026-08-01&end_date=2026-08-18');
      req.flush([]);
    });
  });

  describe('getTimeSeriesData', () => {
    it('should GET time series data from /api/reports/timeseries endpoint', () => {
      const mockTimeSeries: TimeSeriesDataDTO[] = [
        {
          date: '2026-08-18',
          fraud_count: 15,
          total_count: 1000
        },
        {
          date: '2026-08-17',
          fraud_count: 10,
          total_count: 900
        }
      ];

      let result: TimeSeriesDataDTO[] | undefined;
      service.getTimeSeriesData('2026-08-01', '2026-08-18').subscribe(data => (result = data));

      const req = httpMock.expectOne('http://localhost:8005/api/reports/timeseries?start_date=2026-08-01&end_date=2026-08-18');
      expect(req.request.method).toBe('GET');

      req.flush(mockTimeSeries);
      expect(result).toEqual(mockTimeSeries);
    });

    it('should validate date parameters in time series request', () => {
      service.getTimeSeriesData('2026-08-01', '2026-08-18').subscribe();

      const req = httpMock.expectOne('http://localhost:8005/api/reports/timeseries?start_date=2026-08-01&end_date=2026-08-18');
      expect(req.request.params.get('start_date')).toBe('2026-08-01');
      expect(req.request.params.get('end_date')).toBe('2026-08-18');

      req.flush([]);
    });
  });
});
