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
  id?: string;
  date?: string;
  description?: string;
  amount?: number;
  score?: number;
  confidence?: string;
  explainability?: {
    summary?: string;
    factors?: string[];
    shap_contributions?: any[];
  };
  shap_contributions?: any[];
}
