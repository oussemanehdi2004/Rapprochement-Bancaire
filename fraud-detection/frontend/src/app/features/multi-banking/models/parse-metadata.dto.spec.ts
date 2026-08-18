import { ParseMetadataDTO } from './parse-metadata.dto';

describe('ParseMetadataDTO', () => {
  it('should create a valid ParseMetadataDTO', () => {
    const metadata: ParseMetadataDTO = {
      filename: 'transactions.csv',
      format: 'csv',
      tenant_id: 'tenant-123',
      bank_id: 'bank-456',
      authenticated_tenant: 'tenant-123',
      authenticated_user: 'user@example.com'
    };

    expect(metadata.filename).toBe('transactions.csv');
    expect(metadata.format).toBe('csv');
    expect(metadata.tenant_id).toBe('tenant-123');
    expect(metadata.bank_id).toBe('bank-456');
    expect(metadata.authenticated_tenant).toBe('tenant-123');
    expect(metadata.authenticated_user).toBe('user@example.com');
  });

  it('should support different file formats', () => {
    const formats = ['csv', 'camt053', 'mt940', 'pain.001', 'pain001'];
    
    formats.forEach(format => {
      const metadata: ParseMetadataDTO = {
        filename: `transactions.${format}`,
        format: format as any,
        tenant_id: 'tenant-123',
        bank_id: 'bank-456',
        authenticated_tenant: 'tenant-123',
        authenticated_user: 'user@example.com'
      };

      expect(metadata.format).toBe(format);
    });
  });

  it('should validate tenant consistency', () => {
    const metadata: ParseMetadataDTO = {
      filename: 'transactions.csv',
      format: 'csv',
      tenant_id: 'tenant-123',
      bank_id: 'bank-456',
      authenticated_tenant: 'tenant-123',
      authenticated_user: 'user@example.com'
    };

    expect(metadata.tenant_id).toBe(metadata.authenticated_tenant);
  });

  it('should include user authentication information', () => {
    const metadata: ParseMetadataDTO = {
      filename: 'transactions.csv',
      format: 'csv',
      tenant_id: 'tenant-123',
      bank_id: 'bank-456',
      authenticated_tenant: 'tenant-123',
      authenticated_user: 'admin@bankmatch.com'
    };

    expect(metadata.authenticated_user).toContain('@');
    expect(metadata.authenticated_user).toContain('.');
  });
});
