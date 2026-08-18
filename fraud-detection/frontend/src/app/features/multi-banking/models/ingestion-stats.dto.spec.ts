import { IngestionStatsDTO } from './ingestion-stats.dto';

describe('IngestionStatsDTO', () => {
  it('should create a valid IngestionStatsDTO', () => {
    const stats: IngestionStatsDTO = {
      total_files: 100,
      successful: 85,
      failed: 10,
      pending: 5,
      total_transactions: 15000
    };

    expect(stats.total_files).toBe(100);
    expect(stats.successful).toBe(85);
    expect(stats.failed).toBe(10);
    expect(stats.pending).toBe(5);
    expect(stats.total_transactions).toBe(15000);
  });

  it('should allow zero values', () => {
    const stats: IngestionStatsDTO = {
      total_files: 0,
      successful: 0,
      failed: 0,
      pending: 0,
      total_transactions: 0
    };

    expect(stats.total_files).toBe(0);
    expect(stats.successful).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.total_transactions).toBe(0);
  });

  it('should calculate success rate correctly', () => {
    const stats: IngestionStatsDTO = {
      total_files: 100,
      successful: 85,
      failed: 10,
      pending: 5,
      total_transactions: 15000
    };

    const successRate = (stats.successful / stats.total_files) * 100;
    expect(successRate).toBe(85);
  });

  it('should calculate failure rate correctly', () => {
    const stats: IngestionStatsDTO = {
      total_files: 100,
      successful: 85,
      failed: 10,
      pending: 5,
      total_transactions: 15000
    };

    const failureRate = (stats.failed / stats.total_files) * 100;
    expect(failureRate).toBe(10);
  });
});
