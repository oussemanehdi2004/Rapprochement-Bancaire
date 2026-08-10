import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { FraudAlertsService } from '../services/fraud-alerts.service';
import { DefaultService, TransactionInput, TransactionOutput } from '../../../api';
import { GraphService, GraphAccountNode, GraphNetworkResponse } from '../services/graph.service';
import { FraudAlert } from '../models/fraud-alert.model';
import { ConfigService, ThresholdsConfig } from '../services/config.service';

export type TabId = 'overview' | 'hybrid' | 'graph' | 'shap' | 'rules' | 'config';

export interface CsvTransaction {
  id?: string | number;
  amount: number;
  tenant_id?: string;
  transaction_reference?: string;
  date?: string;
  description?: string;
  sender_balance_before?: number;
  sender_balance_after?: number;
  receiver_balance_before?: number;
  receiver_balance_after?: number;
  transaction_type?: string;
  account_iban?: string;
  beneficiary_iban?: string;
  [key: string]: any;
}

export interface GraphNodePosition {
  iban: string;
  x: number;
  y: number;
  isCenter: boolean;
}

@Component({
  selector: 'app-fraud-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fraud-dashboard.component.html'
})
export class FraudDashboardComponent {
  // Services injectés
  private http = inject(HttpClient);
  public alertsService = inject(FraudAlertsService);
  private graphService = inject(GraphService);
  private apiService = inject(DefaultService); 
  
  // Exposition de Math pour le template HTML
  protected readonly Math = Math;

  // Colonnes requises & colonnes numériques pour CSV
  private readonly REQUIRED_COLUMNS = ['id', 'amount'];
  private readonly NUMERIC_COLUMNS = [
    'amount', 
    'sender_balance_before', 
    'sender_balance_after', 
    'receiver_balance_before', 
    'receiver_balance_after'
  ];

