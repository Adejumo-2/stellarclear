# StellarClear Release Candidate Runbook

This runbook specifies operational verification procedures, health diagnostics, deployment gates, and emergency remediation steps for validating and operating StellarClear release candidates (RC).

---

## 1. Release Candidate Verification Gates

Before promoting any release candidate build to production, the automated release verification pipeline must succeed:

```bash
# Execute full multi-stage release verification pipeline
npm run verify:release
```

The pipeline executes seven sequential validation stages:
1. **Build Validation**: Compiles all TypeScript packages (`schemas`, `proof`, `db`, `sdk`, `settlement-registry`) and services (`api`, `indexer`, `matcher`).
2. **Strict Typecheck**: Runs TypeScript compiler across all packages and test suites in strict mode with 0 errors.
3. **Unit Test Suite**: Exercises schemas, canonical serialization, matcher decimal normalization, break taxonomy, and database client repositories.
4. **API Service Suite**: Validates all HTTP endpoints, Zod schema validations, idempotency replays, dispute workflows, and sanitized error responses.
5. **Indexer Sync Suite**: Verifies idempotent Soroban contract event ingestion, ledger sequence checkpoints, and DB state sync.
6. **Cross-Layer Consistency Suite**: Confirms mathematical equality: `Database state == Indexer state == On-chain state == SettlementProof`.
7. **Live Contract Integration Suite**: Exercises the full lifecycle against deployed Soroban contract bindings.

---

## 2. Configuration & Pre-Flight Security Validation

Ensure production configuration avoids unsafe development defaults:

```bash
# Verify environment variables
export STELLAR_NETWORK="mainnet"
export STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
export STELLAR_RPC_URL="https://horizon.stellar.org/soroban/rpc"
export STELLAR_CONTRACT_ID="C..." # Authoritative deployed SettlementRegistry contract ID
export DATABASE_URL="postgres://user:password@prod-db.internal:5432/stellarclear_prod"
export ENABLE_ANCHORING="true"
export NODE_ENV="production"
```

The API service validates configurations at startup via `detectUnsafeDefaults()` and `validateProductionConfig()`:
- Rejects placeholder contract IDs (`CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM`).
- Rejects testnet passphrases in production environments.
- Enforces strict 1MB payload limits and idempotency key fingerprinting.

---

## 3. Operational Probes & Diagnostic Endpoints

StellarClear exposes three tiers of monitoring endpoints:

### Liveness Probe (`GET /health`)
Used by container orchestrators to detect process lockup:
```bash
curl -f http://localhost:3000/health
```
```json
{
  "status": "ok",
  "service": "stellarclear-api",
  "version": "0.1.0",
  "uptimeSeconds": 86400,
  "timestamp": "2026-09-30T12:00:00.000Z"
}
```

### Readiness Probe (`GET /ready`)
Used by load balancers before routing settlement traffic:
```bash
curl -f http://localhost:3000/ready
```
Returns `200 OK` when healthy, or `503 Service Unavailable` if database or contract RPC is unreachable.

### Structured Health Diagnostics (`GET /v1/operations/diagnostics`)
Used for deep telemetry, pipeline latency, and ledger indexing status:
```bash
curl http://localhost:3000/v1/operations/diagnostics
```
```json
{
  "status": "healthy",
  "timestamp": "2026-09-30T12:00:00.000Z",
  "uptimeSeconds": 86400,
  "version": "0.1.0",
  "environment": "testnet",
  "database": {
    "status": "healthy",
    "latencyMs": 4,
    "totalCases": 15420,
    "totalObservations": 15418,
    "totalReconciliations": 15418,
    "totalBreaks": 12
  },
  "contract": {
    "status": "healthy",
    "contractId": "CAAA...",
    "network": "testnet",
    "rpcUrl": "https://soroban-testnet.stellar.org",
    "anchoringEnabled": true,
    "rpcLatencyMs": 48
  },
  "indexing": {
    "status": "synced",
    "latestLedger": 1650000,
    "indexedCheckpoint": 1650000,
    "pendingEventsCount": 0
  },
  "pipeline": {
    "openCases": 2,
    "matchedCases": 15406,
    "brokenCases": 8,
    "disputedCases": 1,
    "resolvedCases": 1,
    "finalizedCases": 15400
  }
}
```

---

## 4. Release Candidate E2E Verification Workflow

Perform a smoke verification of the release candidate using the standard lifecycle:

1. **Create Case**:
   ```bash
   curl -X POST http://localhost:3000/v1/cases \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: rc-smoke-001" \
     -d '{"expected": {"caseId": "'$CASE_ID'", "owner": "'$OWNER'", "tradeReference": "RC-SMOKE-1", "asset": "USDC:G...", "amount": "100.0000000", "expectedDestination": "'$DEST'", "deadline": 2000000}}'
   ```

2. **Submit Observation**:
   ```bash
   curl -X POST http://localhost:3000/v1/cases/$CASE_ID/observe \
     -H "Content-Type: application/json" \
     -d '{"observation": {"txHash": "'$TX_HASH'", "ledger": 1600000, "asset": "USDC:G...", "amount": "100.0000000", "destination": "'$DEST'", "status": "SUCCESS", "observedAt": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}}'
   ```

3. **Reconcile**:
   ```bash
   curl -X POST http://localhost:3000/v1/cases/$CASE_ID/reconcile
   ```

4. **Verify Consistency**:
   ```bash
   curl http://localhost:3000/v1/cases/$CASE_ID/consistency
   ```
   Ensure `"isConsistent": true` and `"consistencyStatus": "CONSISTENT"`.

5. **Generate & Verify Proof**:
   ```bash
   curl http://localhost:3000/v1/cases/$CASE_ID/proof
   ```

6. **Finalize**:
   ```bash
   curl -X POST http://localhost:3000/v1/cases/$CASE_ID/finalize
   ```

---

## 5. Incident Response & Playbooks

### Case Consistency Drift Detected
- **Symptom**: `GET /v1/cases/:caseId/consistency` returns `isConsistent: false` with `STALE_DATABASE`.
- **Root Cause**: Indexer event stream delayed behind Soroban ledger close.
- **Remediation**:
  1. Inspect `indexing.pendingEventsCount` via `/v1/operations/diagnostics`.
  2. Verify Soroban RPC node sync status.
  3. Re-run indexer sync: `npm run start:indexer -- --catchup`.

### Replay Conflict (`409 IDEMPOTENCY_CONFLICT`)
- **Symptom**: Client request rejected with HTTP 409 and error code `IDEMPOTENCY_CONFLICT`.
- **Root Cause**: The client sent a mutated payload using an existing `Idempotency-Key`.
- **Remediation**:
  1. Verify client retry logic is generating fresh UUIDs for new business intents.
  2. For true retries, ensure exact canonical payload matching.

### Rollback Procedure
If a release candidate fails post-deployment smoke tests:
1. Re-route gateway traffic to the prior stable release tag.
2. The Postgres schema migrations are backward-compatible.
3. On-chain Soroban contract state remains immutable and safely readable by earlier clients.
