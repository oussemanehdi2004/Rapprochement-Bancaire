import { Component, OnInit, OnDestroy, PLATFORM_ID, computed, inject, signal, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FraudAlertsService, TransactionOutputExtended } from '../services/fraud-alerts.service';
import { DefaultService, TransactionInput, TransactionOutput } from '../../../api';
import { GraphService, GraphAccountNode, GraphNetworkResponse } from '../services/graph.service';
import { FraudAlert, FraudCategory, FraudSeverity } from '../models/fraud-alert.model';
import { ConfigService, ThresholdsConfig } from '../services/config.service';
import { PdfExportService } from '../services/pdf-export.service';
import { DataRefreshService } from '../../../core/services/data-refresh.service';
import { AuthService } from '../../../core/services/auth.service';

import { SeverityBadgeComponent } from '../components/severity-badge/severity-badge.component';
import { CategoryBadgeComponent } from '../components/category-badge/category-badge.component';
import { SkeletonLoaderComponent } from '../components/skeleton-loader/skeleton-loader.component';
import { ThresholdSimulatorComponent, SimulationThresholds } from '../components/threshold-simulator/threshold-simulator.component';
import { FraudChartsComponent } from '../components/fraud-charts/fraud-charts.component';
import { InteractiveGraphComponent } from '../components/interactive-graph/interactive-graph.component';

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

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
  [key: string]: unknown;
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
  imports: [
    CommonModule,
    FormsModule,
    ThresholdSimulatorComponent,
    SeverityBadgeComponent,
    CategoryBadgeComponent,
    FraudChartsComponent,
    InteractiveGraphComponent,
    SkeletonLoaderComponent,
  ],
  templateUrl: './fraud-dashboard.component.html',
  styleUrls: ['./fraud-dashboard.component.css']
})
export class FraudDashboardComponent implements OnInit, OnDestroy {
  // Services injectés
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  public alertsService = inject(FraudAlertsService);
  private graphService = inject(GraphService);
  private apiService = inject(DefaultService);
  private pdfExportService = inject(PdfExportService);
  private dataRefreshService = inject(DataRefreshService);
  private authService = inject(AuthService);

  // Theme — single light theme (dark mode removed, kept for child component inputs)
  public darkMode = signal(false);
  public isBrowser = signal(false);
  public hasLoadError = signal(false);

  // Safe stats access with default values
  public safeStats = computed(() => {
    try {
      const stats = this.alertsService.stats();
      return stats || {
        totalAlerts: 0,
        critical: 0,
        high: 0,
        underInvestigation: 0,
        totalAmountAtRisk: 0
      };
    } catch {
      return { totalAlerts: 0, critical: 0, high: 0, underInvestigation: 0, totalAmountAtRisk: 0 };
    }
  });

  // Exposition de Math pour le template HTML
  protected readonly Math = Math;

  // Time signal that updates every minute to avoid ExpressionChangedAfterItHasBeenCheckedError
  private currentTime = signal('');
  private timeUpdateInterval: ReturnType<typeof setInterval> | undefined;

