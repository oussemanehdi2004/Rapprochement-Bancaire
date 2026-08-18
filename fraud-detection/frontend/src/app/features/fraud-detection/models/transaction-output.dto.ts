/**
 * DTO pour la sortie de transaction analysée
 * Correspond au schéma TransactionOutput dans api-spec.yaml
 */
import { ExplainabilityDTO } from './explainability.dto';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type ReconciliationStatus = 'MATCHED' | 'UNMATCHED' | 'SUSPICIOUS';

export interface TransactionOutputDTO {
  tenant_id?: string;
  transaction_reference: string;
  id: string;
  date: string;
  description: string;
  amount: number;
  isFraud: boolean;
  fraudProbability: number;
  score?: number;
  confidence?: ConfidenceLevel;
  reconciliationStatus: ReconciliationStatus;
  ruleCategory?: string | null;
  explainability: ExplainabilityDTO;
}
