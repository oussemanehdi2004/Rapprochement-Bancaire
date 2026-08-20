/**
 * DTO pour les données de rapports de fraude
 * Aligné sur la structure backend ReportsDataDTO
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
  total_transactions?: number;
}

export interface ReportsDataDTO {
  total_transactions: number;
  fraud_count: number;
  fraud_rate: number;
  blocked_amount: number;
  category_breakdown: CategoryBreakdownDTO[];
  time_series_data: TimeSeriesDataDTO[];
}

export function toSummary(dto: ReportsDataDTO): FraudSummaryDTO {
  return {
    total_transactions: dto.total_transactions,
    fraud_detected: dto.fraud_count,
    fraud_rate: dto.fraud_rate,
    total_amount: dto.blocked_amount,
    blocked_amount: dto.blocked_amount,
  };
}

export function toTimeSeries(dto: ReportsDataDTO): TimeSeriesDataDTO[] {
  return (dto.time_series_data || []).map(ts => ({
    date: ts.date,
    fraud_count: ts.fraud_count,
    total_count: ts.total_transactions ?? ts.total_count ?? 0,
  }));
}
