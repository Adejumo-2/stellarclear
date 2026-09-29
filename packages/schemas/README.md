# @stellarclear/schemas

Canonical runtime-validated domain schemas and TypeScript types for the StellarClear protocol.

## Schemas Included

- **Domain Models**: `ExpectedSettlementSchema`, `ObservedSettlementSchema`, `AttestationSchema`, `SettlementProofSchema`
- **Reconciliation Models**: `ReconciliationRequestSchema`, `ReconciliationResultSchema`, `BreakSchema`
- **Protocol Enums**: `CaseStatusSchema`, `BreakCodeSchema`, `AttestationRoleSchema`, `ReconciliationStatusSchema`, `TransactionStatusSchema`
- **API Payloads**: `CreateCaseRequestSchema`, `SubmitObservationRequestSchema`, `VerifyProofRequestSchema`, `ApiErrorResponseSchema`, `HealthResponseSchema`
- **Primitives**: `Bytes32HexSchema`, `StellarAddressSchema`, `DecimalAmountSchema`, `LedgerSequenceSchema`

## Usage

```typescript
import { ExpectedSettlementSchema, type ExpectedSettlement } from "@stellarclear/schemas";

const result = ExpectedSettlementSchema.safeParse(inputData);
if (result.success) {
  const settlement: ExpectedSettlement = result.data;
}
```