  // Données de démonstration
  public readonly mockTransactionsToAnalyze: CsvTransaction[] = [
    {
      tenant_id: "tenant-123", transaction_reference: "mongo_001", id: "tx_seuil",
      date: "2026-07-24T10:00:00Z", description: "Virement fournisseur externe",
      amount: 15000.0, sender_balance_before: 50000.0, sender_balance_after: 35000.0,
      receiver_balance_before: 0.0, receiver_balance_after: 15000.0, transaction_type: "TRANSFER"
    },
    {
      tenant_id: "tenant-123", transaction_reference: "mongo_002", id: "tx_approche",
      date: "2026-07-24T10:02:00Z", description: "Virement fournisseur B",
      amount: 9500.0, sender_balance_before: 20000.0, sender_balance_after: 10500.0,
      receiver_balance_before: 0.0, receiver_balance_after: 9500.0, transaction_type: "TRANSFER"
    },
    {
      tenant_id: "tenant-123", transaction_reference: "mongo_003", id: "tx_cash",
      date: "2026-07-24T10:05:00Z", description: "Retrait exceptionnel PARIS",
      amount: 6000.0, sender_balance_before: 10000.0, sender_balance_after: 4000.0,
      receiver_balance_before: 0.0, receiver_balance_after: 0.0, transaction_type: "CASH_OUT"
    },
    {
      tenant_id: "tenant-123", transaction_reference: "mongo_004", id: "tx_casino",
      date: "2026-07-24T10:07:00Z", description: "Virement casino en ligne",
      amount: 250.0, sender_balance_before: 2000.0, sender_balance_after: 1750.0,
      receiver_balance_before: 0.0, receiver_balance_after: 250.0, transaction_type: "TRANSFER"
    },
    {
      tenant_id: "tenant-123", transaction_reference: "mongo_005", id: "tx_dup_1",
      date: "2026-07-24T11:00:00Z", description: "Paiement Fournisseur ABC",
      amount: 2500.0, sender_balance_before: 8000.0, sender_balance_after: 5500.0,
      receiver_balance_before: 0.0, receiver_balance_after: 2500.0, transaction_type: "PAYMENT"
    },
    {
      tenant_id: "tenant-123", transaction_reference: "mongo_006", id: "tx_dup_2",
      date: "2026-07-24T11:01:00Z", description: "Paiement Fournisseur ABC",
      amount: 2500.0, sender_balance_before: 5500.0, sender_balance_after: 3000.0,
      receiver_balance_before: 0.0, receiver_balance_after: 2500.0, transaction_type: "PAYMENT"
    },
    {
      tenant_id: "tenant-123", transaction_reference: "mongo_007", id: "tx_rep_1",
      date: "2026-07-24T12:00:00Z", description: "Abonnement mensuel Service X",
      amount: 800.0, sender_balance_before: 3000.0, sender_balance_after: 2200.0,
      receiver_balance_before: 0.0, receiver_balance_after: 800.0, transaction_type: "PAYMENT"
    },
    {
      tenant_id: "tenant-123", transaction_reference: "mongo_008", id: "tx_rep_2",
      date: "2026-07-24T12:01:00Z", description: "Abonnement mensuel Service X",
      amount: 800.0, sender_balance_before: 2200.0, sender_balance_after: 1400.0,
      receiver_balance_before: 0.0, receiver_balance_after: 800.0, transaction_type: "PAYMENT"
    },
    {
      tenant_id: "tenant-123", transaction_reference: "mongo_009", id: "tx_rep_3",
      date: "2026-07-24T12:02:00Z", description: "Abonnement mensuel Service X",
      amount: 800.0, sender_balance_before: 1400.0, sender_balance_after: 600.0,
      receiver_balance_before: 0.0, receiver_balance_after: 800.0, transaction_type: "PAYMENT"
    },
    {
      tenant_id: "tenant-123", transaction_reference: "mongo_010", id: "tx_frac_1",
      date: "2026-07-24T13:00:00Z", description: "Virement partiel A",
      amount: 4000.0, sender_balance_before: 20000.0, sender_balance_after: 16000.0,
      receiver_balance_before: 0.0, receiver_balance_after: 4000.0, transaction_type: "TRANSFER"
    },
    {
      tenant_id: "tenant-123", transaction_reference: "mongo_011", id: "tx_frac_2",
      date: "2026-07-24T13:10:00Z", description: "Virement partiel B",
      amount: 4000.0, sender_balance_before: 16000.0, sender_balance_after: 12000.0,
      receiver_balance_before: 0.0, receiver_balance_after: 4000.0, transaction_type: "TRANSFER"
    },
    {
      tenant_id: "tenant-123", transaction_reference: "mongo_012", id: "tx_frac_3",
      date: "2026-07-24T13:20:00Z", description: "Virement partiel C",
      amount: 3000.0, sender_balance_before: 12000.0, sender_balance_after: 9000.0,
      receiver_balance_before: 0.0, receiver_balance_after: 3000.0, transaction_type: "TRANSFER"
    },
    {
      tenant_id: "tenant-123", transaction_reference: "mongo_013", id: "tx_clean",
      date: "2026-07-24T14:00:00Z", description: "Achat fournitures de bureau",
      amount: 45.0, sender_balance_before: 1000.0, sender_balance_after: 955.0,
      receiver_balance_before: 0.0, receiver_balance_after: 45.0, transaction_type: "PAYMENT"
    }
  ];

  // Exposition des signaux du service
  public filteredAlerts = this.alertsService.alerts;
  public loading = this.alertsService.loading;
  public errorMessage = signal<string | null>(null);
  
  // Signal pour stocker les résultats des cas Supabase
  public supabaseResults = signal<TransactionOutput[] | null>(null); 
  
  // Filtres UI
  public statusFilter = signal<string>('tous');
  public severityFilter = signal<string>('tous');
  public search = signal<string>('');

