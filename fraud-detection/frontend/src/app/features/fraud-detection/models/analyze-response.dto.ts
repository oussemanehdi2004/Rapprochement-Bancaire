/**
 * DTO pour la réponse d'analyse de fraude
 * Correspond au schéma AnalyzeResponse dans api-spec.yaml
 */
import { TransactionOutputDTO } from './transaction-output.dto';

export interface AnalyzeResponseDTO {
  success: boolean;
  data: TransactionOutputDTO[];
}
