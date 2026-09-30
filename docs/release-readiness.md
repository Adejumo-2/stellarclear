# StellarClear Release Readiness & Pre-Flight Verification

This document defines the pre-release verification process for the StellarClear application monorepo before deploying updates to staging (Testnet) or production.

---

## 1. Automated Release Check Script

Run the automated release readiness pipeline:

```bash
npm run verify:release
# or directly:
bash scripts/release-check.sh
```

### Verification Pipeline Steps:
1. **Environment Verification**: Confirms Node.js `>=22.12.0` and npm dependencies are present.
2. **Clean Build**: Recompiles all TypeScript packages (`@stellarclear/schemas`, `@stellarclear/proof`, `settlement-registry`, `@stellarclear/db`, `@stellarclear/sdk`) and services (`@stellarclear/api`, `@stellarclear/indexer`, `@stellarclear/matcher`).
3. **Strict Typecheck**: Runs `tsc --noEmit` across all workspaces with zero permitted type errors.
4. **Unit Test Suite**: Executes unit tests across domain schemas, canonical commitments, decimal normalization, and SDK bindings.
5. **API Test Suite**: Tests REST API endpoints, Zod schema validations, idempotency handling, readiness checks, and consistency queries.
6. **Indexer Test Suite**: Validates event decoding, durable cursor checkpoints, and idempotent database synchronization.
7. **End-to-End Integration Suite**: Validates complete settlement lifecycles (Match, Break, Dispute, Resolution, Proof verification, and On-chain finalization) against Soroban contract state.

---

## 2. Pre-Release Verification Checklist

Before promoting a release:

- [ ] **Contract Deployment**: The `SettlementRegistry` contract is deployed and initialized on the target network.
- [ ] **Contract Bindings**: TypeScript bindings (`packages/settlement-registry`) match the deployed contract specification.
- [ ] **Database Migrations**: PostgreSQL database schema tables are created and indexed.
- [ ] **Environment Variables**: `.env` contains valid `STELLAR_CONTRACT_ID`, `STELLAR_NETWORK`, `STELLAR_RPC_URL`, and `DATABASE_URL`.
- [ ] **Liveness & Readiness**: `GET /health` and `GET /ready` probes return `200 OK`.
- [ ] **Cross-Layer Consistency**: `GET /v1/cases/:caseId/consistency` reports `isConsistent: true` on verified cases.
- [ ] **Audit Trail Integrity**: `GET /v1/cases/:caseId/audit` shows complete milestone records.
- [ ] **Documentation**: Architecture, API reference, deployment, and operations guides are up to date.

---

## 3. Promotion & Rollback Guidelines

### Staging Promotion
Deploy artifacts to the Testnet staging environment and run the live integration suite:
```bash
STELLAR_NETWORK=testnet npm run test:integration
```

### Rollback Strategy
If an unexpected failure occurs during deployment:
1. Roll back the API service binary/container to the prior stable release tag.
2. Database writes are append-only and backward compatible.
3. Soroban contract state is authoritative and immutable; no manual on-chain rollback is required.