  // ===== SEUILS CONFIGURABLES =====
  public mlThreshold: number = 50; 
  public criticalAmountThreshold: number = 5000;
  public autoBlockEnabled: boolean = false;

  // Signal réactif pour diffuser le seuil appliqué aux calculs
  public appliedMlThreshold = signal<number>(50);

  // ===== GESTION DES ONGLETS =====
  public activeTab = signal<TabId>('overview');

  public readonly tabs: ReadonlyArray<{ id: TabId; icon: string; label: string; ready: boolean }> = [
    { id: 'overview', icon: '📊', label: 'Vue d\'ensemble', ready: true },
    { id: 'hybrid', icon: '🔍', label: 'Détection Hybride', ready: true },
    { id: 'graph', icon: '🕸️', label: 'Réseaux & Graphe', ready: true },
    { id: 'shap', icon: '📈', label: 'Explicabilité SHAP', ready: true },
    { id: 'rules', icon: '📋', label: 'Règles Métier', ready: true },
    { id: 'config', icon: '⚙️', label: 'Config Seuils', ready: true },
  ];

  public setTab(id: TabId): void {
    this.activeTab.set(id);
    if (id === 'config' && !this.editableThresholds()) {
      this.loadThresholdsFromApi();
    }
  }

  /**
   * Sauvegarde et applique la nouvelle configuration de seuil
   */
  public saveConfig(): void {
    console.log(`Nouveau seuil appliqué : ${this.mlThreshold}%`);
    this.appliedMlThreshold.set(Number(this.mlThreshold));
    this.configSaved.set(true);
    setTimeout(() => this.configSaved.set(false), 3000);
  }

  private resetLocalAlerts(): void {
    if (typeof (this.alertsService as any).clearAlerts === 'function') {
      (this.alertsService as any).clearAlerts();
    } else if ((this.alertsService as any).alerts?.set) {
      (this.alertsService as any).alerts.set([]);
    }
  }

  // ===== ONGLET RÈGLES MÉTIER =====
  private readonly RULE_CATEGORY_LABELS: Record<string, string> = {
    SEUIL_REGLEMENTAIRE: 'Seuil réglementaire TRACFIN (>10k€)',
    SEUIL_APPROCHE: 'Approche du seuil (90% de 10k€)',
    RETRAIT_CASH_IMPORTANT: 'Retrait cash important (>5k€)',
    MOTCLE_SENSIBLE: 'Mot-clé sensible LAB/FT',
    MONTANT_EXCEPTIONNEL: 'Montant exceptionnel vs historique',
    COMPTE_RAREMENT_UTILISE: 'Compte rarement utilisé',
    NOUVEL_IBAN: 'Nouvel IBAN bénéficiaire',
    PAIEMENT_DUPLIQUE: 'Paiement dupliqué',
    PAIEMENT_REPETITIF: 'Paiement répétitif',
    FRACTIONNEMENT_SUSPECT: 'Fractionnement de paiements',
    RESEAU_FRAUDE: 'Réseau de fraude (graphe)',
    PAIEMENT_CIRCULAIRE: 'Paiement circulaire (graphe)',
    COLLUSION_SUSPECTE: 'Collusion suspecte (graphe)',
    DONNEE_INVALIDE: 'Donnée invalide',
    NON_CATEGORISE: 'Non catégorisé',
  };

  public ruleCategoryLabel(cat: string): string {
    return this.RULE_CATEGORY_LABELS[cat] ?? cat;
  }

  public ruleCategoryStats = computed(() => {
    const groups = new Map<string, { count: number; amount: number; sampleFactor: string }>();
    for (const alert of this.filteredAlerts()) {
      const cat = alert.category || 'NON_CATEGORISE';
      if (cat === 'NON_CATEGORISE' && alert.status === 'dismissed') continue;
      const entry = groups.get(cat) ?? { count: 0, amount: 0, sampleFactor: '' };
      entry.count += 1;
      entry.amount += alert.amount || 0;
      if (!entry.sampleFactor && alert.explainability.factors.length > 0) {
        entry.sampleFactor = alert.explainability.factors[0];
      }
      groups.set(cat, entry);
    }
    return Array.from(groups.entries())
      .map(([category, stats]) => ({ category, ...stats }))
      .sort((a, b) => b.count - a.count);
  });

