import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ConfigService, ThresholdsConfig } from './config.service';

const FULL_CONFIG: ThresholdsConfig = {
  SEUIL_REGLEMENTAIRE: 10000,
  SEUIL_APPROCHE_RATIO: 0.9,
  SEUIL_CASH_OUT: 5000,
  SEUIL_MONTANT_ABERRANT: 1_000_000_000,
  RATIO_MONTANT_INHABITUEL: 8,
  SEUIL_JOURS_COMPTE_DORMANT: 90,
  MOTS_CLES_SENSIBLES: ['CASINO', 'PARIS', 'POKER', 'BET', 'PARI'],
};

describe('ConfigService', () => {
  let service: ConfigService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ConfigService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ConfigService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should GET the current thresholds from /api/config/thresholds', () => {
    let result: ThresholdsConfig | undefined;
    service.getThresholds().subscribe((cfg) => (result = cfg));

    const req = httpMock.expectOne('/api/config/thresholds');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: FULL_CONFIG });

    expect(result).toEqual(FULL_CONFIG);
  });

  it('should PUT a partial patch and return the updated thresholds', () => {
    const patch: Partial<ThresholdsConfig> = { SEUIL_CASH_OUT: 7500 };
    let result: ThresholdsConfig | undefined;

    service.updateThresholds(patch).subscribe((cfg) => (result = cfg));

    const req = httpMock.expectOne('/api/config/thresholds');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(patch);

    const updated: ThresholdsConfig = { ...FULL_CONFIG, SEUIL_CASH_OUT: 7500 };
    req.flush({ success: true, data: updated });

    expect(result?.SEUIL_CASH_OUT).toBe(7500);
  });

  it('should propagate an error if the server rejects the update', () => {
    let caught: unknown = null;
    service.updateThresholds({ SEUIL_REGLEMENTAIRE: -1 }).subscribe({
      error: (err) => (caught = err),
    });

    const req = httpMock.expectOne('/api/config/thresholds');
    req.flush({ detail: 'Invalid threshold' }, { status: 422, statusText: 'Unprocessable Entity' });

    expect(caught).not.toBeNull();
  });
});
