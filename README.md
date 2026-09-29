# StellarClear

StellarClear is an open-source, Stellar-native settlement evidence and reconciliation protocol.

It compares:
1. an expected settlement instruction, and
2. an observed Stellar settlement,

then produces:
- a deterministic match or break result,
- evidence commitments,
- a Soroban settlement record,
- attestations,
- and a verifiable Settlement Proof.

## Monorepo Architecture

```text
stellarclear/
├── apps/
│   └── web/                   # Operations web interface (React + Vite)
├── services/
│   ├── api/                   # REST API service (Fastify)
│   ├── indexer/               # Durable Stellar event ingestion service
│   └── matcher/               # Settlement reconciliation engine
├── packages/
│   ├── settlement-registry/   # Generated Soroban contract TypeScript bindings
│   ├── sdk/                   # StellarClear TypeScript client SDK
│   ├── schemas/               # Protocol Zod schemas and domain models
│   └── proof/                 # Canonical serialization and proof generator/verifier
├── docs/                      # Documentation
├── tests/                     # Integration tests
└── scripts/                   # Tooling and operational scripts
```

## Prerequisites

- Node.js `>=22.12.0`
- npm `>=10.0.0`
- Stellar CLI (`stellar`)
- Rust toolchain (for contract compilation)

## Setup & Installation

```bash
# Install dependencies
npm install

# Generate TypeScript bindings from Soroban contract wasm
npm run generate:bindings

# Build all packages and services
npm run build

# Run test suite
npm test
```

## Environment Configuration

Copy `.env.example` to `.env` and fill in the required variables:

```bash
cp .env.example .env
```

## Security & Privacy Boundary

The application keeps private settlement details strictly off-chain. Only cryptographic commitments, public Stellar transaction references, protocol state, and authorized attestations are anchored to Soroban.
