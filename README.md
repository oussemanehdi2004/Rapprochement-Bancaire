# BankMatch - Multi-Banking & Fraud Detection Modules

## Overview

This repository contains the Multi-Banking and Fraud Detection modules developed for the BankMatch platform. These modules handle the ingestion of bank statements in multiple formats and integrate with a fraud detection engine.

## Architecture

The system consists of two main microservices:

### Multi-Banking Service
- **Port**: 8010
- **Responsibilities**: 
  - Parse bank statements (CSV, CAMT.053, MT940, PAIN.001)
  - Normalize transactions to a pivot schema
  - Validate transactions (IBAN, dates, amounts, duplicates)
  - Transmit to Fraud Detection service via JWT authentication
  - Integrate with BankMatch API (currently disabled)

### Fraud Detection Service
- **Port**: 8005
- **Responsibilities**:
  - Analyze transactions for fraud patterns
  - Apply business rules and ML models (XGBoost, Isolation Forest)
  - Provide explainability via SHAP
  - Graph analysis with Neo4j

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Python 3.13
- Node.js (for frontend)

### Environment Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd rapprochement-bancaire
```

2. Configure environment variables:
```bash
# Multi-Banking
cd multi-banking
cp .env.example .env
# Edit .env with your configuration

# Fraud Detection
cd ../fraud-detection
cp .env.example .env
# Edit .env with your configuration
```

3. Start services with Docker Compose:
```bash
docker-compose up -d
```

### Testing

#### Multi-Banking Tests
```bash
cd multi-banking
python -m pytest tests/ -v
```

#### Fraud Detection Tests
```bash
cd fraud-detection/backend
python -m pytest tests/ -v
```

#### Frontend Integration Tests
```bash
cd fraud-detection/frontend
ng test --include="**/*.integration.spec.ts" --no-watch
```

## API Endpoints

### Multi-Banking Service
- `GET /health` - Health check
- `POST /api/multi-banking/parse` - Parse bank file
- `POST /api/multi-banking/validate` - Validate transactions
- `POST /api/multi-banking/ingest` - Complete ingestion pipeline
- `GET /stats` - Ingestion statistics
- `GET /uploads` - Upload history

### Fraud Detection Service
- `GET /health` - Health check
- `POST /api/analyze` - Analyze transactions
- `GET/POST /api/config` - Threshold configuration
- `GET /api/graph/*` - Graph-based fraud detection
- `GET /api/reports` - Fraud reports and analytics

## Configuration

### Multi-Banking Environment Variables
```bash
# Internal Service Authentication
INTERNAL_SERVICE_SECRET=internal_dev_secret
DISABLE_INTERNAL_AUTH=false

# BankMatch Integration
MULTI_BANKING_SERVICE_SECRET=multi_banking_dev_secret
BANKMATCH_BASE_URL=http://localhost:4090/api
BANKMATCH_INTEGRATION_ENABLED=false

# Service Configuration
FRAUD_SERVICE_URL=http://localhost:8005
ENVIRONMENT=development
DEBUG_PAYLOAD=false
```

### Fraud Detection Environment Variables
```bash
# Internal Service Authentication
INTERNAL_SERVICE_SECRET=internal_dev_secret
DISABLE_INTERNAL_AUTH=false

# Service Configuration
NODE_BACKEND_URL=http://localhost:3000
ENVIRONMENT=development
ENABLE_TEST_TOKEN_ENDPOINT=false

# Supabase Integration
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

## Security Considerations

⚠️ **Important Security Notes**:
- Current JWT secrets are for development only (19-24 bytes). Use 32+ character secrets in production
- Tenant isolation relies on proper token validation by BankMatch backend
- XML parsing should be hardened against XXE attacks in production
- Never commit secrets to the repository

## Monitoring

- **Prometheus**: Metrics exposed on `/metrics` endpoint
- **Grafana**: Available for visualization (configuration required)
- **Structured Logging**: JSON logs with request ID tracking

## Architecture Decisions

Key architectural decisions are documented in `ARCHITECTURE_DECISIONS.md`:
- Service scope boundaries (Multi-Banking NOT implementing matching engine)
- Authentication patterns (internal JWT with 30min expiration)
- Integration approach with BankMatch APIs

## Testing Results

Current test coverage (as of 2026-08-18):
- Multi-Banking Backend: 28 tests (10.63s) ✅ PASSED
- Fraud Detection Backend: 71 tests (243.18s) ✅ PASSED
- Frontend Integration: 35 tests (24.61s) ✅ PASSED
- **Total**: 134 tests ✅ ALL PASSED

## Known Limitations

- Duplicate detection uses hardcoded ±0.02 EUR tolerance
- Statistics stored in memory (lost on restart)
- Retry logic is hardcoded (3 attempts, 0.5s initial delay)
- BankMatch integration disabled pending API contract finalization
- End-to-end tests not yet implemented
- Neo4j connection issues in some environments

## Future Improvements

- Add persistence for upload statistics
- Implement end-to-end tests with Docker Compose
- Make duplicate tolerance and retry delays configurable
- Complete BankMatch API integration
- Enhance security (RS256 JWT, secrets management)
- Add comprehensive API documentation

## Documentation

- `ARCHITECTURE_DECISIONS.md` - Architecture decisions and implementation status
- `INTEGRATION.md` - Integration guide and API contracts
- `TESTING_FINDINGS_AND_RECOMMENDATIONS.md` - Test results and recommendations
- `TESTING_REPORT.md` - Detailed testing report

## Support

For questions about:
- **Architecture**: Reference `ARCHITECTURE_DECISIONS.md`
- **BankMatch integration**: Contact BankMatch team for API contracts
- **Deployment**: Follow deployment readiness checklist in architecture docs

## License

Internal project - ELITECOM

## Version

- Multi-Banking API: v1.1.0
- Fraud Detection API: v2.2.0
- Last Updated: 2026-08-24