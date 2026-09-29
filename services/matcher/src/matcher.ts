import {
  ExpectedSettlementSchema,
  ObservedSettlementSchema,
  type ExpectedSettlement,
  type ObservedSettlement,
  type ReconciliationResult,
  type Break,
} from "@stellarclear/schemas";
import { compareDecimalAmounts } from "./amount.js";

export interface ReconcileOptions {
  isDuplicate?: boolean;
  isUnexpected?: boolean;
}

/**
 * Deterministic settlement reconciliation comparing expected terms against an observed Stellar settlement.
 */
export function reconcileSettlement(
  expected: ExpectedSettlement,
  observed?: ObservedSettlement | null,
  options?: ReconcileOptions
): ReconciliationResult {
  const validExpected = ExpectedSettlementSchema.parse(expected);
  const nowIso = new Date().toISOString();

  // 1. Missing Settlement
  if (!observed) {
    const missingBreak: Break = {
      code: "MISSING_SETTLEMENT",
      field: "observed",
      expectedValue: validExpected.amount,
      observedValue: undefined,
      message: "No observed Stellar transaction found matching settlement terms",
    };
    return {
      caseId: validExpected.caseId,
      status: "BREAK",
      matched: false,
      breaks: [missingBreak],
      reconciledAt: nowIso,
    };
  }

  const validObserved = ObservedSettlementSchema.parse(observed);
  const breaks: Break[] = [];

  // 2. Failed Transaction
  if (validObserved.status === "FAILED") {
    breaks.push({
      code: "FAILED_TRANSACTION",
      field: "status",
      expectedValue: "SUCCESS",
      observedValue: "FAILED",
      message: "Settlement transaction failed on the Stellar ledger",
    });
  }

  // 3. Asset Mismatch
  if (validExpected.asset.trim().toUpperCase() !== validObserved.asset.trim().toUpperCase()) {
    breaks.push({
      code: "ASSET_MISMATCH",
      field: "asset",
      expectedValue: validExpected.asset,
      observedValue: validObserved.asset,
      message: `Expected asset ${validExpected.asset} but observed ${validObserved.asset}`,
    });
  }

  // 4. Amount Mismatch (exact non-floating point comparison)
  if (!compareDecimalAmounts(validExpected.amount, validObserved.amount)) {
    breaks.push({
      code: "AMOUNT_MISMATCH",
      field: "amount",
      expectedValue: validExpected.amount,
      observedValue: validObserved.amount,
      message: `Expected amount ${validExpected.amount} but observed ${validObserved.amount}`,
    });
  }

  // 5. Destination Mismatch
  if (validExpected.expectedDestination !== validObserved.destination) {
    breaks.push({
      code: "DESTINATION_MISMATCH",
      field: "destination",
      expectedValue: validExpected.expectedDestination,
      observedValue: validObserved.destination,
      message: `Expected destination ${validExpected.expectedDestination} but observed ${validObserved.destination}`,
    });
  }

  // 6. Reference Mismatch (when reference is specified)
  if (validExpected.reference && validExpected.reference !== validObserved.reference) {
    breaks.push({
      code: "REFERENCE_MISMATCH",
      field: "reference",
      expectedValue: validExpected.reference,
      observedValue: validObserved.reference ?? "none",
      message: `Expected reference ${validExpected.reference} but observed ${validObserved.reference ?? "none"}`,
    });
  }

  // 7. Late Settlement
  if (validObserved.ledger > validExpected.deadline) {
    breaks.push({
      code: "LATE_SETTLEMENT",
      field: "ledger",
      expectedValue: String(validExpected.deadline),
      observedValue: String(validObserved.ledger),
      message: `Settlement ledger sequence ${validObserved.ledger} exceeded deadline ${validExpected.deadline}`,
    });
  }

  // 8. Duplicate Settlement
  if (options?.isDuplicate) {
    breaks.push({
      code: "DUPLICATE_SETTLEMENT",
      field: "txHash",
      expectedValue: "unique",
      observedValue: validObserved.txHash,
      message: `Duplicate settlement transaction ${validObserved.txHash} detected for this case`,
    });
  }

  // 9. Unexpected Transaction
  if (options?.isUnexpected) {
    breaks.push({
      code: "UNEXPECTED_TRANSACTION",
      field: "txHash",
      expectedValue: "expected_settlement",
      observedValue: validObserved.txHash,
      message: `Unexpected transaction ${validObserved.txHash} not conforming to case agreement`,
    });
  }

  const isMatched = breaks.length === 0;

  return {
    caseId: validExpected.caseId,
    status: isMatched ? "MATCHED" : "BREAK",
    matched: isMatched,
    breaks,
    reconciledAt: nowIso,
  };
}
