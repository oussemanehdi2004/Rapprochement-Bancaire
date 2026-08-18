import { ThresholdsDTO } from './thresholds.dto';

describe('ThresholdsDTO', () => {
  it('should create a valid ThresholdsDTO with all fields', () => {
    const thresholds: ThresholdsDTO = {
      SEUIL_REGLEMENTAIRE: 10000,
      SEUIL_APPROCHE_RATIO: 0.9,
      SEUIL_CASH_OUT: 5000,
      SEUIL_MONTANT_ABERRANT: 1_000_000_000,
      RATIO_MONTANT_INHABITUEL: 8,
      SEUIL_JOURS_COMPTE_DORMANT: 90,
      MOTS_CLES_SENSIBLES: ['CASINO', 'PARIS', 'POKER', 'BET', 'PARI']
    };

    expect(thresholds.SEUIL_REGLEMENTAIRE).toBe(10000);
    expect(thresholds.SEUIL_APPROCHE_RATIO).toBe(0.9);
    expect(thresholds.SEUIL_CASH_OUT).toBe(5000);
    expect(thresholds.MOTS_CLES_SENSIBLES).toHaveLength(5);
  });

  it('should create a ThresholdsDTO with partial fields', () => {
    const thresholds: ThresholdsDTO = {
      SEUIL_REGLEMENTAIRE: 15000
    };

    expect(thresholds.SEUIL_REGLEMENTAIRE).toBe(15000);
    expect(thresholds.SEUIL_APPROCHE_RATIO).toBeUndefined();
  });

  it('should handle empty MOTS_CLES_SENSIBLES array', () => {
    const thresholds: ThresholdsDTO = {
      MOTS_CLES_SENSIBLES: []
    };

    expect(thresholds.MOTS_CLES_SENSIBLES).toHaveLength(0);
  });

  it('should validate numeric thresholds', () => {
    const thresholds: ThresholdsDTO = {
      SEUIL_REGLEMENTAIRE: 10000,
      SEUIL_APPROCHE_RATIO: 0.9,
      SEUIL_CASH_OUT: 5000,
      SEUIL_MONTANT_ABERRANT: 1_000_000_000,
      RATIO_MONTANT_INHABITUEL: 8,
      SEUIL_JOURS_COMPTE_DORMANT: 90
    };

    expect(thresholds.SEUIL_REGLEMENTAIRE).toBeGreaterThan(0);
    expect(thresholds.SEUIL_APPROCHE_RATIO).toBeGreaterThan(0);
    expect(thresholds.SEUIL_APPROCHE_RATIO).toBeLessThanOrEqual(1);
    expect(thresholds.SEUIL_JOURS_COMPTE_DORMANT).toBeGreaterThan(0);
  });

  it('should handle sensitive keywords in different languages', () => {
    const thresholds: ThresholdsDTO = {
      MOTS_CLES_SENSIBLES: [
        'CASINO', 'PARIS', 'POKER',
        'GAMBLING', 'BETTING', 'CASINO',
        'JEU', 'PARIE', 'GAINS'
      ]
    };

    expect(thresholds.MOTS_CLES_SENSIBLES).toHaveLength(9);
    expect(thresholds.MOTS_CLES_SENSIBLES).toContain('CASINO');
    expect(thresholds.MOTS_CLES_SENSIBLES).toContain('GAMBLING');
  });

  it('should allow threshold updates', () => {
    const original: ThresholdsDTO = {
      SEUIL_REGLEMENTAIRE: 10000,
      SEUIL_CASH_OUT: 5000
    };

    const updated: ThresholdsDTO = {
      ...original,
      SEUIL_REGLEMENTAIRE: 15000
    };

    expect(updated.SEUIL_REGLEMENTAIRE).toBe(15000);
    expect(updated.SEUIL_CASH_OUT).toBe(5000);
  });

  it('should validate ratio thresholds', () => {
    const thresholds: ThresholdsDTO = {
      SEUIL_APPROCHE_RATIO: 0.85,
      RATIO_MONTANT_INHABITUEL: 7.5
    };

    expect(thresholds.SEUIL_APPROCHE_RATIO).toBeGreaterThanOrEqual(0);
    expect(thresholds.SEUIL_APPROCHE_RATIO).toBeLessThanOrEqual(1);
    expect(thresholds.RATIO_MONTANT_INHABITUEL).toBeGreaterThan(0);
  });

  it('should handle large amount thresholds', () => {
    const thresholds: ThresholdsDTO = {
      SEUIL_MONTANT_ABERRANT: 1_000_000_000
    };

    expect(thresholds.SEUIL_MONTANT_ABERRANT).toBe(1_000_000_000);
    expect(thresholds.SEUIL_MONTANT_ABERRANT).toBeGreaterThan(1_000_000);
  });
});
