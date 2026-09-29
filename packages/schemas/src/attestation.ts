import { z } from "zod";
import {
  Bytes32HexSchema,
  LedgerSequenceSchema,
  StellarAddressSchema,
} from "./primitives.js";
import { AttestationRoleSchema } from "./enums.js";

/**
 * Protocol Attestation anchoring an authorized party's confirmation on-chain.
 */
export const AttestationSchema = z.object({
  caseId: Bytes32HexSchema,
  role: AttestationRoleSchema,
  attestor: StellarAddressSchema,
  commitment: Bytes32HexSchema,
  attestedAtLedger: LedgerSequenceSchema,
});

export type Attestation = z.infer<typeof AttestationSchema>;
