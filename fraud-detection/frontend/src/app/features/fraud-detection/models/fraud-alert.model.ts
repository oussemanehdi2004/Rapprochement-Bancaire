export type FraudSeverity =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type FraudCategory =
  | 'montant_exceptionnel'
  | 'nouvel_iban'
  | 'iban_modifie'
  | 'double_paiement'
  | 'fractionnement'
  | 'paiement_repetitif'
  | 'horaire_atypique'
  | 'fournisseur_risque'
  | 'reseau_fraude'
  | 'comportement_utilisateur'
  | 'remboursement_suspect'
  | 'paiement_circulaire'
  | 'compte_rarement_utilise'
  | 'reference_similaire'
  | 'collusion'
  | 'SEUIL_REGLEMENTAIRE'
  | 'ANOMALIE_SOLDE'
  | 'TRANSACTION_SUSPECTE'
  | 'NON_CATEGORISE';
export interface ShapContribution {
  feature: string;
  value: number;
  direction: 'positive' | 'negative';
}
export interface FraudExplainability {
  summary: string;
  factors: string[];
  shap_contributions?: ShapContribution[];
}

export interface FraudAlert {
  id: string;
  tenantId: string;
  transactionId: string;
  date: string;
  description: string;
  amount: number;
  beneficiary?: string;
  iban?: string;
  category?: FraudCategory;
  severity: FraudSeverity;
  fraudScore: number; // 0-100, unified score across rules + ML + graph
  status: 'new' | 'investigating' | 'confirmed' | 'dismissed';
  reconciliationStatus?: 'MATCHED' | 'UNMATCHED' | 'SUSPICIOUS';
  explainability: FraudExplainability;
}

export interface FraudDashboardStats {
  totalAlerts: number;
  critical: number;
  high: number;
  underInvestigation: number;
  totalAmountAtRisk: number;
}