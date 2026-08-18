import { ParseResponseDTO } from './parse-response.dto';
import { ParsedTransactionDTO } from './parsed-transaction.dto';
import { ParseMetadataDTO } from './parse-metadata.dto';

describe('ParseResponseDTO', () => {
  const mockTransaction: ParsedTransactionDTO = {
    tenant_id: 'tenant-123',
    source_line_hash: 'abc123',
    reference: 'REF-001',
    value_date: '2026-08-18',
    label: 'VIREMENT',
    amount: 1000.00,
    account_iban: 'FR7612345678901234567890123'
  };

  const mockMetadata: ParseMetadataDTO = {
    filename: 'transactions.csv',
    format: 'csv',
    tenant_id: 'tenant-123',
    bank_id: 'bank-456',
    authenticated_tenant: 'tenant-123',
    authenticated_user: 'user@example.com'
  };

  it('should create a valid ParseResponseDTO', () => {
    const response: ParseResponseDTO = {
      success: true,
      count: 1,
      data: [mockTransaction],
      metadata: mockMetadata
    };

    expect(response.success).toBe(true);
    expect(response.count).toBe(1);
    expect(response.data).toHaveLength(1);
    expect(response.data[0]).toEqual(mockTransaction);
    expect(response.metadata).toEqual(mockMetadata);
  });

  it('should handle empty data array', () => {
    const response: ParseResponseDTO = {
      success: true,
      count: 0,
      data: [],
      metadata: mockMetadata
    };

    expect(response.count).toBe(0);
    expect(response.data).toHaveLength(0);
  });

  it('should handle multiple transactions', () => {
    const transactions: ParsedTransactionDTO[] = [
      { ...mockTransaction, reference: 'REF-001' },
      { ...mockTransaction, reference: 'REF-002' },
      { ...mockTransaction, reference: 'REF-003' }
    ];

    const response: ParseResponseDTO = {
      success: true,
      count: 3,
      data: transactions,
      metadata: mockMetadata
    };

    expect(response.count).toBe(3);
    expect(response.data).toHaveLength(3);
  });

  it('should handle failed parse', () => {
    const response: ParseResponseDTO = {
      success: false,
      count: 0,
      data: [],
      metadata: mockMetadata
    };

    expect(response.success).toBe(false);
    expect(response.count).toBe(0);
  });

  it('should include metadata information', () => {
    const response: ParseResponseDTO = {
      success: true,
      count: 1,
      data: [mockTransaction],
      metadata: mockMetadata
    };

    expect(response.metadata.filename).toBe('transactions.csv');
    expect(response.metadata.format).toBe('csv');
    expect(response.metadata.tenant_id).toBe('tenant-123');
    expect(response.metadata.bank_id).toBe('bank-456');
  });
});
