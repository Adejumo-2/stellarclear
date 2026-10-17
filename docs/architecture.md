# StellarClear System Architecture

StellarClear is an open-source, Stellar-native settlement evidence and reconciliation protocol that provides cryptographic auditability for financial settlements executed on the Stellar network.

## Core Architectural Principles

1. **Strict Privacy Boundary**: Sensitive trade details (business counterparties, internal trade references, settlement instructions, and internal bookkeeping records) remain off-chain in private databases.
2. **Canonical Cryptographic Commitments**: Off-chain settlement terms, observed transactions, and dispute resolutions are transformed into deterministic SHA-256 commitments before being submitted to Soroban.
3. **On-Chain Evidence Anchoring**: The Soroban `SettlementRegistry` smart contract acts as the immutable global settlement truth layer, storing status transitions, cryptographic commitments, transaction references, and multi-party attestations.
4. **Independent Verifiability**: Any counterparty, auditor, regulator, or automated agent can independently verify a `SettlementProof` offline via canonical SHA-256 hashing or online against live Soroban contract state.

---

## Architectural Overview

```mermaid
flowchart TD
    subgraph OffChain["Off-Chain Application Layer"]
        subgraph Ingestion["Settlement Ingestion & Matching"]
            Expected["Expected Settlement Terms"]
            Observed["Observed Stellar Settlement"]
            Matcher["Reconciliation Matcher Engine"]
            DB[(PostgreSQL / Settlement DB)]
        end

        subgraph ProofPipeline["Cryptographic Proof Engine"]
            Canonicalizer["Canonical Formatter"]
            CommitmentGen["Commitment Generator (SHA-256)"]
            ProofGen["SettlementProof Generator"]
            Verifier["Proof & Chain Verifier"]
        end

        API["StellarClear REST API Service"]
        Indexer["Stellar Event Indexer Service"]
    end

    subgraph OnChain["On-Chain Soroban Layer"]
        Registry["SettlementRegistry Contract"]
        Events["Contract Diagnostic & System Events"]
        Ledger["Stellar Ledger State"]
    end

    Expected --> API
    Observed --> API
    API --> DB
    API --> Matcher
    Matcher --> DB
    API --> ProofPipeline
    ProofPipeline --> ProofGen
    API --> Registry
    Indexer --> Events
    Events --> Indexer
    Indexer --> DB
    Verifier --> Registry
```

---

## Trust Boundaries & Data Flow

The system spans five trust boundaries. Untrusted data crosses them only in defined directions; raw trade terms never leave the off-chain tier (only SHA-256 commitments do).

```mermaid
flowchart TD
    subgraph TB0["TB0 — Public internet (untrusted)"]
        Client["Integrator / Counterparty client"]
        WSClient["WebSocket stream consumers"]
    end

    subgraph TB1["TB1 — Application tier (private network)"]
        API["REST API"]
        Matcher["Matcher"]
        Indexer["Indexer"]
        Proof["Proof Engine"]
    end

    subgraph TB2["TB2 — Data tier (private network)"]
        DB[("PostgreSQL")]
    end

    subgraph TB3["TB3 — Public Stellar network"]
        RPC["Soroban RPC"]
        Contract["SettlementRegistry"]
    end

    subgraph TB4["TB4 — Third-party observers (semi-trusted)"]
        Obs["Observer daemons"]
    end

    Client -->|"REST (no end-user auth in v0.1.1 — private exposure only)"| API
    API --> Matcher
    API --> Proof
    API -->|"SQL, credentials from env"| DB
    Indexer -->|"checkpoint writes"| DB
    Indexer -->|"getEvents"| RPC
    API -->|"contract invocations"| RPC
    Obs -->|"signed invocations"| RPC
    RPC --> Contract
    Contract -->|"contract events"| Indexer
    Indexer -->|"WS stream, optional auth token"| WSClient
```

