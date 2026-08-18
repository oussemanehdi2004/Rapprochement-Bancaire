/**
 * DTO pour les statistiques d'ingestion de fichiers bancaires
 * Correspond au schéma IngestionStats dans api-spec.yaml
 */
export interface IngestionStatsDTO {
  total_files: number;
  successful: number;
  failed: number;
  pending: number;
  total_transactions: number;
}
