import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { FraudDashboardComponent } from './fraud-dashboard.component';
import { FraudAlertsService } from '../services/fraud-alerts.service';
// Ajuste les chemins ci-dessous selon ton projet :
import { GraphService } from '../services/graph.service';
import { ConfigService } from '../services/config.service';
import { DefaultService } from '../../../api/services/default.service'; 

describe('FraudDashboardComponent', () => {
  let component: FraudDashboardComponent;
  let fixture: ComponentFixture<FraudDashboardComponent>;

  // Déclaration de nos Mocks
  let mockFraudAlertsService: any;
  let mockGraphService: any;
  let mockConfigService: any;
  let mockDefaultService: any;

  beforeEach(async () => {
    // 1. Mock de FraudAlertsService avec la BONNE structure
    mockFraudAlertsService = {
      loading: signal(false),
      alerts: signal([]),
      stats: signal({
        totalAlerts: 15,
        critical: 3,
        high: 5,
        underInvestigation: 2,
        totalAmountAtRisk: 150000
      }),
      // On utilise vi.fn() car tu utilises Vitest
      analyzeTransactions: vi.fn().mockReturnValue(of([])),
      calculateDashboardStats: vi.fn()
    };

    // 2. Mock de GraphService
    mockGraphService = {
      loading: signal(false),
      topAccounts: signal([]),
      networkData: signal(null),
      selectedAccount: signal(null),
      loadTopAccounts: vi.fn().mockReturnValue(of([])),
      selectAccount: vi.fn()
    };

    // 3. Mock de ConfigService
    mockConfigService = {
      loading: signal(false),
      thresholds: signal({ SEUIL: 10000, FREQUENCE: 5 }),
      loadThresholds: vi.fn().mockReturnValue(of({})),
      updateThresholds: vi.fn().mockReturnValue(of({}))
    };

    // 4. Mock de DefaultService (Appels Supabase)
    mockDefaultService = {
      analyzeSupabaseCases: vi.fn().mockReturnValue(of({}))
    };

    await TestBed.configureTestingModule({
      imports: [FraudDashboardComponent], // Standalone component
      providers: [
        // Indispensable pour éviter la NullInjectorError sur HttpClient
        provideHttpClient(),
        provideHttpClientTesting(),
        // Fourniture de nos mocks à la place des vrais services
        { provide: FraudAlertsService, useValue: mockFraudAlertsService },
        { provide: GraphService, useValue: mockGraphService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DefaultService, useValue: mockDefaultService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FraudDashboardComponent);
    component = fixture.componentInstance;
    
    // Déclenche le premier cycle de détection de changements
    fixture.detectChanges();
  });

  it('devrait créer le composant dashboard', () => {
    expect(component).toBeTruthy();
  });

  it('devrait lire les bonnes statistiques depuis alertsService', () => {
    // Vrai test : on s'assure que le composant a bien accès au signal du service mocké
    const stats = component.alertsService.stats();
    
    expect(stats).toBeDefined();
    expect(stats.totalAlerts).toBe(15);
    expect(stats.critical).toBe(3);
    expect(stats.totalAmountAtRisk).toBe(150000);
  });

  it('devrait afficher la structure des cartes de statistiques dans le DOM', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const textContent = compiled.textContent || '';
    
    // Vérification basée sur le template réel attendu
    expect(textContent).toContain('Total alertes');
    expect(textContent).toContain('Critiques');
    expect(textContent).toContain('Élevées');
    expect(textContent).toContain('En investigation');
  });

  // --- TESTS DE COMPORTEMENT ---

  it('devrait changer d\'onglet via setTab()', () => {
    // Si ta méthode s'appelle 'setTab' et ta variable 'activeTab'
    component.setTab('GRAPH');
    expect(component.activeTab).toBe('GRAPH');
    
    component.setTab('RULES');
    expect(component.activeTab).toBe('RULES');
  });

  /* 
   Décommente et ajuste le nom de la méthode selon comment elle s'appelle 
   dans fraud-dashboard.component.ts (ex: analyze(), onAnalyze(), etc.)
  */
  // it('devrait déclencher l\'analyse locale', () => {
  //   component.analyze(); 
  //   expect(mockFraudAlertsService.analyzeTransactions).toHaveBeenCalled();
  // });

  // it('devrait déclencher l\'analyse Supabase', () => {
  //   component.analyzeSupabase(); 
  //   expect(mockDefaultService.analyzeSupabaseCases).toHaveBeenCalled();
  // });
});