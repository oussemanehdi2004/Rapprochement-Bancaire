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
import type { BankFileFormat } from '../../../core/types/index';

describe('MultiBankingService - Comprehensive Integration Suite', () => {
  let service: MultiBankingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => store[key] = value.toString(),
        removeItem: (key: string) => delete store[key],
        clear: () => store = {},
      };
    })();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

    TestBed.configureTestingModule({
      providers: [MultiBankingService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MultiBankingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // ==========================================================================
  // SECTION 1: SERVICE INITIALIZATION
  // ==========================================================================

  describe('Service Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });
  });

  // ==========================================================================
  // SECTION 2: GET STATS
  // ==========================================================================

  describe('Get Stats', () => {
    it('should GET from /stats endpoint', () => {
      const mockStats: IngestionStatsDTO = {
        total_files: 100, successful: 85, failed: 10, pending: 5, total_transactions: 15000
      };

      let result: IngestionStatsDTO | undefined;
      service.getStats().subscribe(stats => (result = stats));

      const req = httpMock.expectOne(r => r.url.endsWith('/stats'));
      expect(req.request.method).toBe('GET');
      req.flush(mockStats);
      expect(result).toEqual(mockStats);
    });

    it('should handle empty stats', () => {
      service.getStats().subscribe(stats => {
        expect(stats.total_files).toBe(0);
        expect(stats.total_transactions).toBe(0);
      });

      const req = httpMock.expectOne(r => r.url.endsWith('/stats'));
      req.flush({ total_files: 0, successful: 0, failed: 0, pending: 0, total_transactions: 0 });
    });

    it('should handle HTTP 500 error', () => {
      let caughtError: any;
      service.getStats().subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne(r => r.url.endsWith('/stats'));
      req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
      expect(caughtError).toBeTruthy();
    });

    it('should handle network timeout', () => {
      let caughtError: any;
      service.getStats().subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne(r => r.url.endsWith('/stats'));
      req.error(new ProgressEvent('timeout'), { status: 0, statusText: 'Timeout' });
      expect(caughtError).toBeTruthy();
    });
  });

  // ==========================================================================
  // SECTION 3: GET RECENT UPLOADS
  // ==========================================================================

  describe('Get Recent Uploads', () => {
    it('should GET from /uploads endpoint', () => {
      const mockUploads: FileUploadDTO[] = [
        {
          id: 'upload-1', filename: 'transactions.csv', bank: 'bank-456',
          format: 'csv', status: 'completed', transaction_count: 150,
          uploaded_at: '2026-08-18T10:00:00Z'
        }
      ];

      let result: FileUploadDTO[] | undefined;
      service.getRecentUploads().subscribe(uploads => (result = uploads));

      const req = httpMock.expectOne(r => r.url.endsWith('/uploads'));
      expect(req.request.method).toBe('GET');
      req.flush(mockUploads);
      expect(result).toEqual(mockUploads);
    });

    it('should handle empty uploads list', () => {
      service.getRecentUploads().subscribe(uploads => {
        expect(uploads).toEqual([]);
      });

      const req = httpMock.expectOne(r => r.url.endsWith('/uploads'));
      req.flush([]);
    });

    it('should handle mixed status uploads', () => {
      const mockUploads: FileUploadDTO[] = [
        { id: '1', filename: 'a.csv', bank: 'b1', format: 'csv', status: 'completed', transaction_count: 100, uploaded_at: '2026-08-18T10:00:00Z' },
        { id: '2', filename: 'b.csv', bank: 'b1', format: 'csv', status: 'failed', transaction_count: 0, uploaded_at: '2026-08-18T11:00:00Z', error_message: 'Parse error' },
        { id: '3', filename: 'c.csv', bank: 'b1', format: 'csv', status: 'pending', transaction_count: 50, uploaded_at: '2026-08-18T12:00:00Z' },
      ];

      service.getRecentUploads().subscribe(uploads => {
        expect(uploads).toHaveLength(3);
        expect(uploads[0].status).toBe('completed');
        expect(uploads[1].status).toBe('failed');
        expect(uploads[2].status).toBe('pending');
      });

      const req = httpMock.expectOne(r => r.url.endsWith('/uploads'));
      req.flush(mockUploads);
    });
  });

  // ==========================================================================
  // SECTION 4: PARSE FILE
  // ==========================================================================

  describe('Parse File', () => {
    it('should POST multipart form data to /parse', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const mockResponse: ParseResponseDTO = {
        success: true, count: 10, data: [],
        metadata: {
          filename: 'test.csv', format: 'csv' as BankFileFormat,
          tenant_id: 't1', bank_id: 'b1',
          authenticated_tenant: 't1', authenticated_user: 'user@test.com'
        }
      };

      let result: ParseResponseDTO | undefined;
      service.parseFile(mockFile, 'csv', 't1', 'b1')
        .subscribe(response => (result = response));

      const req = httpMock.expectOne(r => r.url.includes('/parse'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBe(true);

      const formData = req.request.body as FormData;
      expect(formData.get('file')).toBe(mockFile);
      expect(formData.get('format')).toBe('csv');
      expect(formData.get('tenant_id')).toBe('t1');
      expect(formData.get('bank_id')).toBe('b1');

      req.flush(mockResponse);
      expect(result).toEqual(mockResponse);
    });

    it('should support all file formats', () => {
      const formats: BankFileFormat[] = ['csv', 'camt053', 'mt940', 'pain.001', 'pain001'];
      const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' });

      formats.forEach(format => {
        service.parseFile(mockFile, format, 't1', 'b1').subscribe();

        const req = httpMock.expectOne(r => r.url.includes('/parse'));
        expect((req.request.body as FormData).get('format')).toBe(format);

        req.flush({ success: true, count: 0, data: [], metadata: {} as any });
        httpMock.verify();
      });
    });

    it('should handle 400 Bad Request for empty file', () => {
      const mockFile = new File([''], 'empty.csv', { type: 'text/csv' });
      let caughtError: any;

      service.parseFile(mockFile, 'csv', 't1', 'b1').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne(r => r.url.includes('/parse'));
      req.flush({ detail: 'Le fichier est vide' }, { status: 400, statusText: 'Bad Request' });
      expect(caughtError).toBeTruthy();
    });

    it('should handle 400 for unsupported format', () => {
      const mockFile = new File(['test'], 'test.xyz', { type: 'text/plain' });
      let caughtError: any;

      service.parseFile(mockFile, 'xyz' as any, 't1', 'b1').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne(r => r.url.includes('/parse'));
      req.flush({ detail: 'Format non supporté' }, { status: 400, statusText: 'Bad Request' });
      expect(caughtError).toBeTruthy();
    });

    it('should handle 413 Payload Too Large', () => {
      const mockFile = new File(['x'.repeat(10000000)], 'large.csv', { type: 'text/csv' });
      let caughtError: any;

      service.parseFile(mockFile, 'csv', 't1', 'b1').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne(r => r.url.includes('/parse'));
      req.flush('File too large', { status: 413, statusText: 'Payload Too Large' });
      expect(caughtError).toBeTruthy();
    });
  });

  // ==========================================================================
  // SECTION 5: VALIDATE FILE
  // ==========================================================================

  describe('Validate File', () => {
    it('should POST to /validate endpoint', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });

      service.validateFile(mockFile, 'csv', 't1', 'b1').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/validate'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBe(true);

      req.flush({ success: true, count: 10, validation: { valid_count: 8, invalid_count: 2, errors: [] } });
    });

    it('should handle validation with errors', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });

      service.validateFile(mockFile, 'csv', 't1', 'b1').subscribe(response => {
        expect(response.validation.error_count).toBe(2);
        expect(response.validation.errors).toHaveLength(2);
      });

      const req = httpMock.expectOne(r => r.url.includes('/validate'));
      req.flush({
        success: true, count: 10,
        validation: {
          valid_count: 8, invalid_count: 2,
          errors: [
            { index: 0, errors: ['account_iban manquant'] },
            { index: 5, errors: ['amount ne peut pas être 0'] },
          ]
        }
      });
    });

    it('should handle 500 server error', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      let caughtError: any;

      service.validateFile(mockFile, 'csv', 't1', 'b1').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne(r => r.url.includes('/validate'));
      req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
      expect(caughtError).toBeTruthy();
    });
  });

  // ==========================================================================
  // SECTION 6: INGEST FILE
  // ==========================================================================

  describe('Ingest File', () => {
    it('should POST to /ingest endpoint', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const mockResponse: IngestResponseDTO = {
        success: true, parsed_count: 150,
        fraud_result: { transactions: [] },
        bankmatch_result: null,
        metadata: {
          filename: 'test.csv', format: 'csv' as BankFileFormat,
          tenant_id: 't1', bank_id: 'b1',
          bankmatch_integration_enabled: false
        }
      };

      let result: IngestResponseDTO | undefined;
      service.ingestFile(mockFile, 'csv', 't1', 'b1')
        .subscribe(response => (result = response));

      const req = httpMock.expectOne(r => r.url.includes('/ingest'));
      expect(req.request.method).toBe('POST');

      req.flush(mockResponse);
      expect(result).toEqual(mockResponse);
    });

    it('should handle BankMatch integration results', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const mockResponse: IngestResponseDTO = {
        success: true, parsed_count: 150,
        fraud_result: { transactions: [] },
        bankmatch_result: {
          session_id: 'session-123',
          matching: { matched: 148, unmatched: 2 }
        },
        metadata: {
          filename: 'test.csv', format: 'csv' as BankFileFormat,
          tenant_id: 't1', bank_id: 'b1',
          bankmatch_integration_enabled: true
        }
      };

      service.ingestFile(mockFile, 'csv', 't1', 'b1').subscribe(response => {
        expect(response.bankmatch_result).not.toBeNull();
        expect(response.bankmatch_result?.session_id).toBe('session-123');
      });

      const req = httpMock.expectOne(r => r.url.includes('/ingest'));
      req.flush(mockResponse);
    });

    it('should handle 502 Bad Gateway from fraud service', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      let caughtError: any;

      service.ingestFile(mockFile, 'csv', 't1', 'b1').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne(r => r.url.includes('/ingest'));
      req.flush('Fraud service error', { status: 502, statusText: 'Bad Gateway' });
      expect(caughtError).toBeTruthy();
    });

    it('should handle 400 for empty file', () => {
      const mockFile = new File([''], 'empty.csv', { type: 'text/csv' });
      let caughtError: any;

      service.ingestFile(mockFile, 'csv', 't1', 'b1').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne(r => r.url.includes('/ingest'));
      req.flush({ detail: 'Le fichier est vide' }, { status: 400, statusText: 'Bad Request' });
      expect(caughtError).toBeTruthy();
    });

    it('should handle fraud analysis failure within successful ingest', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const mockResponse: IngestResponseDTO = {
        success: true, parsed_count: 5,
        fraud_result: { error: 'Analysis failed', success: false },
        bankmatch_result: null,
        metadata: {
          filename: 'test.csv', format: 'csv' as BankFileFormat,
          tenant_id: 't1', bank_id: 'b1',
          bankmatch_integration_enabled: false
        }
      };

      service.ingestFile(mockFile, 'csv', 't1', 'b1').subscribe(response => {
        expect(response.success).toBe(true);
        expect(response.fraud_result.error).toBe('Analysis failed');
      });

      const req = httpMock.expectOne(r => r.url.includes('/ingest'));
      req.flush(mockResponse);
    });
  });

  // ==========================================================================
  // SECTION 7: HEALTH CHECK
  // ==========================================================================

  describe('Health Check', () => {
    it('should GET from /health endpoint', () => {
      service.checkHealth().subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/health'));
      expect(req.request.method).toBe('GET');
      req.flush({ status: 'ok', service: 'multi-banking' });
    });

    it('should handle health check failure', () => {
      let caughtError: any;
      service.checkHealth().subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne(r => r.url.includes('/health'));
      req.flush('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });
      expect(caughtError).toBeTruthy();
    });
  });

  // ==========================================================================
  // SECTION 8: FILE FORMAT VARIATIONS
  // ==========================================================================

  describe('File Format Variations', () => {
    it('should handle CAMT.053 format for parse', () => {
      const mockFile = new File(['xml'], 'statement.xml', { type: 'application/xml' });

      service.parseFile(mockFile, 'camt053', 't1', 'b1').subscribe(response => {
        expect(response.success).toBe(true);
      });

      const req = httpMock.expectOne(r => r.url.includes('/parse'));
      expect((req.request.body as FormData).get('format')).toBe('camt053');
      req.flush({ success: true, count: 1, data: [], metadata: {} as any });
    });

    it('should handle MT940 format for ingest', () => {
      const mockFile = new File(['swift'], 'statement.mt940', { type: 'text/plain' });

      service.ingestFile(mockFile, 'mt940', 't1', 'b1').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/ingest'));
      expect((req.request.body as FormData).get('format')).toBe('mt940');
      req.flush({ success: true, parsed_count: 0, fraud_result: null, bankmatch_result: null, metadata: {} as any });
    });

    it('should handle PAIN.001 format for parse', () => {
      const mockFile = new File(['xml'], 'payment.xml', { type: 'application/xml' });

      service.parseFile(mockFile, 'pain.001', 't1', 'b1').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/parse'));
      expect((req.request.body as FormData).get('format')).toBe('pain.001');
      req.flush({ success: true, count: 0, data: [], metadata: {} as any });
    });
  });

  // ==========================================================================
  // SECTION 9: AUTH TOKEN HANDLING
  // ==========================================================================

  describe('Auth Token Handling', () => {
    it('should include auth token from localStorage when available', () => {
      localStorage.setItem('auth_token', 'test-jwt-token');

      service.getStats().subscribe();

      const req = httpMock.expectOne(r => r.url.endsWith('/stats'));
      expect(req.request.headers.get('Authorization')).toBe('Bearer test-jwt-token');

      req.flush({ total_files: 0, successful: 0, failed: 0, pending: 0, total_transactions: 0 });
      localStorage.removeItem('auth_token');
    });

    it('should handle missing auth token gracefully', () => {
      localStorage.removeItem('auth_token');

      service.getStats().subscribe();

      const req = httpMock.expectOne(r => r.url.endsWith('/stats'));
      // Should not throw
      req.flush({ total_files: 0, successful: 0, failed: 0, pending: 0, total_transactions: 0 });
    });
  });

  // ==========================================================================
  // SECTION 10: LARGE FILE HANDLING
  // ==========================================================================

  describe('Large File Handling', () => {
    it('should handle large CSV file parse request', () => {
      const largeContent = 'x'.repeat(5 * 1024 * 1024); // 5MB
      const mockFile = new File([largeContent], 'large.csv', { type: 'text/csv' });

      service.parseFile(mockFile, 'csv', 't1', 'b1').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/parse'));
      expect(req.request.body instanceof FormData).toBe(true);
      req.flush({ success: true, count: 1000, data: [], metadata: {} as any });
    });
  });

  // ==========================================================================
  // SECTION 11: CONCURRENT OPERATIONS
  // ==========================================================================

  describe('Concurrent Operations', () => {
    it('should handle multiple simultaneous parse requests', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });

      service.parseFile(mockFile, 'csv', 't1', 'b1').subscribe();
      const req1 = httpMock.expectOne(r => r.url.includes('/parse'));
      req1.flush({ success: true, count: 10, data: [], metadata: {} as any });

      service.parseFile(mockFile, 'csv', 't1', 'b1').subscribe();
      const req2 = httpMock.expectOne(r => r.url.includes('/parse'));
      req2.flush({ success: true, count: 20, data: [], metadata: {} as any });

      httpMock.verify();
    });

    it('should handle mixed endpoints concurrently', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });

      service.getStats().subscribe();
      service.getRecentUploads().subscribe();
      service.parseFile(mockFile, 'csv', 't1', 'b1').subscribe();

      const statsReq = httpMock.expectOne(r => r.url.endsWith('/stats'));
      const uploadsReq = httpMock.expectOne(r => r.url.endsWith('/uploads'));
      const parseReq = httpMock.expectOne(r => r.url.includes('/parse'));

      statsReq.flush({ total_files: 0, successful: 0, failed: 0, pending: 0, total_transactions: 0 });
      uploadsReq.flush([]);
      parseReq.flush({ success: true, count: 0, data: [], metadata: {} as any });
    });
  });

  // ==========================================================================
  // SECTION 12: RESPONSE STRUCTURE VALIDATION
  // ==========================================================================

  describe('Response Structure Validation', () => {
    it('should validate IngestResponseDTO has all required fields', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const fullResponse: IngestResponseDTO = {
        success: true, parsed_count: 5,
        fraud_result: {
          success: true,
          data: [{
            transaction_reference: 'ref1', id: 'TX-1', isFraud: false,
            fraudProbability: 0.05, score: 5, confidence: 'LOW',
            reconciliationStatus: 'MATCHED', ruleCategory: 'NON_CATEGORISE',
            explainability: { summary: 'OK', factors: [] }
          }]
        },
        bankmatch_result: null,
        metadata: {
          filename: 'test.csv', format: 'csv' as BankFileFormat,
          tenant_id: 't1', bank_id: 'b1',
          bankmatch_integration_enabled: false
        }
      };

      service.ingestFile(mockFile, 'csv', 't1', 'b1').subscribe(response => {
        expect(response.success).toBeDefined();
        expect(response.parsed_count).toBeDefined();
        expect(response.fraud_result).toBeDefined();
        expect(response.bankmatch_result).toBeDefined();
        expect(response.metadata).toBeDefined();
        expect(response.metadata.filename).toBeDefined();
        expect(response.metadata.format).toBeDefined();
        expect(response.metadata.tenant_id).toBeDefined();
        expect(response.metadata.bank_id).toBeDefined();
        expect(typeof response.metadata.bankmatch_integration_enabled).toBe('boolean');
      });

      const req = httpMock.expectOne(r => r.url.includes('/ingest'));
      req.flush(fullResponse);
    });

    it('should validate ParseResponseDTO has all required fields', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const fullResponse: ParseResponseDTO = {
        success: true, count: 10,
        data: [{
          tenant_id: 't1', source_line_hash: 'abc123', reference: 'REF-001',
          value_date: '2026-08-18', label: 'VIREMENT', amount: 1000.00,
          balance_before: 5000.0, balance_after: 4000.0,
          account_iban: 'FR761234', counterparty_iban: 'FR769876',
        }],
        metadata: {
          filename: 'test.csv', format: 'csv' as BankFileFormat,
          tenant_id: 't1', bank_id: 'b1',
          authenticated_tenant: 't1', authenticated_user: 'user@test.com'
        }
      };

      service.parseFile(mockFile, 'csv', 't1', 'b1').subscribe(response => {
        expect(response.success).toBeDefined();
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.data)).toBe(true);
        expect(response.metadata).toBeDefined();
      });

      const req = httpMock.expectOne(r => r.url.includes('/parse'));
      req.flush(fullResponse);
    });
  });
});
