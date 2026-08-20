# Comprehensive Integration Testing Guide

## BankMatch - Bank Reconciliation Application

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Summary](#2-architecture-summary)
3. [Test Suite Inventory](#3-test-suite-inventory)
4. [Prerequisites & Setup](#4-prerequisites--setup)
5. [Running the Tests](#5-running-the-tests)
6. [Test Modules Reference](#6-test-modules-reference)
7. [Manual Testing Guide](#7-manual-testing-guide)
8. [Edge Cases & Scenarios](#8-edge-cases--scenarios)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Overview

This integration test suite validates the **end-to-end data flow** of the BankMatch bank reconciliation application, covering:

- **Backend fraud-detection module** (Python FastAPI)
- **Backend multi-banking module** (Python FastAPI)
- **Frontend client** (Angular 21)
- **Cross-service communication** (S2S auth, REST APIs)

### What Is Tested

| Category | Coverage |
|---|---|
| API endpoint contracts | All REST endpoints for both backends |
| Business rules engine | 14+ fraud detection rules |
| ML fusion logic | Score fusion, confidence mapping |
| Auth flows | S2S tokens, demo fallback, JWT validation |
| File parsers | CSV, CAMT.053, MT940, PAIN.001 |
| Validation rules | IBAN, dates, amounts, duplicates |
| Error handling | HTTP errors, service failures, edge cases |
| Frontend services | API calls, data mapping, state management |
| Cross-service pipeline | Multi-Banking → Fraud Detection flow |

---

## 2. Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                    Angular Frontend                      │
│                   (port 4200)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ FraudDashboard│  │MultiBanking  │  │Transactions  │  │
│  │  Component    │  │Dashboard     │  │List          │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
│         │                  │                             │
│  ┌──────┴───────┐  ┌──────┴───────┐                     │
│  │FraudAlerts   │  │MultiBanking  │                     │
│  │Service       │  │Service       │                     │
│  └──────┬───────┘  └──────┬───────┘                     │
└─────────┼──────────────────┼─────────────────────────────┘
          │ /api/*           │ /api/banking/*
          ▼                  ▼
┌─────────────────┐  ┌─────────────────┐
│ Fraud Detection │  │ Multi-Banking   │
│ FastAPI :8006   │◄─│ FastAPI :8010   │
│                 │  │                 │
│ • Rules Engine  │  │ • CSV Parser    │
│ • ML Model      │  │ • CAMT.053      │
│ • Graph Engine  │  │ • MT940         │
│ • Config Store  │  │ • Validators    │
└─────────────────┘  └─────────────────┘
```

---

## 3. Test Suite Inventory

### Backend: Fraud Detection

| File | Test Count | Scope |
|---|---|---|
| `fraud-detection/backend/tests/test_integration_suite.py` | ~100 tests | Full API, rules engine, auth, config, edge cases |
| `fraud-detection/backend/tests/test_api.py` | ~12 tests | API endpoint contracts |
| `fraud-detection/backend/tests/test_rules_engine.py` | ~15 tests | Business rules unit tests |
| `fraud-detection/backend/tests/mock_payloads.py` | — | Shared test data factories |

### Backend: Multi-Banking

| File | Test Count | Scope |
|---|---|---|
| `multi-banking/tests/test_integration_suite.py` | ~60 tests | Full pipeline, parsers, validation, error handling |
| `multi-banking/tests/test_ingest_integration.py` | ~5 tests | Ingest pipeline with mocked fraud service |
| `multi-banking/tests/test_csv_parser.py` | ~1 test | Basic CSV parsing |
| `multi-banking/tests/test_camt053_parser.py` | Tests | CAMT.053 parsing |
| `multi-banking/tests/test_mt940_parser.py` | Tests | MT940 parsing |
| `multi-banking/tests/test_duplicate_tolerance.py` | Tests | Duplicate detection tolerance |

### Frontend

| File | Test Count | Scope |
|---|---|---|
| `frontend/.../fraud-alerts.comprehensive.integration.spec.ts` | ~40 tests | FraudAlertsService full integration |
| `frontend/.../multi-banking.comprehensive.integration.spec.ts` | ~35 tests | MultiBankingService full integration |
| `frontend/.../fraud-alerts.service.spec.ts` | ~10 tests | Service unit tests |
| `frontend/.../multi-banking.service.spec.ts` | ~12 tests | Service unit tests |

### Cross-Service E2E

| File | Test Count | Scope |
|---|---|---|
| `fraud-detection/e2e/test_comprehensive_integration.py` | ~20 tests | Full pipeline, auth, data consistency, performance |
| `fraud-detection/e2e/test_full_pipeline.py` | ~3 tests | Basic E2E pipeline |

---

## 4. Prerequisites & Setup

### For Backend Tests

```bash
# Install Python dependencies
cd fraud-detection/backend
pip install -r requirements.txt
pip install pytest pytest-asyncio respx

cd ../../multi-banking
pip install -r requirements.txt
pip install pytest pytest-asyncio respx
```

### For Frontend Tests

```bash
cd fraud-detection/frontend
npm install
```

### For E2E Tests (requires running services)

```bash
# Start all services via Docker
docker-compose up -d

# OR start locally in separate terminals:
# Terminal 1: Fraud Detection
cd fraud-detection/backend && python main.py

# Terminal 2: Multi-Banking
cd multi-banking && python main.py

# Terminal 3: Frontend
cd fraud-detection/frontend && ng serve
```

### Environment Variables

```bash
# Fraud Detection (backend/conftest.py sets these automatically for tests)
export JWT_SECRET="test-secret-key-used-only-in-tests-32b"
export ENABLE_TEST_TOKEN_ENDPOINT=true
export TESTING=true
export RATE_LIMIT_REQUESTS=1000

# Multi-Banking (conftest.py sets this automatically)
export DISABLE_INTERNAL_AUTH=true
```

---

## 5. Running the Tests

### Backend: Fraud Detection

```bash
cd fraud-detection/backend

# Run all tests
pytest tests/ -v

# Run only the integration suite
pytest tests/test_integration_suite.py -v

# Run with coverage
pytest tests/ -v --cov=. --cov-report=term-missing

# Run specific test class
pytest tests/test_integration_suite.py::TestRegulatoryThresholdRules -v

# Run specific test
pytest tests/test_integration_suite.py::TestAnalyzeNormalFlows::test_clean_small_payment_is_matched -v
```

### Backend: Multi-Banking

```bash
cd multi-banking

# Run all tests
pytest tests/ -v

# Run integration suite
pytest tests/test_integration_suite.py -v

# Run with coverage
pytest tests/ -v --cov=. --cov-report=term-missing
```

### Frontend

```bash
cd fraud-detection/frontend

# Run all tests
npx ng test --watch=false

# Run specific spec file
npx ng test --watch=false --include='**/fraud-alerts.comprehensive.integration.spec.ts'

# Run with code coverage
npx ng test --watch=false --code-coverage
```

### E2E Tests (requires running services)

```bash
cd fraud-detection/e2e

# Install E2E dependencies
pip install -r requirements-e2e.txt

# Run E2E tests
pytest test_comprehensive_integration.py -v

# Run full pipeline test
pytest test_full_pipeline.py -v
```

---

## 6. Test Modules Reference

### SECTION 1: Fraud Detection Backend — API Endpoints

| Test | Scope | Scenario | Expected Outcome |
|---|---|---|---|
| `test_root_reports_all_system_statuses` | Root `/` | App startup | Returns `production_ready` with all flags |
| `test_health_endpoint_returns_ok` | `/health` | Monitoring ping | 200 OK with `status: ok` |
| `test_health_includes_x_request_id` | `/health` | Request tracing | X-Request-ID header present |

**Manual Test:**
1. Open browser to `http://localhost:8005/`
2. Verify JSON response with `status: "production_ready"`
3. Open `http://localhost:8005/health`
4. Verify `{"success": true, "data": {"status": "ok"}}`

---

### SECTION 2: Authentication Flows

| Test | Scope | Scenario | Expected Outcome |
|---|---|---|---|
| `test_valid_s2s_token_grants_access` | `/api/analyze` | Valid internal JWT | Request processed |
| `test_missing_token_falls_back_to_demo` | `/api/analyze` | No token (dev mode) | Demo context used |
| `test_invalid_token_falls_back_to_dev` | `/api/analyze` | Corrupted JWT | Dev context fallback |
| `test_test_token_endpoint_returns_usable_token` | `/api/token` | Dev requests token | Valid JWT returned |
| `test_demo_endpoint_requires_no_auth` | `/api/analyze-demo` | No auth needed | Request succeeds |

**Manual Test:**
1. `curl http://localhost:8005/api/token` — get a test token
2. Copy the `access_token` value
3. `curl -X POST http://localhost:8005/api/analyze -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '[{"id":"TX-1","amount":100,"description":"TEST","date":"2026-08-14","transaction_type":"PAYMENT","transaction_reference":"ref1"}]'`
4. Verify success response

---

### SECTION 3: Regulatory Threshold Rules

| Test | Scope | Scenario | Expected Outcome |
|---|---|---|---|
| `test_amount_above_10k_is_blocked` | SEUIL_REGLEMENTAIRE | 15,000 EUR transfer | isFraud=True, score≥90, SUSPICIOUS |
| `test_amount_exactly_at_10k_triggers_approche` | SEUIL_APPROCHE | Exactly 10,000 EUR | SEUIL_APPROCHE triggered, score=40 |
| `test_amount_just_below_approche_ratio_not_flagged` | Boundary | 8,999 EUR | Not flagged |
| `test_amount_at_9k_triggers_approche` | Boundary | 9,000 EUR | SEUIL_APPROCHE triggered |

**Manual Test:**
1. Navigate to Fraud Dashboard → "Détection Hybride" tab
2. Click "Analyser" with demo data
3. Find transaction `tx_seuil` (15,000 EUR) — verify it shows as CRITICAL/SUSPICIOUS
4. Find transaction `tx_approche` (9,500 EUR) — verify it shows elevated risk

---

### SECTION 4: Sensitive Keyword Rules

| Test | Scope | Scenario | Expected Outcome |
|---|---|---|---|
| `test_gambling_keywords_are_flagged` | MOTCLE_SENSIBLE | CASINO, PARIS, POKER, BET, PARI | All flagged |
| `test_clean_description_not_flagged` | Negative test | Normal description | Not flagged |
| `test_keyword_rule_is_case_insensitive` | Case handling | Mixed case variants | All detected |

**Manual Test:**
1. In Fraud Dashboard, click "Charger Démo"
2. Find transaction `tx_casino` — verify it shows SUSPICIOUS with "Mot-clé sensible" factor

---

### SECTION 5: Cash Out Rules

| Test | Scope | Scenario | Expected Outcome |
|---|---|---|---|
| `test_large_cash_out_is_blocked` | RETRAIT_CASH | 6,000 EUR CASH_OUT | score≥80 |
| `test_cash_out_at_exact_threshold_not_flagged` | Boundary | 5,000 EUR CASH_OUT | Not flagged |
| `test_small_cash_out_not_flagged` | Negative test | 200 EUR CASH_OUT | Not flagged |

**Manual Test:**
1. In Fraud Dashboard, find `tx_cash` (6,000 EUR CASH_OUT) — verify flagged

---

### SECTION 6: Behavioral Rules

| Test | Scope | Scenario | Expected Outcome |
|---|---|---|---|
| `test_atypical_hour_3am_is_flagged` | HORAIRE_ATYPIQUE | 3:15 AM transaction | score≥25 |
| `test_normal_hour_2pm_not_flagged` | Negative test | 2:00 PM transaction | score<25 |
| `test_device_change_detection` | CHANGEMENT_DEVICE | Same account, different device | score≥70 |
| `test_geolocation_change_detection` | CHANGEMENT_GEOLOC | FR→TN geolocation change | score≥85 |

**Manual Test:**
1. Start the backend with debug logging
2. Submit two transactions with different `device_fingerprint` values for the same IBAN
3. Check logs for "CHANGEMENT_DEVICE" rule trigger

---

### SECTION 7: Batch Processing Rules

| Test | Scope | Scenario | Expected Outcome |
|---|---|---|---|
| `test_duplicate_payments_detected` | PAIEMENT_DUPLIQUE | 2 identical payments | Score increase |
| `test_repetitive_payments_detected` | PAIEMENT_REPETITIF | 3+ identical payments | All flagged |
| `test_structuring_detection` | FRACTIONNEMENT_SUSPECT | Sub-threshold summing >10k | Flagged |

**Manual Test:**
1. Prepare CSV with 3 identical transactions (same amount, description, tenant)
2. Upload via Multi-Banking Dashboard
3. In Fraud Dashboard, verify all 3 show PAIEMENT_REPETITIF category

---

### SECTION 8: Score Fusion Logic

| Test | Scope | Scenario | Expected Outcome |
|---|---|---|---|
| `test_fusion_with_no_rule_category` | ML only | No rule triggered | Returns ML probability |
| `test_fusion_with_rule_and_ml` | Combined | Both ML and rules | Higher than either alone |
| `test_fusion_with_isolation_forest_anomaly` | Anomaly boost | IF detects anomaly | Score boosted |
| `test_fusion_never_exceeds_1` | Boundary | Multiple high scores | Capped at 1.0 |

**Manual Test:**
1. In Fraud Dashboard, check the "Vue d'ensemble" tab
2. Verify fraud probability scores are between 0 and 1
3. Verify scores are 0 for clean transactions

---

### SECTION 9: Config Management

| Test | Scope | Scenario | Expected Outcome |
|---|---|---|---|
| `test_get_thresholds_returns_defaults` | Read | Default config | Returns default values |
| `test_update_thresholds_persists` | Write | Update threshold | Value persisted |
| `test_update_with_invalid_keys_ignored` | Validation | Unknown key | Silently filtered |
| `test_update_type_coercion_float` | Type safety | Int→float | Correct type |

**Manual Test:**
1. Navigate to Fraud Dashboard → "Config Seuils" tab
2. Change SEUIL_REGLEMENTAIRE from 10000 to 15000
3. Click "Sauvegarder"
4. Refresh page — verify value persists at 15000
5. Submit a 12,000 EUR transaction — verify it's no longer flagged (below new threshold)

---

### SECTION 10: Multi-Banking Pipeline

| Test | Scope | Scenario | Expected Outcome |
|---|---|---|---|
| `test_successful_ingest_returns_results` | Full pipeline | CSV upload | Parsed + fraud analyzed |
| `test_ingest_502_when_fraud_service_errors` | Error propagation | Fraud service 500 | 502 Bad Gateway |
| `test_parse_endpoint_returns_transactions` | Parse only | CSV parse | Transactions returned |
| `test_validate_endpoint_returns_validation_result` | Validate only | CSV validate | Validation results |

**Manual Test:**
1. Navigate to Multi-Banking Dashboard
2. Select a CSV file, choose bank "Bank A", format "CSV"
3. Click "Uploader"
4. Verify success toast: "Fichier traité avec succès - X transactions extraites"
5. Check "Uploads Récents" table shows the upload with status "Réussi"

---

### SECTION 11: Frontend Service Integration

| Test | Scope | Scenario | Expected Outcome |
|---|---|---|---|
| `should map TransactionOutputDTO[] to FraudAlert[]` | Data mapping | API response | Frontend model populated |
| `should compute dashboard stats correctly` | Stats | Multiple alerts | KPIs computed |
| `should handle 500 Internal Server Error` | Error handling | Server error | Loading reset, error propagated |
| `should include multipart form data with correct fields` | File upload | CSV upload | FormData correct |

**Manual Test:**
1. Open browser DevTools → Network tab
2. Navigate to Fraud Dashboard
3. Click "Charger Démo"
4. Verify POST to `/api/analyze-demo` returns 200
5. Verify dashboard KPIs update (Total Alertes, Critical, etc.)

---

### SECTION 12: Cross-Service E2E

| Test | Scope | Scenario | Expected Outcome |
|---|---|---|---|
| `test_high_amount_flags_fraud` | Full pipeline | 15k EUR CSV | Fraud flagged |
| `test_sensitive_keyword_flags_fraud` | Full pipeline | CASINO CSV | Fraud flagged |
| `test_analyze_response_time_under_2s` | Performance | 10 transactions | <2s response |
| `test_transaction_reference_preserved` | Data integrity | Full pipeline | Reference preserved |

**Manual Test:**
1. Start all services: `docker-compose up -d`
2. Open `http://localhost:4200`
3. Go to Multi-Banking Dashboard
4. Upload `data/sample.csv`
5. Go to Fraud Dashboard
6. Verify the analyzed transactions appear with correct fraud flags

---

## 7. Manual Testing Guide

### Test Case 1: Normal Transaction Flow

| Step | Action | Expected Result |
|---|---|---|
| 1 | Open `http://localhost:4200/fraud-detection` | Dashboard loads with KPIs |
| 2 | Click "Charger Démo" | 11 demo transactions loaded |
| 3 | Check "Vue d'ensemble" tab | Severity donut, time series, heatmap visible |
| 4 | Check "Detection Hybride" tab | Transaction list with fraud scores |
| 5 | Verify clean transactions show MATCHED | Green badge, low score |
| 6 | Verify flagged transactions show SUSPICIOUS | Red badge, high score |

### Test Case 2: File Upload Flow

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to Multi-Banking Dashboard | Stats and upload history visible |
| 2 | Click "Choisir un fichier" | File picker opens |
| 3 | Select a CSV file | File name displayed |
| 4 | Select a bank from dropdown | Bank selected |
| 5 | Select format "CSV" | Format selected |
| 6 | Click "Uploader" | Loading spinner, then success toast |
| 7 | Check "Uploads Récents" | New entry with status "Réussi" |

### Test Case 3: Threshold Configuration

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to Fraud Dashboard → "Config Seuils" | Current thresholds displayed |
| 2 | Change SEUIL_REGLEMENTAIRE to 5000 | Input field updates |
| 3 | Click "Sauvegarder" | Success notification |
| 4 | Submit a 6,000 EUR transaction | Now flagged as SEUIL_REGLEMENTAIRE |
| 5 | Reset threshold to 10000 | Value restored |

### Test Case 4: Error Handling

| Step | Action | Expected Result |
|---|---|---|
| 1 | Stop the fraud detection backend | Service unavailable |
| 2 | Try to upload a file via Multi-Banking | Error message displayed |
| 3 | Restart the backend | Service恢复 |
| 4 | Upload again | Success |

### Test Case 5: Graph Visualization

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to Fraud Dashboard → "Reseaux & Graphe" | Graph visualization loads |
| 2 | Click on a flagged account node | Network expands |
| 3 | Check for fraud network indicators | Connected suspicious accounts highlighted |
| 4 | Check mule account detection | Mule accounts flagged |

---

## 8. Edge Cases & Scenarios

### Malicious Payloads

| Scenario | Input | Expected Behavior |
|---|---|---|
| SQL Injection in description | `'; DROP TABLE fraud_alerts;--` | Processed safely, no DB impact |
| XSS in description | `<script>alert('xss')</script>` | Stored as plain text |
| Extremely large amount | `999999999999` | DONNEE_INVALIDE or processed |
| Negative amount | `-500` | DONNEE_INVALIDE |
| Unicode overflow | 10,000 char description | Processed without crash |

### Multi-Bank Synchronization Conflicts

| Scenario | Expected Behavior |
|---|---|
| Same transaction from two banks | Duplicate detected via SHA-256 hash |
| Slight amount difference (±0.02 EUR) | Near-duplicate flagged |
| Different dates for same transaction | Treated as separate transactions |
| Concurrent uploads from same tenant | Both processed independently |

### Network Resilience

| Scenario | Expected Behavior |
|---|---|
| Fraud service timeout | Retry with exponential backoff (3 attempts) |
| Fraud service 502/503/504 | Retried up to 3 times |
| Fraud service 500 | 502 returned to caller |
| Network partition | Graceful degradation |

---

## 9. Troubleshooting

### Common Issues

| Issue | Solution |
|---|---|
| `ModuleNotFoundError: main` | Run pytest from the module directory |
| `JWT_SECRET not set` | conftest.py sets this; ensure it runs first |
| `Rate limit exceeded` | conftest.py sets high limits; check env |
| `Model not loaded` | Tests use `rules_only` fixture; ML tests skip |
| `Frontend tests fail with SSR` | Tests run in browser mode, not SSR |
| `E2E tests fail` | Ensure both services are running |

### Verifying Test Results

```bash
# Backend: Check test summary
pytest tests/ -v --tb=short 2>&1 | tail -20

# Frontend: Check Karma/Vitest output
npx ng test --watch=false 2>&1 | tail -20

# E2E: Check full pipeline
pytest e2e/ -v --tb=short 2>&1 | tail -20
```

### Test Data Cleanup

Tests use `autouse` fixtures to clear caches between runs:
- `_velocity_cache.clear()` — velocity tracking
- `_device_cache.clear()` — device fingerprint tracking
- `_geo_cache.clear()` — geolocation tracking

No manual cleanup needed between test runs.

---

## File Reference

```
fraud-detection/
├── backend/
│   ├── tests/
│   │   ├── conftest.py                    # Test configuration
│   │   ├── factories.py                   # Test data factories
│   │   ├── mock_payloads.py              # NEW: Comprehensive mock data
│   │   ├── test_integration_suite.py      # NEW: ~100 integration tests
│   │   ├── test_api.py                    # Existing API tests
│   │   └── test_rules_engine.py           # Existing rules tests
│   └── pytest.ini
├── e2e/
│   ├── test_full_pipeline.py              # Existing E2E tests
│   └── test_comprehensive_integration.py  # NEW: Cross-service E2E
├── frontend/
│   └── src/app/features/
│       ├── fraud-detection/services/
│       │   └── fraud-alerts.comprehensive.integration.spec.ts  # NEW
│       └── multi-banking/services/
│           └── multi-banking.comprehensive.integration.spec.ts  # NEW
multi-banking/
├── tests/
│   ├── conftest.py
│   └── test_integration_suite.py          # NEW: ~60 integration tests
└── TESTING_GUIDE.md                       # NEW: This document
```
