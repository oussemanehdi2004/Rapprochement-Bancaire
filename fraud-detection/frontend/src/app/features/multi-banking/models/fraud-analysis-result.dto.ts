/**
 * DTO pour le résultat d'analyse de fraude
 * Correspond au schéma FraudAnalysisResult dans api-spec.yaml
 */
export interface FraudAnalysisResultDTO {
  transaction_reference: string;
  isFraud: boolean;
  fraudProbability: number;
  reconciliationStatus: string;
  ruleCategory?: string | null;
}
