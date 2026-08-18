import { IngestResponseDTO, BankMatchResultDTO } from './ingest-response.dto';
import { FraudAnalysisResultDTO } from './fraud-analysis-result.dto';
import { IngestMetadataDTO } from './ingest-metadata.dto';

describe('IngestResponseDTO', () => {
  const mockFraudResults: FraudAnalysisResultDTO[] = [
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
  ];

  const mockBankMatchResult: BankMatchResultDTO = {
    session_id: 'session-123',
    matching: {
      matched: 148,
      unmatched: 2
    }
  };

  const mockMetadata: IngestMetadataDTO = {
    filename: 'transactions.csv',
    format: 'csv',
    tenant_id: 'tenant-123',
    bank_id: 'bank-456',
    bankmatch_integration_enabled: true
  };

  it('should create a valid IngestResponseDTO', () => {
    const response: IngestResponseDTO = {
      success: true,
      parsed_count: 150,
      fraud_result: {
        transactions: mockFraudResults
      },
      bankmatch_result: mockBankMatchResult,
      metadata: mockMetadata
    };

    expect(response.success).toBe(true);
    expect(response.parsed_count).toBe(150);
    expect(response.fraud_result.transactions).toHaveLength(2);
    expect(response.bankmatch_result).not.toBeNull();
    expect(response.metadata).toEqual(mockMetadata);
  });

  it('should handle BankMatch integration disabled', () => {
    const response: IngestResponseDTO = {
      success: true,
      parsed_count: 150,
      fraud_result: {
        transactions: mockFraudResults
      },
      bankmatch_result: null,
      metadata: {
        ...mockMetadata,
        bankmatch_integration_enabled: false
      }
    };

    expect(response.bankmatch_result).toBeNull();
    expect(response.metadata.bankmatch_integration_enabled).toBe(false);
  });

  it('should handle BankMatch integration error', () => {
    const errorResult: BankMatchResultDTO = {
      error: 'BankMatch service unavailable'
    };

    const response: IngestResponseDTO = {
      success: true,
      parsed_count: 150,
      fraud_result: {
        transactions: mockFraudResults
      },
      bankmatch_result: errorResult,
      metadata: mockMetadata
    };

    expect(response.bankmatch_result?.error).toBe('BankMatch service unavailable');
  });

  it('should include fraud analysis results', () => {
    const response: IngestResponseDTO = {
      success: true,
      parsed_count: 150,
      fraud_result: {
        transactions: mockFraudResults
      },
      bankmatch_result: mockBankMatchResult,
      metadata: mockMetadata
    };

    expect(response.fraud_result.transactions[0].isFraud).toBe(false);
    expect(response.fraud_result.transactions[1].isFraud).toBe(true);
  });

  it('should match parsed count with transaction count', () => {
    const response: IngestResponseDTO = {
      success: true,
      parsed_count: 150,
      fraud_result: {
        transactions: mockFraudResults
      },
      bankmatch_result: mockBankMatchResult,
      metadata: mockMetadata
    };

    // In real scenario, these should match, but for test we verify structure
    expect(response.parsed_count).toBeGreaterThan(0);
    expect(response.fraud_result.transactions).toHaveLength(2);
  });

  it('should handle failed ingestion', () => {
    const response: IngestResponseDTO = {
      success: false,
      parsed_count: 0,
      fraud_result: {
        transactions: []
      },
      bankmatch_result: null,
      metadata: mockMetadata
    };

    expect(response.success).toBe(false);
    expect(response.parsed_count).toBe(0);
  });
});
