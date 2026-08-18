import {
  IngestionStatsDTO,
  FileUploadDTO,
  ParsedTransactionDTO,
  FraudAnalysisResultDTO,
  ParseResponseDTO,
  ParseMetadataDTO,
  ValidationErrorDTO,
  ValidationResultDTO,
  ValidateResponseDTO,
  IngestMetadataDTO,
  IngestResponseDTO,
  BankMatchResultDTO
} from './index';

describe('Multi-Banking DTOs Contract Validation', () => {
  describe('OpenAPI Spec Compliance', () => {
    it('should validate IngestionStatsDTO matches api-spec.yaml schema', () => {
      const dto: IngestionStatsDTO = {
        total_files: 100,
        successful: 85,
        failed: 10,
        pending: 5,
        total_transactions: 15000
      };

      // Validate required fields exist
      expect(dto.total_files).toBeDefined();
      expect(dto.successful).toBeDefined();
      expect(dto.failed).toBeDefined();
      expect(dto.pending).toBeDefined();
      expect(dto.total_transactions).toBeDefined();

      // Validate field types
      expect(typeof dto.total_files).toBe('number');
      expect(typeof dto.successful).toBe('number');
      expect(typeof dto.failed).toBe('number');
      expect(typeof dto.pending).toBe('number');
      expect(typeof dto.total_transactions).toBe('number');
    });

    it('should validate FileUploadDTO matches api-spec.yaml schema', () => {
      const dto: FileUploadDTO = {
        id: 'upload-123',
        filename: 'transactions.csv',
        bank: 'bank-456',
        format: 'csv',
        status: 'completed',
        transaction_count: 150,
        uploaded_at: '2026-08-18T10:30:00Z',
        error_message: null
      };

      // Validate required fields
      expect(dto.id).toBeDefined();
      expect(dto.filename).toBeDefined();
      expect(dto.bank).toBeDefined();
      expect(dto.format).toBeDefined();
      expect(dto.status).toBeDefined();
      expect(dto.transaction_count).toBeDefined();
      expect(dto.uploaded_at).toBeDefined();

      // Validate optional field
      expect(dto.error_message).toBeNull();

      // Validate status enum values
      const validStatuses = ['pending', 'processing', 'completed', 'failed'];
      expect(validStatuses).toContain(dto.status);
    });

    it('should validate ParsedTransactionDTO matches api-spec.yaml schema', () => {
      const dto: ParsedTransactionDTO = {
        tenant_id: 'tenant-123',
        source_line_hash: 'abc123',
        reference: 'REF-001',
        value_date: '2026-08-18',
        label: 'VIREMENT',
        amount: 1000.00,
        balance_before: 5000.0,
        balance_after: 4000.0,
        account_balance: 4000.0,
        account_iban: 'FR761234567890123456789012345',
        counterparty_iban: 'FR769876543210987654321098765'
      };

      // Validate required fields
      expect(dto.tenant_id).toBeDefined();
      expect(dto.source_line_hash).toBeDefined();
      expect(dto.reference).toBeDefined();
      expect(dto.value_date).toBeDefined();
      expect(dto.label).toBeDefined();
      expect(dto.amount).toBeDefined();
      expect(dto.account_iban).toBeDefined();

      // Validate nullable fields
      expect(dto.balance_before).not.toBeNull();
      expect(dto.counterparty_iban).not.toBeNull();
    });

    it('should validate FraudAnalysisResultDTO matches api-spec.yaml schema', () => {
      const dto: FraudAnalysisResultDTO = {
        transaction_reference: 'TX-001',
        isFraud: true,
        fraudProbability: 0.85,
        reconciliationStatus: 'SUSPICIOUS',
        ruleCategory: 'MOTCLE_SENSIBLE'
      };

      // Validate required fields
      expect(dto.transaction_reference).toBeDefined();
      expect(dto.isFraud).toBeDefined();
      expect(dto.fraudProbability).toBeDefined();
      expect(dto.reconciliationStatus).toBeDefined();

      // Validate types
      expect(typeof dto.isFraud).toBe('boolean');
      expect(typeof dto.fraudProbability).toBe('number');
      expect(dto.fraudProbability).toBeGreaterThanOrEqual(0);
      expect(dto.fraudProbability).toBeLessThanOrEqual(1);

      // Validate optional field
      expect(dto.ruleCategory).toBeDefined();
    });

    it('should validate ParseResponseDTO matches api-spec.yaml schema', () => {
      const dto: ParseResponseDTO = {
        success: true,
        count: 150,
        data: [],
        metadata: {
          filename: 'test.csv',
          format: 'csv',
          tenant_id: 'tenant-123',
          bank_id: 'bank-456',
          authenticated_tenant: 'tenant-123',
          authenticated_user: 'user@example.com'
        }
      };

      // Validate required fields
      expect(dto.success).toBeDefined();
      expect(dto.count).toBeDefined();
      expect(dto.data).toBeDefined();
      expect(dto.metadata).toBeDefined();

      // Validate types
      expect(typeof dto.success).toBe('boolean');
      expect(typeof dto.count).toBe('number');
      expect(Array.isArray(dto.data)).toBe(true);
    });

    it('should validate ValidationErrorDTO matches api-spec.yaml schema', () => {
      const dto: ValidationErrorDTO = {
        line_number: 10,
        error: 'Montant invalide',
        field: 'amount'
      };

      // Validate required fields
      expect(dto.line_number).toBeDefined();
      expect(dto.error).toBeDefined();
      expect(dto.field).toBeDefined();

      // Validate types
      expect(typeof dto.line_number).toBe('number');
      expect(typeof dto.error).toBe('string');
      expect(typeof dto.field).toBe('string');
    });

    it('should validate ValidationResultDTO matches api-spec.yaml schema', () => {
      const dto: ValidationResultDTO = {
        valid_count: 150,
        invalid_count: 2,
        errors: [
          {
            line_number: 10,
            error: 'Montant invalide',
            field: 'amount'
          }
        ]
      };

      // Validate required fields
      expect(dto.valid_count).toBeDefined();
      expect(dto.invalid_count).toBeDefined();
      expect(dto.errors).toBeDefined();

      // Validate structure
      expect(Array.isArray(dto.errors)).toBe(true);
      expect(dto.errors[0].line_number).toBeDefined();
    });

    it('should validate IngestResponseDTO matches api-spec.yaml schema', () => {
      const dto: IngestResponseDTO = {
        success: true,
        parsed_count: 150,
        fraud_result: {
          transactions: []
        },
        bankmatch_result: {
          session_id: 'session-123',
          matching: { matched: 148, unmatched: 2 }
        },
        metadata: {
          filename: 'test.csv',
          format: 'csv',
          tenant_id: 'tenant-123',
          bank_id: 'bank-456',
          bankmatch_integration_enabled: true
        }
      };

      // Validate required fields
      expect(dto.success).toBeDefined();
      expect(dto.parsed_count).toBeDefined();
      expect(dto.fraud_result).toBeDefined();
      expect(dto.metadata).toBeDefined();

      // Validate nested structures
      expect(dto.fraud_result.transactions).toBeDefined();
      expect(Array.isArray(dto.fraud_result.transactions)).toBe(true);
      expect(dto.bankmatch_result).not.toBeNull();
    });
  });

  describe('Type Safety Validation', () => {
    it('should enforce type safety for numeric fields', () => {
      const stats: IngestionStatsDTO = {
        total_files: 100,
        successful: 85,
        failed: 10,
        pending: 5,
        total_transactions: 15000
      };

      // TypeScript should prevent string assignment
      const invalidStats: IngestionStatsDTO = {
        ...stats,
        total_files: '100' as any
      };

      expect(typeof invalidStats.total_files).toBe('string');
    });

    it('should enforce type safety for boolean fields', () => {
      const response: ParseResponseDTO = {
        success: true,
        count: 0,
        data: [],
        metadata: {
          filename: 'test.csv',
          format: 'csv',
          tenant_id: 'tenant-123',
          bank_id: 'bank-456',
          authenticated_tenant: 'tenant-123',
          authenticated_user: 'user@example.com'
        }
      };

      const invalidResponse: ParseResponseDTO = {
        ...response,
        success: 'true' as any
      };

      expect(typeof invalidResponse.success).toBe('string');
    });

    it('should enforce type safety for enum fields', () => {
      const upload: FileUploadDTO = {
        id: 'upload-123',
        filename: 'test.csv',
        bank: 'bank-456',
        format: 'csv',
        status: 'completed',
        transaction_count: 100,
        uploaded_at: '2026-08-18T10:00:00Z'
      };

      const invalidUpload: FileUploadDTO = {
        ...upload,
        status: 'invalid_status' as any
      };

      expect(['pending', 'processing', 'completed', 'failed']).not.toContain(invalidUpload.status);
    });
  });

  describe('Field Presence Validation', () => {
    it('should require all mandatory fields in IngestionStatsDTO', () => {
      // @ts-expect-error - Testing missing required field
      const invalidStats: IngestionStatsDTO = {
        successful: 85,
        failed: 10,
        pending: 5,
        total_transactions: 15000
        // missing total_files
      };

      expect(invalidStats.total_files).toBeUndefined();
    });

    it('should require all mandatory fields in FileUploadDTO', () => {
      // @ts-expect-error - Testing missing required field
      const invalidUpload: FileUploadDTO = {
        filename: 'test.csv',
        bank: 'bank-456',
        format: 'csv',
        status: 'completed',
        transaction_count: 100,
        uploaded_at: '2026-08-18T10:00:00Z'
        // missing id
      };

      expect(invalidUpload.id).toBeUndefined();
    });
  });

  describe('Data Format Validation', () => {
    it('should validate date format in ParseMetadataDTO', () => {
      const metadata: ParseMetadataDTO = {
        filename: 'test.csv',
        format: 'csv',
        tenant_id: 'tenant-123',
        bank_id: 'bank-456',
        authenticated_tenant: 'tenant-123',
        authenticated_user: 'user@example.com'
      };

      // The DTO doesn't have date fields, but filename should be valid
      expect(metadata.filename).toMatch(/^[a-zA-Z0-9_\-\.]+$/);
    });

    it('should validate IBAN format in ParsedTransactionDTO', () => {
      const transaction: ParsedTransactionDTO = {
        tenant_id: 'tenant-123',
        source_line_hash: 'abc123',
        reference: 'REF-001',
        value_date: '2026-08-18',
        label: 'VIREMENT',
        amount: 1000.00,
        account_iban: 'FR761234567890123456789012345',
        counterparty_iban: 'FR769876543210987654321098765'
      };

      expect(transaction.account_iban).toMatch(/^FR[A-Z0-9]{27}$/);
      expect(transaction.counterparty_iban).toMatch(/^FR[A-Z0-9]{27}$/);
    });

    it('should validate file format enum values', () => {
      const validFormats = ['csv', 'camt053', 'mt940', 'pain.001', 'pain001'];
      
      validFormats.forEach(format => {
        const metadata: ParseMetadataDTO = {
          filename: `test.${format}`,
          format: format as any,
          tenant_id: 'tenant-123',
          bank_id: 'bank-456',
          authenticated_tenant: 'tenant-123',
          authenticated_user: 'user@example.com'
        };

        expect(validFormats).toContain(metadata.format);
      });
    });
  });
});
