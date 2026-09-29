# @stellarclear/api

REST API service for StellarClear settlement operations, evidence ingestion, and reconciliation.

## Endpoints

- `POST /v1/cases` - Create a settlement case
- `GET /v1/cases/:caseId` - Retrieve settlement case details
- `POST /v1/cases/:caseId/observe` - Submit observed transaction
- `POST /v1/cases/:caseId/reconcile` - Trigger deterministic reconciliation
- `GET /v1/cases/:caseId/breaks` - List reconciliation breaks
- `GET /health` - Health check
- `GET /ready` - Readiness check
