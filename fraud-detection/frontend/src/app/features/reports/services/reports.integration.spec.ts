import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ReportsService } from './reports.service';
import {
  ReportsDataDTO,
  CategoryBreakdownDTO,
  TimeSeriesDataDTO
} from '../../fraud-detection/models';

describe('ReportsService Integration Tests', () => {
  let service: ReportsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ReportsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReportsService);
    httpMock = TestBed.inject(HttpTestingController);

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
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('API Contract Validation', () => {
    it('should validate ReportsDataDTO contract with API spec', () => {
      const apiResponse: ReportsDataDTO = {
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
          },
          {
            category: 'SEUIL_REGLEMENTAIRE',
            count: 30,
            percentage: 20.0
          },
          {
            category: 'ANOMALIE_SOLDE',
            count: 25,
            percentage: 16.67
          },
          {
            category: 'TRANSACTION_SUSPECTE',
            count: 20,
            percentage: 13.33
          },
          {
            category: 'NON_CATEGORISE',
            count: 30,
            percentage: 20.0
          }
        ],
        timeSeriesData: [
          {
            date: '2026-08-18',
            fraud_count: 15,
            total_count: 1000
          },
          {
            date: '2026-08-17',
            fraud_count: 12,
            total_count: 950
          },
          {
            date: '2026-08-16',
            fraud_count: 18,
            total_count: 1100
          }
        ]
      };

      let result: ReportsDataDTO | undefined;
      service.getReports('2026-08-01', '2026-08-18').subscribe(reports => (result = reports));

      const req = httpMock.expectOne(req => req.url.includes('/api/reports'));
      req.flush(apiResponse);

      expect(result).toBeDefined();
      expect(result?.summary.total_transactions).toBe(10000);
      expect(result?.summary.fraud_detected).toBe(150);
      expect(result?.categoryBreakdown).toHaveLength(5);
      expect(result?.timeSeriesData).toHaveLength(3);
    });

    it('should validate CategoryBreakdownDTO contract with API spec', () => {
      const apiResponse: CategoryBreakdownDTO[] = [
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

      const req = httpMock.expectOne(req => req.url.includes('/api/reports/categories'));
      req.flush(apiResponse);

      expect(result).toBeDefined();
      expect(result).toHaveLength(2);
      expect(result?.[0].category).toBe('MOTCLE_SENSIBLE');
      expect(result?.[0].percentage).toBe(30.0);
    });

    it('should validate TimeSeriesDataDTO contract with API spec', () => {
      const apiResponse: TimeSeriesDataDTO[] = [
        {
          date: '2026-08-18',
          fraud_count: 15,
          total_count: 1000
        },
        {
          date: '2026-08-17',
          fraud_count: 12,
          total_count: 950
        }
      ];

      let result: TimeSeriesDataDTO[] | undefined;
      service.getTimeSeriesData('2026-08-01', '2026-08-18').subscribe(data => (result = data));

      const req = httpMock.expectOne(req => req.url.includes('/api/reports/timeseries'));
      req.flush(apiResponse);

      expect(result).toBeDefined();
      expect(result).toHaveLength(2);
      expect(result?.[0].date).toBe('2026-08-18');
      expect(result?.[0].fraud_count).toBe(15);
    });
  });

  describe('Export Functionality Integration', () => {
    it('should handle PDF export with correct content type', () => {
      const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' });

      let result: Blob | undefined;
      service.exportPDF('2026-08-01', '2026-08-18').subscribe(blob => (result = blob));

      const req = httpMock.expectOne(req => req.url.includes('/api/reports/pdf'));
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      expect(req.request.params.get('start_date')).toBe('2026-08-01');
      expect(req.request.params.get('end_date')).toBe('2026-08-18');

      req.flush(mockBlob);

      expect(result).toBeDefined();
      expect(result?.type).toBe('application/pdf');
    });

    it('should handle CSV export with correct content type', () => {
      const mockBlob = new Blob(['CSV content'], { type: 'text/csv' });

      let result: Blob | undefined;
      service.exportCSV('2026-08-01', '2026-08-18').subscribe(blob => (result = blob));

      const req = httpMock.expectOne(req => req.url.includes('/api/reports/csv'));
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');

      req.flush(mockBlob);

      expect(result).toBeDefined();
      expect(result?.type).toBe('text/csv');
    });

    it('should handle export errors gracefully', () => {
      let caughtError: any;
      service.exportPDF('2026-08-01', '2026-08-18').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne(req => req.url.includes('/api/reports/pdf'));
      req.flush(new Blob(['Export failed'], { type: 'application/pdf' }), { status: 500, statusText: 'Internal Server Error' });

      expect(caughtError).toBeTruthy();
    });
  });

  describe('Date Range Validation', () => {
    it('should validate date parameters format', () => {
      service.getReports('2026-08-01', '2026-08-18').subscribe();

      const req = httpMock.expectOne(req => req.url.includes('/api/reports'));
      expect(req.request.params.get('start_date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(req.request.params.get('end_date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      req.flush({
        summary: { total_transactions: 0, fraud_detected: 0, fraud_rate: 0, total_amount: 0, blocked_amount: 0 },
        categoryBreakdown: [],
        timeSeriesData: []
      });
    });

    it('should handle different date ranges', () => {
      const dateRanges = [
        ['2026-01-01', '2026-01-31'],
        ['2026-06-01', '2026-06-30'],
        ['2026-08-01', '2026-08-18']
      ];

      dateRanges.forEach(([startDate, endDate]) => {
        service.getReports(startDate, endDate).subscribe();

        const req = httpMock.expectOne(req => req.url.includes('/api/reports'));
        expect(req.request.params.get('start_date')).toBe(startDate);
        expect(req.request.params.get('end_date')).toBe(endDate);

        req.flush({
          summary: { total_transactions: 0, fraud_detected: 0, fraud_rate: 0, total_amount: 0, blocked_amount: 0 },
          categoryBreakdown: [],
          timeSeriesData: []
        });
      });
    });
  });

  describe('Data Consistency Integration', () => {
    it('should maintain consistency between summary and breakdown', () => {
      const apiResponse: ReportsDataDTO = {
        summary: {
          total_transactions: 10000,
          fraud_detected: 150,
          fraud_rate: 0.015,
          total_amount: 5_000_000,
          blocked_amount: 750_000
        },
        categoryBreakdown: [
          { category: 'MOTCLE_SENSIBLE', count: 45, percentage: 30.0 },
          { category: 'SEUIL_REGLEMENTAIRE', count: 30, percentage: 20.0 },
          { category: 'ANOMALIE_SOLDE', count: 25, percentage: 16.67 },
          { category: 'TRANSACTION_SUSPECTE', count: 20, percentage: 13.33 },
          { category: 'NON_CATEGORISE', count: 30, percentage: 20.0 }
        ],
        timeSeriesData: []
      };

      let result: ReportsDataDTO | undefined;
      service.getReports('2026-08-01', '2026-08-18').subscribe(reports => (result = reports));

      const req = httpMock.expectOne(req => req.url.includes('/api/reports'));
      req.flush(apiResponse);

      const totalCategoryCount = result?.categoryBreakdown.reduce((sum, cat) => sum + cat.count, 0);
      expect(totalCategoryCount).toBeLessThanOrEqual(result?.summary.fraud_detected || 0);
    });

    it('should calculate fraud rate correctly', () => {
      const apiResponse: ReportsDataDTO = {
        summary: {
          total_transactions: 10000,
          fraud_detected: 150,
          fraud_rate: 0.015,
          total_amount: 5_000_000,
          blocked_amount: 750_000
        },
        categoryBreakdown: [],
        timeSeriesData: []
      };

      let result: ReportsDataDTO | undefined;
      service.getReports('2026-08-01', '2026-08-18').subscribe(reports => (result = reports));

      const req = httpMock.expectOne(req => req.url.includes('/api/reports'));
      req.flush(apiResponse);

      const calculatedRate = (result?.summary.fraud_detected || 0) / (result?.summary.total_transactions || 1);
      expect(calculatedRate).toBeCloseTo(result?.summary.fraud_rate || 0, 4);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle 400 Bad Request for invalid date parameters', () => {
      let caughtError: any;
      service.getReports('invalid-date', '2026-08-18').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne(req => req.url.includes('/api/reports'));
      req.flush({ success: false, error: 'Invalid date parameters' }, { status: 400, statusText: 'Bad Request' });

      expect(caughtError).toBeTruthy();
    });

    it('should handle 401 Unauthorized', () => {
      localStorage.setItem('auth_token', 'invalid-token');

      let caughtError: any;
      service.getReports('2026-08-01', '2026-08-18').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne(req => req.url.includes('/api/reports'));
      req.flush({ success: false, error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      expect(caughtError).toBeTruthy();
      localStorage.removeItem('auth_token');
    });

    it('should handle 500 Internal Server Error', () => {
      let caughtError: any;
      service.getReports('2026-08-01', '2026-08-18').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne(req => req.url.includes('/api/reports'));
      req.flush({ success: false, error: 'Internal Server Error' }, { status: 500, statusText: 'Internal Server Error' });

      expect(caughtError).toBeTruthy();
    });
  });
});
