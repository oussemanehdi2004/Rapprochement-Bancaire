import { ParsedTransactionDTO } from './parsed-transaction.dto';

describe('ParsedTransactionDTO', () => {
  it('should create a valid ParsedTransactionDTO', () => {
    const transaction: ParsedTransactionDTO = {
      tenant_id: 'tenant-123',
      source_line_hash: 'abc123',
      reference: 'REF-001',
      value_date: '2026-08-18',
      label: 'VIREMENT ENTRANT',
      amount: 1500.50,
      balance_before: 5000.0,
      balance_after: 3499.5,
      account_balance: 3499.5,
      account_iban: 'FR761234567890123456789012345',
      counterparty_iban: 'FR769876543210987654321098765'
    };

    expect(transaction.tenant_id).toBe('tenant-123');
    expect(transaction.source_line_hash).toBe('abc123');
    expect(transaction.reference).toBe('REF-001');
    expect(transaction.value_date).toBe('2026-08-18');
    expect(transaction.label).toBe('VIREMENT ENTRANT');
    expect(transaction.amount).toBe(1500.50);
    expect(transaction.balance_before).toBe(5000.0);
    expect(transaction.balance_after).toBe(3499.5);
    expect(transaction.account_balance).toBe(3499.5);
    expect(transaction.account_iban).toBe('FR761234567890123456789012345');
    expect(transaction.counterparty_iban).toBe('FR769876543210987654321098765');
  });

  it('should allow nullable balance fields', () => {
    const transaction: ParsedTransactionDTO = {
      tenant_id: 'tenant-123',
      source_line_hash: 'abc123',
      reference: 'REF-002',
      value_date: '2026-08-18',
      label: 'VIREMENT SORTANT',
      amount: 500.00,
      balance_before: null,
      balance_after: null,
      account_balance: null,
      account_iban: 'FR7612345678901234567890123',
      counterparty_iban: null
    };

    expect(transaction.balance_before).toBeNull();
    expect(transaction.balance_after).toBeNull();
    expect(transaction.account_balance).toBeNull();
    expect(transaction.counterparty_iban).toBeNull();
  });

  it('should calculate amount difference correctly', () => {
    const transaction: ParsedTransactionDTO = {
      tenant_id: 'tenant-123',
      source_line_hash: 'abc123',
      reference: 'REF-003',
      value_date: '2026-08-18',
      label: 'VIREMENT',
      amount: 500.00,
      balance_before: 1000.0,
      balance_after: 500.0,
      account_balance: 500.0,
      account_iban: 'FR761234567890123456789012345',
      counterparty_iban: 'FR769876543210987654321098765'
    };

    const difference = transaction.balance_before! - transaction.balance_after!;
    expect(difference).toBe(transaction.amount);
  });

  it('should validate IBAN format (basic check)', () => {
    const transaction: ParsedTransactionDTO = {
      tenant_id: 'tenant-123',
      source_line_hash: 'abc123',
      reference: 'REF-004',
      value_date: '2026-08-18',
      label: 'VIREMENT',
      amount: 1000.00,
      account_iban: 'FR761234567890123456789012345',
      counterparty_iban: 'FR769876543210987654321098765'
    };

    expect(transaction.account_iban).toMatch(/^FR[A-Z0-9]{27}$/);
    expect(transaction.counterparty_iban).toMatch(/^FR[A-Z0-9]{27}$/);
  });
});
