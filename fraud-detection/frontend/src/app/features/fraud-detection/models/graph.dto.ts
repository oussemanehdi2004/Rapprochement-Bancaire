/**
 * DTO pour les résultats d'analyse de graphe
 * Correspond aux schémas FlaggedAccount, MuleAccount, PageRankResult, Community dans api-spec.yaml
 */

export interface FlaggedAccountDTO {
  iban: string;
  alert_count: number;
  categories: string[];
}

export interface MuleAccountDTO {
  iban: string;
  in_count: number;
  out_count: number;
  in_out_ratio: number;
  avg_delay_hours: number;
}

export interface PageRankResultDTO {
  iban: string;
  pagerank_score: number;
  out_degree: number;
  in_degree: number;
}

export interface CommunityDTO {
  center_account: string;
  community_members: string[];
  community_size: number;
}
