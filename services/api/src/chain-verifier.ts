import {
  type SettlementProof,
  type ExpectedSettlement,
  type ObservedSettlement,
} from "@stellarclear/schemas";
import { verifySettlementProof } from "@stellarclear/proof";
import type { SettlementRegistryOperations, CaseRecord, AttestationRecord } from "@stellarclear/sdk";
import type { OnChainVerificationResult } from "./types.js";

export interface OnChainStateProvider {
  getCase(caseId: string): Promise<CaseRecord | null>;
  getAttestation?(caseId: string, attestor: string): Promise<AttestationRecord | null>;
}

/**
 * Verifies cryptographic settlement proofs against both canonical commitments
 * and live / simulated Soroban SettlementRegistry on-chain state.
 */
export class SorobanChainVerifier {
  constructor(
    private readonly stateProvider?: OnChainStateProvider | SettlementRegistryOperations,
    private readonly defaultContractId?: string,
    private readonly defaultNetwork?: string
  ) {}

  public async verifyOnChainProof(params: {
    proof: SettlementProof;
    termsDocument?: ExpectedSettlement;
    observedDocument?: ObservedSettlement;
    expectedContractId?: string;
    expectedNetwork?: string;
  }): Promise<OnChainVerificationResult> {
    const verifiedAt = new Date().toISOString();

    // 1-3. Offline cryptographic & commitment verification
    const expContract = params.expectedContractId ?? this.defaultContractId;
    const expNetwork = params.expectedNetwork ?? this.defaultNetwork;

    const offlineResult = verifySettlementProof(params.proof, {
      terms: params.termsDocument,
      observation: params.observedDocument,
      expectedContractId: expContract,
      expectedNetwork: expNetwork,
    });

    if (!offlineResult.valid) {
      return {
        valid: false,
        reason: offlineResult.reason,
        recomputedTermsCommitment: offlineResult.recomputedTermsCommitment,
        recomputedObservationCommitment: offlineResult.recomputedObservationCommitment,
        verifiedAt,
      };
    }

    const { proof } = params;

    // 4. Expected contract ID check
    if (expContract && proof.contractId.toLowerCase() !== expContract.toLowerCase()) {
      return {
        valid: false,
        reason: `Contract ID mismatch: proof specifies ${proof.contractId}, expected ${expContract}`,
        recomputedTermsCommitment: offlineResult.recomputedTermsCommitment,
        recomputedObservationCommitment: offlineResult.recomputedObservationCommitment,
        verifiedAt,
      };
    }

    // 5. Expected network check
    if (expNetwork && proof.network !== expNetwork) {
      return {
        valid: false,
        reason: `Network mismatch: proof specifies ${proof.network}, expected ${expNetwork}`,
        recomputedTermsCommitment: offlineResult.recomputedTermsCommitment,
        recomputedObservationCommitment: offlineResult.recomputedObservationCommitment,
        verifiedAt,
      };
    }

    // 6. Query Soroban contract state for case existence
    if (this.stateProvider) {
      let onChainCase: CaseRecord | null = null;
      try {
        onChainCase = await this.stateProvider.getCase(proof.caseId);
      } catch (err: unknown) {
        return {
          valid: false,
          reason: `Failed to query Soroban contract state for case ${proof.caseId}: ${(err as Error).message}`,
          recomputedTermsCommitment: offlineResult.recomputedTermsCommitment,
          recomputedObservationCommitment: offlineResult.recomputedObservationCommitment,
          verifiedAt,
        };
      }

      if (!onChainCase) {
        return {
          valid: false,
          reason: `Case ${proof.caseId} does not exist on Soroban SettlementRegistry`,
          recomputedTermsCommitment: offlineResult.recomputedTermsCommitment,
          recomputedObservationCommitment: offlineResult.recomputedObservationCommitment,
          verifiedAt,
        };
      }

      const obsCommitment = onChainCase.observation?.observationCommitment;

      // 7. On-chain terms commitment matching
      if (onChainCase.termsCommitment.toLowerCase() !== proof.termsCommitment.toLowerCase()) {
        return {
          valid: false,
          reason: `On-chain terms commitment mismatch: contract has ${onChainCase.termsCommitment}, proof has ${proof.termsCommitment}`,
          recomputedTermsCommitment: offlineResult.recomputedTermsCommitment,
          recomputedObservationCommitment: offlineResult.recomputedObservationCommitment,
          onChainState: {
            caseId: onChainCase.caseId,
            status: onChainCase.status,
            termsCommitment: onChainCase.termsCommitment,
            observationCommitment: obsCommitment,
            finalizedLedger: onChainCase.finalizedAtLedger,
          },
          verifiedAt,
        };
      }

      // 8. On-chain observation commitment matching
      if (proof.observationCommitment) {
        if (
          obsCommitment &&
          obsCommitment.toLowerCase() !== proof.observationCommitment.toLowerCase()
        ) {
          return {
            valid: false,
            reason: `On-chain observation commitment mismatch: contract has ${obsCommitment}, proof has ${proof.observationCommitment}`,
            recomputedTermsCommitment: offlineResult.recomputedTermsCommitment,
            recomputedObservationCommitment: offlineResult.recomputedObservationCommitment,
            onChainState: {
              caseId: onChainCase.caseId,
              status: onChainCase.status,
              termsCommitment: onChainCase.termsCommitment,
              observationCommitment: obsCommitment,
              finalizedLedger: onChainCase.finalizedAtLedger,
            },
            verifiedAt,
          };
        }
      }

      // 9. Reconciliation state matching
      if (proof.result === "MATCHED" && onChainCase.status !== "MATCHED" && onChainCase.status !== "FINALIZED") {
        return {
          valid: false,
          reason: `Reconciliation status mismatch: proof claims MATCHED but on-chain status is ${onChainCase.status}`,
          recomputedTermsCommitment: offlineResult.recomputedTermsCommitment,
          recomputedObservationCommitment: offlineResult.recomputedObservationCommitment,
          onChainState: {
            caseId: onChainCase.caseId,
            status: onChainCase.status,
            termsCommitment: onChainCase.termsCommitment,
            observationCommitment: obsCommitment,
            finalizedLedger: onChainCase.finalizedAtLedger,
          },
          verifiedAt,
        };
      } else if (
        proof.result === "BREAK" &&
        !["BREAK", "DISPUTED", "RESOLVED", "FINALIZED"].includes(onChainCase.status)
      ) {
        return {
          valid: false,
          reason: `Reconciliation status mismatch: proof claims BREAK but on-chain status is ${onChainCase.status}`,
          recomputedTermsCommitment: offlineResult.recomputedTermsCommitment,
          recomputedObservationCommitment: offlineResult.recomputedObservationCommitment,
          onChainState: {
            caseId: onChainCase.caseId,
            status: onChainCase.status,
            termsCommitment: onChainCase.termsCommitment,
            observationCommitment: obsCommitment,
            finalizedLedger: onChainCase.finalizedAtLedger,
          },
          verifiedAt,
        };
      }

      // 10. Attestations verification
      if (proof.attestations && proof.attestations.length > 0 && typeof this.stateProvider.getAttestation === "function") {
        for (const att of proof.attestations) {
          const onChainAtt = await this.stateProvider.getAttestation(proof.caseId, att.attestor);
          if (!onChainAtt) {
            return {
              valid: false,
              reason: `Attestation by ${att.attestor} not found on Soroban contract`,
              recomputedTermsCommitment: offlineResult.recomputedTermsCommitment,
              recomputedObservationCommitment: offlineResult.recomputedObservationCommitment,
              verifiedAt,
            };
          }
          if (onChainAtt.commitment.toLowerCase() !== att.commitment.toLowerCase()) {
            return {
              valid: false,
              reason: `Attestation commitment mismatch for ${att.attestor}: contract has ${onChainAtt.commitment}, proof has ${att.commitment}`,
              recomputedTermsCommitment: offlineResult.recomputedTermsCommitment,
              recomputedObservationCommitment: offlineResult.recomputedObservationCommitment,
              verifiedAt,
            };
          }
        }
      }

      return {
        valid: true,
        recomputedTermsCommitment: offlineResult.recomputedTermsCommitment,
        recomputedObservationCommitment: offlineResult.recomputedObservationCommitment,
        onChainState: {
          caseId: onChainCase.caseId,
          status: onChainCase.status,
          termsCommitment: onChainCase.termsCommitment,
          observationCommitment: obsCommitment,
          finalizedLedger: onChainCase.finalizedAtLedger,
        },
        verifiedAt,
      };
    }

    return {
      valid: true,
      recomputedTermsCommitment: offlineResult.recomputedTermsCommitment,
      recomputedObservationCommitment: offlineResult.recomputedObservationCommitment,
      verifiedAt,
    };
  }
}