| Boundary | Crossing | Control |
| :--- | :--- | :--- |
| TB0 → TB1 | REST requests | Strict Zod validation, idempotency keys; network-level isolation (API auth is a mainnet blocker — see Threat `Spoof.2`) |
| TB1 → TB2 | SQL | Credentials via environment only; Postgres never publicly mapped |
| TB1 / TB4 → TB3 | Contract invocations | `require_auth()` role checks on-chain; signer keys never in repo |
| TB3 → TB1 | Contract events | Indexer cursor checkpoints + idempotent DB constraints |
| TB5 (Operator/CI) | Deploys, secrets | Pinned reproducible artifacts, GitHub secret scanning |

Full threat analysis: [Threat Model (STRIDE)](./threat-model.md) · [Monitoring Plan](./monitoring-plan.md).

---

## Monorepo Components

### 1. Packages

- **`packages/schemas`**: Canonical runtime-validated domain schemas using Zod in TypeScript strict mode. Contains domain models for `ExpectedSettlement`, `ObservedSettlement`, `ReconciliationResult`, `Break`, `Attestation`, and `SettlementProof`. Financial decimal amounts are stored as exact strings to prevent floating-point rounding errors.
- **`packages/proof`**: Canonical formatting (`formatDomainDocument`) and SHA-256 commitment computation (`computeTermsCommitment`, `computeObservationCommitment`, `computeResolutionCommitment`). Implements deterministic serialization invariant to JSON key order, as well as `createSettlementProof` and `verifySettlementProof`.
- **`packages/settlement-registry`**: Generated TypeScript bindings directly compiled from the Soroban `SettlementRegistry` smart contract wasm using Stellar CLI.
- **`packages/sdk`**: High-level TypeScript client SDK wrapping Soroban RPC submission, contract simulation, typed error normalization, and case operations (`SettlementRegistryOperations`).
- **`packages/db`**: Database persistence layer with SQL schema migrations, repository patterns for cases, observations, reconciliations, breaks, and attestations, supporting both PostgreSQL and in-memory test clients.

### 2. Services

- **`services/matcher`**: Strict financial reconciliation engine that compares expected instructions against observed on-chain transactions, evaluating exact decimal equality, destination match, asset match, deadline compliance, and returning detailed break diagnostics (`BreakCode`).
- **`services/indexer`**: Resilient ingestion service for Soroban contract events (`CaseCreated`, `CaseObserved`, `CaseMatched`, `CaseBroken`, `CaseAttested`, `CaseDisputed`, `CaseResolved`, `CaseFinalized`), maintaining idempotency and durable cursor tracking.
- **`services/api`**: Fast REST API service exposing case creation, observation recording, automated reconciliation, attestation management, dispute workflows, proof generation, and on-chain verification endpoints.

---

## Data Flow & Evidence Pipeline

1. **Instruction Ingestion**: Case terms are submitted to `POST /v1/cases`. The canonical terms commitment is calculated off-chain and anchored on Soroban via `create_case`.
2. **Transaction Observation**: The actual on-chain Stellar transaction is ingested via `POST /v1/cases/:caseId/observe`. The canonical observation commitment is computed and anchored on Soroban via `record_observation`.
3. **Automated Reconciliation**: The reconciliation matcher runs exact decimal and rule verification via `POST /v1/cases/:caseId/reconcile`. A match triggers `record_match`, whereas breaks trigger `record_break` with machine-readable break codes.
4. **Multi-Party Attestations**: Authorized participants submit cryptographic signatures/attestations via `POST /v1/cases/:caseId/attest`, anchoring confirmations on Soroban via `submit_attestation`.
5. **Dispute & Resolution (if broken)**: Disputed cases transition via `open_dispute` and `submit_resolution` with evidence and agreement commitments.
6. **Settlement Finalization**: Once matched or resolved, the case is sealed on-chain via `finalize_case`.
7. **Settlement Proof Generation & Verification**: A verifiable `SettlementProof` JSON package is exported via `GET /v1/cases/:caseId/proof`, which can be validated anywhere via `POST /v1/proofs/verify` or `POST /v1/proofs/verify/onchain`.
