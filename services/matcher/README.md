# @stellarclear/matcher

Deterministic reconciliation engine for comparing Expected Settlement instructions with observed on-chain transactions.

## Break Codes

- `AMOUNT_MISMATCH`
- `ASSET_MISMATCH`
- `DESTINATION_MISMATCH`
- `REFERENCE_MISMATCH`
- `MISSING_SETTLEMENT`
- `DUPLICATE_SETTLEMENT`
- `LATE_SETTLEMENT`
- `FAILED_TRANSACTION`
- `UNEXPECTED_TRANSACTION`

## Determinism & Precision

Uses exact string-based decimal normalization without JavaScript floating point approximations.
Pure side-effect free computation.
