/**
 * DTO pour la réponse d'ingestion complète
 * Correspond au schéma IngestResponse dans api-spec.yaml
 */
import { FraudAnalysisResultDTO } from './fraud-analysis-result.dto';
import { IngestMetadataDTO } from './ingest-metadata.dto';

export interface BankMatchResultDTO {
  session_id?: string;
  matching?: any;
  error?: string;
}

export interface IngestResponseDTO {
  success: boolean;
  parsed_count: number;
  fraud_result: {
    transactions: FraudAnalysisResultDTO[];
  };
  bankmatch_result: BankMatchResultDTO | null;
  metadata: IngestMetadataDTO;
}
