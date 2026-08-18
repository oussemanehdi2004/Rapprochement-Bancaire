import { FileUploadDTO, FileUploadStatus } from './file-upload.dto';

describe('FileUploadDTO', () => {
  it('should create a valid FileUploadDTO', () => {
    const upload: FileUploadDTO = {
      id: 'upload-123',
      filename: 'transactions.csv',
      bank: 'bank-456',
      format: 'csv',
      status: 'completed',
      transaction_count: 150,
      uploaded_at: '2026-08-18T10:30:00Z'
    };

    expect(upload.id).toBe('upload-123');
    expect(upload.filename).toBe('transactions.csv');
    expect(upload.bank).toBe('bank-456');
    expect(upload.format).toBe('csv');
    expect(upload.status).toBe('completed');
    expect(upload.transaction_count).toBe(150);
    expect(upload.uploaded_at).toBe('2026-08-18T10:30:00Z');
  });

  it('should allow optional error_message', () => {
    const upload: FileUploadDTO = {
      id: 'upload-124',
      filename: 'invalid.csv',
      bank: 'bank-456',
      format: 'csv',
      status: 'failed',
      transaction_count: 0,
      uploaded_at: '2026-08-18T11:00:00Z',
      error_message: 'Format de fichier invalide'
    };

    expect(upload.error_message).toBe('Format de fichier invalide');
  });

  it('should allow null error_message', () => {
    const upload: FileUploadDTO = {
      id: 'upload-125',
      filename: 'valid.csv',
      bank: 'bank-456',
      format: 'csv',
      status: 'completed',
      transaction_count: 100,
      uploaded_at: '2026-08-18T12:00:00Z',
      error_message: null
    };

    expect(upload.error_message).toBeNull();
  });

  it('should accept all valid status values', () => {
    const validStatuses: FileUploadStatus[] = ['pending', 'processing', 'completed', 'failed'];
    
    validStatuses.forEach(status => {
      const upload: FileUploadDTO = {
        id: `upload-${status}`,
        filename: 'test.csv',
        bank: 'bank-456',
        format: 'csv',
        status: status,
        transaction_count: 10,
        uploaded_at: '2026-08-18T10:00:00Z'
      };

      expect(upload.status).toBe(status);
    });
  });
});
