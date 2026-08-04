import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Services
import { 
  FraudAlertsService, 
  TransactionOutput 
} from './services/fraud-alerts.service';
import { 
  GraphService, 
  GraphNetworkResponse, 
  TopAccount 
} from './services/graph.service';
import { 
  ConfigService, 
  ThresholdsModel 
} from './services/config.service';

@Component({
  selector: 'app-fraud-detection',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fraud-detection.component.html',
})
export class FraudDetectionComponent implements OnInit {
  // --- Données ---
  transactions: TransactionOutput[] = [];
  topAccounts: TopAccount[] = [];
  thresholds: ThresholdsModel | null = null;
  selectedNetwork: GraphNetworkResponse | null = null;
  selectedTxDetails: TransactionOutput | null = null;
  selectedAccountIban: string | null = null;
  loadingGraph: boolean = false;
  networkData: any = null;
  // --- Filtres & UI ---
  isLoading = false;
  errorMessage: string | null = null;
  statusFilter = '';
  searchQuery = '';
  selectedIban: string | null = null;
 
  constructor(
    private fraudAlertsService: FraudAlertsService,
    private graphService: GraphService,
    private configService: ConfigService
  ) {}

  ngOnInit(): void {
    this.loadAllData();
  }

  /**
   * Chargement global des données
   */
  loadAllData(): void {
    this.isLoading = true;
    this.errorMessage = null;

    this.loadTransactions();
    this.loadTopAccounts();
    this.loadThresholds();
  }
  selectAccount(account: string) {
    this.selectedAccountIban = account;
    this.loadingGraph = true;
  }
  /**
   * 1. Récupère la liste des transactions/alertes
   */
  loadTransactions(): void {
    this.fraudAlertsService.getTransactions({
      status: this.statusFilter || undefined,
      search: this.searchQuery || undefined,
      limit: 50
    }).subscribe({
      next: (data) => {
        this.transactions = data;
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = err.message;
        this.isLoading = false;
      }
    });
  }

  /**
   * 2. Récupère les comptes les plus signalés (Graphe Neo4j)
   */
  loadTopAccounts(): void {
    this.graphService.getTopFlaggedAccounts(5).subscribe({
      next: (data) => {
        this.topAccounts = data;
      },
      error: (err) => {
        console.warn('[FraudDetectionComponent] Erreur top accounts:', err);
      }
    });
  }

  /**
   * 3. Récupère les seuils de détection
   */
  loadThresholds(): void {
    this.configService.getThresholds().subscribe({
      next: (data) => {
        this.thresholds = data;
      },
      error: (err) => {
        console.warn('[FraudDetectionComponent] Erreur seuils config:', err);
      }
    });
  }

  /**
   * Charge le réseau Neo4j centré sur un IBAN
   */
  inspectAccountNetwork(account?: string): void {
  if (!account) return;
  this.selectedAccountIban = account;
  this.loadingGraph = true;
  this.graphService.getAccountNetwork(account, 2).subscribe({
    next: (data) => {
      this.networkData = data;
      this.loadingGraph = false;
    },
    error: (err) => {
      console.error(err);
      this.loadingGraph = false;
    }
  });
}

  /**
   * Sélectionne une transaction pour afficher l'explicabilité détaillée (SHAP & Facteurs)
   */
  selectTransactionDetails(tx: TransactionOutput): void {
    this.selectedTxDetails = tx;
  }

  /**
   * Exécute une simulation d'analyse en mode Démo
   */
  runDemoAnalysis(): void {
    this.isLoading = true;
    const samplePayload = [
      {
        tenant_id: 'tenant_demo',
        mongo_transaction_id: '60d5ecb8b5c9c22234567890',
        id: `TX_SIM_${Date.now().toString().slice(-4)}`,
        date: new Date().toISOString(),
        description: 'Virement suspect entrant',
        amount: 12500.0,
        sender_account: 'FR7612345678901234567890123',
        receiver_account: 'FR7698765432109876543210987',
        transaction_type: 'TRANSFER',
        sender_balance_before: 15000.0,
        sender_balance_after: 2500.0,
        receiver_balance_before: 50.0,
        receiver_balance_after: 12550.0
      }
    ];

    this.fraudAlertsService.analyzeTransactions(samplePayload).subscribe({
      next: (results: any) => {
        this.transactions = [...results, ...this.transactions];
        this.isLoading = false;
      },
      error: (err : any) => {
        this.errorMessage = err.message;
        this.isLoading = false;
      }
    });
  }

  /**
   * Réinitialise le filtre et la vue de détail
   */
  clearSelections(): void {
    this.selectedIban = null;
    this.selectedNetwork = null;
    this.selectedTxDetails = null;
  }

  /**
   * Helpers visuels pour le template HTML
   */
  getConfidenceBadgeClass(confidence: 'HIGH' | 'MEDIUM' | 'LOW'): string {
    switch (confidence) {
      case 'HIGH': return 'badge-danger';
      case 'MEDIUM': return 'badge-warning';
      case 'LOW': return 'badge-info';
      default: return 'badge-secondary';
    }
  }

  getScoreColorClass(score: number): string {
    if (score >= 70) return 'text-danger fw-bold';
    if (score >= 40) return 'text-warning fw-bold';
    return 'text-success';
  }
}