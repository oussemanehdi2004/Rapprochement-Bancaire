import { IngestMetadataDTO } from './ingest-metadata.dto';

describe('IngestMetadataDTO', () => {
  it('should create a valid IngestMetadataDTO', () => {
    const metadata: IngestMetadataDTO = {
      filename: 'transactions.csv',
      format: 'csv',
      tenant_id: 'tenant-123',
      bank_id: 'bank-456',
      bankmatch_integration_enabled: true
    };

    expect(metadata.filename).toBe('transactions.csv');
    expect(metadata.format).toBe('csv');
    expect(metadata.tenant_id).toBe('tenant-123');
    expect(metadata.bank_id).toBe('bank-456');
    expect(metadata.bankmatch_integration_enabled).toBe(true);
  });

  it('should support BankMatch integration disabled', () => {
    const metadata: IngestMetadataDTO = {
      filename: 'transactions.csv',
      format: 'csv',
      tenant_id: 'tenant-123',
      bank_id: 'bank-456',
      bankmatch_integration_enabled: false
    };

    expect(metadata.bankmatch_integration_enabled).toBe(false);
  });

  it('should support different file formats', () => {
    const formats = ['csv', 'camt053', 'mt940', 'pain.001', 'pain001'];
    
    formats.forEach(format => {
      const metadata: IngestMetadataDTO = {
        filename: `transactions.${format}`,
        format: format as any,
        tenant_id: 'tenant-123',
        bank_id: 'bank-456',
        bankmatch_integration_enabled: true
      };

      expect(metadata.format).toBe(format);
    });
  });

  it('should include file information', () => {
    const metadata: IngestMetadataDTO = {
      filename: 'bank_statements_2026_08.csv',
      format: 'csv',
      tenant_id: 'tenant-123',
      bank_id: 'bank-456',
      bankmatch_integration_enabled: true
    };

    expect(metadata.filename).toContain('.csv');
    expect(metadata.filename).toMatch(/^[a-zA-Z0-9_\-\.]+$/);
  });

  it('should include tenant and bank identification', () => {
    const metadata: IngestMetadataDTO = {
      filename: 'transactions.csv',
      format: 'csv',
      tenant_id: 'tenant-123',
      bank_id: 'bank-456',
      bankmatch_integration_enabled: true
    };

    expect(metadata.tenant_id).toMatch(/^tenant-\d+$/);
    expect(metadata.bank_id).toMatch(/^bank-\d+$/);
  });
});
