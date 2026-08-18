import { FraudSummaryDTO, CategoryBreakdownDTO, TimeSeriesDataDTO, ReportsDataDTO } from './reports.dto';

describe('Reports DTOs', () => {
  describe('FraudSummaryDTO', () => {
    it('should create a valid FraudSummaryDTO', () => {
      const summary: FraudSummaryDTO = {
        total_transactions: 10000,
        fraud_detected: 150,
        fraud_rate: 0.015,
        total_amount: 5_000_000,
        blocked_amount: 750_000
      };

      expect(summary.total_transactions).toBe(10000);
      expect(summary.fraud_detected).toBe(150);
      expect(summary.fraud_rate).toBe(0.015);
    });

    it('should calculate fraud rate correctly', () => {
      const summary: FraudSummaryDTO = {
        total_transactions: 10000,
        fraud_detected: 150,
        fraud_rate: 0.015,
        total_amount: 5_000_000,
        blocked_amount: 750_000
      };

      const calculatedRate = summary.fraud_detected / summary.total_transactions;
      expect(calculatedRate).toBe(summary.fraud_rate);
    });

    it('should handle zero fraud cases', () => {
      const summary: FraudSummaryDTO = {
        total_transactions: 5000,
        fraud_detected: 0,
        fraud_rate: 0,
        total_amount: 2_000_000,
        blocked_amount: 0
      };

      expect(summary.fraud_detected).toBe(0);
      expect(summary.fraud_rate).toBe(0);
      expect(summary.blocked_amount).toBe(0);
    });
  });

  describe('CategoryBreakdownDTO', () => {
    it('should create a valid CategoryBreakdownDTO', () => {
      const breakdown: CategoryBreakdownDTO = {
        category: 'MOTCLE_SENSIBLE',
        count: 45,
        percentage: 30.0
      };

      expect(breakdown.category).toBe('MOTCLE_SENSIBLE');
      expect(breakdown.count).toBe(45);
      expect(breakdown.percentage).toBe(30.0);
    });

    it('should validate percentage range', () => {
      const breakdown: CategoryBreakdownDTO = {
        category: 'SEUIL_REGLEMENTAIRE',
        count: 30,
        percentage: 20.0
      };

      expect(breakdown.percentage).toBeGreaterThanOrEqual(0);
      expect(breakdown.percentage).toBeLessThanOrEqual(100);
    });

    it('should handle different fraud categories', () => {
      const categories = [
        'MOTCLE_SENSIBLE',
        'SEUIL_REGLEMENTAIRE',
        'ANOMALIE_SOLDE',
        'TRANSACTION_SUSPECTE',
        'NON_CATEGORISE'
      ];

      categories.forEach(category => {
        const breakdown: CategoryBreakdownDTO = {
          category: category,
          count: 10,
          percentage: 10.0
        };

        expect(breakdown.category).toBe(category);
      });
    });
  });

  describe('TimeSeriesDataDTO', () => {
    it('should create a valid TimeSeriesDataDTO', () => {
      const timeSeries: TimeSeriesDataDTO = {
        date: '2026-08-18',
        fraud_count: 15,
        total_count: 1000
      };

      expect(timeSeries.date).toBe('2026-08-18');
      expect(timeSeries.fraud_count).toBe(15);
      expect(timeSeries.total_count).toBe(1000);
    });

    it('should validate date format', () => {
      const timeSeries: TimeSeriesDataDTO = {
        date: '2026-08-18',
        fraud_count: 10,
        total_count: 500
      };

      expect(timeSeries.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should calculate fraud rate per day', () => {
      const timeSeries: TimeSeriesDataDTO = {
        date: '2026-08-18',
        fraud_count: 25,
        total_count: 1000
      };

      const dailyRate = timeSeries.fraud_count / timeSeries.total_count;
      expect(dailyRate).toBe(0.025);
    });

    it('should handle days with no fraud', () => {
      const timeSeries: TimeSeriesDataDTO = {
        date: '2026-08-17',
        fraud_count: 0,
        total_count: 800
      };

      expect(timeSeries.fraud_count).toBe(0);
      expect(timeSeries.total_count).toBeGreaterThan(0);
    });
  });

  describe('ReportsDataDTO', () => {
    const mockSummary: FraudSummaryDTO = {
      total_transactions: 10000,
      fraud_detected: 150,
      fraud_rate: 0.015,
      total_amount: 5_000_000,
      blocked_amount: 750_000
    };

    const mockCategoryBreakdown: CategoryBreakdownDTO[] = [
      {
        category: 'MOTCLE_SENSIBLE',
        count: 45,
        percentage: 30.0
      },
      {
        category: 'SEUIL_REGLEMENTAIRE',
        count: 30,
        percentage: 20.0
      }
    ];

    const mockTimeSeries: TimeSeriesDataDTO[] = [
      {
        date: '2026-08-18',
        fraud_count: 15,
        total_count: 1000
      },
      {
        date: '2026-08-17',
        fraud_count: 10,
        total_count: 900
      }
    ];

    it('should create a valid ReportsDataDTO', () => {
      const reports: ReportsDataDTO = {
        summary: mockSummary,
        categoryBreakdown: mockCategoryBreakdown,
        timeSeriesData: mockTimeSeries
      };

      expect(reports.summary).toEqual(mockSummary);
      expect(reports.categoryBreakdown).toHaveLength(2);
      expect(reports.timeSeriesData).toHaveLength(2);
    });

    it('should include all report components', () => {
      const reports: ReportsDataDTO = {
        summary: mockSummary,
        categoryBreakdown: mockCategoryBreakdown,
        timeSeriesData: mockTimeSeries
      };

      expect(reports.summary.total_transactions).toBe(10000);
      expect(reports.categoryBreakdown[0].category).toBe('MOTCLE_SENSIBLE');
      expect(reports.timeSeriesData[0].date).toBe('2026-08-18');
    });

    it('should handle empty breakdown arrays', () => {
      const reports: ReportsDataDTO = {
        summary: mockSummary,
        categoryBreakdown: [],
        timeSeriesData: mockTimeSeries
      };

      expect(reports.categoryBreakdown).toHaveLength(0);
    });

    it('should maintain data consistency across components', () => {
      const reports: ReportsDataDTO = {
        summary: mockSummary,
        categoryBreakdown: mockCategoryBreakdown,
        timeSeriesData: mockTimeSeries
      };

      const totalCategoryCount = reports.categoryBreakdown.reduce((sum, cat) => sum + cat.count, 0);
      expect(totalCategoryCount).toBeLessThanOrEqual(reports.summary.fraud_detected);
    });
  });
});
