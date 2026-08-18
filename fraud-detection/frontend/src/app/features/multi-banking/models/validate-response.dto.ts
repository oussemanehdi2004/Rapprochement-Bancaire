/**
 * DTO pour la réponse de validation de fichier
 * Correspond au schéma ValidateResponse dans api-spec.yaml
 */
import { ValidationResultDTO } from './validation-result.dto';

export interface ValidateResponseDTO {
  success: boolean;
  count: number;
  validation: ValidationResultDTO;
}
