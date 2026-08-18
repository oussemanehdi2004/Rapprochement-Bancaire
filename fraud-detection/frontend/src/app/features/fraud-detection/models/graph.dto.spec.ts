import { FlaggedAccountDTO, MuleAccountDTO, PageRankResultDTO, CommunityDTO } from './graph.dto';

describe('Graph DTOs', () => {
  describe('FlaggedAccountDTO', () => {
    it('should create a valid FlaggedAccountDTO', () => {
      const account: FlaggedAccountDTO = {
        iban: 'FR7612345678901234567890123',
        alert_count: 15,
        categories: ['SEUIL_REGLEMENTAIRE', 'MOTCLE_SENSIBLE']
      };

      expect(account.iban).toBe('FR7612345678901234567890123');
      expect(account.alert_count).toBe(15);
      expect(account.categories).toHaveLength(2);
    });

    it('should handle accounts with single alert', () => {
      const account: FlaggedAccountDTO = {
        iban: 'FR7698765432109876543210987',
        alert_count: 1,
        categories: ['ANOMALIE_SOLDE']
      };

      expect(account.alert_count).toBe(1);
      expect(account.categories).toHaveLength(1);
    });

    it('should validate IBAN format', () => {
      const account: FlaggedAccountDTO = {
        iban: 'FR7612345678901234567890123',
        alert_count: 5,
        categories: ['TEST']
      };

      expect(account.iban).toMatch(/^FR[A-Z0-9]{25}$/);
    });
  });

  describe('MuleAccountDTO', () => {
    it('should create a valid MuleAccountDTO', () => {
      const account: MuleAccountDTO = {
        iban: 'FR7612345678901234567890123',
        in_count: 100,
        out_count: 95,
        in_out_ratio: 0.95,
        avg_delay_hours: 2.5
      };

      expect(account.in_count).toBe(100);
      expect(account.out_count).toBe(95);
      expect(account.in_out_ratio).toBe(0.95);
    });

    it('should calculate in_out_ratio correctly', () => {
      const account: MuleAccountDTO = {
        iban: 'FR7698765432109876543210987',
        in_count: 80,
        out_count: 75,
        in_out_ratio: 0.9375,
        avg_delay_hours: 1.5
      };

      const calculatedRatio = account.out_count / account.in_count;
      expect(calculatedRatio).toBeCloseTo(account.in_out_ratio, 2);
    });

    it('should identify high-risk mule accounts', () => {
      const account: MuleAccountDTO = {
        iban: 'FR7612345678901234567890123',
        in_count: 200,
        out_count: 195,
        in_out_ratio: 0.975,
        avg_delay_hours: 0.5
      };

      expect(account.in_out_ratio).toBeGreaterThan(0.9);
      expect(account.avg_delay_hours).toBeLessThan(24);
    });
  });

  describe('PageRankResultDTO', () => {
    it('should create a valid PageRankResultDTO', () => {
      const result: PageRankResultDTO = {
        iban: 'FR7612345678901234567890123',
        pagerank_score: 0.85,
        out_degree: 50,
        in_degree: 30
      };

      expect(result.pagerank_score).toBe(0.85);
      expect(result.out_degree).toBe(50);
      expect(result.in_degree).toBe(30);
    });

    it('should validate PageRank score range', () => {
      const result: PageRankResultDTO = {
        iban: 'FR7698765432109876543210987',
        pagerank_score: 0.92,
        out_degree: 75,
        in_degree: 45
      };

      expect(result.pagerank_score).toBeGreaterThanOrEqual(0);
      expect(result.pagerank_score).toBeLessThanOrEqual(1);
    });

    it('should identify high PageRank accounts', () => {
      const result: PageRankResultDTO = {
        iban: 'FR7612345678901234567890123',
        pagerank_score: 0.95,
        out_degree: 100,
        in_degree: 80
      };

      expect(result.pagerank_score).toBeGreaterThan(0.9);
      expect(result.out_degree + result.in_degree).toBeGreaterThan(100);
    });
  });

  describe('CommunityDTO', () => {
    it('should create a valid CommunityDTO', () => {
      const community: CommunityDTO = {
        center_account: 'FR7612345678901234567890123',
        community_members: [
          'FR7698765432109876543210987',
          'FR7655555555555555555555555',
          'FR7633333333333333333333333'
        ],
        community_size: 4
      };

      expect(community.center_account).toBe('FR7612345678901234567890123');
      expect(community.community_members).toHaveLength(3);
      expect(community.community_size).toBe(4);
    });

    it('should handle small communities', () => {
      const community: CommunityDTO = {
        center_account: 'FR7612345678901234567890123',
        community_members: ['FR7698765432109876543210987'],
        community_size: 2
      };

      expect(community.community_size).toBe(2);
      expect(community.community_members).toHaveLength(1);
    });

    it('should validate community size consistency', () => {
      const community: CommunityDTO = {
        center_account: 'FR7612345678901234567890123',
        community_members: [
          'FR7698765432109876543210987',
          'FR7655555555555555555555555'
        ],
        community_size: 3
      };

      expect(community.community_size).toBe(community.community_members.length + 1);
    });
  });
});
