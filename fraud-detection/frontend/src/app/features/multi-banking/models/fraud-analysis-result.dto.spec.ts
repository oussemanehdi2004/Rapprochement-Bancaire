import { FraudAnalysisResultDTO } from './fraud-analysis-result.dto';

describe('FraudAnalysisResultDTO', () => {
  it('should create a valid FraudAnalysisResultDTO', () => {
    const result: FraudAnalysisResultDTO = {
      transaction_reference: 'TX-10024',
      isFraud: true,
      fraudProbability: 0.85,
      reconciliationStatus: 'SUSPICIOUS',
      ruleCategory: 'MOTCLE_SENSIBLE'
    };

    expect(result.transaction_reference).toBe('TX-10024');
    expect(result.isFraud).toBe(true);
    expect(result.fraudProbability).toBe(0.85);
    expect(result.reconciliationStatus).toBe('SUSPICIOUS');
    expect(result.ruleCategory).toBe('MOTCLE_SENSIBLE');
  });

  it('should allow nullable ruleCategory', () => {
    const result: FraudAnalysisResultDTO = {
      transaction_reference: 'TX-10025',
      isFraud: false,
      fraudProbability: 0.15,
      reconciliationStatus: 'MATCHED',
      ruleCategory: null
    };

    expect(result.ruleCategory).toBeNull();
  });

  it('should validate fraudProbability range', () => {
    const result: FraudAnalysisResultDTO = {
      transaction_reference: 'TX-10026',
      isFraud: true,
      fraudProbability: 0.95,
      reconciliationStatus: 'SUSPICIOUS'
    };

    expect(result.fraudProbability).toBeGreaterThanOrEqual(0);
    expect(result.fraudProbability).toBeLessThanOrEqual(1);
  });

  it('should correctly classify high risk transactions', () => {
    const highRisk: FraudAnalysisResultDTO = {
      transaction_reference: 'TX-10027',
      isFraud: true,
      fraudProbability: 0.92,
      reconciliationStatus: 'SUSPICIOUS'
    };

    expect(highRisk.isFraud).toBe(true);
    expect(highRisk.fraudProbability).toBeGreaterThan(0.9);
  });

  it('should correctly classify low risk transactions', () => {
    const lowRisk: FraudAnalysisResultDTO = {
      transaction_reference: 'TX-10028',
      isFraud: false,
      fraudProbability: 0.08,
      reconciliationStatus: 'MATCHED'
    };

    expect(lowRisk.isFraud).toBe(false);
    expect(lowRisk.fraudProbability).toBeLessThan(0.1);
  });
});
