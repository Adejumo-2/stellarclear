import {
  SettlementProofSchema,
  type SettlementProof,
  type ExpectedSettlement,
  type ObservedSettlement,
  type Attestation,
  type ReconciliationStatus,
} from "@stellarclear/schemas";
import {
  computeTermsCommitment,
  computeObservationCommitment,
} from "./commitments.js";

export interface CreateProofParams {
  caseId: string;
  terms: ExpectedSettlement;
  observation: ObservedSettlement;
  finalizedLedger: number;
  result: ReconciliationStatus;
  attestations: Attestation[];
  contractId: string;
  network: string;
  version?: string;
}

/**
 * Creates a verified SettlementProof bundle from domain records.
 */
export function createSettlementProof(params: CreateProofParams): SettlementProof {
  const termsCommitment = computeTermsCommitment(params.terms);
  const observationCommitment = computeObservationCommitment(params.observation);

  const proof: SettlementProof = {
    protocol: "STELLARCLEAR",
    version: params.version ?? "1.0.0",
    caseId: params.caseId.toLowerCase(),
    termsCommitment,
    observationCommitment,
    txHash: params.observation.txHash.toLowerCase(),
    finalizedLedger: params.finalizedLedger,
    result: params.result,
    attestations: params.attestations,
    contractId: params.contractId,
    network: params.network,
  };

  return SettlementProofSchema.parse(proof);
}
