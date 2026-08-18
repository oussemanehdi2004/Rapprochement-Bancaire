/**
 * Types partagés communs à tous les modules
 * Utilisés pour la cohérence et la réutilisation entre Multi-Banking et Fraud Detection
 */

/**
 * Types de réponse API standardisés
 */
export interface APIResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T = any> extends APIResponse<T[]> {
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Types d'erreurs standardisés
 */
export interface APIError {
  status: number;
  message: string;
  detail?: string;
  code?: string;
}

/**
 * Métadonnées communes
 */
export interface BaseMetadata {
  tenant_id: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

/**
 * Types de statut standardisés
 */
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * Types de fichiers supportés
 */
export type BankFileFormat = 'csv' | 'camt053' | 'mt940' | 'pain.001' | 'pain001';

/**
 * Configuration d'authentification
 */
export interface AuthConfig {
  tokenKey: string;
  tokenType: 'Bearer' | 'Basic' | 'ApiKey';
  headerName?: string;
}

/**
 * Configuration de temps réel (SSE/WebSocket)
 */
export interface RealtimeConfig {
  enabled: boolean;
  endpoint: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}
