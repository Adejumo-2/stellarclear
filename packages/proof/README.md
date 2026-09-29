# @stellarclear/proof

Canonical serialization, cryptographic commitments, and Settlement Proof creation/verification for StellarClear.

## Core Features

- **Deterministic Canonicalization**: Sorts object keys, standardizes null/undefined values, removes whitespace ambiguity.
- **SHA-256 Commitments**:
  - `computeTermsCommitment`
  - `computeObservationCommitment`
  - `computeResolutionCommitment`
- **Settlement Proof**:
  - `createSettlementProof`
  - `verifySettlementProof`

## Domain Prefixes

- `STELLARCLEAR/TERMS/V1`
- `STELLARCLEAR/OBSERVATION/V1`
- `STELLARCLEAR/RESOLUTION/V1`
