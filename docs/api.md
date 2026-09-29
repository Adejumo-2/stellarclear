# StellarClear REST API Reference

The StellarClear API service provides endpoints to manage the end-to-end settlement reconciliation, attestation, dispute, and proof lifecycle.

**Base Path**: `/`  
**Content-Type**: `application/json`  
**Network Header**: Standard tracing header `X-Request-Id` is accepted and returned on all responses.

---

## Endpoints Summary

| Method | Path | Description |
|:---|:---|:---|
| `GET` | `/health` | Service health status |
| `GET` | `/ready` | Service readiness and database connectivity |
| `POST` | `/v1/cases` | Create a new settlement case and anchor on Soroban |
| `GET` | `/v1/cases/:caseId` | Retrieve a settlement case by 32-byte hex ID |
| `POST` | `/v1/cases/:caseId/observe` | Record an observed Stellar settlement transaction |
| `POST` | `/v1/cases/:caseId/reconcile` | Run automated reconciliation matcher and anchor decision |
| `GET` | `/v1/cases/:caseId/breaks` | List reconciliation break diagnostics |
| `POST` | `/v1/cases/:caseId/attest` | Submit a cryptographic settlement attestation |
| `GET` | `/v1/cases/:caseId/attestations` | List all recorded attestations for a case |
| `POST` | `/v1/cases/:caseId/dispute` | Open a settlement dispute with evidence payload |
| `POST` | `/v1/cases/:caseId/resolve` | Submit a dispute resolution agreement |
| `GET` | `/v1/cases/:caseId/dispute` | Get dispute and resolution details for a case |
| `POST` | `/v1/cases/:caseId/finalize` | Finalize a matched or resolved case on Soroban |
| `GET` | `/v1/cases/:caseId/proof` | Export a verifiable `SettlementProof` artifact |
| `POST` | `/v1/proofs/verify` | Offline cryptographic proof verification |
| `POST` | `/v1/proofs/verify/onchain` | Verify cryptographic proof against live Soroban contract state |

---

## 1. Case Management

### `POST /v1/cases`
Creates a new expected settlement instruction, computes its terms commitment, anchors the case on Soroban, and stores it in the database.

**Request Body**:
```json
{
  "expected": {
    "caseId": "1111111111111111111111111111111111111111111111111111111111111111",
    "owner": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    "counterparty": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    "tradeReference": "TRADE-100",
    "asset": "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    "amount": "50000.00",
    "expectedDestination": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    "reference": "INV-999",
    "deadline": 1250000
  }
}
```

**Response (201 Created)**:
```json
{
  "caseId": "1111111111111111111111111111111111111111111111111111111111111111",
  "status": "OPEN",
  "termsCommitment": "a3b1c2...",
  "txHash": "0x_create_tx_...",
  "createdAt": "2026-09-29T14:00:00.000Z"
}
```

---

## 2. Observation & Reconciliation

### `POST /v1/cases/:caseId/observe`
Records an observed Stellar payment transaction.

**Request Body**:
```json
{
  "observation": {
    "txHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "ledger": 1249950,
    "asset": "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    "amount": "50000.00",
    "destination": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    "reference": "INV-999",
    "status": "SUCCESS",
    "observedAt": "2026-09-29T14:05:00.000Z"
  }
}
```

**Response (200 OK)**:
```json
{
  "caseId": "1111111111111111111111111111111111111111111111111111111111111111",
  "status": "OBSERVED",
  "observationCommitment": "f4e5d6...",
  "txHash": "0x_obs_tx_...",
  "observedAt": "2026-09-29T14:05:00.000Z"
}
```

### `POST /v1/cases/:caseId/reconcile`
Executes automated rule matching against expected terms and observed transaction.

**Response (200 OK - Match)**:
```json
{
  "caseId": "1111111111111111111111111111111111111111111111111111111111111111",
  "status": "MATCHED",
  "matched": true,
  "breaks": [],
  "reconciledAt": "2026-09-29T14:06:00.000Z",
  "txHash": "0x_match_tx_..."
}
```

---

## 3. Proof Verification

### `POST /v1/proofs/verify/onchain`
Verifies a `SettlementProof` package against canonical commitments and queries live Soroban smart contract state.

**Request Body**:
```json
{
  "proof": {
    "version": "1.0.0",
    "caseId": "1111111111111111111111111111111111111111111111111111111111111111",
    "termsCommitment": "a3b1c2...",
    "observationCommitment": "f4e5d6...",
    "finalizedLedger": 1250000,
    "result": "MATCHED",
    "attestations": [],
    "contractId": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
    "network": "testnet",
    "generatedAt": "2026-09-29T14:10:00.000Z"
  },
  "termsDocument": { ... },
  "observedDocument": { ... }
}
```

**Response (200 OK)**:
```json
{
  "valid": true,
  "recomputedTermsCommitment": "a3b1c2...",
  "recomputedObservationCommitment": "f4e5d6...",
  "onChainState": {
    "caseId": "1111111111111111111111111111111111111111111111111111111111111111",
    "status": "MATCHED",
    "termsCommitment": "a3b1c2...",
    "observationCommitment": "f4e5d6...",
    "finalizedLedger": 1250000
  },
  "verifiedAt": "2026-09-29T14:12:00.000Z"
}
```

---

## Error Handling Model

All error responses adhere to the standard envelope format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid decimal format in amount",
    "requestId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "details": [ ... ]
  }
}
```

### Standard HTTP Status Codes:
- `400 Bad Request`: Payload validation error or invalid lifecycle transition.
- `403 Forbidden`: Unauthorized participant action for role.
- `404 Not Found`: Target case ID does not exist.
- `409 Conflict`: Duplicate case ID creation.
- `500 Internal Server Error`: Unhandled server or RPC exception.
