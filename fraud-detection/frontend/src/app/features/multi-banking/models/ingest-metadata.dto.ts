/**
 * DTO pour les métadonnées d'ingestion
 * Correspond au schéma IngestMetadata dans api-spec.yaml
 */
import { BankFileFormat } from '../../../core/types/index';

export interface IngestMetadataDTO {
  filename: string;
  format: BankFileFormat;
  tenant_id: string;
  bank_id: string;
  bankmatch_integration_enabled: boolean;
}