  // ===== ONGLET EXPLICABILITÉ SHAP =====
  public shapFactorStats = computed(() => {
    const groups = new Map<string, { positive: number; negative: number }>();
    
    for (const alert of this.filteredAlerts()) {
      const contributions = alert.explainability.shapContributions ?? [];
      
      for (const c of contributions) {
        const entry = groups.get(c.feature) ?? { positive: 0, negative: 0 };
        if (c.direction === 'positive') {
          entry.positive += 1;
        } else {
          entry.negative += 1;
        }
        groups.set(c.feature, entry);
      }
    }
    
    return Array.from(groups.entries())
      .map(([feature, stats]) => ({ feature, total: stats.positive + stats.negative, ...stats }))
      .sort((a, b) => b.total - a.total);
  });

  public alertsWithMlFactors = computed(() =>
    this.filteredAlerts().filter(a => ((a.explainability as any)?.shapContributions?.length ?? 0) > 0)
  );

  public mlFactorsOf(alert: FraudAlert): string[] {
    const contributions = (alert.explainability as any)?.shapContributions ?? [];
    if (contributions.length > 0) {
      return contributions.map((c: any) => `${c.feature} (${c.direction === 'positive' ? '+' : '-'}${c.value})`);
    }
    return alert.explainability.factors.filter(f => / a contribué (positivement|négativement)$/.test(f));
  }

  public ruleFactorsOf(alert: FraudAlert): string[] {
    return alert.explainability.factors.filter(f => !/ a contribué (positivement|négativement)$/.test(f));
  }

  // ===== CONFIG API SERVICE =====
  private configService = inject(ConfigService);
  public configLoading = signal(false);
  public configError = signal<string | null>(null);
  public configSaved = signal(false);
  public editableThresholds = signal<ThresholdsConfig | null>(null);

  public loadThresholdsFromApi(): void {
    this.configError.set(null);
    this.configSaved.set(false);
    this.configLoading.set(true);
    this.configService.getThresholds().subscribe({
      next: (cfg) => {
        this.editableThresholds.set(cfg);
        this.configLoading.set(false);
      },
      error: (err) => {
        this.configLoading.set(false);
        this.configError.set(`Impossible de charger la configuration: ${err.message}`);
      }
    });
  }

  public saveThresholds(): void {
    const cfg = this.editableThresholds();
    if (!cfg) return;
    this.configError.set(null);
    this.configSaved.set(false);
    this.configLoading.set(true);
    this.configService.updateThresholds(cfg).subscribe({
      next: (updated) => {
        this.editableThresholds.set(updated);
        this.configLoading.set(false);
        this.configSaved.set(true);
      },
      error: (err) => {
        this.configLoading.set(false);
        this.configError.set(`Échec de la sauvegarde: ${err.message}`);
      }
    });
  }

  public updateKeywordsFromInput(value: string): void {
    const cfg = this.editableThresholds();
    if (!cfg) return;
    const list = value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    this.editableThresholds.set({ ...cfg, MOTS_CLES_SENSIBLES: list });
  }

  // ===== ÉTAT DU GRAPHE =====
  public graphTenantId = signal<string>('tenant-123');
  public topAccounts = signal<GraphAccountNode[]>([]);
  public selectedIban = signal<string | null>(null);
  public networkData = signal<GraphNetworkResponse | null>(null);
  public graphLoading = signal(false);
  public graphError = signal<string | null>(null);

