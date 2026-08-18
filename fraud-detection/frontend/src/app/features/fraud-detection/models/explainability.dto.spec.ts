import { ExplainabilityDTO } from './explainability.dto';
import { ShapContributionDTO } from './shap-contribution.dto';

describe('ExplainabilityDTO', () => {
  const mockShapContributions: ShapContributionDTO[] = [
    {
      feature: 'amount',
      value: 0.23,
      direction: 'positive'
    },
    {
      feature: 'transaction_type',
      value: -0.15,
      direction: 'negative'
    }
  ];

  it('should create a valid ExplainabilityDTO', () => {
    const explainability: ExplainabilityDTO = {
      summary: 'Transaction suspecte détectée',
      factors: ['Montant élevé', 'Type de transaction inhabituel'],
      shap_contributions: mockShapContributions
    };

    expect(explainability.summary).toBe('Transaction suspecte détectée');
    expect(explainability.factors).toHaveLength(2);
    expect(explainability.shap_contributions).toHaveLength(2);
  });

  it('should handle empty factors array', () => {
    const explainability: ExplainabilityDTO = {
      summary: 'Aucune anomalie détectée',
      factors: [],
      shap_contributions: []
    };

    expect(explainability.factors).toHaveLength(0);
    expect(explainability.shap_contributions).toHaveLength(0);
  });

  it('should handle optional shap_contributions', () => {
    const explainability: ExplainabilityDTO = {
      summary: 'Transaction validée',
      factors: ['Montant normal']
    };

    expect(explainability.shap_contributions).toBeUndefined();
  });

  it('should include meaningful summary', () => {
    const explainability: ExplainabilityDTO = {
      summary: 'Bloqué par conformité : Mot-clé sensible détecté',
      factors: ['Mot-clé sensible détecté (LAB/FT)']
    };

    expect(explainability.summary).toContain('conformité');
    expect(explainability.summary.length).toBeGreaterThan(10);
  });

  it('should provide detailed factor information', () => {
    const explainability: ExplainabilityDTO = {
      summary: 'Fraude détectée',
      factors: [
        'Montant exceptionnel (x10 supérieur à la moyenne)',
        'Horaire atypique (3h du matin)',
        'Nouveau bénéficiaire'
      ],
      shap_contributions: mockShapContributions
    };

    expect(explainability.factors).toHaveLength(3);
    expect(explainability.factors[0]).toContain('Montant');
    expect(explainability.factors[1]).toContain('Horaire');
    expect(explainability.factors[2]).toContain('bénéficiaire');
  });

  it('should link factors with SHAP contributions', () => {
    const explainability: ExplainabilityDTO = {
      summary: 'Analyse ML',
      factors: ['amount', 'transaction_type'],
      shap_contributions: mockShapContributions
    };

    expect(explainability.factors.length).toBe(explainability.shap_contributions?.length);
  });
});
