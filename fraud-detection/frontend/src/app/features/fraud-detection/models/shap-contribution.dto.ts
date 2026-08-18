/**
 * DTO pour les contributions SHAP (explicabilité ML)
 * Correspond au schéma ShapContribution dans api-spec.yaml
 */
export interface ShapContributionDTO {
  feature: string;
  value: number;
  direction: 'positive' | 'negative';
}
