# Settlement Lifecycle & Break Taxonomy

This document describes the state machine, lifecycle stages, break taxonomy, and dispute workflows for StellarClear settlements.

## State Machine

```mermaid
stateDiagram-v2
    [*] --> OPEN: Case Created (terms commitment)
    OPEN --> OBSERVED: Transaction Observed (observation commitment)
    OBSERVED --> MATCHED: Reconciliation Passes
    OBSERVED --> BREAK: Reconciliation Fails
    MATCHED --> FINALIZED: Finalized on Soroban
    BREAK --> DISPUTED: Dispute Opened (evidence commitment)
    DISPUTED --> RESOLVED: Dispute Resolved (resolution commitment)
    RESOLVED --> FINALIZED: Finalized on Soroban
    FINALIZED --> [*]
```

---

## Lifecycle Stages

### 1. Case Creation (`OPEN`)
- **Initiator**: Case Owner / Trade Originator.
- **Off-Chain**: Validates `ExpectedSettlement` schema with exact decimal amount string.
- **Commitment**: `termsCommitment = SHA256(formatDomainDocument("STELLARCLEAR/TERMS/V1", expected))`.
- **On-Chain**: `SettlementRegistry.create_case(case_id, owner, counterparty, terms_commitment, expires_at_ledger)`.
- **Status**: `OPEN`.

### 2. Transaction Observation (`OBSERVED`)
- **Initiator**: Ingestion service, observer, or case counterparty.
- **Off-Chain**: Validates `ObservedSettlement` schema with Stellar transaction hash, destination, amount, asset, ledger sequence, and timestamp.
- **Commitment**: `observationCommitment = SHA256(formatDomainDocument("STELLARCLEAR/OBSERVATION/V1", observed))`.
- **On-Chain**: `SettlementRegistry.record_observation(observer, case_id, tx_hash, observation_commitment, observed_ledger)`.
- **Status**: `OBSERVED`.

### 3. Reconciliation (`MATCHED` or `BREAK`)
- **Initiator**: Automated Matcher engine.
- **Rules Evaluated**:
  1. Transaction presence & execution status (`SUCCESS`).
  2. Exact decimal amount equality (`expected.amount === observed.amount`).
  3. Asset identifier matching (`expected.asset === observed.asset`).
  4. Destination account matching (`expected.expectedDestination === observed.destination`).
  5. Payment reference matching (if expected).
  6. Ledger sequence deadline compliance (`observed.ledger <= expected.deadline`).
- **On-Chain Decision**:
  - If MATCHED: `SettlementRegistry.record_match(observer, case_id)`.
  - If BREAK: `SettlementRegistry.record_break(observer, case_id, break_code)`.

---

## Break Taxonomy

When reconciliation fails, one or more standardized break codes are generated:

| Break Code | Description | Corrective / Recovery Action |
|:---|:---|:---|
| `AMOUNT_MISMATCH` | Observed amount differs from expected amount (underpayment or overpayment). | Open dispute; request supplemental settlement or issue credit memo. |
| `ASSET_MISMATCH` | Asset code or issuer does not match expected settlement asset. | Open dispute; return incorrect asset and re-issue in correct asset. |
| `DESTINATION_MISMATCH` | Transaction was delivered to an address other than `expectedDestination`. | Open dispute; initiate asset recovery or counterparty review. |
| `REFERENCE_MISMATCH` | Payment memo / reference tag differs from expected reference. | Counterparty clarification and manual reconciliation mapping. |
| `MISSING_SETTLEMENT` | No transaction was observed prior to evaluation or deadline expiration. | Notify counterparty or query indexer for delayed transactions. |
| `LATE_SETTLEMENT` | Transaction was confirmed after the specified `deadline` ledger sequence. | Apply contractual late penalties or renegotiate settlement deadline. |
| `FAILED_TRANSACTION` | Stellar transaction execution resulted in failure (`FAILED`). | Re-submit payment transaction on Stellar network. |
| `DUPLICATE_SETTLEMENT` | Multiple settlement transactions detected for the same trade reference. | Audit and process refund for duplicate settlement execution. |
| `UNEXPECTED_TRANSACTION` | Settlement was observed without an active open case instruction. | Create retroactive case or return funds to sender. |

---

## Dispute & Resolution Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Case Owner
    actor Counterparty as Counterparty
    participant API as StellarClear API
    participant Registry as Soroban SettlementRegistry

    Note over Owner,Registry: Case is in BREAK state
    Owner->>API: POST /v1/cases/:caseId/dispute (reason, evidence)
    API->>Registry: open_dispute(initiator, dispute_commitment)
    Registry-->>API: txHash (Case status: DISPUTED)
    API-->>Owner: 201 Created (DISPUTED)

    Counterparty->>API: POST /v1/cases/:caseId/resolve (resolutionType, agreedAmount, details)
    API->>Registry: submit_resolution(resolver, resolution_commitment)
    Registry-->>API: txHash (Case status: RESOLVED)
    API-->>Counterparty: 200 OK (RESOLVED)

    Owner->>API: POST /v1/cases/:caseId/finalize
    API->>Registry: finalize_case(case_id)
    Registry-->>API: txHash (Case status: FINALIZED)
    API-->>Owner: 200 OK (FINALIZED)
```

---

## Case Finalization (`FINALIZED`)

- **Eligibility**: Case must be in `MATCHED` or `RESOLVED` state.
- **Action**: Invokes `SettlementRegistry.finalize_case(case_id)`.
- **Result**: Immutably closes the settlement case on Soroban, recording `finalized_at_ledger` and `finalization_tx_hash`. No further state modifications are permitted.
