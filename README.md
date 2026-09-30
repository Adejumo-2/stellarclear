# StellarClear

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![CI](https://github.com/StellarClear/stellarclear/actions/workflows/ci.yml/badge.svg)](./.github/workflows/ci.yml)

StellarClear is an open-source, Stellar-native settlement evidence and reconciliation protocol.

It compares:
1. an expected settlement instruction, and
2. an observed Stellar settlement transaction,

then produces:
- a deterministic match or break classification,
- cryptographic commitments,
- a Soroban on-chain settlement record,
- multi-party attestations,
- and an independently verifiable Settlement Proof.

> The smart contract layer lives in [`StellarClear/stellarclear-contract`](https://github.com/StellarClear/stellarclear-contract) (`SettlementRegistry` Soroban contract). This monorepo consumes its generated TypeScript bindings via `packages/settlement-registry`.

---

## Documentation

Comprehensive guides and technical documentation are available in the [`docs/`](./docs) directory:

- [System Architecture](./docs/architecture.md) — Off-chain reconciliation, on-chain anchoring, and cryptographic proof pipeline.
- [Settlement Lifecycle & Break Taxonomy](./docs/settlement-lifecycle.md) — State machine transitions, break classifications, dispute workflows, and finalization.
- [Proof & Cryptographic Verification Guide](./docs/proof-verification.md) — Canonical commitments, offline verification, and live Soroban state verification.
- [Soroban Smart Contract Integration](./docs/soroban-integration.md) — `SettlementRegistry` bindings, SDK operations, and event indexing.
- [REST API Reference](./docs/api.md) — Endpoints, Zod schemas, request/response examples, and error model.
- [Deployment & Setup Guide](./docs/deployment.md) — Soroban contract deployment, Postgres migrations, environment variables, and Docker.
- [Operations & Monitoring Guide](./docs/operations.md) — Health/readiness probes, consistency checks, audit histories, and idempotency.
- [Troubleshooting & Break Remediation](./docs/troubleshooting.md) — Break diagnoses, Soroban contract error codes, and indexer resynchronization.
- [Integration Verification Guide](./docs/integration-verification.md) — Test suite layout, running live Soroban lifecycles, and verification procedures.

---

## Monorepo Architecture

```text
stellarclear/
├── services/
│   ├── api/                   # REST API service (Fastify-compatible dispatcher)
│   ├── indexer/               # Durable Stellar & Soroban event ingestion service
│   └── matcher/               # Settlement reconciliation engine
├── packages/
│   ├── settlement-registry/   # Generated Soroban contract TypeScript bindings
│   ├── sdk/                   # StellarClear TypeScript client SDK
│   ├── schemas/               # Protocol Zod schemas and domain models
│   ├── proof/                 # Canonical serialization and proof generator/verifier
│   └── db/                    # Settlement persistence layer (Postgres & In-Memory)
├── docs/                      # Technical documentation and specifications
└── tests/                     # Unit and End-to-End integration tests
```

---

## Prerequisites

- Node.js `>=22.12.0`
- npm `>=10.0.0`
- Stellar CLI (`stellar`)
- Rust toolchain (for contract compilation in `stellarclear-contract`)

---

## Setup & Installation

```bash
# 1. Install monorepo dependencies
npm install

# 2. Generate TypeScript bindings from Soroban contract wasm (if rebuilding contracts)
# Default expects ../stellarclear-contract checkout next to this repo.
# Override with: SETTLEMENT_REGISTRY_WASM=/path/to/settlement_registry.wasm npm run generate:bindings
npm run generate:bindings

# 3. Build all packages and services
npm run build

# 4. Run full unit and integration test suite
npm test

# Run modular test pipelines
npm run test:unit         # Unit tests (schemas, proof, matcher, db, sdk)
npm run test:api          # API endpoints & lifecycle verification
npm run test:indexer      # Indexer & event synchronization
npm run test:integration  # Live Soroban contract integration tests
```

---

## Environment Configuration

Copy `.env.example` to `.env` and fill in the required variables:

```bash
cp .env.example .env
```

`STELLAR_CONTRACT_ID` must be set to your deployed `SettlementRegistry` contract address before running live testnet transactions.

---

## Security & Privacy Boundary

The protocol strictly separates private trade data from public on-chain records:
- **Private Data (Off-Chain)**: Trade references, exact counterparty information, payment descriptions, and internal bookkeeping details remain in private off-chain databases.
- **Public Anchors (On-Chain)**: Only deterministic SHA-256 commitments (`termsCommitment`, `observationCommitment`, `resolutionCommitment`), Stellar transaction references, case lifecycle states, and participant attestations are written to Soroban.

---

## Funding (Drips)

This repo is claimable on [Drips](https://www.drips.network). Ownership is proven via `FUNDING.json` on the default branch (`main`).

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## License

Apache-2.0 — see [`LICENSE`](./LICENSE).
