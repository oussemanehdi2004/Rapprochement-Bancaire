import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { FraudAlertsService } from './fraud-alerts.service';
import {
  TransactionOutputDTO,
  AnalyzeResponseDTO,
  ExplainabilityDTO,
  ThresholdsDTO
} from '../models';

describe('FraudAlertsService - Comprehensive Integration Suite', () => {
  let service: FraudAlertsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FraudAlertsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FraudAlertsService);
    httpMock = TestBed.inject(HttpTestingController);

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
  });

  afterEach(() => httpMock.verify());

  function makeOutput(overrides: Partial<TransactionOutputDTO> = {}): TransactionOutputDTO {
    return {
      transaction_reference: 'ref_001', id: 'TX-1', date: '2026-07-16',
      description: 'ACHAT', amount: 100, isFraud: false, fraudProbability: 0,
      reconciliationStatus: 'MATCHED', explainability: { summary: 'OK', factors: [] },
      ...overrides,
    };
  }

  // ==========================================================================
  // SECTION 1: SERVICE INITIALIZATION
  // ==========================================================================

  describe('Service Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should have empty alerts initially', () => {
      expect(service.alerts()).toEqual([]);
    });

    it('should have null stats initially', () => {
      expect(service.stats()).toBeNull();
    });

    it('should have loading false initially', () => {
      expect(service.loading()).toBe(false);
    });
  });

  // ==========================================================================
  // SECTION 2: ANALYZE TRANSACTIONS - NORMAL FLOWS
  // ==========================================================================

  describe('Analyze Transactions - Normal Flows', () => {
    it('should POST to /api/analyze-demo', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 100 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual([{ id: 'TX-1', amount: 100 }]);
      req.flush({ data: [makeOutput()] });
    });

    it('should set loading true during request', () => {
      service.analyzeTransactions([]).subscribe();
      expect(service.loading()).toBe(true);
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [] });
      expect(service.loading()).toBe(false);
    });

    it('should map single transaction result to alerts', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 100 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [makeOutput({ id: 'TX-1', amount: 250, isFraud: true, fraudProbability: 0.92 })] });

      const alerts = service.alerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].id).toBe('TX-1');
      expect(alerts[0].amount).toBe(250);
    });

    it('should map multiple results to alerts', () => {
      service.analyzeTransactions([{ id: 'a' }, { id: 'b' }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({
        data: [
          makeOutput({ id: 'a', isFraud: true, fraudProbability: 0.95 }),
          makeOutput({ id: 'b', isFraud: false, fraudProbability: 0.02 }),
        ]
      });

      expect(service.alerts().length).toBe(2);
    });

    it('should prepend new alerts to existing ones', () => {
      service.analyzeTransactions([{ id: 'TX-1' }]).subscribe();
      const req1 = httpMock.expectOne('/api/analyze-demo');
      req1.flush({ data: [makeOutput({ id: 'TX-1' })] });

      service.analyzeTransactions([{ id: 'TX-2' }]).subscribe();
      const req2 = httpMock.expectOne('/api/analyze-demo');
      req2.flush({ data: [makeOutput({ id: 'TX-2' })] });

      const alerts = service.alerts();
      expect(alerts.length).toBe(2);
      expect(alerts[0].id).toBe('TX-2'); // New alerts first
      expect(alerts[1].id).toBe('TX-1');
    });

    it('should handle empty response data', () => {
      service.analyzeTransactions([]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [] });

      expect(service.alerts()).toEqual([]);
    });
  });

  // ==========================================================================
  // SECTION 3: SEVERITY MAPPING
  // ==========================================================================

  describe('Severity Mapping', () => {
    it.each([
      [0.95, 'critical'],
      [0.90, 'critical'],
      [0.75, 'high'],
      [0.70, 'high'],
      [0.50, 'medium'],
      [0.40, 'low'],
      [0.10, 'low'],
      [0.01, 'low'],
    ] as const)('should map fraudProbability %.2f to severity %s', (probability, expected) => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [makeOutput({ fraudProbability: probability })] });
      expect(service.alerts()[0].severity).toBe(expected);
    });
  });

  // ==========================================================================
  // SECTION 4: CONFIDENCE MAPPING
  // ==========================================================================

  describe('Confidence Mapping', () => {
    it.each([
      [92, 'HIGH'],
      [85, 'HIGH'],
      [84, 'MEDIUM'],
      [70, 'MEDIUM'],
      [69, 'LOW'],
      [0, 'LOW'],
    ] as const)('should map score %d to confidence %s', (score, expected) => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [makeOutput({ score })] });
      expect(service.alerts()[0].confidence).toBe(expected);
    });
  });

  // ==========================================================================
  // SECTION 5: CATEGORY INFERENCE
  // ==========================================================================

  describe('Category Inference', () => {
    it('should use ruleCategory when not NON_CATEGORISE', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [makeOutput({ ruleCategory: 'SEUIL_REGLEMENTAIRE' })] });
      expect(service.alerts()[0].category).toBe('SEUIL_REGLEMENTAIRE');
    });

    it('should infer montant_exceptionnel from factors', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({
        data: [makeOutput({
          ruleCategory: 'NON_CATEGORISE',
          explainability: { summary: '', factors: ['Montant inhabituel (x9 supérieur à la moyenne)'] }
        })]
      });
      expect(service.alerts()[0].category).toBe('montant_exceptionnel');
    });

    it('should default to NON_CATEGORISE when no inference possible', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [makeOutput({ ruleCategory: 'NON_CATEGORISE' })] });
      expect(service.alerts()[0].category).toBe('NON_CATEGORISE');
    });
  });

  // ==========================================================================
  // SECTION 6: DASHBOARD STATS COMPUTATION
  // ==========================================================================

  describe('Dashboard Stats Computation', () => {
    it('should compute totalAlerts correctly', () => {
      service.analyzeTransactions([{ id: 'a' }, { id: 'b' }, { id: 'c' }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({
        data: [
          makeOutput({ id: 'a', isFraud: true, fraudProbability: 0.95 }),
          makeOutput({ id: 'b', isFraud: false, fraudProbability: 0.02 }),
          makeOutput({ id: 'c', isFraud: true, fraudProbability: 0.75 }),
        ]
      });
      expect(service.stats()?.totalAlerts).toBe(3);
    });

    it('should count critical alerts (score >= 85)', () => {
      service.analyzeTransactions([{ id: 'a' }, { id: 'b' }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({
        data: [
          makeOutput({ id: 'a', isFraud: true, fraudProbability: 0.95 }),
          makeOutput({ id: 'b', isFraud: false, fraudProbability: 0.02 }),
        ]
      });
      expect(service.stats()?.critical).toBe(1);
    });

    it('should count high alerts (score 70-84)', () => {
      service.analyzeTransactions([{ id: 'a' }, { id: 'b' }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({
        data: [
          makeOutput({ id: 'a', isFraud: true, fraudProbability: 0.75 }),
          makeOutput({ id: 'b', isFraud: false, fraudProbability: 0.02 }),
        ]
      });
      expect(service.stats()?.high).toBe(1);
    });

    it('should compute totalAmountAtRisk for fraud transactions only', () => {
      service.analyzeTransactions([{ id: 'a' }, { id: 'b' }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({
        data: [
          makeOutput({ id: 'a', amount: 5000, isFraud: true, fraudProbability: 0.95 }),
          makeOutput({ id: 'b', amount: 100, isFraud: false, fraudProbability: 0.02 }),
        ]
      });
      expect(service.stats()?.totalAmountAtRisk).toBe(5000);
    });

    it('should compute underInvestigation as isFraud count', () => {
      service.analyzeTransactions([{ id: 'a' }, { id: 'b' }, { id: 'c' }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({
        data: [
          makeOutput({ id: 'a', isFraud: true, fraudProbability: 0.95 }),
          makeOutput({ id: 'b', isFraud: false, fraudProbability: 0.02 }),
          makeOutput({ id: 'c', isFraud: true, fraudProbability: 0.75 }),
        ]
      });
      expect(service.stats()?.underInvestigation).toBe(2);
    });
  });

  // ==========================================================================
  // SECTION 7: GET TRANSACTIONS (LIST ENDPOINT)
  // ==========================================================================

  describe('Get Transactions', () => {
    it('should GET from /api/transactions', () => {
      service.getTransactions().subscribe();
      const req = httpMock.expectOne('/api/transactions');
      expect(req.request.method).toBe('GET');
      req.flush({ data: [] });
    });

    it('should include status filter in params', () => {
      service.getTransactions({ status: 'SUSPICIOUS' }).subscribe();
      const req = httpMock.expectOne(r => r.url === '/api/transactions');
      expect(req.request.params.get('status')).toBe('SUSPICIOUS');
      req.flush({ data: [] });
    });

    it('should include search filter in params', () => {
      service.getTransactions({ search: 'TX-001' }).subscribe();
      const req = httpMock.expectOne(r => r.url === '/api/transactions');
      expect(req.request.params.get('search')).toBe('TX-001');
      req.flush({ data: [] });
    });

    it('should include limit and offset', () => {
      service.getTransactions({ limit: 25, offset: 50 }).subscribe();
      const req = httpMock.expectOne(r => r.url === '/api/transactions');
      expect(req.request.params.get('limit')).toBe('25');
      expect(req.request.params.get('offset')).toBe('50');
      req.flush({ data: [] });
    });

    it('should replace alerts with fetched data', () => {
      service.getTransactions().subscribe();
      const req = httpMock.expectOne('/api/transactions');
      req.flush({ data: [makeOutput({ id: 'TX-FETCHED' })] });

      const alerts = service.alerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].id).toBe('TX-FETCHED');
    });
  });

  // ==========================================================================
  // SECTION 8: CLEAR ALERTS
  // ==========================================================================

  describe('Clear Alerts', () => {
    it('should reset alerts to empty', () => {
      service.analyzeTransactions([{ id: 'TX-1' }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [makeOutput({ id: 'TX-1' })] });

      service.clearAlerts();
      expect(service.alerts()).toEqual([]);
    });

    it('should reset stats to zeros', () => {
      service.clearAlerts();
      expect(service.stats()?.totalAlerts).toBe(0);
      expect(service.stats()?.critical).toBe(0);
      expect(service.stats()?.totalAmountAtRisk).toBe(0);
    });
  });

  // ==========================================================================
  // SECTION 9: ERROR HANDLING
  // ==========================================================================

  describe('Error Handling', () => {
    it('should reset loading on error', () => {
      let caught: unknown = null;
      service.analyzeTransactions([{ id: 'TX-1' }]).subscribe({
        error: (err) => (caught = err),
      });

      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(service.loading()).toBe(false);
      expect(caught).not.toBeNull();
    });

    it('should handle 400 Bad Request', () => {
      let caught: any;
      service.analyzeTransactions([{} as any]).subscribe({
        error: (err) => (caught = err)
      });

      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ success: false, error: 'Invalid data' }, { status: 400, statusText: 'Bad Request' });
      expect(caught).toBeTruthy();
    });

    it('should handle 429 Rate Limiting', () => {
      let caught: any;
      service.analyzeTransactions([]).subscribe({
        error: (err) => (caught = err)
      });

      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ success: false, error: 'Too Many Requests' }, { status: 429, statusText: 'Too Many Requests' });
      expect(caught).toBeTruthy();
    });

    it('should handle network error (status 0)', () => {
      let caught: any;
      service.analyzeTransactions([]).subscribe({
        error: (err) => (caught = err)
      });

      const req = httpMock.expectOne('/api/analyze-demo');
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
      expect(caught).toBeTruthy();
    });

    it('should handle 401 Unauthorized on getTransactions', () => {
      let caught: any;
      service.getTransactions().subscribe({
        error: (err) => (caught = err)
      });

      const req = httpMock.expectOne('/api/transactions');
      req.flush({ success: false }, { status: 401, statusText: 'Unauthorized' });
      expect(caught).toBeTruthy();
    });
  });

  // ==========================================================================
  // SECTION 10: SHAP CONTRIBUTIONS MAPPING
  // ==========================================================================

  describe('SHAP Contributions Mapping', () => {
    it('should preserve shap_contributions from API response', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({
        data: [makeOutput({
          explainability: {
            summary: 'Test',
            factors: ['factor1'],
            shap_contributions: [
              { feature: 'amount', value: 0.23, direction: 'positive' },
              { feature: 'hour_of_day', value: -0.15, direction: 'negative' },
            ]
          }
        })]
      });

      const alert = service.alerts()[0];
      expect(alert.explainability.shap_contributions).toHaveLength(2);
      expect(alert.explainability.shap_contributions[0].feature).toBe('amount');
    });

    it('should default shap_contributions to empty array', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({
        data: [makeOutput({
          explainability: { summary: 'Test', factors: [] }
        })]
      });

      expect(service.alerts()[0].explainability.shap_contributions).toEqual([]);
    });
  });

  // ==========================================================================
  // SECTION 11: FRAUD SCORE DERIVATION
  // ==========================================================================

  describe('Fraud Score Derivation', () => {
    it('should use score from API when provided', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [makeOutput({ score: 85 })] });
      expect(service.alerts()[0].fraudScore).toBe(85);
    });

    it('should compute fraudScore from fraudProbability when score not provided', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [makeOutput({ fraudProbability: 0.73 })] });
      expect(service.alerts()[0].fraudScore).toBe(73);
    });

    it('should default fraudScore to 0 when neither score nor probability', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [makeOutput({ score: undefined as any, fraudProbability: 0 })] });
      expect(service.alerts()[0].fraudScore).toBe(0);
    });
  });

  // ==========================================================================
  // SECTION 12: STATUS DERIVATION
  // ==========================================================================

  describe('Status Derivation', () => {
    it('should mark fraud transactions as "new"', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [makeOutput({ isFraud: true })] });
      expect(service.alerts()[0].status).toBe('new');
    });

    it('should mark non-fraud transactions as "dismissed"', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [makeOutput({ isFraud: false })] });
      expect(service.alerts()[0].status).toBe('dismissed');
    });
  });

  // ==========================================================================
  // SECTION 13: EDGE CASES
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle transaction with minimal fields', () => {
      service.analyzeTransactions([{ id: 'X' }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [makeOutput({ id: 'X', amount: 0, fraudProbability: 0 })] });
      expect(service.alerts().length).toBe(1);
    });

    it('should handle very large amounts', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: [makeOutput({ amount: 999999999.99, isFraud: true, fraudProbability: 1.0 })] });
      expect(service.alerts()[0].amount).toBe(999999999.99);
      expect(service.stats()?.totalAmountAtRisk).toBe(999999999.99);
    });

    it('should handle concurrent analyze calls', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req1 = httpMock.expectOne('/api/analyze-demo');
      req1.flush({ data: [makeOutput({ id: 'TX-1' })] });

      service.analyzeTransactions([{ id: 'TX-2', amount: 20 }]).subscribe();
      const req2 = httpMock.expectOne('/api/analyze-demo');
      req2.flush({ data: [makeOutput({ id: 'TX-2' })] });

      expect(service.alerts().length).toBe(2);
    });

    it('should handle response with null data gracefully', () => {
      service.analyzeTransactions([{ id: 'TX-1', amount: 10 }]).subscribe();
      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: null });
      expect(service.alerts()).toEqual([]);
    });
  });
});
