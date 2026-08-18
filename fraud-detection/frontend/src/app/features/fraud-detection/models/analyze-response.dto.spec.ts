import { AnalyzeResponseDTO } from './analyze-response.dto';
import { TransactionOutputDTO } from './transaction-output.dto';
import { ExplainabilityDTO } from './explainability.dto';

describe('AnalyzeResponseDTO', () => {
  const mockExplainability: ExplainabilityDTO = {
    summary: 'Transaction suspecte',
    factors: ['Montant élevé']
  };

  const mockTransactions: TransactionOutputDTO[] = [
    {
      transaction_reference: 'TX-001',
      id: 'TX-001',
      date: '2026-07-16T14:30:00Z',
      description: 'VIREMENT',
      amount: 1500.50,
      isFraud: true,
      fraudProbability: 0.85,
      reconciliationStatus: 'SUSPICIOUS',
      explainability: mockExplainability
    },
    {
      transaction_reference: 'TX-002',
      id: 'TX-002',
      date: '2026-07-16T15:00:00Z',
      description: 'VIREMENT',
      amount: 100.00,
      isFraud: false,
      fraudProbability: 0.05,
      reconciliationStatus: 'MATCHED',
      explainability: mockExplainability
    }
  ];

  it('should create a valid AnalyzeResponseDTO', () => {
    const response: AnalyzeResponseDTO = {
      success: true,
      data: mockTransactions
    };

    expect(response.success).toBe(true);
    expect(response.data).toHaveLength(2);
    expect(response.data[0].transaction_reference).toBe('TX-001');
  });

  it('should handle empty data array', () => {
    const response: AnalyzeResponseDTO = {
      success: true,
      data: []
    };

    expect(response.success).toBe(true);
    expect(response.data).toHaveLength(0);
  });

  it('should handle failed analysis', () => {
    const response: AnalyzeResponseDTO = {
      success: false,
      data: []
    };

    expect(response.success).toBe(false);
  });

  it('should include multiple transaction results', () => {
    const transactions: TransactionOutputDTO[] = [
      ...mockTransactions,
      {
        transaction_reference: 'TX-003',
        id: 'TX-003',
        date: '2026-07-16T16:00:00Z',
        description: 'VIREMENT',
        amount: 500.00,
        isFraud: true,
        fraudProbability: 0.6,
        reconciliationStatus: 'SUSPICIOUS',
        explainability: mockExplainability
      }
    ];

    const response: AnalyzeResponseDTO = {
      success: true,
      data: transactions
    };

    expect(response.data).toHaveLength(3);
  });

  it('should maintain transaction order', () => {
    const response: AnalyzeResponseDTO = {
      success: true,
      data: mockTransactions
    };

    expect(response.data[0].transaction_reference).toBe('TX-001');
    expect(response.data[1].transaction_reference).toBe('TX-002');
  });

  it('should include fraud detection results', () => {
    const response: AnalyzeResponseDTO = {
      success: true,
      data: mockTransactions
    };

    const fraudCount = response.data.filter(tx => tx.isFraud).length;
    expect(fraudCount).toBe(1);
  });

  it('should include explainability for each transaction', () => {
    const response: AnalyzeResponseDTO = {
      success: true,
      data: mockTransactions
    };

    response.data.forEach(transaction => {
      expect(transaction.explainability).toBeDefined();
      expect(transaction.explainability.summary).toBeTruthy();
    });
  });
});
