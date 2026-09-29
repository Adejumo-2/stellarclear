import { z } from "zod";
import { Bytes32HexSchema } from "./primitives.js";
import { BreakCodeSchema, ReconciliationStatusSchema } from "./enums.js";
import {
  ExpectedSettlementSchema,
  ObservedSettlementSchema,
} from "./settlement.js";

/**
 * Detailed description of an individual reconciliation break.
 */
export const BreakSchema = z.object({
  code: BreakCodeSchema,
  field: z.string().min(1, "field is required"),
  expectedValue: z.string().optional(),
  observedValue: z.string().optional(),
  message: z.string().min(1, "message is required"),
});

export type Break = z.infer<typeof BreakSchema>;

/**
 * Request payload to perform reconciliation between expected terms and observed settlement.
 */
export const ReconciliationRequestSchema = z.object({
  expected: ExpectedSettlementSchema,
  observed: ObservedSettlementSchema.optional(),
});

export type ReconciliationRequest = z.infer<typeof ReconciliationRequestSchema>;

/**
 * Complete deterministic outcome produced by the Matcher engine.
 */
export const ReconciliationResultSchema = z.object({
  caseId: Bytes32HexSchema,
  status: ReconciliationStatusSchema,
  matched: z.boolean(),
  breaks: z.array(BreakSchema),
  reconciledAt: z.string().min(1, "reconciledAt timestamp is required"),
});

export type ReconciliationResult = z.infer<typeof ReconciliationResultSchema>;
