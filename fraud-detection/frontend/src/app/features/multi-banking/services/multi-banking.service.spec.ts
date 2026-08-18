import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MultiBankingService } from './multi-banking.service';
import {
  IngestionStatsDTO,
  FileUploadDTO,
  ParseResponseDTO,
  IngestResponseDTO
} from '../models';

describe('MultiBankingService', () => {
  let service: MultiBankingService;
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
      providers: [MultiBankingService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MultiBankingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getStats', () => {
    it('should GET ingestion stats from /stats endpoint', () => {
      const mockStats: IngestionStatsDTO = {
        total_files: 100,
        successful: 85,
        failed: 10,
        pending: 5,
        total_transactions: 15000
      };

      let result: IngestionStatsDTO | undefined;
      service.getStats().subscribe(stats => (result = stats));

      const req = httpMock.expectOne('http://localhost:8005/banking/stats');
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('Authorization')).toBeNull();

      req.flush(mockStats);
      expect(result).toEqual(mockStats);
    });

    it('should include auth token when available', () => {
      localStorage.setItem('auth_token', 'test-token');

      const mockStats: IngestionStatsDTO = {
        total_files: 50,
        successful: 45,
        failed: 3,
        pending: 2,
        total_transactions: 7500
      };

      service.getStats().subscribe();

      const req = httpMock.expectOne('http://localhost:8005/banking/stats');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');

      req.flush(mockStats);
      localStorage.removeItem('auth_token');
    });

    it('should handle HTTP errors', () => {
      let caughtError: any;
      service.getStats().subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne('http://localhost:8005/banking/stats');
      req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });

      expect(caughtError).toBeTruthy();
    });
  });

  describe('getRecentUploads', () => {
    it('should GET recent uploads from /uploads endpoint', () => {
      const mockUploads: FileUploadDTO[] = [
        {
          id: 'upload-1',
          filename: 'transactions.csv',
          bank: 'bank-456',
          format: 'csv',
          status: 'completed',
          transaction_count: 150,
          uploaded_at: '2026-08-18T10:00:00Z'
        }
      ];

      let result: FileUploadDTO[] | undefined;
      service.getRecentUploads().subscribe(uploads => (result = uploads));

      const req = httpMock.expectOne('http://localhost:8005/banking/uploads');
      expect(req.request.method).toBe('GET');

      req.flush(mockUploads);
      expect(result).toEqual(mockUploads);
    });

    it('should handle empty uploads list', () => {
      service.getRecentUploads().subscribe(uploads => {
        expect(uploads).toEqual([]);
      });

      const req = httpMock.expectOne('http://localhost:8005/banking/uploads');
      req.flush([]);
    });
  });

  describe('parseFile', () => {
    it('should POST file to /api/multi-banking/parse endpoint', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const mockResponse: ParseResponseDTO = {
        success: true,
        count: 10,
        data: [],
        metadata: {
          filename: 'test.csv',
          format: 'csv',
          tenant_id: 'tenant-123',
          bank_id: 'bank-456',
          authenticated_tenant: 'tenant-123',
          authenticated_user: 'user@example.com'
        }
      };

      let result: ParseResponseDTO | undefined;
      service.parseFile(mockFile, 'csv', 'tenant-123', 'bank-456')
        .subscribe(response => (result = response));

      const req = httpMock.expectOne('http://localhost:8005/banking/api/multi-banking/parse');
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBe(true);

      req.flush(mockResponse);
      expect(result).toEqual(mockResponse);
    });

    it('should send multipart form data with correct fields', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });

      service.parseFile(mockFile, 'csv', 'tenant-123', 'bank-456').subscribe();

      const req = httpMock.expectOne('http://localhost:8005/banking/api/multi-banking/parse');
      const formData = req.request.body as FormData;

      expect(formData.get('file')).toBe(mockFile);
      expect(formData.get('format')).toBe('csv');
      expect(formData.get('tenant_id')).toBe('tenant-123');
      expect(formData.get('bank_id')).toBe('bank-456');

      req.flush({ success: true, count: 0, data: [], metadata: {} as any });
    });

    it('should handle different file formats', () => {
      const formats = ['csv', 'camt053', 'mt940', 'pain.001', 'pain001'];
      const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' });

      formats.forEach(format => {
        service.parseFile(mockFile, format as any, 'tenant-123', 'bank-456').subscribe();

        const req = httpMock.expectOne('http://localhost:8005/banking/api/multi-banking/parse');
        expect(req.request.body.get('format')).toBe(format);

        req.flush({ success: true, count: 0, data: [], metadata: {} as any });
        httpMock.verify();
      });
    });
  });

  describe('validateFile', () => {
    it('should POST file to /api/multi-banking/validate endpoint', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });

      service.validateFile(mockFile, 'csv', 'tenant-123', 'bank-456').subscribe();

      const req = httpMock.expectOne('http://localhost:8005/banking/api/multi-banking/validate');
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBe(true);

      req.flush({ success: true, count: 0, validation: { valid_count: 0, invalid_count: 0, errors: [] } });
    });
  });

  describe('ingestFile', () => {
    it('should POST file to /api/multi-banking/ingest endpoint', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const mockResponse: IngestResponseDTO = {
        success: true,
        parsed_count: 150,
        fraud_result: {
          transactions: []
        },
        bankmatch_result: null,
        metadata: {
          filename: 'test.csv',
          format: 'csv',
          tenant_id: 'tenant-123',
          bank_id: 'bank-456',
          bankmatch_integration_enabled: false
        }
      };

      let result: IngestResponseDTO | undefined;
      service.ingestFile(mockFile, 'csv', 'tenant-123', 'bank-456')
        .subscribe(response => (result = response));

      const req = httpMock.expectOne('http://localhost:8005/banking/api/multi-banking/ingest');
      expect(req.request.method).toBe('POST');

      req.flush(mockResponse);
      expect(result).toEqual(mockResponse);
    });

    it('should handle BankMatch integration results', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const mockResponse: IngestResponseDTO = {
        success: true,
        parsed_count: 150,
        fraud_result: {
          transactions: []
        },
        bankmatch_result: {
          session_id: 'session-123',
          matching: { matched: 148, unmatched: 2 }
        },
        metadata: {
          filename: 'test.csv',
          format: 'csv',
          tenant_id: 'tenant-123',
          bank_id: 'bank-456',
          bankmatch_integration_enabled: true
        }
      };

      service.ingestFile(mockFile, 'csv', 'tenant-123', 'bank-456').subscribe(response => {
        expect(response.bankmatch_result).not.toBeNull();
        expect(response.bankmatch_result?.session_id).toBe('session-123');
      });

      const req = httpMock.expectOne('http://localhost:8005/banking/api/multi-banking/ingest');
      req.flush(mockResponse);
    });
  });

  describe('checkHealth', () => {
    it('should GET health status from /health endpoint', () => {
      service.checkHealth().subscribe();

      const req = httpMock.expectOne('http://localhost:8005/banking/health');
      expect(req.request.method).toBe('GET');

      req.flush({ status: 'ok', service: 'multi-banking' });
    });

    it('should handle health check failures', () => {
      let caughtError: any;
      service.checkHealth().subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne('http://localhost:8005/banking/health');
      req.flush('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });

      expect(caughtError).toBeTruthy();
    });
  });
});
