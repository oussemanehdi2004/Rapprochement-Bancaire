import { TransactionOutputDTO, ConfidenceLevel, ReconciliationStatus } from './transaction-output.dto';
import { ExplainabilityDTO } from './explainability.dto';

describe('TransactionOutputDTO', () => {
  const mockExplainability: ExplainabilityDTO = {
    summary: 'Transaction suspecte détectée',
    factors: ['Montant élevé'],
    shap_contributions: [
      {
        feature: 'amount',
        value: 0.23,
        direction: 'positive'
      }
    ]
  };

  it('should create a valid TransactionOutputDTO', () => {
    const transaction: TransactionOutputDTO = {
      transaction_reference: 'TX-10024',
      id: 'TX-10024',
      date: '2026-07-16T14:30:00Z',
      description: 'VIREMENT ENTRANT CASINO',
      amount: 1500.50,
      isFraud: true,
      fraudProbability: 0.85,
      reconciliationStatus: 'SUSPICIOUS',
      ruleCategory: 'MOTCLE_SENSIBLE',
      explainability: mockExplainability
    };

    expect(transaction.transaction_reference).toBe('TX-10024');
    expect(transaction.isFraud).toBe(true);
    expect(transaction.fraudProbability).toBe(0.85);
    expect(transaction.reconciliationStatus).toBe('SUSPICIOUS');
  });

  it('should handle optional tenant_id', () => {
    const transaction: TransactionOutputDTO = {
      tenant_id: 'tenant-123',
      transaction_reference: 'TX-10025',
      id: 'TX-10025',
      date: '2026-07-16T15:00:00Z',
      description: 'VIREMENT',
      amount: 100.00,
      isFraud: false,
      fraudProbability: 0.05,
      reconciliationStatus: 'MATCHED',
      explainability: mockExplainability
    };

    expect(transaction.tenant_id).toBe('tenant-123');
  });

  it('should handle optional score and confidence', () => {
    const transaction: TransactionOutputDTO = {
      transaction_reference: 'TX-10026',
      id: 'TX-10026',
      date: '2026-07-16T16:00:00Z',
      description: 'VIREMENT',
      amount: 200.00,
      isFraud: true,
      fraudProbability: 0.75,
      score: 75,
      confidence: 'MEDIUM',
      reconciliationStatus: 'SUSPICIOUS',
      explainability: mockExplainability
    };

    expect(transaction.score).toBe(75);
    expect(transaction.confidence).toBe('MEDIUM');
  });

  it('should validate confidence levels', () => {
    const validLevels: ConfidenceLevel[] = ['HIGH', 'MEDIUM', 'LOW'];
    
    validLevels.forEach(level => {
      const transaction: TransactionOutputDTO = {
        transaction_reference: `TX-${level}`,
        id: `TX-${level}`,
        date: '2026-07-16T17:00:00Z',
        description: 'Test',
        amount: 100.00,
        isFraud: true,
        fraudProbability: 0.5,
        confidence: level,
        reconciliationStatus: 'SUSPICIOUS',
        explainability: mockExplainability
      };

      expect(transaction.confidence).toBe(level);
    });
  });

  it('should validate reconciliation statuses', () => {
    const validStatuses: ReconciliationStatus[] = ['MATCHED', 'UNMATCHED', 'SUSPICIOUS'];
    
    validStatuses.forEach(status => {
      const transaction: TransactionOutputDTO = {
        transaction_reference: `TX-${status}`,
        id: `TX-${status}`,
        date: '2026-07-16T18:00:00Z',
        description: 'Test',
        amount: 100.00,
        isFraud: status === 'SUSPICIOUS',
        fraudProbability: status === 'SUSPICIOUS' ? 0.8 : 0.1,
        reconciliationStatus: status,
        explainability: mockExplainability
      };

      expect(transaction.reconciliationStatus).toBe(status);
    });
  });

  it('should validate fraudProbability range', () => {
    const transaction: TransactionOutputDTO = {
      transaction_reference: 'TX-10027',
      id: 'TX-10027',
      date: '2026-07-16T19:00:00Z',
      description: 'Test',
      amount: 100.00,
      isFraud: true,
      fraudProbability: 0.95,
      reconciliationStatus: 'SUSPICIOUS',
      explainability: mockExplainability
    };

    expect(transaction.fraudProbability).toBeGreaterThanOrEqual(0);
    expect(transaction.fraudProbability).toBeLessThanOrEqual(1);
  });

  it('should handle nullable ruleCategory', () => {
    const transaction: TransactionOutputDTO = {
      transaction_reference: 'TX-10028',
      id: 'TX-10028',
      date: '2026-07-16T20:00:00Z',
      description: 'VIREMENT',
      amount: 100.00,
      isFraud: false,
      fraudProbability: 0.1,
      reconciliationStatus: 'MATCHED',
      ruleCategory: null,
      explainability: mockExplainability
    };

    expect(transaction.ruleCategory).toBeNull();
  });

  it('should include explainability information', () => {
    const transaction: TransactionOutputDTO = {
      transaction_reference: 'TX-10029',
      id: 'TX-10029',
      date: '2026-07-16T21:00:00Z',
      description: 'VIREMENT',
      amount: 1000.00,
      isFraud: true,
      fraudProbability: 0.9,
      reconciliationStatus: 'SUSPICIOUS',
      explainability: mockExplainability
    };

    expect(transaction.explainability.summary).toBe('Transaction suspecte détectée');
    expect(transaction.explainability.factors).toHaveLength(1);
  });
});
