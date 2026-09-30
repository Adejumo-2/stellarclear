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

## 2. On-Chain & Cross-Layer Consistency Verification

StellarClear enforces a strict cross-layer consistency model:
```text
Database state == Indexed state == On-chain state == SettlementProof
```

To verify that the off-chain database, indexer state, on-chain Soroban contract state, and proof commitments remain in lockstep:

```bash
curl http://localhost:3000/v1/cases/:caseId/consistency
```

### Consistency Report Fields:
- `isConsistent`: Boolean flag indicating complete agreement between DB and contract.
- `consistencyStatus`: High-level status classification:
  - `CONSISTENT`: Complete agreement across commitments, statuses, and transaction references.
  - `MISSING_ONCHAIN_CASE`: Case exists in database but has not been anchored in Soroban `SettlementRegistry`.
  - `COMMITMENT_MISMATCH`: Cryptographic SHA-256 commitments differ between database records and on-chain state.
  - `STATE_MISMATCH`: Database status and contract status contradict each other.
  - `STALE_DATABASE`: On-chain state has advanced past the database representation (requires indexer catch-up).
  - `STALE_CHAIN_REFERENCE`: Missing create or lifecycle transaction references in local persistence.
- `databaseStatus`: Off-chain database lifecycle status (`OPEN`, `OBSERVED`, `MATCHED`, `BREAK`, `DISPUTED`, `RESOLVED`, `FINALIZED`).
- `onChainStatus`: Authoritative on-chain Soroban lifecycle status.
- `details`:
  - `termsCommitmentMatch`: Boolean verification of terms hash.
  - `observationCommitmentMatch`: Boolean verification of observation hash.
  - `statusMatch`: Boolean check on state alignment.
  - `onChainCaseExists`: Verification of contract entry.
  - `chainReferencePresent`: Verification of create transaction hash.
  - `attestationsConsistent`: Verification of multi-party attestations.
  - `disputeResolutionConsistent`: Verification of dispute/resolution records.
  - `finalizationConsistent`: Verification of final ledger and state.
  - `networkIdentityConsistent`: Verification of contract ID and network passphrase.
  - `transactionReferences`: Recorded transaction hashes (`createTxHash`, `observationTxHash`, `reconciliationTxHash`, `attestationTxHash`, `disputeTxHash`, `resolutionTxHash`, `finalizationTxHash`).
  - `discrepancies`: List of human-readable diagnostic descriptions for any detected mismatch.

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
