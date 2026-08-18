/**
 * DTO pour les données de rapports de fraude
 * Correspond aux schémas ReportsData, FraudSummary, CategoryBreakdown, TimeSeriesData dans api-spec.yaml
 */

export interface FraudSummaryDTO {
  total_transactions: number;
  fraud_detected: number;
  fraud_rate: number;
  total_amount: number;
  blocked_amount: number;
}

export interface CategoryBreakdownDTO {
  category: string;
  count: number;
  percentage: number;
}

export interface TimeSeriesDataDTO {
  date: string;
  fraud_count: number;
  total_count: number;
}

export interface ReportsDataDTO {
  summary: FraudSummaryDTO;
  categoryBreakdown: CategoryBreakdownDTO[];
  timeSeriesData: TimeSeriesDataDTO[];
}
