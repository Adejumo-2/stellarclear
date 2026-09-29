import { z } from "zod";
import {
  Bytes32HexSchema,
  LedgerSequenceSchema,
  StellarAddressSchema,
} from "./primitives.js";
import { ReconciliationStatusSchema } from "./enums.js";
import { AttestationSchema } from "./attestation.js";

/**
 * SettlementProof represents an independently verifiable bundle of commitments,
 * protocol references, on-chain state, and attestations for a finalized settlement.
 */
export const SettlementProofSchema = z.object({
  protocol: z.literal("STELLARCLEAR"),
  version: z.string().min(1, "version is required"),
  caseId: Bytes32HexSchema,
  termsCommitment: Bytes32HexSchema,
  observationCommitment: Bytes32HexSchema,
  txHash: Bytes32HexSchema,
  finalizedLedger: LedgerSequenceSchema,
  result: ReconciliationStatusSchema,
  attestations: z.array(AttestationSchema),
  contractId: StellarAddressSchema,
  network: z.string().min(1, "network is required"),
});

export type SettlementProof = z.infer<typeof SettlementProofSchema>;
