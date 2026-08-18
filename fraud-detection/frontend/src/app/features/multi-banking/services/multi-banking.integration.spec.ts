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

describe('MultiBankingService Integration Tests', () => {
  let service: MultiBankingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MultiBankingService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MultiBankingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

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
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('API Contract Validation', () => {
    it('should validate ParseResponseDTO contract with API spec', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const apiResponse = {
        success: true,
        count: 10,
        data: [
          {
            tenant_id: 'tenant-123',
            source_line_hash: 'abc123',
            reference: 'REF-001',
            value_date: '2026-08-18',
            label: 'VIREMENT',
            amount: 1000.00,
            balance_before: 5000.0,
            balance_after: 4000.0,
            account_balance: 4000.0,
            account_iban: 'FR761234567890123456789012345',
            counterparty_iban: 'FR769876543210987654321098765'
          }
        ],
        metadata: {
          filename: 'test.csv',
          format: 'csv' as BankFileFormat,
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
      req.flush(apiResponse);

      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(result?.count).toBe(10);
      expect(result?.data).toHaveLength(1);
      expect(result?.metadata.filename).toBe('test.csv');
      expect(result?.metadata.format).toBe('csv');
    });

    it('should validate IngestResponseDTO contract with API spec', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const apiResponse = {
        success: true,
        parsed_count: 150,
        fraud_result: {
          transactions: [
            {
              transaction_reference: 'TX-001',
              isFraud: false,
              fraudProbability: 0.15,
              reconciliationStatus: 'MATCHED'
            },
            {
              transaction_reference: 'TX-002',
              isFraud: true,
              fraudProbability: 0.85,
              reconciliationStatus: 'SUSPICIOUS',
              ruleCategory: 'MOTCLE_SENSIBLE'
            }
          ]
        },
        bankmatch_result: {
          session_id: 'session-123',
          matching: {
            matched: 148,
            unmatched: 2
          }
        },
        metadata: {
          filename: 'test.csv',
          format: 'csv' as BankFileFormat,
          tenant_id: 'tenant-123',
          bank_id: 'bank-456',
          bankmatch_integration_enabled: true
        }
      };

      let result: IngestResponseDTO | undefined;
      service.ingestFile(mockFile, 'csv', 'tenant-123', 'bank-456')
        .subscribe(response => (result = response));

      const req = httpMock.expectOne('http://localhost:8005/banking/api/multi-banking/ingest');
      req.flush(apiResponse);

      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(result?.parsed_count).toBe(150);
      expect(result?.fraud_result.transactions).toHaveLength(2);
      expect(result?.bankmatch_result).not.toBeNull();
      expect(result?.bankmatch_result?.session_id).toBe('session-123');
    });

    it('should validate IngestionStatsDTO contract with API spec', () => {
      const apiResponse = {
        total_files: 100,
        successful: 85,
        failed: 10,
        pending: 5,
        total_transactions: 15000
      };

      let result: IngestionStatsDTO | undefined;
      service.getStats().subscribe(stats => (result = stats));

      const req = httpMock.expectOne('http://localhost:8005/banking/stats');
      req.flush(apiResponse);

      expect(result).toBeDefined();
      expect(result?.total_files).toBe(100);
      expect(result?.successful).toBe(85);
      expect(result?.failed).toBe(10);
      expect(result?.pending).toBe(5);
      expect(result?.total_transactions).toBe(15000);
    });

    it('should validate FileUploadDTO contract with API spec', () => {
      const apiResponse = [
        {
          id: 'upload-123',
          filename: 'transactions.csv',
          bank: 'bank-456',
          format: 'csv',
          status: 'completed' as const,
          transaction_count: 150,
          uploaded_at: '2026-08-18T10:30:00Z'
        },
        {
          id: 'upload-124',
          filename: 'invalid.csv',
          bank: 'bank-456',
          format: 'csv',
          status: 'failed' as const,
          transaction_count: 0,
          uploaded_at: '2026-08-18T11:00:00Z',
          error_message: 'Format de fichier invalide'
        }
      ];

      let result: FileUploadDTO[] | undefined;
      service.getRecentUploads().subscribe(uploads => (result = uploads));

      const req = httpMock.expectOne('http://localhost:8005/banking/uploads');
      req.flush(apiResponse);

      expect(result).toBeDefined();
      expect(result).toHaveLength(2);
      expect(result?.[0].status).toBe('completed');
      expect(result?.[1].status).toBe('failed');
      expect(result?.[1].error_message).toBe('Format de fichier invalide');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle 400 Bad Request with proper error structure', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });

      let caughtError: any;
      service.parseFile(mockFile, 'csv', 'tenant-123', 'bank-456').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne('http://localhost:8005/banking/api/multi-banking/parse');
      req.flush({
        success: false,
        error: 'Format de fichier non supporté'
      }, { status: 400, statusText: 'Bad Request' });

      expect(caughtError).toBeTruthy();
    });

    it('should handle 401 Unauthorized with proper error structure', () => {
      localStorage.setItem('auth_token', 'invalid-token');

      let caughtError: any;
      service.getStats().subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne('http://localhost:8005/banking/stats');
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(caughtError).toBeTruthy();
      localStorage.removeItem('auth_token');
    });

    it('should handle 413 Payload Too Large for file uploads', () => {
      const mockFile = new File(['test'], 'large.csv', { type: 'text/csv' });

      let caughtError: any;
      service.parseFile(mockFile, 'csv', 'tenant-123', 'bank-456').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne('http://localhost:8005/banking/api/multi-banking/parse');
      req.flush('File too large', { status: 413, statusText: 'Payload Too Large' });

      expect(caughtError).toBeTruthy();
    });

    it('should handle 502 Bad Gateway for BankMatch integration', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });

      let caughtError: any;
      service.ingestFile(mockFile, 'csv', 'tenant-123', 'bank-456').subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne('http://localhost:8005/banking/api/multi-banking/ingest');
      req.flush('BankMatch service unavailable', { status: 502, statusText: 'Bad Gateway' });

      expect(caughtError).toBeTruthy();
    });
  });

  describe('Data Flow Integration', () => {
    it('should handle complete file ingestion workflow', () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });

      // Step 1: Parse
      service.parseFile(mockFile, 'csv', 'tenant-123', 'bank-456').subscribe();
      let parseReq = httpMock.expectOne('http://localhost:8005/banking/api/multi-banking/parse');
      parseReq.flush({
        success: true,
        count: 150,
        data: [],
        metadata: {
          filename: 'test.csv',
          format: 'csv' as BankFileFormat,
          tenant_id: 'tenant-123',
          bank_id: 'bank-456',
          authenticated_tenant: 'tenant-123',
          authenticated_user: 'user@example.com'
        }
      });

      // Step 2: Ingest
      service.ingestFile(mockFile, 'csv', 'tenant-123', 'bank-456').subscribe();
      let ingestReq = httpMock.expectOne('http://localhost:8005/banking/api/multi-banking/ingest');
      ingestReq.flush({
        success: true,
        parsed_count: 150,
        fraud_result: { transactions: [] },
        bankmatch_result: null,
        metadata: {
          filename: 'test.csv',
          format: 'csv' as BankFileFormat,
          tenant_id: 'tenant-123',
          bank_id: 'bank-456',
          bankmatch_integration_enabled: false
        }
      });

      // Step 3: Check stats
      service.getStats().subscribe();
      let statsReq = httpMock.expectOne('http://localhost:8005/banking/stats');
      statsReq.flush({
        total_files: 101,
        successful: 86,
        failed: 10,
        pending: 5,
        total_transactions: 15150
      });
    });

    it('should maintain data consistency across service calls', () => {
      const stats1 = { total_files: 100, successful: 85, failed: 10, pending: 5, total_transactions: 15000 };
      const stats2 = { total_files: 101, successful: 86, failed: 10, pending: 5, total_transactions: 15150 };

      let results: IngestionStatsDTO[] = [];

      service.getStats().subscribe(stats => results.push(stats));
      let req1 = httpMock.expectOne('http://localhost:8005/banking/stats');
      req1.flush(stats1);

      service.getStats().subscribe(stats => results.push(stats));
      let req2 = httpMock.expectOne('http://localhost:8005/banking/stats');
      req2.flush(stats2);

      expect(results).toHaveLength(2);
      expect(results[0].total_files).toBe(100);
      expect(results[1].total_files).toBe(101);
    });
  });
});
