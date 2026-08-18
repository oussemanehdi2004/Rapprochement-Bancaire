import { ShapContributionDTO } from './shap-contribution.dto';

describe('ShapContributionDTO', () => {
  it('should create a valid ShapContributionDTO', () => {
    const contribution: ShapContributionDTO = {
      feature: 'amount',
      value: 0.23,
      direction: 'positive'
    };

    expect(contribution.feature).toBe('amount');
    expect(contribution.value).toBe(0.23);
    expect(contribution.direction).toBe('positive');
  });

  it('should create a valid negative contribution', () => {
    const contribution: ShapContributionDTO = {
      feature: 'transaction_type',
      value: -0.15,
      direction: 'negative'
    };

    expect(contribution.feature).toBe('transaction_type');
    expect(contribution.value).toBe(-0.15);
    expect(contribution.direction).toBe('negative');
  });

  it('should validate direction values', () => {
    const validDirections: Array<'positive' | 'negative'> = ['positive', 'negative'];
    
    validDirections.forEach(direction => {
      const contribution: ShapContributionDTO = {
        feature: 'test_feature',
        value: 0.1,
        direction: direction
      };

      expect(contribution.direction).toBe(direction);
    });
  });

  it('should handle zero contribution values', () => {
    const contribution: ShapContributionDTO = {
      feature: 'neutral_feature',
      value: 0,
      direction: 'positive'
    };

    expect(contribution.value).toBe(0);
  });

  it('should validate contribution value range', () => {
    const contribution: ShapContributionDTO = {
      feature: 'amount',
      value: 0.5,
      direction: 'positive'
    };

    expect(contribution.value).toBeGreaterThanOrEqual(-1);
    expect(contribution.value).toBeLessThanOrEqual(1);
  });

  it('should include meaningful feature names', () => {
    const features = ['amount', 'transaction_type', 'device_fingerprint', 'geo_location', 'time_of_day'];
    
    features.forEach(feature => {
      const contribution: ShapContributionDTO = {
        feature: feature,
        value: 0.1,
        direction: 'positive'
      };

      expect(contribution.feature).toBe(feature);
      expect(contribution.feature.length).toBeGreaterThan(0);
    });
  });
});
