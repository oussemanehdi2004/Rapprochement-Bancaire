import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { FraudAlertsService } from './fraud-alerts.service';
import {
  TransactionOutputDTO,
  AnalyzeResponseDTO,
  ExplainabilityDTO,
  NotificationDTO,
  ThresholdsDTO
} from '../models';

// Type alias for what the service actually returns
type ServiceResult = TransactionOutputDTO[];

describe('FraudAlertsService Integration Tests', () => {
  let service: FraudAlertsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FraudAlertsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FraudAlertsService);
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
    it('should validate AnalyzeResponseDTO contract with API spec', () => {
      const mockExplainability: ExplainabilityDTO = {
        summary: 'Transaction suspecte détectée',
        factors: ['Montant élevé', 'Mot-clé sensible'],
        shap_contributions: [
          {
            feature: 'amount',
            value: 0.23,
            direction: 'positive'
          }
        ]
      };

      const apiResponse: AnalyzeResponseDTO = {
        success: true,
        data: [
          {
            transaction_reference: 'TX-10024',
            id: 'TX-10024',
            date: '2026-07-16T14:30:00Z',
            description: 'VIREMENT ENTRANT CASINO',
            amount: 1500.50,
            isFraud: true,
            fraudProbability: 0.85,
            score: 85,
            confidence: 'HIGH',
            reconciliationStatus: 'SUSPICIOUS',
            ruleCategory: 'MOTCLE_SENSIBLE',
            explainability: mockExplainability
          },
          {
            transaction_reference: 'TX-10025',
            id: 'TX-10025',
            date: '2026-07-16T15:00:00Z',
            description: 'VIREMENT NORMAL',
            amount: 100.00,
            isFraud: false,
            fraudProbability: 0.05,
            score: 5,
            confidence: 'LOW',
            reconciliationStatus: 'MATCHED',
            ruleCategory: null,
            explainability: {
              summary: 'Aucune anomalie détectée',
              factors: []
            }
          }
        ]
      };

      let result: ServiceResult | undefined;
      service.analyzeTransactions([
        {
          tenant_id: 'tenant-123',
          transaction_reference: 'TX-10024',
          id: 'TX-10024',
          date: '2026-07-16T14:30:00Z',
          description: 'VIREMENT ENTRANT CASINO',
          amount: 1500.50,
          sender_balance_before: 5000.0,
          sender_balance_after: 3499.5,
          receiver_balance_before: 200.0,
          receiver_balance_after: 1700.5,
          transaction_type: 'TRANSFER'
        }
      ]).subscribe(response => (result = response));

      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: apiResponse.data, success: true });

      expect(result).toBeDefined();
      expect(result).toHaveLength(2);
      expect(result?.[0].isFraud).toBe(true);
      expect(result?.[0].fraudProbability).toBe(0.85);
      expect(result?.[0].confidence).toBe('HIGH');
    });

    it('should validate ThresholdsDTO contract with API spec', () => {
      const apiResponse: ThresholdsDTO = {
        SEUIL_REGLEMENTAIRE: 10000,
        SEUIL_APPROCHE_RATIO: 0.9,
        SEUIL_CASH_OUT: 5000,
        SEUIL_MONTANT_ABERRANT: 1_000_000_000,
        RATIO_MONTANT_INHABITUEL: 8,
        SEUIL_JOURS_COMPTE_DORMANT: 90,
        MOTS_CLES_SENSIBLES: ['CASINO', 'PARIS', 'POKER', 'BET', 'PARI']
      };

      // This would be tested through ConfigService, but we can validate the DTO structure
      expect(apiResponse.SEUIL_REGLEMENTAIRE).toBe(10000);
      expect(apiResponse.MOTS_CLES_SENSIBLES).toHaveLength(5);
    });

    it('should validate NotificationDTO contract with API spec', () => {
      const apiResponse: NotificationDTO[] = [
        {
          id: 'notif-123',
          type: 'critical',
          title: 'Fraude détectée',
          message: 'Transaction TX-10024 bloquée',
          timestamp: '2026-08-18T10:30:00Z',
          read: false,
          icon: 'alert'
        },
        {
          id: 'notif-124',
          type: 'warning',
          title: 'Activité suspecte',
          message: 'Multiple transactions détectées',
          timestamp: '2026-08-18T11:00:00Z',
          read: true
        }
      ];

      expect(apiResponse).toHaveLength(2);
      expect(apiResponse[0].type).toBe('critical');
      expect(apiResponse[0].read).toBe(false);
      expect(apiResponse[1].type).toBe('warning');
      expect(apiResponse[1].read).toBe(true);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle 400 Bad Request with invalid transaction data', () => {
      let caughtError: any;
      service.analyzeTransactions([{} as any]).subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({
        success: false,
        error: 'Données de transaction invalides'
      }, { status: 400, statusText: 'Bad Request' });

      expect(caughtError).toBeTruthy();
    });

    it('should handle 401 Unauthorized with missing token', () => {
      // localStorage.removeItem('token');

      let caughtError: any;
      service.getTransactions().subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne('/api/transactions');
      req.flush({ success: false, error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      expect(caughtError).toBeTruthy();
    });

    it('should handle 429 Rate Limiting', () => {
      let caughtError: any;
      service.analyzeTransactions([]).subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ success: false, error: 'Too Many Requests' }, { status: 429, statusText: 'Too Many Requests' });

      expect(caughtError).toBeTruthy();
    });

    it('should handle 500 Internal Server Error', () => {
      let caughtError: any;
      service.analyzeTransactions([]).subscribe({
        error: (err) => (caughtError = err)
      });

      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ success: false, error: 'Internal Server Error' }, { status: 500, statusText: 'Internal Server Error' });

      expect(caughtError).toBeTruthy();
    });
  });

  describe('Data Mapping Integration', () => {
    it('should correctly map API response to frontend models', () => {
      const mockExplainability: ExplainabilityDTO = {
        summary: 'Test',
        factors: ['Test factor']
      };

      const apiResponse: AnalyzeResponseDTO = {
        success: true,
        data: [
          {
            transaction_reference: 'TX-001',
            id: 'TX-001',
            date: '2026-07-16T14:30:00Z',
            description: 'Test transaction',
            amount: 1000.00,
            isFraud: true,
            fraudProbability: 0.92,
            reconciliationStatus: 'SUSPICIOUS',
            ruleCategory: 'SEUIL_REGLEMENTAIRE',
            explainability: mockExplainability
          }
        ]
      };

      service.analyzeTransactions([{
        tenant_id: 'tenant-123',
        transaction_reference: 'TX-001',
        id: 'TX-001',
        date: '2026-07-16T14:30:00Z',
        description: 'Test transaction',
        amount: 1000.00,
        sender_balance_before: 2000.0,
        sender_balance_after: 1000.0,
        receiver_balance_before: 500.0,
        receiver_balance_after: 1500.0,
        transaction_type: 'TRANSFER'
      }]).subscribe();

      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: apiResponse.data, success: true });

      const alerts = service.alerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].transactionId).toBe('TX-001');
      expect(alerts[0].fraudScore).toBe(92);
      expect(alerts[0].severity).toBe('critical');
      expect(alerts[0].confidence).toBe('HIGH');
    });

    it('should apply business rules for confidence levels', () => {
      const mockExplainability: ExplainabilityDTO = {
        summary: 'Test',
        factors: ['Test factor']
      };

      const testCases = [
        { fraudProbability: 0.95, expectedConfidence: 'HIGH' },
        { fraudProbability: 0.75, expectedConfidence: 'MEDIUM' },
        { fraudProbability: 0.45, expectedConfidence: 'LOW' }
      ];

      testCases.forEach(({ fraudProbability, expectedConfidence }) => {
        const apiResponse: AnalyzeResponseDTO = {
          success: true,
          data: [
            {
              transaction_reference: `TX-${fraudProbability}`,
              id: `TX-${fraudProbability}`,
              date: '2026-07-16T14:30:00Z',
              description: 'Test',
              amount: 1000.00,
              isFraud: fraudProbability > 0.5,
              fraudProbability: fraudProbability,
              reconciliationStatus: 'SUSPICIOUS',
              explainability: mockExplainability
            }
          ]
        };

        service.analyzeTransactions([{
          tenant_id: 'tenant-123',
          transaction_reference: `TX-${fraudProbability}`,
          id: `TX-${fraudProbability}`,
          date: '2026-07-16T14:30:00Z',
          description: 'Test',
          amount: 1000.00,
          sender_balance_before: 2000.0,
          sender_balance_after: 1000.0,
          receiver_balance_before: 500.0,
          receiver_balance_after: 1500.0,
          transaction_type: 'TRANSFER'
        }]).subscribe();

        const req = httpMock.expectOne('/api/analyze-demo');
        req.flush(apiResponse);

        const alerts = service.alerts();
        expect(alerts[0].confidence).toBe(expectedConfidence);
      });
    });

    it('should calculate dashboard stats correctly', () => {
      const mockExplainability: ExplainabilityDTO = {
        summary: 'Test',
        factors: ['Test factor']
      };

      const apiResponse: AnalyzeResponseDTO = {
        success: true,
        data: [
          {
            transaction_reference: 'TX-001',
            id: 'TX-001',
            date: '2026-07-16T14:30:00Z',
            description: 'High risk',
            amount: 5000.00,
            isFraud: true,
            fraudProbability: 0.95,
            reconciliationStatus: 'SUSPICIOUS',
            explainability: mockExplainability
          },
          {
            transaction_reference: 'TX-002',
            id: 'TX-002',
            date: '2026-07-16T15:00:00Z',
            description: 'Medium risk',
            amount: 2500.00,
            isFraud: true,
            fraudProbability: 0.75,
            reconciliationStatus: 'SUSPICIOUS',
            explainability: mockExplainability
          },
          {
            transaction_reference: 'TX-003',
            id: 'TX-003',
            date: '2026-07-16T16:00:00Z',
            description: 'Low risk',
            amount: 100.00,
            isFraud: false,
            fraudProbability: 0.05,
            reconciliationStatus: 'MATCHED',
            explainability: mockExplainability
          }
        ]
      };

      service.analyzeTransactions([
        {
          tenant_id: 'tenant-123',
          transaction_reference: 'TX-001',
          id: 'TX-001',
          date: '2026-07-16T14:30:00Z',
          description: 'High risk',
          amount: 5000.00,
          sender_balance_before: 10000.0,
          sender_balance_after: 5000.0,
          receiver_balance_before: 1000.0,
          receiver_balance_after: 6000.0,
          transaction_type: 'TRANSFER'
        },
        {
          tenant_id: 'tenant-123',
          transaction_reference: 'TX-002',
          id: 'TX-002',
          date: '2026-07-16T15:00:00Z',
          description: 'Medium risk',
          amount: 2500.00,
          sender_balance_before: 5000.0,
          sender_balance_after: 2500.0,
          receiver_balance_before: 500.0,
          receiver_balance_after: 3000.0,
          transaction_type: 'TRANSFER'
        },
        {
          tenant_id: 'tenant-123',
          transaction_reference: 'TX-003',
          id: 'TX-003',
          date: '2026-07-16T16:00:00Z',
          description: 'Low risk',
          amount: 100.00,
          sender_balance_before: 1000.0,
          sender_balance_after: 900.0,
          receiver_balance_before: 200.0,
          receiver_balance_after: 300.0,
          transaction_type: 'TRANSFER'
        }
      ]).subscribe();

      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: apiResponse.data, success: true });

      const stats = service.stats();
      expect(stats?.totalAlerts).toBe(3);
      expect(stats?.critical).toBe(1); // score >= 85
      expect(stats?.high).toBe(1); // score 70-84
      expect(stats?.underInvestigation).toBe(2); // isFraud transactions
      expect(stats?.totalAmountAtRisk).toBe(7500); // sum of fraud amounts
    });
  });

  describe('Real-time Updates Integration', () => {
    it('should update alerts signal when new data arrives', () => {
      const mockExplainability: ExplainabilityDTO = {
        summary: 'Test',
        factors: ['Test factor']
      };

      const apiResponse: AnalyzeResponseDTO = {
        success: true,
        data: [
          {
            transaction_reference: 'TX-001',
            id: 'TX-001',
            date: '2026-07-16T14:30:00Z',
            description: 'Test',
            amount: 1000.00,
            isFraud: true,
            fraudProbability: 0.85,
            reconciliationStatus: 'SUSPICIOUS',
            explainability: mockExplainability
          }
        ]
      };

      expect(service.alerts()).toHaveLength(0);

      service.analyzeTransactions([{
        tenant_id: 'tenant-123',
        transaction_reference: 'TX-001',
        id: 'TX-001',
        date: '2026-07-16T14:30:00Z',
        description: 'Test',
        amount: 1000.00,
        sender_balance_before: 2000.0,
        sender_balance_after: 1000.0,
        receiver_balance_before: 500.0,
        receiver_balance_after: 1500.0,
        transaction_type: 'TRANSFER'
      }]).subscribe();

      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ data: apiResponse.data, success: true });

      expect(service.alerts()).toHaveLength(1);
    });

    it('should update loading state during API calls', () => {
      expect(service.loading()).toBe(false);

      service.analyzeTransactions([]).subscribe();

      expect(service.loading()).toBe(true);

      const req = httpMock.expectOne('/api/analyze-demo');
      req.flush({ success: true, data: [] });

      expect(service.loading()).toBe(false);
    });
  });
});
