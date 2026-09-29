import { z } from "zod";

/**
 * Lifecycle state for an on-chain settlement case in SettlementRegistry.
 */
export const CaseStatusSchema = z.enum([
  "OPEN",
  "OBSERVED",
  "MATCHED",
  "BREAK",
  "DISPUTED",
  "RESOLVED",
  "FINALIZED",
]);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

/**
 * Standardized machine-readable classification for settlement reconciliation breaks.
 */
export const BreakCodeSchema = z.enum([
  "AMOUNT_MISMATCH",
  "ASSET_MISMATCH",
  "DESTINATION_MISMATCH",
  "REFERENCE_MISMATCH",
  "MISSING_SETTLEMENT",
  "DUPLICATE_SETTLEMENT",
  "LATE_SETTLEMENT",
  "FAILED_TRANSACTION",
  "UNEXPECTED_TRANSACTION",
]);
export type BreakCode = z.infer<typeof BreakCodeSchema>;

/**
 * Participant role for cryptographic settlement attestations.
 */
export const AttestationRoleSchema = z.enum([
  "OWNER",
  "COUNTERPARTY",
  "OBSERVER",
]);
export type AttestationRole = z.infer<typeof AttestationRoleSchema>;

/**
 * High-level reconciliation outcome status.
 */
export const ReconciliationStatusSchema = z.enum(["MATCHED", "BREAK"]);
export type ReconciliationStatus = z.infer<typeof ReconciliationStatusSchema>;

/**
 * Transaction execution outcome on the Stellar ledger.
 */
export const TransactionStatusSchema = z.enum(["SUCCESS", "FAILED"]);
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;
