# StellarClear Troubleshooting Guide

This guide helps operators diagnose and resolve common reconciliation, network, indexer, and contract errors in StellarClear.

---

## 1. Reconciliation Breaks Diagnostics

When `POST /v1/cases/:caseId/reconcile` returns a `BREAK` result, query `GET /v1/cases/:caseId/breaks` for detailed breakdown:

### Break Codes & Remediation:

| Break Code | Cause | Operator Action |
|:---|:---|:---|
| `AMOUNT_MISMATCH` | Paid amount does not match expected settlement instruction. | Check decimals/base units. If counterparty short-paid, open dispute or request top-up payment. |
| `ASSET_MISMATCH` | Payment made in wrong asset (e.g., native XLM instead of USDC). | Confirm asset code and issuer StrKey. Counterparty must execute transfer with specified asset. |
| `DESTINATION_MISMATCH` | Payment sent to incorrect destination account. | Verify expected destination. If funds misdirected, dispute or re-route. |
| `REFERENCE_MISMATCH` | Memo / payment reference tag did not match instruction. | Ensure payment transaction included the specified memo text or hash. |
| `LATE_SETTLEMENT` | Settlement transaction ledger sequence > instruction deadline. | Extend deadline via agreement or dispute to resolve timeline exception. |
| `MISSING_SETTLEMENT` | No corresponding payment transaction found on Stellar. | Verify sender executed payment; verify indexer is up to date with the latest ledger. |
| `FAILED_TRANSACTION` | Stellar transaction was included in a ledger with failed status. | Check transaction result code (e.g. `txINSUFFICIENT_BALANCE`, `opUNDERFUNDED`). |
| `DUPLICATE_SETTLEMENT` | Same transaction hash observed multiple times for distinct terms. | Reject duplicate observation or check for replayed instructions. |

---

## 2. Soroban Contract Errors

When submitting transactions via the SDK, the following normalized contract errors may occur:

- `NotAuthorized (1)`: The caller is not the registered owner, counterparty, authorized observer, or contract admin. Ensure the signing key matches the registered role.
- `CaseNotFound (2)`: The `case_id` has not been initialized on-chain via `create_case`.
- `CaseAlreadyExists (3)`: Attempted to call `create_case` with an already active 32-byte case ID.
- `InvalidStateTransition (4)`: Attempted an illegal lifecycle transition (e.g. attempting to finalize an unverified `BREAK` without resolution).
- `ObserverNotAuthorized (5)`: Only authorized observers can call `record_observation`, `record_match`, and `record_break`.
- `CaseExpired (6)`: Target ledger sequence has passed the expiration window.

---

## 3. Commitment Mismatches & Proof Verification Failures

If `POST /v1/proofs/verify` or `POST /v1/proofs/verify/onchain` returns `valid: false`:

1. **Check Canonicalization**: Ensure terms documents contain exact string amounts and correct StrKey formatting without whitespace discrepancies.
2. **Domain Separator**: Confirm the hash prefix:
   - `STELLARCLEAR/TERMS/V1`
   - `STELLARCLEAR/OBSERVATION/V1`
   - `STELLARCLEAR/RESOLUTION/V1`
3. **Soroban State Check**: Query `GET /v1/cases/:caseId/onchain` to confirm the commitment on-chain matches the cryptographic proof artifact.

---

## 4. Indexer Resynchronization & Replay

If database state lags behind Stellar ledger height:

1. **Inspect Cursor**:
   ```sql
   SELECT * FROM ingestion_cursors WHERE network = 'testnet';
   ```
2. **Force Replay**:
   Restart the indexer service with a specified start ledger. The indexer uses idempotent upserts and unique constraints (`ON CONFLICT DO NOTHING`) so replaying ledgers is safe:
   ```bash
   START_LEDGER=1240000 node services/indexer/dist/index.js
   ```
