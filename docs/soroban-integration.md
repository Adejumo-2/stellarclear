# Soroban Smart Contract Integration

StellarClear integrates natively with the Soroban smart contract layer via the `SettlementRegistry` contract.

## Contract Specification

The `SettlementRegistry` Soroban contract interface defines the global on-chain state machine and data structures:

```rust
pub struct SettlementCase {
    pub owner: Address,
    pub counterparty: Option<Address>,
    pub terms_commitment: BytesN<32>,
    pub expires_at_ledger: u32,
    pub status: CaseStatus,
    pub observation: Option<Observation>,
    pub decision: Decision,
    pub created_at_ledger: u32,
    pub finalized_at_ledger: Option<u32>,
}
```

---

## Generated TypeScript Bindings

Bindings are generated directly from compiled Soroban contract WASM:

```bash
npm run generate:bindings
```

Located in `packages/settlement-registry`:
- `Client`: Direct RPC contract execution wrapper.
- Type definitions: `SettlementCase`, `Observation`, `Decision`, `CaseStatus`, `BreakCode`, `AttestationRole`, `Errors`.
- Spec exports: `networks`, `CONTRACT_SPEC`, `Errors` mapping.

---

## SDK Operations Integration

The high-level `SettlementRegistryOperations` class in `@stellarclear/sdk` provides typed abstractions over the generated bindings:

```typescript
import { StellarClearClient } from "@stellarclear/sdk";

const client = new StellarClearClient({
  network: "testnet",
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  rpcUrl: "https://soroban-testnet.stellar.org",
});

// Operations available:
// - client.registry.createCase(terms, options)
// - client.registry.recordObservation({ observer, caseId, observation }, options)
// - client.registry.recordMatch({ observer, caseId }, options)
// - client.registry.recordBreak({ observer, caseId, breakCode }, options)
// - client.registry.submitAttestation({ attestor, caseId, role, commitment }, options)
// - client.registry.openDispute({ initiator, caseId, disputeCommitment }, options)
// - client.registry.submitResolution({ resolver, caseId, resolutionCommitment }, options)
// - client.registry.finalizeCase(caseId, options)
// - client.registry.getCase(caseId, options)
// - client.registry.getAttestation(caseId, attestor, options)
// - client.registry.isObserver(observer, options)
// - client.registry.getResolution(caseId, resolver, options)
```

---

## Contract Event Ingestion & Indexer

The `IndexerService` (`services/indexer`) polls Soroban RPC event endpoints and decodes topics into structured events:

```typescript
import { IndexerService } from "@stellarclear/indexer";

const indexer = new IndexerService({
  network: "testnet",
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  rpcUrl: "https://soroban-testnet.stellar.org",
  pollIntervalMs: 2000,
}, dbClient);

// Starts resilient event polling and DB indexing
await indexer.start();
```

### Event Topics Decoded:
- `CaseCreated`: Case ID, owner, terms commitment.
- `CaseObserved`: Case ID, observer, observation commitment, transaction hash.
- `CaseMatched`: Case ID, matched decision.
- `CaseBroken`: Case ID, break code.
- `CaseAttested`: Case ID, attestor, role, commitment.
- `CaseDisputed`: Case ID, initiator, dispute commitment.
- `CaseResolved`: Case ID, resolver, resolution commitment.
- `CaseFinalized`: Case ID, final ledger sequence.

---

## Contract Error Handling & Normalization

Soroban numeric error codes are converted into typed TypeScript error instances (`ContractError`):

| Contract Error Code | Error Symbol | Description |
|:---|:---|:---|
| 1 | `CaseAlreadyExists` | Case ID already created on-chain |
| 2 | `CaseNotFound` | Case ID not found in contract storage |
| 3 | `CaseExpired` | Current ledger sequence exceeds `expires_at_ledger` |
| 4 | `CaseNotOpen` | Case is not in OPEN status |
| 5 | `CaseNotObserved` | Case has not had an observation recorded |
| 6 | `CaseAlreadyObserved` | Case has already recorded an observation |
| 7 | `CaseNotBroken` | Case is not in BREAK status when opening dispute |
| 8 | `CaseNotDisputed` | Case is not in DISPUTED status |
| 9 | `CaseNotReadyForFinalization` | Case status is neither MATCHED nor RESOLVED |
| 10 | `CaseAlreadyFinalized` | Finalize called on already finalized case |
| 11 | `Unauthorized` | Caller address is not authorized for this operation |
| 12 | `InvalidAttestation` | Attestation commitment does not match case |
| 13 | `AttestationAlreadyExists` | Attestor already submitted an attestation |
| 14 | `InvalidResolution` | Resolution commitment is malformed |
| 15 | `InvalidObservation` | Observation commitment or transaction hash is invalid |
| 16 | `DeadlinePassed` | Deadline has elapsed |
| 17 | `InvalidCaseState` | Invalid state transition attempt |
| 18 | `AlreadyDisputed` | Dispute already active for case |
| 19 | `AlreadyResolved` | Resolution already submitted for case |
| 20 | `InvalidBreakCode` | Unrecognized or malformed break code |
