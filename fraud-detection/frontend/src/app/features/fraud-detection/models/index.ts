/**
 * Point d'entrée centralisé pour tous les DTOs Fraud Detection
 * Facilite l'importation et maintient la cohérence des types
 */

export type { ShapContributionDTO } from './shap-contribution.dto';
export type { ExplainabilityDTO } from './explainability.dto';
export type { TransactionInputDTO, TransactionType } from './transaction-input.dto';
export type { TransactionOutputDTO, ConfidenceLevel, ReconciliationStatus } from './transaction-output.dto';
export type { AnalyzeResponseDTO } from './analyze-response.dto';
export type { ThresholdsDTO } from './thresholds.dto';
export type { FlaggedAccountDTO, MuleAccountDTO, PageRankResultDTO, CommunityDTO } from './graph.dto';
export type { FraudSummaryDTO, CategoryBreakdownDTO, TimeSeriesDataDTO, ReportsDataDTO } from './reports.dto';
export type { NotificationDTO, NotificationType } from './notification.dto';

// Export des modèles existants pour compatibilité
export type { FraudAlert, FraudSeverity, FraudCategory, FraudExplainability, FraudDashboardStats } from './fraud-alert.model';
