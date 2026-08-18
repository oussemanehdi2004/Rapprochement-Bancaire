/**
 * DTO pour les métadonnées de parsing
 * Correspond au schéma ParseMetadata dans api-spec.yaml
 */
import { BankFileFormat } from '../../../core/types/index';

export interface ParseMetadataDTO {
  filename: string;
  format: BankFileFormat;
  tenant_id: string;
  bank_id: string;
  authenticated_tenant: string;
  authenticated_user: string;
}