  public loadTopAccounts(): void {
    this.graphError.set(null);
    this.graphLoading.set(true);
    this.networkData.set(null);
    this.graphService.getTopAccounts(this.graphTenantId()).subscribe({
      next: (accounts) => {
        this.topAccounts.set(accounts);
        this.graphLoading.set(false);
        if (accounts.length > 0) {
          this.selectAccount(accounts[0].iban);
        } else {
          this.graphError.set('Aucun compte signalé trouvé pour ce tenant_id.');
        }
      },
      error: (err) => {
        this.graphLoading.set(false);
        this.graphError.set(`Impossible de charger les comptes: ${err.message || 'Neo4j indisponible'}`);
      }
    });
  }

  public selectAccount(iban: string): void {
    this.selectedIban.set(iban);
    this.graphService.getAccountNetwork(this.graphTenantId(), iban).subscribe({
      next: (net) => this.networkData.set(net),
      error: (err) => this.graphError.set(`Impossible de charger le réseau: ${err.message}`)
    });
  }

  public graphNodePositions = computed(() => {
    const net = this.networkData();
    if (!net) return [];
    
    const cx = 300, cy = 200, radius = 150;
    const others = net.nodes.filter(n => n !== net.center_iban);
    
    const positions: GraphNodePosition[] = [
      { iban: net.center_iban, x: cx, y: cy, isCenter: true }
    ];
    
    others.forEach((iban, i) => {
      const angle = (2 * Math.PI * i) / Math.max(others.length, 1);
      positions.push({
        iban,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        isCenter: false
      });
    });
    return positions;
  });

  public shortIban(iban: string): string {
    if (!iban) return '';
    return iban.length > 14 ? iban.slice(0, 6) + '…' + iban.slice(-4) : iban;
  }

  public nodePos(iban: string): { x: number; y: number } {
    const found = this.graphNodePositions().find(p => p.iban === iban);
    return found ? { x: found.x, y: found.y } : { x: 300, y: 200 };
  }

  // ===== IMPORT CSV =====
  public importedFileName = signal<string | null>(null);
  public importError = signal<string | null>(null);