  public ngOnInit(): void {
    try {
      const isBrowser = isPlatformBrowser(this.platformId);
      this.isBrowser.set(isBrowser);
      if (!isBrowser) {
        return;
      }
      this.updateTime();
      this.timeUpdateInterval = setInterval(() => this.updateTime(), 60000);
      this.destroyRef.onDestroy(() => {
        if (this.timeUpdateInterval) {
          clearInterval(this.timeUpdateInterval);
        }
      });
      this.hasLoadError.set(false);
      this.errorMessage.set(null);

      // Sync graphTenantId from auth service (now loaded eagerly in constructor)
      const currentUser = this.authService?.getCurrentUser();
      if (currentUser?.tenantId) {
        this.graphTenantId.set(currentUser.tenantId);
      }

      // Abonnement au rafraîchissement global (Multi-Banking ingest ou Fraud CSV)
      this.dataRefreshService.refresh$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.ngZone.run(() => {
            // Si on est en mode Supabase, on recharge depuis la persistance
            if (this.analysisMode() === 'supabase') {
              this.loadSupabasePersistedData();
            }
            // Toujours forcer le recalcul des KPIs/graphes
            this.cdr.detectChanges();
            // Si onglet graphe actif, recharger le graphe
            if (this.activeTab() === 'graph') {
              this.loadTopAccounts();
            }
          });
        });
      // Defer initial demo load to after hydration to avoid SSR/client race and ensure vite proxy is ready
      const hasData = (() => {
        try { return (this.filteredAlerts()?.length ?? 0) > 0 || !!this.supabaseResults()?.length; } catch { return false; }
      })();
      if (!hasData) {
        setTimeout(() => {
          this.ngZone.run(() => {
            try {
              const stillEmpty = (() => {
                try { return (this.filteredAlerts()?.length ?? 0) === 0 && !this.supabaseResults()?.length; } catch { return true; }
              })();
              if (stillEmpty) {
                this.useDemoData();
              }
              this.hasLoadError.set(false);
              this.cdr.detectChanges();
            } catch (e) {
              this.hasLoadError.set(true);
              this.errorMessage.set('Erreur d\'initialisation: ' + (e instanceof Error ? e.message : String(e)));
              this.cdr.detectChanges();
            }
          });
        }, 300);
      }
    } catch (e) {
      this.hasLoadError.set(true);
      this.errorMessage.set('Erreur critique: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  public ngOnDestroy(): void {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
    }
  }

  private updateTime(): void {
    this.currentTime.set(
      new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    );
  }

  // Colonnes requises & colonnes numériques pour CSV
  private readonly REQUIRED_COLUMNS = ['id', 'amount'];
  private readonly NUMERIC_COLUMNS = [
    'amount',
    'sender_balance_before',
    'sender_balance_after',
    'receiver_balance_before',
    'receiver_balance_after'
  ];

  // Données de démonstration - SPREAD ACROSS MULTIPLE DATES FOR TIME SERIES
  private getMockTransactionsToAnalyze(tenantId: string): CsvTransaction[] {
    return [
      {
        tenant_id: tenantId, transaction_reference: "mongo_001", id: "tx_seuil",
        date: "2026-08-13T10:00:00Z", description: "Virement fournisseur externe",
        amount: 15000.0, sender_balance_before: 50000.0, sender_balance_after: 35000.0,
        receiver_balance_before: 0.0, receiver_balance_after: 15000.0, transaction_type: "TRANSFER"
      },
      {
        tenant_id: tenantId, transaction_reference: "mongo_002", id: "tx_approche",
        date: "2026-08-13T10:02:00Z", description: "Virement fournisseur B",
        amount: 9500.0, sender_balance_before: 20000.0, sender_balance_after: 10500.0,
        receiver_balance_before: 0.0, receiver_balance_after: 9500.0, transaction_type: "TRANSFER"
      },
      {
        tenant_id: tenantId, transaction_reference: "mongo_003", id: "tx_cash",
        date: "2026-08-14T10:05:00Z", description: "Retrait exceptionnel PARIS",
        amount: 6000.0, sender_balance_before: 10000.0, sender_balance_after: 4000.0,
        receiver_balance_before: 0.0, receiver_balance_after: 0.0, transaction_type: "CASH_OUT"
      },
      {
        tenant_id: tenantId, transaction_reference: "mongo_004", id: "tx_casino",
        date: "2026-08-14T10:07:00Z", description: "Virement casino en ligne",
        amount: 250.0, sender_balance_before: 2000.0, sender_balance_after: 1750.0,
        receiver_balance_before: 0.0, receiver_balance_after: 250.0, transaction_type: "TRANSFER"
      },
      {
        tenant_id: tenantId, transaction_reference: "mongo_005", id: "tx_dup_1",
        date: "2026-08-15T11:00:00Z", description: "Paiement Fournisseur ABC",
        amount: 2500.0, sender_balance_before: 8000.0, sender_balance_after: 5500.0,
        receiver_balance_before: 0.0, receiver_balance_after: 2500.0, transaction_type: "PAYMENT"
      },
      {
        tenant_id: tenantId, transaction_reference: "mongo_006", id: "tx_dup_2",
        date: "2026-08-15T11:01:00Z", description: "Paiement Fournisseur ABC",
        amount: 2500.0, sender_balance_before: 5500.0, sender_balance_after: 3000.0,
        receiver_balance_before: 0.0, receiver_balance_after: 2500.0, transaction_type: "PAYMENT"
      },
      {
        tenant_id: tenantId, transaction_reference: "mongo_007", id: "tx_rep_1",
        date: "2026-08-16T12:00:00Z", description: "Abonnement mensuel Service X",
        amount: 800.0, sender_balance_before: 3000.0, sender_balance_after: 2200.0,
        receiver_balance_before: 0.0, receiver_balance_after: 800.0, transaction_type: "PAYMENT"
      },
      {
        tenant_id: tenantId, transaction_reference: "mongo_008", id: "tx_rep_2",
        date: "2026-08-16T12:01:00Z", description: "Abonnement mensuel Service X",
        amount: 800.0, sender_balance_before: 2200.0, sender_balance_after: 1400.0,
        receiver_balance_before: 0.0, receiver_balance_after: 800.0, transaction_type: "PAYMENT"
      },
      {
        tenant_id: tenantId, transaction_reference: "mongo_009", id: "tx_rep_3",
        date: "2026-08-17T12:02:00Z", description: "Abonnement mensuel Service X",
        amount: 800.0, sender_balance_before: 1400.0, sender_balance_after: 600.0,
        receiver_balance_before: 0.0, receiver_balance_after: 800.0, transaction_type: "PAYMENT"
      },
      {
        tenant_id: tenantId, transaction_reference: "mongo_010", id: "tx_frac_1",
        date: "2026-08-17T13:00:00Z", description: "Virement partiel A",
        amount: 4000.0, sender_balance_before: 20000.0, sender_balance_after: 16000.0,
        receiver_balance_before: 0.0, receiver_balance_after: 4000.0, transaction_type: "TRANSFER"
      },
      {
        tenant_id: tenantId, transaction_reference: "mongo_011", id: "tx_frac_2",
        date: "2026-08-18T13:10:00Z", description: "Virement partiel B",
        amount: 4000.0, sender_balance_before: 16000.0, sender_balance_after: 12000.0,
        receiver_balance_before: 0.0, receiver_balance_after: 4000.0, transaction_type: "TRANSFER"
      },
      {
        tenant_id: tenantId, transaction_reference: "mongo_012", id: "tx_frac_3",
        date: "2026-08-18T13:20:00Z", description: "Virement partiel C",
        amount: 3000.0, sender_balance_before: 12000.0, sender_balance_after: 9000.0,
        receiver_balance_before: 0.0, receiver_balance_after: 3000.0, transaction_type: "TRANSFER"
      },
      {
        tenant_id: tenantId, transaction_reference: "mongo_013", id: "tx_clean",
        date: "2026-08-19T14:00:00Z", description: "Achat fournitures de bureau",
        amount: 45.0, sender_balance_before: 1000.0, sender_balance_after: 955.0,
        receiver_balance_before: 0.0, receiver_balance_after: 45.0, transaction_type: "PAYMENT"
      }
    ];
  }

  // Analysis mode to track data source
  public analysisMode = signal<'local' | 'supabase'>('local');
  private lastImportedTransactions = signal<CsvTransaction[] | null>(null);
  private lastImportedTenantId = signal<string | null>(null);

  // Exposition des signaux du service — defensive for SSR/white-screen
  public filteredAlerts = computed(() => {
    try {
      const rawAlerts = this.alertsService.alerts();
      const list = Array.isArray(rawAlerts) ? rawAlerts : [];
      if (list.length === 0) return [];
      return this.mapTransactionData(list);
    } catch {
      return [];
    }
  });
  
  public loading = this.alertsService.loading;
  public errorMessage = signal<string | null>(null);

  // Signal pour stocker les résultats des cas Supabase
  public supabaseResults = signal<TransactionOutput[] | null>(null);

  // Helper method to map TransactionOutput to TransactionOutputExtended
  private mapTransactionData(items: TransactionOutput[] | TransactionOutputExtended[]): TransactionOutputExtended[] {
    const cfg = this.editableThresholds();
    const seuil_high = cfg?.SEUIL_CONFIDENCE_HIGH ?? 85;
    const seuil_medium = cfg?.SEUIL_CONFIDENCE_MEDIUM ?? 70;
    return items.map(tx => {
      const score = tx.fraudProbability ? Math.round(tx.fraudProbability * 100) : 0;

      let derivedConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      if (score >= seuil_high) derivedConfidence = 'HIGH';
      else if (score >= seuil_medium) derivedConfidence = 'MEDIUM';
      else derivedConfidence = 'LOW';

      let derivedSeverity: 'critical' | 'high' | 'medium' | 'low' = 'low';
      const fraudProb = tx.fraudProbability ?? 0;
      if (fraudProb >= 0.9) derivedSeverity = 'critical';
      else if (fraudProb >= 0.7) derivedSeverity = 'high';
      else if (fraudProb >= 0.5) derivedSeverity = 'medium';
      else derivedSeverity = 'low';

      let derivedCategory = (tx as unknown as { ruleCategory?: string }).ruleCategory || 'NON_CATEGORISE';
      if (derivedCategory === 'NON_CATEGORISE' && tx.explainability?.factors) {
        const factorsStr = tx.explainability.factors.join(' ').toLowerCase();
        if (factorsStr.includes('montant') && (factorsStr.includes('inhabituel') || factorsStr.includes('exceptionnel'))) {
          derivedCategory = 'montant_exceptionnel';
        }
      }

      const rawAny = tx as unknown as Record<string, unknown>;
      const beneficiaryRaw = (rawAny['beneficiary_iban'] as string) || (rawAny['beneficiary'] as string) || (rawAny['receiver_account'] as string) || (rawAny['counterparty_iban'] as string) || null;
      const beneficiaryVal = beneficiaryRaw && String(beneficiaryRaw).trim().length > 0 ? String(beneficiaryRaw) : '—';

      // Derive status: use backend isFraud, but also check auto-block rule
      const autoBlockEnabled = cfg?.AUTO_BLOCK_ENABLED ?? false;
      const seuilMl = cfg?.SEUIL_ML ?? 50;
      const isBlocked = autoBlockEnabled && score >= seuilMl;
      const isFraudFinal = tx.isFraud || isBlocked;

      let derivedStatus: string;
      if (isBlocked) {
        derivedStatus = 'blocked';
      } else if (isFraudFinal) {
        derivedStatus = 'new';
      } else {
        derivedStatus = 'dismissed';
      }

      return {
        ...tx,
        tenantId: tx.tenant_id,
        transactionId: tx.id || tx.transaction_reference,
        category: derivedCategory,
        confidence: derivedConfidence,
        severity: derivedSeverity,
        beneficiary: beneficiaryVal,
        fraudScore: score,
        status: derivedStatus,
        isFraud: isFraudFinal,
        fraudProbability: tx.fraudProbability ?? 0,
        reconciliationStatus: tx.reconciliationStatus ?? 'PENDING',
        explainability: {
          summary: tx.explainability?.summary ?? 'No explanation available',
          factors: tx.explainability?.factors ?? [],
          shap_contributions: tx.explainability?.shap_contributions ?? []
        }
      } as TransactionOutputExtended;
    });
  }

  // Filtres UI
  public statusFilter = signal<string>('tous');
  public severityFilter = signal<string>('tous');
  public search = signal<string>('');

  // ===== SEUILS CONFIGURABLES & SIMULATION WHAT-IF =====
  public mlThreshold: number = 50.0;
  public criticalAmountThreshold: number = 3000;
  public autoBlockEnabled: boolean = false;

  // Signal réactif pour diffuser le seuil appliqué aux calculs
  public appliedMlThreshold = signal<number>(50.0);

  // Signal pour le simulateur What-If (interactif en temps réel)
  public currentSimulation = signal<SimulationThresholds>({
    mlProbability: 50.0,
    abnormalAmount: 10000
  });

  public onSimulationChange(newThresholds: SimulationThresholds): void {
    this.currentSimulation.set(newThresholds);
    this.appliedMlThreshold.set(newThresholds.mlProbability);
    this.mlThreshold = newThresholds.mlProbability;
    if (this.alertsService.alerts().length > 0) {
      this.alertsService.updateStats(this.alertsService.alerts());
    }
    this.ngZone.run(() => {
      this.cdr.detectChanges();
      setTimeout(() => this.cdr.detectChanges(), 30);
    });
  }

  public onMlThresholdSliderChange(value: number): void {
    this.appliedMlThreshold.set(value);
    this.currentSimulation.set({ ...this.currentSimulation(), mlProbability: value });
    if (this.alertsService.alerts().length > 0) {
      this.alertsService.updateStats(this.alertsService.alerts());
    }
    this.ngZone.run(() => {
      this.cdr.detectChanges();
      setTimeout(() => this.cdr.detectChanges(), 30);
    });
  }

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
    if (id === 'graph') {
      // Toujours recharger le graphe à l'ouverture pour refléter les derniers imports (évite cache figé)
      this.loadTopAccounts();
    }
  }

  public saveConfig(): void {
    const newThreshold = Number(this.mlThreshold);
    this.appliedMlThreshold.set(newThreshold);
    this.currentSimulation.set({ mlProbability: newThreshold, abnormalAmount: this.currentSimulation().abnormalAmount });
    // Sync with editableThresholds so next saveThresholds() picks up the value
    const cfg = this.editableThresholds();
    if (cfg) {
      this.editableThresholds.set({ ...cfg, SEUIL_ML: newThreshold, MONTANT_ANORMAL: this.currentSimulation().abnormalAmount });
    }
    if (this.alertsService.alerts().length > 0) {
      this.alertsService.updateStats(this.alertsService.alerts());
    }
    this.configSaved.set(true);
    this.ngZone.run(() => {
      this.cdr.detectChanges();
      setTimeout(() => this.cdr.detectChanges(), 30);
    });
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.configSaved.set(false), 3000);
    }
  }

  private resetLocalAlerts(): void {
    this.alertsService.clearAlerts();
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
    MONTANT_ANORMAL: 'Montant anormal (seuil configuré)',
    SEUIL_MONTANT_CRITIQUE: 'Seuil montant critique dépassé',
  };

  public ruleCategoryLabel(cat: string): string {
    return this.RULE_CATEGORY_LABELS[cat] ?? cat;
  }

  public ruleCategoryStats = computed(() => {
    const groups = new Map<string, { count: number; amount: number; sampleFactor: string; scoreSum: number }>();
    for (const alert of this.filteredAlerts()) {
      const cat = alert.category || 'NON_CATEGORISE';
      if (cat === 'NON_CATEGORISE' && alert.status === 'dismissed') continue;
      const entry = groups.get(cat) ?? { count: 0, amount: 0, sampleFactor: '', scoreSum: 0 };
      entry.count += 1;
      entry.amount += alert.amount || 0;
      entry.scoreSum += (alert.fraudScore ?? 0);
      if (!entry.sampleFactor && alert.explainability.factors.length > 0) {
        entry.sampleFactor = alert.explainability.factors[0];
      }
      groups.set(cat, entry);
    }
    return Array.from(groups.entries())
      .map(([category, stats]) => ({
        category,
        ...stats,
        avgScore: stats.count > 0 ? Math.round(stats.scoreSum / stats.count) : 0
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
  });

  // Couleur de jauge selon le niveau de risque (aligné sur les seuils HIGH≥85 / MEDIUM≥70)
  public gaugeColor(score: number): string {
    if (score >= 85) return '#dc2626'; // critique
    if (score >= 70) return '#ea580c'; // élevé
    if (score >= 40) return '#d97706'; // moyen
    return '#16a34a'; // faible
  }

  // Adaptation pour le composant graphique FraudChartsComponent
  public categoryChartStats = computed(() =>
    this.ruleCategoryStats().map(s => ({
      category: this.ruleCategoryLabel(s.category),
      count: s.count,
    }))
  );

  // ===== DONNÉES TEMPORELLES POUR L'ÉVOLUTION =====
  public timeSeriesData = computed(() => {
    const alerts = this.filteredAlerts();
    if (alerts.length === 0) return [];

    // Extract unique dates from actual transaction data
    const dateMap = new Map<string, { fraudCount: number; totalCount: number }>();
    
    for (const alert of alerts) {
      try {
        const alertDate = alert.date?.split('T')[0];
        if (!alertDate) continue;
        
        const entry = dateMap.get(alertDate) ?? { fraudCount: 0, totalCount: 0 };
        entry.totalCount++;
        if (alert.isFraud) {
          entry.fraudCount++;
        }
        dateMap.set(alertDate, entry);
      } catch (e) {
        // Ignore invalid dates
      }
    }
    
    // Convert to array and sort by date
    const timeSeries = Array.from(dateMap.entries())
      .map(([date, stats]) => ({
        date,
        fraudCount: stats.fraudCount,
        totalCount: stats.totalCount
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // If we have data, return it; otherwise return empty array
    return timeSeries.length > 0 ? timeSeries : [];
  });

  // ===== DONNÉES HORAIRES POUR LA HEATMAP =====
  public hourlyData = computed(() => {
    const alerts = this.filteredAlerts();
    if (alerts.length === 0) return [];

    // Initialiser les 24 heures
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));

    // Compter les alertes par heure
    for (const alert of alerts) {
      try {
        const hour = new Date(alert.date).getHours();
        if (hour >= 0 && hour < 24) {
          hourly[hour].count++;
        }
      } catch (e) {
        // Ignorer les dates invalides
      }
    }

    return hourly;
  });

  // ===== CONVERSION DES DONNÉES DE GRAPHE POUR VIS-NETWORK =====
  public graphNodes = computed(() => {
    const net = this.networkData();
    if (!net) return [];

    const nodes: any[] = [];
    
    // Node central
    nodes.push({
      id: net.center_iban,
      label: this.shortIban(net.center_iban),
      title: `Compte central: ${net.center_iban}`,
      color: '#dc2626',
      size: 30,
      font: { size: 16, color: '#ffffff' }
    });

    // Nodes voisins
    for (const nodeId of net.nodes) {
      if (nodeId !== net.center_iban) {
        nodes.push({
          id: nodeId,
          label: this.shortIban(nodeId),
          title: `Compte: ${nodeId}`,
          color: '#3b82f6',
          size: 20,
          font: { size: 12, color: '#374151' }
        });
      }
    }

    return nodes;
  });

  public graphEdges = computed(() => {
    const net = this.networkData();
    if (!net) return [];

    return net.edges.map(edge => ({
      from: edge.source,
      to: edge.target,
      title: `Transaction: ${edge.amount}€ - ${edge.is_fraud ? '⚠️ FRAUDE' : '✓ OK'}`,
      label: `${edge.amount}€`,
      color: edge.is_fraud ? '#dc2626' : '#94a3b8',
      width: edge.is_fraud ? 3 : 2
    }));
  });

  // ===== STATISTIQUES DE SÉVÉRITÉ POUR LE GRAPHE DONUT =====
  public severityCounts = computed<SeverityCounts>(() => {
    const list = this.filteredAlerts();
    const threshold = this.appliedMlThreshold();

    const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const item of list) {
      const score = item.fraudScore ?? item.score ?? 0;
      if (score >= 85) counts.critical++;
      else if (score >= threshold && score >= 70) counts.high++;
      else if (score >= threshold) counts.medium++;
      else counts.low++;
    }
    return counts;
  });

  // ===== ONGLET EXPLICABILITÉ SHAP =====
  public shapFactorStats = computed(() => {
    const groups = new Map<string, { positive: number; negative: number }>();

    for (const alert of this.filteredAlerts()) {
      const contributions = alert.explainability?.shap_contributions ?? [];

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
    this.filteredAlerts().filter(a => (a.explainability?.shap_contributions?.length ?? 0) > 0)
  );

  public mlFactorsOf(alert: FraudAlert): string[] {
    const contributions = alert.explainability?.shap_contributions ?? [];
    if (contributions.length > 0) {
      return contributions.map(c => `${c.feature} (${c.direction === 'positive' ? '+' : '-'}${c.value})`);
    }
    return alert.explainability?.factors?.filter(f => / a contribué (positivement|négativement)$/.test(f)) ?? [];
  }

  public ruleFactorsOf(alert: FraudAlert): string[] {
    return alert.explainability?.factors?.filter(f => !/ a contribué (positivement|négativement)$/.test(f)) ?? [];
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
        // Sync local UI variables from backend config
        this.mlThreshold = cfg.SEUIL_ML ?? 50.0;
        this.appliedMlThreshold.set(this.mlThreshold);
        this.criticalAmountThreshold = cfg.SEUIL_MONTANT_CRITIQUE ?? 3000;
        this.autoBlockEnabled = cfg.AUTO_BLOCK_ENABLED ?? false;
        this.currentSimulation.set({
          mlProbability: this.mlThreshold,
          abnormalAmount: cfg.MONTANT_ANORMAL ?? 10000
        });
        this.configLoading.set(false);
      },
      error: (err) => {
        this.configLoading.set(false);
        this.configError.set(`Impossible de charger la configuration: ${err.message}`);
      }
    });
  }

  public saveThresholds(): void {
    let cfg = this.editableThresholds();
    if (!cfg) return;
    // Push local UI values to the config before saving
    cfg = {
      ...cfg,
      SEUIL_ML: this.mlThreshold,
      MONTANT_ANORMAL: this.currentSimulation().abnormalAmount,
      SEUIL_MONTANT_CRITIQUE: this.criticalAmountThreshold,
      AUTO_BLOCK_ENABLED: this.autoBlockEnabled,
    };
    this.editableThresholds.set(cfg);
    this.configError.set(null);
    this.configSaved.set(false);
    this.configLoading.set(true);
    this.configService.updateThresholds(cfg).subscribe({
      next: (updated) => {
        this.editableThresholds.set(updated);
        // Sync local UI variables from saved config
        this.mlThreshold = updated.SEUIL_ML ?? this.mlThreshold;
        this.appliedMlThreshold.set(this.mlThreshold);
        this.criticalAmountThreshold = updated.SEUIL_MONTANT_CRITIQUE ?? this.criticalAmountThreshold;
        this.autoBlockEnabled = updated.AUTO_BLOCK_ENABLED ?? this.autoBlockEnabled;
        this.currentSimulation.set({
          mlProbability: this.mlThreshold,
          abnormalAmount: updated.MONTANT_ANORMAL ?? this.currentSimulation().abnormalAmount
        });
        this.configLoading.set(false);
        this.configSaved.set(true);
        // Re-analyze existing data to reflect new thresholds
        if (this.alertsService.alerts().length > 0 || this.supabaseResults()?.length) {
          if (this.analysisMode() === 'supabase') {
            this.loadSupabasePersistedData();
          } else if (this.lastImportedTransactions()) {
            // Réutiliser les transactions CSV importées plutôt que les données démo
            this.runAnalysis(this.lastImportedTransactions()!);
          } else {
            this.analyze();
          }
        } else {
          this.ngZone.run(() => {
            this.cdr.detectChanges();
            setTimeout(() => this.cdr.detectChanges(), 50);
          });
        }
        if (isPlatformBrowser(this.platformId)) {
          setTimeout(() => this.configSaved.set(false), 3000);
        }
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
  public graphTenantId = signal<string>('default');
  public topAccounts = signal<GraphAccountNode[]>([]);
  public selectedIban = signal<string | null>(null);
  public networkData = signal<GraphNetworkResponse | null>(null);
  public graphLoading = signal(false);
  public graphError = signal<string | null>(null);

  public loadTopAccounts(): void {
    this.graphError.set(null);
    this.graphLoading.set(true);
    this.networkData.set(null);
    console.log(`Loading top accounts for tenant_id: ${this.graphTenantId()}`);
    this.graphService.getTopAccounts(this.graphTenantId()).subscribe({
      next: (accounts) => {
        this.topAccounts.set(accounts);
        this.graphLoading.set(false);
        console.log(`Loaded ${accounts.length} accounts for tenant: ${this.graphTenantId()}`);
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

  public onTenantIdChange(newTenantId: string): void {
    this.graphTenantId.set(newTenantId);
    console.log(`Tenant ID changed to: ${newTenantId}`);
    // Recharger le graphe automatiquement quand le tenant_id change
    this.loadTopAccounts();
  }

  public selectAccount(iban: string): void {
    this.selectedIban.set(iban);
    console.log(`Loading network for IBAN: ${iban}, tenant: ${this.graphTenantId()}`);
    this.graphService.getAccountNetwork(this.graphTenantId(), iban).subscribe({
      next: (net) => {
        this.networkData.set(net);
        console.log(`Network loaded: ${net.nodes.length} nodes, ${net.edges.length} edges`);
      },
      error: (err) => this.graphError.set(`Impossible de charger le réseau: ${err.message}`)
    });
  }

  // Kept for potential future use, but not needed with vis-network
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
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Erreur de lecture du CSV.';
        this.importError.set(message);
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
        const record: Record<string, string | number> = {};

        header.forEach((col, i) => {
          let val = values[i] ?? '';
          if (this.NUMERIC_COLUMNS.includes(col)) {
            val = val.replace(',', '.');
            record[col] = parseFloat(val) || 0;
          } else {
            record[col] = val;
          }
        });

        const amount = Number(record['amount']) || 0;
        const senderBefore = Number(record['sender_balance_before']) || 10000.0;
        const senderAfter = Number(record['sender_balance_after']) || Math.max(0, senderBefore - amount);

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
    this.lastImportedTransactions.set(null);
    this.lastImportedTenantId.set(null);
    this.analysisMode.set('local');
    this.resetLocalAlerts();
    this.analyze();
  }

  private runAnalysis(transactions: CsvTransaction[]): void {
    this.errorMessage.set(null);
    this.hasLoadError.set(false);
    this.supabaseResults.set(null);
    this.analysisMode.set('local');
    this.resetLocalAlerts();

    // Sauvegarder les transactions importées pour réutilisation après modification des seuils
    this.lastImportedTransactions.set(transactions);
    this.lastImportedTenantId.set(this.graphTenantId());

    // Générer un tenant_id unique pour cet import CSV afin d'isoler le graphe
    const currentUser = this.authService?.getCurrentUser();
    const baseTenant = currentUser?.tenantId || 'default';
    const csvTenantId = transactions.length > 0 && transactions[0].tenant_id && transactions[0].tenant_id !== 'default'
      ? transactions[0].tenant_id
      : `${baseTenant}_import_${Date.now()}`;
    
    this.graphTenantId.set(csvTenantId);
    console.log(`Graph tenant ID updated to: ${csvTenantId}`);

    this.alertsService.analyzeTransactions(transactions, csvTenantId).subscribe({
      next: (res) => {
        console.log('Import CSV analysé avec succès', res);
        this.ngZone.run(() => {
          this.hasLoadError.set(false);
          this.cdr.detectChanges();
          setTimeout(() => {
            this.cdr.detectChanges();
            // Recharger le graphe après nouvel import avec le bon tenant_id
            if (this.activeTab() === 'graph') {
              console.log(`Reloading graph with tenant_id: ${this.graphTenantId()}`);
              this.loadTopAccounts();
            }
          }, 100);
          // Notifier les autres pages (Transactions, Rapports) que Supabase a potentiellement été mis à jour via l'import
          this.dataRefreshService.trigger();
        });
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Échec de l\'analyse du fichier importé';
        this.errorMessage.set(`Erreur: ${message}`);
        this.hasLoadError.set(true);
        // Fallback local si backend indisponible
        if (this.shouldUseLocalDemoFallback(err)) {
          this.useMockDataForDemo();
        }
      }
    });
  }

  /** Charge les données persistées en Supabase et bascule en mode supabase */
  private loadSupabasePersistedData(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.hasLoadError.set(false);
    this.analysisMode.set('supabase');
    
    // Récupérer le tenant_id de l'utilisateur connecté
    const currentUser = this.authService?.getCurrentUser();
    const tenantId = currentUser?.tenantId || this.graphTenantId();
    
    // Mettre à jour le tenant_id du graphe
    this.graphTenantId.set(tenantId);
    
    // On charge les transactions persistées via le service qui mappe et met à jour les stats
    this.alertsService.getTransactions({ limit: 500, tenantId }).subscribe({
      next: (data) => {
        this.ngZone.run(() => {
          // getTransactions a déjà mis à jour alertsService.alerts et stats
          // On synchronise aussi supabaseResults pour le computed filteredAlerts
          const raw = data as unknown as TransactionOutput[];
          this.supabaseResults.set(raw as unknown as TransactionOutput[]);
          this.loading.set(false);
          this.hasLoadError.set(false);
          this.cdr.detectChanges();
          setTimeout(() => this.cdr.detectChanges(), 50);
          if (this.activeTab() === 'graph') this.loadTopAccounts();
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          console.warn('loadSupabasePersistedData failed, fallback mock', err);
          this.loading.set(false);
          if (this.shouldUseLocalDemoFallback(err)) {
            this.useMockSupabaseData();
          } else {
            this.errorMessage.set('Erreur chargement Supabase: ' + (err instanceof Error ? err.message : String(err)));
            this.hasLoadError.set(true);
          }
          this.cdr.detectChanges();
        });
      }
    });
  }

  // ===== KPIS CALCULÉS STRICTEMENT SELON LE SEUIL DÉFINI — defensive null-checks ====
  public totalAnalyzed = computed(() => {
    try { return this.filteredAlerts()?.length ?? 0; } catch { return 0; }
  });

  public fraudRate = computed(() => {
    try {
      const list = this.filteredAlerts() ?? [];
      const total = list.length;
      if (total === 0) return 0;
      const threshold = this.appliedMlThreshold();
      const fraudCount = list.filter(item => {
        const score = (item as any)?.fraudScore ?? (item as any)?.score ?? 0;
        return score >= threshold;
      }).length;
      return Math.round((fraudCount / total) * 100);
    } catch { return 0; }
  });

  public totalAtRisk = computed(() => {
    try {
      const list = this.filteredAlerts() ?? [];
      const threshold = this.appliedMlThreshold();
      const suspiciousItems = list.filter(item => {
        const score = (item as any)?.fraudScore ?? (item as any)?.score ?? 0;
        return score >= threshold;
      });
      return suspiciousItems.reduce((sum, item) => sum + (Number((item as any)?.amount) || 0), 0);
    } catch { return 0; }
  });

  public globalRiskScore = computed(() => {
    try {
      const list = this.filteredAlerts() ?? [];
      if (list.length === 0) return 0;
      const sumScore = list.reduce((acc, item) => {
        const score = (item as any)?.fraudScore ?? (item as any)?.score ?? 0;
        return acc + score;
      }, 0);
      return Math.round((sumScore / list.length) * 100) / 100;
    } catch { return 0; }
  });

  // Store previous period data for real trend calculations
  private previousPeriodData = signal<{
    fraudRate: number;
    amountAtRisk: number;
    riskScore: number;
  } | null>(null);

  // Real trend indicators based on actual data comparison
  public fraudRateTrend = computed(() => {
    const currentRate = this.fraudRate();
    const previous = this.previousPeriodData();
    
    if (!previous || previous.fraudRate === 0) {
      return { value: 0, isPositive: true };
    }
    
    const change = ((currentRate - previous.fraudRate) / previous.fraudRate) * 100;
    return {
      value: Math.round(change),
      isPositive: change < 0 // positive = good (decrease in fraud)
    };
  });

  public amountAtRiskTrend = computed(() => {
    const currentAmount = this.totalAtRisk();
    const previous = this.previousPeriodData();
    
    if (!previous || previous.amountAtRisk === 0) {
      return { value: 0, isPositive: true };
    }
    
    const change = ((currentAmount - previous.amountAtRisk) / previous.amountAtRisk) * 100;
    return {
      value: Math.round(change),
      isPositive: change < 0 // positive = good (decrease in risk)
    };
  });

  public riskScoreTrend = computed(() => {
    const currentScore = this.globalRiskScore();
    const previous = this.previousPeriodData();
    
    if (!previous || previous.riskScore === 0) {
      return { value: 0, isPositive: true };
    }
    
    const change = ((currentScore - previous.riskScore) / previous.riskScore) * 100;
    return {
      value: Math.round(change),
      isPositive: change < 0 // positive = good (decrease in risk score)
    };
  });

  // Save current data as previous period for next comparison
  private saveCurrentAsPrevious(): void {
    this.previousPeriodData.set({
      fraudRate: this.fraudRate(),
      amountAtRisk: this.totalAtRisk(),
      riskScore: this.globalRiskScore()
    });
  }

  public analyze(): void {
    this.errorMessage.set(null);
    this.hasLoadError.set(false);
    this.importError.set(null);
    this.supabaseResults.set(null);
    this.analysisMode.set('local');

    this.saveCurrentAsPrevious();
    this.resetLocalAlerts();

    // Générer un tenant_id unique par session de démo pour isoler chaque graphe
    const currentUser = this.authService?.getCurrentUser();
    const baseTenant = currentUser?.tenantId || 'default';
    const sessionTenantId = `${baseTenant}_session_${Date.now()}`;
    
    // Mettre à jour le tenant_id du graphe
    this.graphTenantId.set(sessionTenantId);
    console.log(`Graph tenant ID updated to: ${sessionTenantId}`);

    // Appliquer le tenant_id aux transactions mock
    const transactionsWithTenant = this.getMockTransactionsToAnalyze(sessionTenantId);

    this.alertsService.analyzeTransactions(transactionsWithTenant, sessionTenantId).subscribe({
      next: (resultats: TransactionOutputExtended[]) => {
        this.ngZone.run(() => {
          console.log('Analyse démo terminée avec succès', resultats);
          this.hasLoadError.set(false);
          this.errorMessage.set(null);
          this.cdr.detectChanges();
          // Force chart redraw after data + refresh graphe
          setTimeout(() => {
            this.cdr.detectChanges();
            if (this.activeTab() === 'graph') {
              console.log(`Reloading graph with tenant_id: ${this.graphTenantId()}`);
              this.loadTopAccounts();
            }
          }, 50);
          this.dataRefreshService.trigger();
        });
      },
      error: (erreur: unknown) => {
        this.ngZone.run(() => {
          console.error('Erreur lors de l\'analyse démo', erreur);
          if (this.shouldUseLocalDemoFallback(erreur)) {
            console.log('Utilisation des donnees mockees en mode demo local');
            this.useMockDataForDemo();
          } else {
            const message = erreur instanceof Error ? erreur.message : 'Impossible de se connecter au backend';
            this.errorMessage.set(`Erreur: ${message}`);
            this.hasLoadError.set(true);
            this.loading.set(false);
          }
          this.cdr.detectChanges();
        });
      }
    });
  }

  private shouldUseLocalDemoFallback(error: unknown): boolean {
    if (error && typeof error === 'object' && 'status' in error) {
      const status = Number((error as { status: unknown }).status ?? 0);
      const message = String((error as { message?: unknown }).message ?? '');

      return (
        status === 0 ||
        status === 401 ||
        status === 404 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        message.includes('401') ||
        message.includes('Failed to fetch') ||
        message.includes('Http failure response')
      );
    }
    return true;
  }

  private useMockDataForDemo(): void {
    this.hasLoadError.set(false);
    this.errorMessage.set(null);
    
    const tenantId = this.graphTenantId();
    
    const mockAlerts: TransactionOutputExtended[] = [
      {
        tenant_id: tenantId,
        transaction_reference: "mongo_001",
        id: 'tx_seuil',
        transactionId: 'mongo_001',
        date: '2026-08-13T10:00:00Z',
        description: 'Virement fournisseur externe',
        amount: 15000.0,
        isFraud: true,
        fraudProbability: 0.925,
        fraudScore: 92.5,
        confidence: 'HIGH',
        severity: 'CRITICAL',
        category: 'SEUIL_REGLEMENTAIRE',
        beneficiary: 'FR7698765432109876543210987',
        reconciliationStatus: 'SUSPICIOUS',
        status: 'under_investigation',
        explainability: {
          summary: 'Montant supérieur au seuil réglementaire TRACFIN',
          factors: ['Montant exceptionnel vs historique', 'Seuil réglementaire TRACFIN (>10k€)'],
          shap_contributions: [
            { feature: 'amount', value: 0.65, direction: 'positive' },
            { feature: 'transaction_type', value: 0.20, direction: 'positive' },
            { feature: 'beneficiary_risk', value: 0.15, direction: 'positive' }
          ]
        }
      },
      {
        tenant_id: tenantId,
        transaction_reference: "mongo_002",
        id: 'tx_approche',
        transactionId: 'mongo_002',
        date: '2026-08-14T10:02:00Z',
        description: 'Virement fournisseur B',
        amount: 9500.0,
        isFraud: true,
        fraudProbability: 0.783,
        fraudScore: 78.3,
        confidence: 'MEDIUM',
        severity: 'HIGH',
        category: 'SEUIL_APPROCHE',
        beneficiary: 'FR7612345678901234567890123',
        reconciliationStatus: 'SUSPICIOUS',
        status: 'under_investigation',
        explainability: {
          summary: 'Approche du seuil réglementaire',
          factors: ['Approche du seuil (90% de 10k€)'],
          shap_contributions: [
            { feature: 'amount', value: 0.45, direction: 'positive' },
            { feature: 'frequency', value: 0.25, direction: 'positive' },
            { feature: 'time_pattern', value: -0.10, direction: 'negative' }
          ]
        }
      },
      {
        tenant_id: tenantId,
        transaction_reference: "mongo_003",
        id: 'tx_cash',
        transactionId: 'mongo_003',
        date: '2026-08-15T10:05:00Z',
        description: 'Retrait exceptionnel PARIS',
        amount: 6000.0,
        isFraud: true,
        fraudProbability: 0.652,
        fraudScore: 65.2,
        confidence: 'MEDIUM',
        severity: 'HIGH',
        category: 'RETRAIT_CASH_IMPORTANT',
        beneficiary: '—',
        reconciliationStatus: 'SUSPICIOUS',
        status: 'under_investigation',
        explainability: {
          summary: 'Retrait cash important détecté',
          factors: ['Retrait cash important (>5k€)'],
          shap_contributions: [
            { feature: 'transaction_type', value: 0.55, direction: 'positive' },
            { feature: 'location_risk', value: 0.30, direction: 'positive' },
            { feature: 'amount', value: 0.15, direction: 'positive' }
          ]
        }
      },
      {
        tenant_id: tenantId,
        transaction_reference: "mongo_005",
        id: 'tx_dup_1',
        transactionId: 'mongo_005',
        date: '2026-08-16T11:00:00Z',
        description: 'Paiement Fournisseur ABC',
        amount: 2500.0,
        isFraud: true,
        fraudProbability: 0.558,
        fraudScore: 55.8,
        confidence: 'MEDIUM',
        severity: 'MEDIUM',
        category: 'PAIEMENT_DUPLIQUE',
        beneficiary: 'FR7611111111111111111111111',
        reconciliationStatus: 'SUSPICIOUS',
        status: 'under_investigation',
        explainability: {
          summary: 'Paiement dupliqué détecté',
          factors: ['Paiement dupliqué'],
          shap_contributions: [
            { feature: 'duplication_score', value: 0.50, direction: 'positive' },
            { feature: 'time_interval', value: 0.30, direction: 'positive' },
            { feature: 'amount', value: 0.10, direction: 'positive' }
          ]
        }
      },
      {
        tenant_id: tenantId,
        transaction_reference: "mongo_013",
        id: 'tx_clean',
        transactionId: 'mongo_013',
        date: '2026-08-17T14:00:00Z',
        description: 'Achat fournitures de bureau',
        amount: 45.0,
        isFraud: false,
        fraudProbability: 0.123,
        fraudScore: 12.3,
        confidence: 'LOW',
        severity: 'LOW',
        category: 'NON_CATEGORISE',
        beneficiary: 'FR7622222222222222222222222',
        reconciliationStatus: 'MATCHED',
        status: 'cleared',
        explainability: {
          summary: 'Transaction normale',
          factors: ['Aucun facteur de risque détecté'],
          shap_contributions: [
            { feature: 'amount', value: -0.05, direction: 'negative' },
            { feature: 'merchant_trust', value: -0.10, direction: 'negative' }
          ]
        }
      }
    ];

    // Injecter les données mockées via le service
    this.ngZone.run(() => {
      this.alertsService.alerts.set(mockAlerts);
      this.alertsService.updateStats(mockAlerts);
      this.loading.set(false);
      this.hasLoadError.set(false);
      this.cdr.detectChanges();
      setTimeout(() => {
        this.cdr.detectChanges();
        if (this.activeTab() === 'graph') this.loadTopAccounts();
      }, 100);
      this.dataRefreshService.trigger();
    });
  }

  public analyzeSupabaseCases(): void {
    this.errorMessage.set(null);
    this.hasLoadError.set(false);
    this.loading.set(true);
    this.analysisMode.set('supabase');
    
    // Save current data as previous for trend calculation
    this.saveCurrentAsPrevious();

    // Générer un tenant_id unique pour cette session Supabase
    const currentUser = this.authService?.getCurrentUser();
    const baseTenant = currentUser?.tenantId || 'default';
    const sessionTenantId = `${baseTenant}_supabase_${Date.now()}`;
    this.graphTenantId.set(sessionTenantId);

    const transactionsSupabase = [
      {
        tenant_id: sessionTenantId,
        transaction_reference: "mongo_supa_001",
        id: "tx_montant_except",
        date: "2026-08-13T09:00:00Z",
        description: "Virement urgent fournisseur",
        amount: 900.0,
        sender_balance_before: 5000.0,
        sender_balance_after: 4100.0,
        receiver_balance_before: 0.0,
        receiver_balance_after: 900.0,
        transaction_type: "TRANSFER",
        account_iban: "FR76-COMPTE-A",
        beneficiary_iban: "FR76-BENEF-A1"
      },
      {
        tenant_id: sessionTenantId,
        transaction_reference: "mongo_supa_002",
        id: "tx_compte_dormant",
        date: "2026-08-14T09:05:00Z",
        description: "Virement réactivation compte",
        amount: 500.0,
        sender_balance_before: 1200.0,
        sender_balance_after: 700.0,
        receiver_balance_before: 0.0,
        receiver_balance_after: 500.0,
        transaction_type: "TRANSFER",
        account_iban: "FR76-COMPTE-B",
        beneficiary_iban: "FR76-BENEF-B1"
      },
      {
        tenant_id: sessionTenantId,
        transaction_reference: "mongo_supa_003",
        id: "tx_nouvel_iban",
        date: "2026-08-15T09:10:00Z",
        description: "Virement nouveau bénéficiaire",
        amount: 800.0,
        sender_balance_before: 3000.0,
        sender_balance_after: 2200.0,
        receiver_balance_before: 0.0,
        receiver_balance_after: 800.0,
        transaction_type: "TRANSFER",
        account_iban: "FR76-COMPTE-C",
        beneficiary_iban: "FR76-BENEF-C-NEW"
      }
    ] as unknown as TransactionInput[];

    let fallbackTimeout: ReturnType<typeof setTimeout> | undefined;
    let completed = false;
    const triggerFallback = () => {
      if (completed) return;
      completed = true;
      this.ngZone.run(() => {
        console.log('Fallback Supabase mock après timeout');
        this.useMockSupabaseData();
      });
    };
    // Fallback rapide si backend indisponible (évite lag)
    fallbackTimeout = setTimeout(() => {
      if (!completed && this.loading()) {
        triggerFallback();
      }
    }, 3500);

    this.apiService.analyzeTransactions(transactionsSupabase).subscribe({
      next: (resultats: TransactionOutput[]) => {
        if (completed) return;
        completed = true;
        if (fallbackTimeout) clearTimeout(fallbackTimeout);
        this.ngZone.run(() => {
          // On a persisté les 3 cas, maintenant on recharge l'ensemble des données Supabase pour refléter tout l'historique (multi-banking inclus)
          console.log('Cas Supabase persistés, rechargement complet...');
          this.loading.set(false);
          this.hasLoadError.set(false);
          this.errorMessage.set(null);
          // D'abord afficher les 3 cas immédiatement pour feedback, puis charger tout
          this.supabaseResults.set(resultats);
          const mappedResults = this.mapTransactionData(resultats);
          this.alertsService.alerts.set(mappedResults);
          this.alertsService.updateStats(mappedResults);
          this.cdr.detectChanges();
          // Ensuite charger l'ensemble persisté (délai pour laisser Supabase indexer)
          setTimeout(() => this.loadSupabasePersistedData(), 400);
          this.dataRefreshService.trigger();
          if (this.activeTab() === 'graph') this.loadTopAccounts();
        });
      },
      error: (erreur: unknown) => {
        if (completed) return;
        completed = true;
        if (fallbackTimeout) clearTimeout(fallbackTimeout);
        this.ngZone.run(() => {
          this.loading.set(false);
          if (this.shouldUseLocalDemoFallback(erreur)) {
            console.log('Utilisation des donnees mockees en mode demo local');
            this.useMockSupabaseData();
          } else {
            const message = erreur instanceof Error ? erreur.message : 'Échec de connexion';
            this.errorMessage.set(`Erreur Supabase: ${message}`);
            this.hasLoadError.set(true);
          }
          this.cdr.detectChanges();
        });
      }
    });
  }

  private useMockSupabaseData(): void {
    const tenantId = this.graphTenantId();

    const mockSupabaseResults: TransactionOutput[] = [
      {
        tenant_id: tenantId,
        transaction_reference: "mongo_supa_001",
        id: 'tx_montant_except',
        date: '2026-08-13T09:00:00Z',
        description: 'Virement urgent fournisseur',
        amount: 900.0,
        isFraud: true,
        fraudProbability: 0.725,
        explainability: {
          summary: 'Montant exceptionnel par rapport à l\'historique',
          factors: ['Montant exceptionnel vs historique', 'Compte rarement utilisé'],
          shap_contributions: [
            { feature: 'amount', value: 0.45, direction: 'positive' },
            { feature: 'account_frequency', value: 0.30, direction: 'positive' },
            { feature: 'time_of_day', value: -0.15, direction: 'negative' }
          ]
        }
      } as unknown as TransactionOutput,
      {
        tenant_id: tenantId,
        transaction_reference: 'mongo_supa_002',
        id: 'tx_compte_dormant',
        date: '2026-08-14T09:05:00Z',
        description: 'Virement réactivation compte',
        amount: 500.0,
        isFraud: true,
        fraudProbability: 0.682,
        explainability: {
          summary: 'Réactivation d\'un compte dormant',
          factors: ['Compte rarement utilisé', 'Nouveau bénéficiaire'],
          shap_contributions: [
            { feature: 'account_inactivity', value: 0.55, direction: 'positive' },
            { feature: 'new_beneficiary', value: 0.25, direction: 'positive' },
            { feature: 'amount', value: 0.10, direction: 'positive' }
          ]
        }
      } as unknown as TransactionOutput,
      {
        tenant_id: tenantId,
        transaction_reference: 'mongo_supa_003',
        id: 'tx_nouvel_iban',
        date: '2026-08-15T09:10:00Z',
        description: 'Virement nouveau bénéficiaire',
        amount: 800.0,
        isFraud: true,
        fraudProbability: 0.587,
        explainability: {
          summary: 'Premier virement vers ce bénéficiaire',
          factors: ['Nouvel IBAN bénéficiaire'],
          shap_contributions: [
            { feature: 'new_beneficiary', value: 0.40, direction: 'positive' },
            { feature: 'amount', value: 0.20, direction: 'positive' },
            { feature: 'transaction_frequency', value: -0.10, direction: 'negative' }
          ]
        }
      } as unknown as TransactionOutput
    ];
    // Inject beneficiary_iban for display
    (mockSupabaseResults[0] as unknown as Record<string, unknown>)['beneficiary_iban'] = 'FR76-BENEF-A1';
    (mockSupabaseResults[1] as unknown as Record<string, unknown>)['beneficiary_iban'] = 'FR76-BENEF-B1';
    (mockSupabaseResults[2] as unknown as Record<string, unknown>)['beneficiary_iban'] = 'FR76-BENEF-C-NEW';

    this.ngZone.run(() => {
      this.supabaseResults.set(mockSupabaseResults);
      const mappedResults = this.mapTransactionData(mockSupabaseResults);
      this.alertsService.alerts.set(mappedResults);
      this.alertsService.updateStats(mappedResults);
      this.hasLoadError.set(false);
      this.errorMessage.set(null);
      this.loading.set(false);
      this.cdr.detectChanges();
      setTimeout(() => {
        this.cdr.detectChanges();
        if (this.activeTab() === 'graph') this.loadTopAccounts();
      }, 100);
      this.dataRefreshService.trigger();
    });
  }

  // ===== FONCTIONS UTILITAIRES D'AFFICHAGE =====
  public getCurrentDate(): string {
    return new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  // ===== EXPORT CSV DES ALERTES =====
  public exportToCsv(): void {
    const source = this.filteredAlerts();

    if (!source || source.length === 0) {
      return;
    }

    const headers = [
      'ID', 'Date', 'Description', 'Montant (€)', 'Score', 'Sévérité',
      'Catégorie', 'Statut', 'Bénéficiaire', 'Est une fraude'
    ];

    const rows = source.map((item: TransactionOutputExtended) => [
      item.id ?? item.transactionId ?? '',
      item.date ?? '',
      (item.description ?? '').replace(/"/g, '""'),
      item.amount ?? 0,
      item.fraudScore ?? 0,
      item.severity ?? '',
      item.category ?? 'NON_CATEGORISE',
      item.status ?? '',
      item.beneficiary ?? '',
      item.isFraud ? 'OUI' : 'NON'
    ]);

    const csvLines = [
      headers.join(';'),
      ...rows.map(r => r.map(v => `"${v}"`).join(';'))
    ];

    const csvContent = '\uFEFF' + csvLines.join('\r\n'); // BOM UTF-8 pour Excel FR
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    link.href = url;
    link.setAttribute('download', `alertes-fraude-${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ===== EXPORT PDF DES ALERTES =====
  public exportToPdf(): void {
    const source = this.filteredAlerts();

    if (!source || source.length === 0) {
      return;
    }

    // Convertir en format FraudAlert attendu par le service
    const alerts: FraudAlert[] = source.map((item: TransactionOutputExtended) => ({
      id: item.id ?? item.transactionId ?? '',
      tenantId: item.tenantId ?? 'unknown',
      transactionId: item.id ?? item.transactionId ?? '',
      date: item.date ?? '',
      description: item.description ?? '',
      amount: item.amount ?? 0,
      beneficiary: item.beneficiary ?? '',
      category: (item.category ?? 'NON_CATEGORISE') as FraudCategory,
      severity: (item.severity ?? 'low') as FraudSeverity,
      fraudScore: item.fraudScore ?? 0,
      status: (item.status ?? 'new') as 'new' | 'investigating' | 'confirmed' | 'dismissed',
      explainability: item.explainability ?? { summary: '', factors: [] }
    }));

    this.pdfExportService.exportAlertsToPdf(alerts, 'Rapport de Détection de Fraude');
  }

  // ===== EXPORT SYNTHÈSE PDF =====
  public exportSummaryToPdf(): void {
    const stats = this.alertsService.stats();
    if (!stats) return;
    
    const summary = {
      totalAlerts: stats.totalAlerts,
      critical: stats.critical,
      high: stats.high,
      medium: stats.totalAlerts - stats.critical - stats.high - stats.underInvestigation,
      low: stats.underInvestigation,
      totalAmount: stats.totalAmountAtRisk,
      fraudRate: this.fraudRate()
    };

    this.pdfExportService.exportSummaryToPdf(summary, 'Synthèse des Alertes de Fraude');
  }
  public getCurrentTime(): string {
    return this.currentTime();
  }
}
