import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { FraudAlertsService } from './fraud-alerts.service';
import { TransactionOutput } from '../../../api';

function makeOutput(overrides: Partial<TransactionOutput & { ruleCategory?: string }> = {}): TransactionOutput & { ruleCategory?: string } {
  return {
    tenant_id: 'tenant-123',
    mongo_transaction_id: 'mongo_001',
    id: 'TX-1',
    date: '2026-07-16',
    description: 'ACHAT SUPERMARCHE',
    amount: 100,
    isFraud: false,
    fraudProbability: 0,
    reconciliationStatus: 'MATCHED',
    ruleCategory: 'NON_CATEGORISE',
    explainability: { summary: 'Aucune anomalie détectée.', factors: [] },
    ...overrides,
  };
}

describe('FraudAlertsService', () => {
  let service: FraudAlertsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FraudAlertsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have empty alerts and null stats initially', () => {
    expect(service.alerts()).toEqual([]);
    expect(service.stats()).toBeNull();
    expect(service.loading()).toBe(false);
  });

  it('should POST to /api/analyze and set loading true while in flight', () => {
    service.analyzeTransactions([{ id: 'TX-1', amount: 100 }]).subscribe();

    expect(service.loading()).toBe(true);
    const req = httpMock.expectOne('/api/analyze');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual([{ id: 'TX-1', amount: 100 }]);

    req.flush([makeOutput()]);
    expect(service.loading()).toBe(false);
  });

  it('should map TransactionOutput[] to FraudAlert[] and populate alerts()', () => {
    service.analyzeTransactions([{ id: 'TX-1', amount: 100 }]).subscribe();

    const req = httpMock.expectOne('/api/analyze');
    req.flush([
      makeOutput({
        id: 'TX-1',
        amount: 250,
        isFraud: true,
        fraudProbability: 0.92,
        reconciliationStatus: 'SUSPICIOUS',
        ruleCategory: 'SEUIL_REGLEMENTAIRE',
        explainability: { summary: 'Bloqué par conformité.', factors: ['Règlement : Montant supérieur au seuil réglementaire (10k)'] },
      }),
    ]);

    const alerts = service.alerts();
    expect(alerts.length).toBe(1);
    expect(alerts[0].id).toBe('TX-1');
    expect(alerts[0].amount).toBe(250);
    expect(alerts[0].category).toBe('SEUIL_REGLEMENTAIRE');
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].fraudScore).toBe(92);
    expect(alerts[0].status).toBe('new');
    expect(alerts[0].reconciliationStatus).toBe('SUSPICIOUS');
  });

  it('should mark a non-fraud transaction as dismissed', () => {
    service.analyzeTransactions([{ id: 'TX-2', amount: 10 }]).subscribe();

    const req = httpMock.expectOne('/api/analyze');
    req.flush([makeOutput({ id: 'TX-2', isFraud: false, fraudProbability: 0.05 })]);

    const alerts = service.alerts();
    expect(alerts[0].status).toBe('dismissed');
    expect(alerts[0].severity).toBe('low');
  });

  it.each([
    [0.95, 'critical'],
    [0.75, 'high'],
    [0.5, 'medium'],
    [0.1, 'low'],
  ] as const)('should map fraudProbability %f to severity %s', (probability, expected) => {
    service.analyzeTransactions([{ id: 'TX-3', amount: 10 }]).subscribe();
    const req = httpMock.expectOne('/api/analyze');
    req.flush([makeOutput({ id: 'TX-3', fraudProbability: probability })]);

    expect(service.alerts()[0].severity).toBe(expected);
  });

  it('should infer a category from factors when ruleCategory is NON_CATEGORISE', () => {
    service.analyzeTransactions([{ id: 'TX-4', amount: 10 }]).subscribe();
    const req = httpMock.expectOne('/api/analyze');
    req.flush([
      makeOutput({
        id: 'TX-4',
        ruleCategory: 'NON_CATEGORISE',
        explainability: { summary: '', factors: ['Montant inhabituel (x9 supérieur à la moyenne du compte)'] },
      }),
    ]);

    expect(service.alerts()[0].category).toBe('montant_exceptionnel');
  });

  it('should compute dashboard stats from the mapped alerts', () => {
    service.analyzeTransactions([{ id: 'a' }, { id: 'b' }]).subscribe();
    const req = httpMock.expectOne('/api/analyze');
    req.flush([
      makeOutput({ id: 'a', amount: 100, isFraud: true, fraudProbability: 0.95 }),
      makeOutput({ id: 'b', amount: 50, isFraud: false, fraudProbability: 0.02 }),
    ]);

    const stats = service.stats();
    expect(stats?.totalAlerts).toBe(2);
    expect(stats?.critical).toBe(1);
    expect(stats?.totalAmountAtRisk).toBe(150);
  });

  it('should reset loading and propagate the error on HTTP failure', () => {
    let caught: unknown = null;
    service.analyzeTransactions([{ id: 'TX-5' }]).subscribe({
      error: (err) => (caught = err),
    });

    const req = httpMock.expectOne('/api/analyze');
    req.flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(service.loading()).toBe(false);
    expect(caught).not.toBeNull();
  });
});
