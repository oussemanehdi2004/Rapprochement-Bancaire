/**
 * DTO pour les seuils de configuration de détection de fraude
 * Correspond aux schémas ThresholdsModel et ThresholdsPatch dans api-spec.yaml
 */
export interface ThresholdsDTO {
  SEUIL_REGLEMENTAIRE?: number;
  SEUIL_APPROCHE_RATIO?: number;
  SEUIL_CASH_OUT?: number;
  SEUIL_MONTANT_ABERRANT?: number;
  RATIO_MONTANT_INHABITUEL?: number;
  SEUIL_JOURS_COMPTE_DORMANT?: number;
  MOTS_CLES_SENSIBLES?: string[];
}
