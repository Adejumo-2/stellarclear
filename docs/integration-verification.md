# StellarClear Integration & Verification Guide

This document describes how to run and verify the test suites, live contract integration flows, and proof verification pipelines across the StellarClear monorepo.

---

## 1. Test Architecture & Structure

The repository includes complete test coverage spanning unit, integration, and live Soroban contract simulation tests:

```text
tests/
├── integration/
│   ├── helpers/
│   │   └── soroban.ts                      # Live Soroban simulation & anchoring helper
│   ├── settlement_live.test.ts             # Complete live match and dispute workflows
│   ├── settlement_match_live.test.ts       # Multi-party attestation & proof verification
│   ├── settlement_break_live.test.ts       # Break classification on Soroban
│   ├── settlement_dispute_live.test.ts     # Dispute opening & resolution arbitration
│   ├── api_settlement_lifecycle.test.ts    # End-to-end API HTTP lifecycle test
│   ├── api_match_workflow.test.ts          # API match verification workflow
│   ├── api_break_workflow.test.ts          # API break detection & diagnostics
│   └── api_dispute_workflow.test.ts        # API dispute & resolution pipeline
├── api_*.test.ts                           # Fastify API endpoint tests
├── sdk_*.test.ts                           # SDK client & SettlementRegistry bindings tests
├── proof_*.test.ts                         # Canonical serialization & proof verification tests
├── matcher_*.test.ts                       # Decimal amounts & break code rule tests
├── indexer_*.test.ts                       # Event decoding, ingestion & cursor sync tests
└── db_*.test.ts                            # Repository & transaction persistence tests
```

---

## 2. Running Test Suites

### Full Suite Run (Typecheck + All Tests)
```bash
npm test
```

### Workspace-Specific Typechecks
```bash
npm run typecheck
```

### Running Specific Test Groups
```bash
# Run only live Soroban integration tests
npx tsc -p tests/tsconfig.json && node --test tests/dist/integration/*live*.test.js

# Run proof verifier tests
npx tsc -p tests/tsconfig.json && node --test tests/dist/proof_*.test.js

# Run API endpoint tests
npx tsc -p tests/tsconfig.json && node --test tests/dist/api_*.test.js
```

---

## 3. Verifying Live Soroban Settlement Lifecycles

### Flow A: Match Lifecycle
1. **Case Creation**: Instruction created off-chain; `termsCommitment` anchored on Soroban via `create_case`.
2. **Observation**: Stellar payment indexed; `observationCommitment` anchored via `record_observation`.
3. **Automated Reconciliation**: Matcher validates amounts, asset, destination, and memo; recorded on-chain via `record_match`.
4. **Attestation**: Participants submit signed attestations via `submit_attestation`.
5. **Finalization**: Case is finalized on Soroban via `finalize_case`.
6. **Proof Verification**: Verifier recomputes SHA-256 commitments and checks against authoritative on-chain contract state.

### Flow B: Break & Dispute Resolution Lifecycle
1. **Case Creation & Observation**: Instruction and divergent payment recorded.
2. **Reconciliation Break**: Matcher detects break code (e.g. `ASSET_MISMATCH` or `AMOUNT_MISMATCH`); recorded via `record_break`.
3. **Dispute Opened**: Initiator opens dispute with evidence commitment via `open_dispute`.
4. **Arbitration Resolution**: Agreed resolution terms committed on-chain via `submit_resolution`.
5. **Finalization & Proof**: Finalized on-chain and verified against resolution state.
