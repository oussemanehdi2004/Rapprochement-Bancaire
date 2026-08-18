import { TransactionInputDTO, TransactionType } from './transaction-input.dto';

describe('TransactionInputDTO', () => {
  it('should create a valid TransactionInputDTO', () => {
    const transaction: TransactionInputDTO = {
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
    };

    expect(transaction.tenant_id).toBe('tenant-123');
    expect(transaction.transaction_reference).toBe('TX-10024');
    expect(transaction.amount).toBe(1500.50);
    expect(transaction.transaction_type).toBe('TRANSFER');
  });

  it('should handle optional fields', () => {
    const transaction: TransactionInputDTO = {
      tenant_id: 'tenant-123',
      transaction_reference: 'TX-10025',
      id: 'TX-10025',
      date: '2026-07-16T15:00:00Z',
      description: 'PAIEMENT',
      amount: 100.00,
      sender_balance_before: 1000.0,
      sender_balance_after: 900.0,
      receiver_balance_before: 500.0,
      receiver_balance_after: 600.0,
      transaction_type: 'PAYMENT',
      account_iban: 'FR7612345678901234567890123',
      beneficiary_iban: 'FR7698765432109876543210987'
    };

    expect(transaction.account_iban).toBeTruthy();
    expect(transaction.beneficiary_iban).toBeTruthy();
  });

  it('should handle all nullable fields as null', () => {
    const transaction: TransactionInputDTO = {
      tenant_id: 'tenant-123',
      transaction_reference: 'TX-10026',
      id: 'TX-10026',
      date: '2026-07-16T16:00:00Z',
      description: 'RETRAIT',
      amount: 200.00,
      sender_balance_before: 800.0,
      sender_balance_after: 600.0,
      receiver_balance_before: 0.0,
      receiver_balance_after: 0.0,
      transaction_type: 'CASH_OUT',
      account_iban: null,
      beneficiary_iban: null,
      sender_account: null,
      receiver_account: null,
      device_id: null,
      device_fingerprint: null,
      ip_address: null,
      country: null,
      city: null
    };

    expect(transaction.account_iban).toBeNull();
    expect(transaction.beneficiary_iban).toBeNull();
    expect(transaction.device_fingerprint).toBeNull();
  });

  it('should validate transaction types', () => {
    const validTypes: TransactionType[] = ['TRANSFER', 'CASH_OUT', 'PAYMENT'];
    
    validTypes.forEach(type => {
      const transaction: TransactionInputDTO = {
        tenant_id: 'tenant-123',
        transaction_reference: `TX-${type}`,
        id: `TX-${type}`,
        date: '2026-07-16T17:00:00Z',
        description: 'Test transaction',
        amount: 100.00,
        sender_balance_before: 1000.0,
        sender_balance_after: 900.0,
        receiver_balance_before: 500.0,
        receiver_balance_after: 600.0,
        transaction_type: type
      };

      expect(transaction.transaction_type).toBe(type);
    });
  });

  it('should validate date format', () => {
    const transaction: TransactionInputDTO = {
      tenant_id: 'tenant-123',
      transaction_reference: 'TX-10027',
      id: 'TX-10027',
      date: '2026-07-16T14:30:00Z',
      description: 'Test',
      amount: 100.00,
      sender_balance_before: 1000.0,
      sender_balance_after: 900.0,
      receiver_balance_before: 500.0,
      receiver_balance_after: 600.0,
      transaction_type: 'TRANSFER'
    };

    expect(transaction.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('should calculate balance changes correctly', () => {
    const transaction: TransactionInputDTO = {
      tenant_id: 'tenant-123',
      transaction_reference: 'TX-10028',
      id: 'TX-10028',
      date: '2026-07-16T18:00:00Z',
      description: 'VIREMENT',
      amount: 500.00,
      sender_balance_before: 1000.0,
      sender_balance_after: 500.0,
      receiver_balance_before: 200.0,
      receiver_balance_after: 700.0,
      transaction_type: 'TRANSFER'
    };

    const senderChange = transaction.sender_balance_before - transaction.sender_balance_after;
    const receiverChange = transaction.receiver_balance_after - transaction.receiver_balance_before;
    
    expect(senderChange).toBe(transaction.amount);
    expect(receiverChange).toBe(transaction.amount);
  });

  it('should include device and location information when available', () => {
    const transaction: TransactionInputDTO = {
      tenant_id: 'tenant-123',
      transaction_reference: 'TX-10029',
      id: 'TX-10029',
      date: '2026-07-16T19:00:00Z',
      description: 'VIREMENT',
      amount: 1000.00,
      sender_balance_before: 2000.0,
      sender_balance_after: 1000.0,
      receiver_balance_before: 500.0,
      receiver_balance_after: 1500.0,
      transaction_type: 'TRANSFER',
      device_fingerprint: 'abc123',
      ip_address: '192.168.1.1',
      country: 'FR',
      city: 'Paris'
    };

    expect(transaction.device_fingerprint).toBe('abc123');
    expect(transaction.country).toBe('FR');
    expect(transaction.city).toBe('Paris');
  });
});
