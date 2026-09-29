# StellarClear Operations Guide

This guide outlines operational procedures, health checks, monitoring, audit trails, and resiliency features for running StellarClear in production.

---

## 1. Service Health & Readiness

StellarClear provides Kubernetes/load-balancer friendly probes:

### Liveness Probe (`GET /health`)
Verifies the HTTP process is running and responding:
```bash
curl -i http://localhost:3000/health
```
```json
{
  "status": "ok",
  "service": "stellarclear-api",
  "version": "0.1.0",
  "timestamp": "2026-09-29T16:00:00.000Z"
}
```

### Readiness Probe (`GET /ready`)
Checks downstream database connectivity, Soroban RPC reachability, and indexer sync cursor:
```bash
curl -i http://localhost:3000/ready
```
```json
{
  "ready": true,
  "service": "stellarclear-api",
  "timestamp": "2026-09-29T16:00:00.000Z",
  "checks": {
    "database": { "status": "UP", "details": { "connected": true } },
    "sorobanRpc": { "status": "UP", "details": { "network": "testnet" } },
    "contract": { "status": "UP", "details": { "contractId": "CAAA..." } },
    "indexer": { "status": "UP", "details": { "lastIngestedLedger": 1250000 } }
  }
}
```
*HTTP status is `200 OK` when ready, and `503 Service Unavailable` if any check fails.*

---

## 2. On-Chain Consistency Verification

To verify that the off-chain database and on-chain Soroban contract state remain in lockstep:

```bash
curl http://localhost:3000/v1/cases/:caseId/consistency
```

### Consistency Report Fields:
- `isConsistent`: Boolean flag indicating complete agreement between DB and contract.
- `stateMismatch`: Detected discrepancies (`CONSISTENT`, `MISSING_ONCHAIN_CASE`, `COMMITMENT_MISMATCH`, `STATE_MISMATCH`, `STALE_DATABASE`, `STALE_CHAIN_REFERENCE`).
- `dbCase`: Off-chain database snapshot.
- `onchainCase`: Authoritative Soroban contract state.

---

## 3. Settlement Audit History

For compliance and operational visibility, every case generates an append-only audit trail:

```bash
curl http://localhost:3000/v1/cases/:caseId/audit
```

```json
{
  "caseId": "1111111111111111111111111111111111111111111111111111111111111111",
  "totalEvents": 4,
  "milestones": [
    {
      "eventType": "CASE_CREATED",
      "timestamp": "2026-09-29T14:00:00.000Z",
      "txHash": "0x_create_tx...",
      "actor": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ"
    },
    {
      "eventType": "OBSERVED",
      "timestamp": "2026-09-29T14:05:00.000Z",
      "txHash": "0x_obs_tx...",
      "actor": "GCOBSERVER..."
    },
    {
      "eventType": "MATCHED",
      "timestamp": "2026-09-29T14:06:00.000Z",
      "txHash": "0x_match_tx...",
      "actor": "GCOBSERVER..."
    },
    {
      "eventType": "FINALIZED",
      "timestamp": "2026-09-29T14:10:00.000Z",
      "txHash": "0x_fin_tx...",
      "actor": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ"
    }
  ]
}
```

---

## 4. Idempotency & Replay Protection

All state-mutating HTTP endpoints (`POST /v1/cases`, `POST /v1/cases/:caseId/observe`, `POST /v1/cases/:caseId/finalize`, etc.) support the `Idempotency-Key` header.

### Usage:
```bash
curl -X POST http://localhost:3000/v1/cases/1111.../finalize \
  -H "Idempotency-Key: idemp-finalize-uuid-12345" \
  -H "Content-Type: application/json" \
  -d '{"finalizer": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ"}'
```

- If a network retry occurs with the same `Idempotency-Key`, the API returns the original cached response with identical status codes without re-submitting transactions or modifying records.
- Duplicate finalization attempts on already finalized cases return the existing finalized state safely with `isIdempotentReplay: true`.
