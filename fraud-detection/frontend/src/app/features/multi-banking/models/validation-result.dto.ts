/**
 * DTO pour le résultat de validation
 * Correspond au schéma ValidationResult dans api-spec.yaml
 */
export interface ValidationErrorDTO {
  line_number: number;
  error: string;
  field: string;
}

export interface ValidationResultDTO {
  valid_count: number;
  invalid_count: number;
  error_count?: number;
  errors: ValidationErrorDTO[];
}
