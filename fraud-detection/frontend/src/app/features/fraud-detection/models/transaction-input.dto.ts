/**
 * DTO pour l'entrée de transaction à analyser
 * Correspond au schéma TransactionInput dans api-spec.yaml
 */
export type TransactionType = 'TRANSFER' | 'CASH_OUT' | 'PAYMENT' | string;

export interface TransactionInputDTO {
  tenant_id: string;
  transaction_reference: string;
  id: string;
  date: string;
  description: string;
  amount: number;
  sender_balance_before: number;
  sender_balance_after: number;
  receiver_balance_before: number;
  receiver_balance_after: number;
  transaction_type: TransactionType;
  account_iban?: string | null;
  beneficiary_iban?: string | null;
  sender_account?: string | null;
  receiver_account?: string | null;
  device_id?: string | null;
  device_fingerprint?: string | null;
  ip_address?: string | null;
  country?: string | null;
  city?: string | null;
}