  public onFileSelected(event: Event): void {
    this.importError.set(null);
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.importedFileName.set(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const transactions = this.parseCsv(text);
        if (transactions.length === 0) {
          this.importError.set('Aucune transaction valide trouvée dans le fichier.');
          return;
        }
        this.runAnalysis(transactions);
      } catch (e: any) {
        this.importError.set(e.message || 'Erreur de lecture du CSV.');
        console.error('Erreur Import CSV:', e);
      }
    };
    reader.readAsText(file);
  }

  private parseCsv(text: string): CsvTransaction[] {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    const separator = lines[0].includes(';') ? ';' : ',';
    const rawHeader = this.splitCsvLine(lines[0], separator);
    const header = rawHeader.map(h => h.toLowerCase().trim());

    const missingColumns = this.REQUIRED_COLUMNS.filter(col => !header.includes(col));
    if (missingColumns.length > 0) {
      throw new Error(`Format CSV incompatible. Colonnes manquantes : ${missingColumns.join(', ')}`);
    }

    const rows = lines.slice(1);

    return rows
      .map((line, index) => {
        const values = this.splitCsvLine(line, separator);
        const record: Record<string, any> = {};

        header.forEach((col, i) => {
          let val = values[i] ?? '';
          if (this.NUMERIC_COLUMNS.includes(col)) {
            val = val.replace(',', '.');
            record[col] = parseFloat(val) || 0;
          } else {
            record[col] = val;
          }
        });

        const amount = record['amount'] || 0;
        const senderBefore = record['sender_balance_before'] ?? 10000.0;
        const senderAfter = record['sender_balance_after'] ?? Math.max(0, senderBefore - amount);

        return {
          tenant_id: record['tenant_id'] || 'tenant_demo',
          transaction_reference: record['transaction_reference'] || record['id'] || `REF_CSV_${index + 1}`,
          id: String(record['id'] || `TX_${index + 1}`),
          date: record['date'] || new Date().toISOString(),
          description: record['description'] || 'Transaction Importée CSV',
          amount: amount,
          sender_balance_before: senderBefore,
          sender_balance_after: senderAfter,
          receiver_balance_before: record['receiver_balance_before'] ?? 0.0,
          receiver_balance_after: record['receiver_balance_after'] ?? amount,
          transaction_type: record['transaction_type'] || 'TRANSFER',
          account_iban: record['account_iban'] || 'FR7612345678901234567890123',
          beneficiary_iban: record['beneficiary_iban'] || 'FR7698765432109876543210987'
        } as CsvTransaction;
      })
      .filter(r => Boolean(r.id) && !isNaN(r.amount)); 
  }

  private splitCsvLine(line: string, separator: string): string[] {
    return line.split(separator).map(s => s.replace(/^"|"$/g, '').trim());
  }

  public useDemoData(): void {
    this.importError.set(null);
    this.importedFileName.set(null);
    this.supabaseResults.set(null);
    this.resetLocalAlerts();
    this.analyze();
  }

  private runAnalysis(transactions: any[]): void {
    this.errorMessage.set(null);
    this.supabaseResults.set(null);
    this.resetLocalAlerts();

    this.alertsService.analyzeTransactions(transactions).subscribe({
      next: () => console.log('Import CSV analysé avec succès'),
      error: (err: any) => {
        this.errorMessage.set(`Erreur: ${err.message || 'Échec de l\'analyse du fichier importé'}`);
      }
    });
  }

  // ===== KPIS CALCULÉS STRICTEMENT SELON LE SEUIL DÉFINI (appliedMlThreshold) =====

  public totalAnalyzed = computed(() => {
    const supa = this.supabaseResults();
    if (supa && supa.length > 0) return supa.length;
    return this.filteredAlerts().length;
  });

  // Calcul du taux de fraude strictement filtré par le score >= seuil configuré
  public fraudRate = computed(() => {
    const supa = this.supabaseResults();
    const list: any[] = (supa && supa.length > 0) ? supa : this.filteredAlerts();
    const total = list.length;
    if (total === 0) return 0;

    const threshold = this.appliedMlThreshold();

    const fraudCount = list.filter(item => {
      const score = item.fraudScore ?? item.fraud_score ?? item.score ?? 0;
      return score >= threshold;
    }).length;

    return Math.round((fraudCount / total) * 100);
  });

  // Calcul du montant à risque strictement filtré par le score >= seuil configuré
  public totalAtRisk = computed(() => {
    const supa = this.supabaseResults();
    const list: any[] = (supa && supa.length > 0) ? supa : this.filteredAlerts();
    const threshold = this.appliedMlThreshold();

    const suspiciousItems = list.filter(item => {
      const score = item.fraudScore ?? item.fraud_score ?? item.score ?? 0;
      return score >= threshold;
    });

    return suspiciousItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  });

  public globalRiskScore = computed(() => {
    const supa = this.supabaseResults();
    const list: any[] = (supa && supa.length > 0) ? supa : this.filteredAlerts();
    if (list.length === 0) return 0;

    const sumScore = list.reduce((acc, item) => {
      const score = item.fraudScore ?? item.fraud_score ?? item.score ?? 0;
      return acc + score;
    }, 0);

    return Math.round((sumScore / list.length) * 100) / 100;
  });

  public analyze(): void {
    this.errorMessage.set(null);
    this.importError.set(null);
    this.supabaseResults.set(null);
    this.resetLocalAlerts();

    this.alertsService.analyzeTransactions(this.mockTransactionsToAnalyze).subscribe({
      next: (resultats: any) => {
        console.log('Analyse démo terminée avec succès', resultats);
      },
      error: (erreur: any) => {
        console.error('Erreur lors de l\'analyse démo', erreur);
        this.errorMessage.set(`Erreur: ${erreur.message || 'Impossible de se connecter au backend'}`);
      }
    });
  }

  public analyzeSupabaseCases(): void {
    this.errorMessage.set(null);
    this.loading.set(true);
    this.resetLocalAlerts();

    const transactionsSupabase: TransactionInput[] = [
      {
        tenant_id: "tenant-123",
        transaction_reference: "mongo_supa_001",
        id: "tx_montant_except",
        date: "2026-07-27T09:00:00Z",
        description: "Virement urgent fournisseur",
        amount: 900.0,
        sender_balance_before: 5000.0,
        sender_balance_after: 4100.0,
        receiver_balance_before: 0.0,
        receiver_balance_after: 900.0,
        transaction_type: "TRANSFER",
        // @ts-ignore
        account_iban: "FR76-COMPTE-A",
        beneficiary_iban: "FR76-BENEF-A1"
      },
      {
        tenant_id: "tenant-123",
        transaction_reference: "mongo_supa_002",
        id: "tx_compte_dormant",
        date: "2026-07-27T09:05:00Z",
        description: "Virement réactivation compte",
        amount: 500.0,
        sender_balance_before: 1200.0,
        sender_balance_after: 700.0,
        receiver_balance_before: 0.0,
        receiver_balance_after: 500.0,
        transaction_type: "TRANSFER",
        // @ts-ignore
        account_iban: "FR76-COMPTE-B",
        beneficiary_iban: "FR76-BENEF-B1"
      },
      {
        tenant_id: "tenant-123",
        transaction_reference: "mongo_supa_003",
        id: "tx_nouvel_iban",
        date: "2026-07-27T09:10:00Z",
        description: "Virement nouveau bénéficiaire",
        amount: 800.0,
        sender_balance_before: 3000.0,
        sender_balance_after: 2200.0,
        receiver_balance_before: 0.0,
        receiver_balance_after: 800.0,
        transaction_type: "TRANSFER",
        // @ts-ignore
        account_iban: "FR76-COMPTE-C",
        beneficiary_iban: "FR76-BENEF-C-NEW"
      }
    ];

    this.apiService.analyzeTransactions(transactionsSupabase).subscribe({
      next: (resultats: TransactionOutput[]) => {
        this.supabaseResults.set(resultats);
        this.loading.set(false);
      },
      error: (erreur: any) => {
        this.loading.set(false);
        this.errorMessage.set(`Erreur Supabase: ${erreur.message || 'Échec de connexion'}`);
      }
    });
  }

  // ===== FONCTIONS UTILITAIRES D'AFFICHAGE =====
  public getCurrentDate(): string {
    return new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  public getCurrentTime(): string {
    return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  public severityBadgeClass(severity: string): string {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'bg-red-50 text-red-700 border-red-200';
      case 'high': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'medium': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'low': return 'bg-green-50 text-green-700 border-green-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  }

  public severityLabel(severity: string): string {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'Critique';
      case 'high': return 'Élevée';
      case 'medium': return 'Moyenne';
      case 'low': return 'Faible';
      default: return severity || 'Inconnu';
    }
  }

  public getSeverityBgColor(severity: string): string {
    switch (severity?.toLowerCase()) {
      case 'critical': return '#fef2f2';
      case 'high': return '#fff7ed';
      case 'medium': return '#fffbeb';
      case 'low': return '#f0fdf4';
      default: return '#f3f4f6';
    }
  }

  public getSeverityTextColor(severity: string): string {
    switch (severity?.toLowerCase()) {
      case 'critical': return '#dc2626';
      case 'high': return '#ea580c';
      case 'medium': return '#d97706';
      case 'low': return '#16a34a';
      default: return '#374151';
    }
  }

  public getSeverityBorderColor(severity: string): string {
    switch (severity?.toLowerCase()) {
      case 'critical': return '#fecaca';
      case 'high': return '#fed7aa';
      case 'medium': return '#fde68a';
      case 'low': return '#bbf7d0';
      default: return '#e5e7eb';
    }
  }
}