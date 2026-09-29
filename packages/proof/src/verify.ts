import {
  SettlementProofSchema,
  type SettlementProof,
  type ExpectedSettlement,
  type ObservedSettlement,
} from "@stellarclear/schemas";
import {
  computeTermsCommitment,
  computeObservationCommitment,
} from "./commitments.js";

export interface VerifyProofOptions {
  terms?: ExpectedSettlement;
  observation?: ObservedSettlement;
  expectedContractId?: string;
  expectedNetwork?: string;
}

export interface VerifyProofResult {
  valid: boolean;
  reason?: string;
  recomputedTermsCommitment?: string;
  recomputedObservationCommitment?: string;
}

/**
 * Independently verifies a SettlementProof bundle against cryptographic commitments and domain documents.
 */
export function verifySettlementProof(
  proof: unknown,
  options?: VerifyProofOptions
): VerifyProofResult {
  // 1. Structural schema validation
  const parsed = SettlementProofSchema.safeParse(proof);
  if (!parsed.success) {
    return {
      valid: false,
      reason: `Malformed proof schema: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    };
  }

  const proofData: SettlementProof = parsed.data;

  // 2. Validate contract ID if specified
  if (options?.expectedContractId && proofData.contractId !== options.expectedContractId) {
    return {
      valid: false,
      reason: `Contract ID mismatch: expected ${options.expectedContractId}, got ${proofData.contractId}`,
    };
  }

  // 3. Validate network if specified
  if (options?.expectedNetwork && proofData.network !== options.expectedNetwork) {
    return {
      valid: false,
      reason: `Network mismatch: expected ${options.expectedNetwork}, got ${proofData.network}`,
    };
  }

  let recomputedTerms: string | undefined;
  let recomputedObs: string | undefined;

  // 4. Verify terms commitment against provided private terms document
  if (options?.terms) {
    try {
      recomputedTerms = computeTermsCommitment(options.terms);
      if (recomputedTerms !== proofData.termsCommitment) {
        return {
          valid: false,
          reason: `Terms commitment mismatch: document recomputed to ${recomputedTerms}, proof anchors ${proofData.termsCommitment}`,
          recomputedTermsCommitment: recomputedTerms,
        };
      }
    } catch (err: unknown) {
      return {
        valid: false,
        reason: `Invalid terms document: ${(err as Error).message}`,
      };
    }
  }

  // 5. Verify observation commitment against provided observed document
  if (options?.observation) {
    try {
      recomputedObs = computeObservationCommitment(options.observation);
      if (recomputedObs !== proofData.observationCommitment) {
        return {
          valid: false,
          reason: `Observation commitment mismatch: document recomputed to ${recomputedObs}, proof anchors ${proofData.observationCommitment}`,
          recomputedTermsCommitment: recomputedTerms,
          recomputedObservationCommitment: recomputedObs,
        };
      }

      if (options.observation.txHash.toLowerCase() !== proofData.txHash.toLowerCase()) {
        return {
          valid: false,
          reason: `Transaction hash mismatch: observed document has ${options.observation.txHash}, proof has ${proofData.txHash}`,
          recomputedTermsCommitment: recomputedTerms,
          recomputedObservationCommitment: recomputedObs,
        };
      }
    } catch (err: unknown) {
      return {
        valid: false,
        reason: `Invalid observed document: ${(err as Error).message}`,
      };
    }
  }

  return {
    valid: true,
    recomputedTermsCommitment: recomputedTerms,
    recomputedObservationCommitment: recomputedObs,
  };
}
