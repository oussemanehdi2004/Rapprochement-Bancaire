/**
 * DTO pour l'explicabilité des décisions de fraude
 * Correspond au schéma Explainability dans api-spec.yaml
 */
import { ShapContributionDTO } from './shap-contribution.dto';

export interface ExplainabilityDTO {
  summary: string;
  factors: string[];
  shap_contributions?: ShapContributionDTO[];
}
