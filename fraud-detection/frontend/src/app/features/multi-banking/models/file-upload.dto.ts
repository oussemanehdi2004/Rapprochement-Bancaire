/**
 * DTO pour les informations de téléchargement de fichiers
 * Correspond au schéma FileUpload dans api-spec.yaml
 */
import { ProcessingStatus } from '../../../core/types/index';

export type FileUploadStatus = ProcessingStatus;

export interface FileUploadDTO {
  id: string;
  filename: string;
  bank: string;
  format: string;
  status: FileUploadStatus;
  transaction_count: number;
  uploaded_at: string;
  error_message?: string | null;
}
