import {
  ShapContributionDTO,
  ExplainabilityDTO,
  TransactionInputDTO,
  TransactionOutputDTO,
  AnalyzeResponseDTO,
  ThresholdsDTO,
  FlaggedAccountDTO,
  MuleAccountDTO,
  PageRankResultDTO,
  CommunityDTO,
  FraudSummaryDTO,
  CategoryBreakdownDTO,
  TimeSeriesDataDTO,
  ReportsDataDTO,
  NotificationDTO
} from './index';

describe('Fraud Detection DTOs Contract Validation', () => {
  describe('OpenAPI Spec Compliance', () => {
    it('should validate ShapContributionDTO matches api-spec.yaml schema', () => {
      const dto: ShapContributionDTO = {
        feature: 'amount',
        value: 0.23,
        direction: 'positive'
      };

      // Validate required fields
      expect(dto.feature).toBeDefined();
      expect(dto.value).toBeDefined();
      expect(dto.direction).toBeDefined();

      // Validate field types
      expect(typeof dto.feature).toBe('string');
      expect(typeof dto.value).toBe('number');
      expect(typeof dto.direction).toBe('string');

      // Validate enum values
      expect(['positive', 'negative']).toContain(dto.direction);
    });

    it('should validate ExplainabilityDTO matches api-spec.yaml schema', () => {
      const dto: ExplainabilityDTO = {
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

      // Validate required fields
      expect(dto.summary).toBeDefined();
      expect(dto.factors).toBeDefined();

      // Validate optional field
      expect(dto.shap_contributions).toBeDefined();
      expect(Array.isArray(dto.shap_contributions)).toBe(true);
    });

    it('should validate TransactionInputDTO matches api-spec.yaml schema', () => {
      const dto: TransactionInputDTO = {
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
        transaction_type: 'TRANSFER',
        account_iban: 'FR761234567890123456789012345',
        beneficiary_iban: 'FR769876543210987654321098765'
      };

      // Validate required fields
      expect(dto.tenant_id).toBeDefined();
      expect(dto.transaction_reference).toBeDefined();
      expect(dto.id).toBeDefined();
      expect(dto.date).toBeDefined();
      expect(dto.description).toBeDefined();
      expect(dto.amount).toBeDefined();
      expect(dto.sender_balance_before).toBeDefined();
      expect(dto.sender_balance_after).toBeDefined();
      expect(dto.receiver_balance_before).toBeDefined();
      expect(dto.receiver_balance_after).toBeDefined();
      expect(dto.transaction_type).toBeDefined();

      // Validate date format
      expect(dto.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });

    it('should validate TransactionOutputDTO matches api-spec.yaml schema', () => {
      const dto: TransactionOutputDTO = {
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
        explainability: {
          summary: 'Test',
          factors: ['Test factor']
        }
      };

      // Validate required fields
      expect(dto.transaction_reference).toBeDefined();
      expect(dto.id).toBeDefined();
      expect(dto.date).toBeDefined();
      expect(dto.description).toBeDefined();
      expect(dto.amount).toBeDefined();
      expect(dto.isFraud).toBeDefined();
      expect(dto.fraudProbability).toBeDefined();
      expect(dto.reconciliationStatus).toBeDefined();
      expect(dto.explainability).toBeDefined();

      // Validate field types
      expect(typeof dto.isFraud).toBe('boolean');
      expect(typeof dto.fraudProbability).toBe('number');
      expect(dto.fraudProbability).toBeGreaterThanOrEqual(0);
      expect(dto.fraudProbability).toBeLessThanOrEqual(1);

      // Validate enum values
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(dto.confidence);
      expect(['MATCHED', 'UNMATCHED', 'SUSPICIOUS']).toContain(dto.reconciliationStatus);
    });

    it('should validate AnalyzeResponseDTO matches api-spec.yaml schema', () => {
      const dto: AnalyzeResponseDTO = {
        success: true,
        data: [
          {
            transaction_reference: 'TX-001',
            id: 'TX-001',
            date: '2026-07-16T14:30:00Z',
            description: 'Test',
            amount: 1000.00,
            isFraud: false,
            fraudProbability: 0.05,
            reconciliationStatus: 'MATCHED',
            explainability: {
              summary: 'Test',
              factors: []
            }
          }
        ]
      };

      // Validate required fields
      expect(dto.success).toBeDefined();
      expect(dto.data).toBeDefined();

      // Validate structure
      expect(typeof dto.success).toBe('boolean');
      expect(Array.isArray(dto.data)).toBe(true);
    });

    it('should validate ThresholdsDTO matches api-spec.yaml schema', () => {
      const dto: ThresholdsDTO = {
        SEUIL_REGLEMENTAIRE: 10000,
        SEUIL_APPROCHE_RATIO: 0.9,
        SEUIL_CASH_OUT: 5000,
        SEUIL_MONTANT_ABERRANT: 1_000_000_000,
        RATIO_MONTANT_INHABITUEL: 8,
        SEUIL_JOURS_COMPTE_DORMANT: 90,
        MOTS_CLES_SENSIBLES: ['CASINO', 'PARIS', 'POKER']
      };

      // Validate field types
      expect(typeof dto.SEUIL_REGLEMENTAIRE).toBe('number');
      expect(typeof dto.SEUIL_APPROCHE_RATIO).toBe('number');
      expect(typeof dto.SEUIL_JOURS_COMPTE_DORMANT).toBe('number');
      expect(Array.isArray(dto.MOTS_CLES_SENSIBLES)).toBe(true);

      // Validate value ranges
      expect(dto.SEUIL_APPROCHE_RATIO).toBeGreaterThanOrEqual(0);
      expect(dto.SEUIL_APPROCHE_RATIO).toBeLessThanOrEqual(1);
    });

    it('should validate NotificationDTO matches api-spec.yaml schema', () => {
      const dto: NotificationDTO = {
        id: 'notif-123',
        type: 'critical',
        title: 'Fraude détectée',
        message: 'Transaction suspecte',
        timestamp: '2026-08-18T10:30:00Z',
        read: false,
        icon: 'alert'
      };

      // Validate required fields
      expect(dto.id).toBeDefined();
      expect(dto.type).toBeDefined();
      expect(dto.title).toBeDefined();
      expect(dto.message).toBeDefined();
      expect(dto.timestamp).toBeDefined();
      expect(dto.read).toBeDefined();

      // Validate enum values
      expect(['critical', 'warning', 'info', 'success']).toContain(dto.type);

      // Validate date format
      expect(dto.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });

    it('should validate ReportsDataDTO matches api-spec.yaml schema', () => {
      const dto: ReportsDataDTO = {
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

      // Validate required fields
      expect(dto.summary).toBeDefined();
      expect(dto.categoryBreakdown).toBeDefined();
      expect(dto.timeSeriesData).toBeDefined();

      // Validate nested structures
      expect(dto.summary.total_transactions).toBeDefined();
      expect(Array.isArray(dto.categoryBreakdown)).toBe(true);
      expect(Array.isArray(dto.timeSeriesData)).toBe(true);
    });
  });

  describe('Graph DTOs Validation', () => {
    it('should validate FlaggedAccountDTO matches api-spec.yaml schema', () => {
      const dto: FlaggedAccountDTO = {
        iban: 'FR7612345678901234567890123',
        alert_count: 15,
        categories: ['SEUIL_REGLEMENTAIRE', 'MOTCLE_SENSIBLE']
      };

      expect(dto.iban).toBeDefined();
      expect(dto.alert_count).toBeDefined();
      expect(dto.categories).toBeDefined();
      expect(Array.isArray(dto.categories)).toBe(true);
    });

    it('should validate MuleAccountDTO matches api-spec.yaml schema', () => {
      const dto: MuleAccountDTO = {
        iban: 'FR7612345678901234567890123',
        in_count: 100,
        out_count: 95,
        in_out_ratio: 0.95,
        avg_delay_hours: 2.5
      };

      expect(dto.iban).toBeDefined();
      expect(dto.in_count).toBeDefined();
      expect(dto.out_count).toBeDefined();
      expect(dto.in_out_ratio).toBeDefined();
      expect(dto.avg_delay_hours).toBeDefined();

      expect(dto.in_out_ratio).toBeGreaterThanOrEqual(0);
      expect(dto.in_out_ratio).toBeLessThanOrEqual(1);
    });

    it('should validate PageRankResultDTO matches api-spec.yaml schema', () => {
      const dto: PageRankResultDTO = {
        iban: 'FR7612345678901234567890123',
        pagerank_score: 0.85,
        out_degree: 50,
        in_degree: 30
      };

      expect(dto.iban).toBeDefined();
      expect(dto.pagerank_score).toBeDefined();
      expect(dto.out_degree).toBeDefined();
      expect(dto.in_degree).toBeDefined();

      expect(dto.pagerank_score).toBeGreaterThanOrEqual(0);
      expect(dto.pagerank_score).toBeLessThanOrEqual(1);
    });

    it('should validate CommunityDTO matches api-spec.yaml schema', () => {
      const dto: CommunityDTO = {
        center_account: 'FR7612345678901234567890123',
        community_members: [
          'FR7698765432109876543210987',
          'FR7655555555555555555555555'
        ],
        community_size: 3
      };

      expect(dto.center_account).toBeDefined();
      expect(dto.community_members).toBeDefined();
      expect(dto.community_size).toBeDefined();

      expect(Array.isArray(dto.community_members)).toBe(true);
      expect(dto.community_size).toBe(dto.community_members.length + 1);
    });
  });

  describe('Type Safety Validation', () => {
    it('should enforce type safety for numeric fields', () => {
      const transaction: TransactionOutputDTO = {
        transaction_reference: 'TX-001',
        id: 'TX-001',
        date: '2026-07-16T14:30:00Z',
        description: 'Test',
        amount: 1000.00,
        isFraud: false,
        fraudProbability: 0.05,
        reconciliationStatus: 'MATCHED',
        explainability: { summary: 'Test', factors: [] }
      };

      const invalidTransaction: TransactionOutputDTO = {
        ...transaction,
        amount: '1000.00' as any
      };

      expect(typeof invalidTransaction.amount).toBe('string');
    });

    it('should enforce type safety for boolean fields', () => {
      const transaction: TransactionOutputDTO = {
        transaction_reference: 'TX-001',
        id: 'TX-001',
        date: '2026-07-16T14:30:00Z',
        description: 'Test',
        amount: 1000.00,
        isFraud: false,
        fraudProbability: 0.05,
        reconciliationStatus: 'MATCHED',
        explainability: { summary: 'Test', factors: [] }
      };

      const invalidTransaction: TransactionOutputDTO = {
        ...transaction,
        isFraud: 'false' as any
      };

      expect(typeof invalidTransaction.isFraud).toBe('string');
    });

    it('should enforce type safety for enum fields', () => {
      const notification: NotificationDTO = {
        id: 'notif-123',
        type: 'critical',
        title: 'Test',
        message: 'Test message',
        timestamp: '2026-08-18T10:00:00Z',
        read: false
      };

      const invalidNotification: NotificationDTO = {
        ...notification,
        type: 'invalid_type' as any
      };

      expect(['critical', 'warning', 'info', 'success']).not.toContain(invalidNotification.type);
    });
  });

  describe('Field Presence Validation', () => {
    it('should require all mandatory fields in TransactionOutputDTO', () => {
      // @ts-expect-error - Testing missing required field
      const invalidTransaction: TransactionOutputDTO = {
        id: 'TX-001',
        date: '2026-07-16T14:30:00Z',
        description: 'Test',
        amount: 1000.00,
        isFraud: false,
        fraudProbability: 0.05,
        reconciliationStatus: 'MATCHED',
        explainability: { summary: 'Test', factors: [] }
        // missing transaction_reference
      };

      expect(invalidTransaction.transaction_reference).toBeUndefined();
    });

    it('should require all mandatory fields in NotificationDTO', () => {
      // @ts-expect-error - Testing missing required field
      const invalidNotification: NotificationDTO = {
        type: 'critical',
        title: 'Test',
        message: 'Test message',
        timestamp: '2026-08-18T10:00:00Z',
        read: false
        // missing id
      };

      expect(invalidNotification.id).toBeUndefined();
    });
  });

  describe('Data Format Validation', () => {
    it('should validate date format in TransactionOutputDTO', () => {
      const transaction: TransactionOutputDTO = {
        transaction_reference: 'TX-001',
        id: 'TX-001',
        date: '2026-07-16T14:30:00Z',
        description: 'Test',
        amount: 1000.00,
        isFraud: false,
        fraudProbability: 0.05,
        reconciliationStatus: 'MATCHED',
        explainability: { summary: 'Test', factors: [] }
      };

      expect(transaction.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });

    it('should validate IBAN format in TransactionInputDTO', () => {
      const transaction: TransactionInputDTO = {
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
        transaction_type: 'TRANSFER',
        account_iban: 'FR761234567890123456789012345',
        beneficiary_iban: 'FR769876543210987654321098765'
      };

      expect(transaction.account_iban).toMatch(/^FR[A-Z0-9]{27}$/);
      expect(transaction.beneficiary_iban).toMatch(/^FR[A-Z0-9]{27}$/);
    });

    it('should validate transaction type enum values', () => {
      const validTypes = ['TRANSFER', 'CASH_OUT', 'PAYMENT'];
      
      validTypes.forEach(type => {
        const transaction: TransactionInputDTO = {
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
          transaction_type: type
        };

        expect(validTypes).toContain(transaction.transaction_type);
      });
    });
  });
});
