/**
 * DTO pour la réponse de parsing de fichier
 * Correspond au schéma ParseResponse dans api-spec.yaml
 */
import { ParsedTransactionDTO } from './parsed-transaction.dto';
import { ParseMetadataDTO } from './parse-metadata.dto';

export interface ParseResponseDTO {
  success: boolean;
  count: number;
  data: ParsedTransactionDTO[];
  metadata: ParseMetadataDTO;
}
