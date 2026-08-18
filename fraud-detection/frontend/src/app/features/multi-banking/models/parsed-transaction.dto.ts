/**
 * DTO pour une transaction bancaire parsée
 * Correspond au schéma ParsedTransaction dans api-spec.yaml
 */
export interface ParsedTransactionDTO {
  tenant_id: string;
  source_line_hash: string;
  reference: string;
  value_date: string;
  label: string;
  amount: number;
  balance_before?: number | null;
  balance_after?: number | null;
  account_balance?: number | null;
  account_iban: string;
  counterparty_iban?: string | null;
}
