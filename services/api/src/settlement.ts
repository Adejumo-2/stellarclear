import type {
  ExpectedSettlement,
  ObservedSettlement,
  BreakCode,
  ReconciliationStatus,
  AttestationRole,
} from "@stellarclear/schemas";
import type { SettlementRegistryOperations, TransactionResult } from "@stellarclear/sdk";

export interface OnChainAnchorService {
  anchorCaseCreation(terms: ExpectedSettlement): Promise<TransactionResult<void>>;
  anchorObservation(params: {
    observer: string;
    caseId: string;
    observation: ObservedSettlement;
  }): Promise<TransactionResult<void>>;
  anchorReconciliation(params: {
    observer: string;
    caseId: string;
    status: ReconciliationStatus;
    breakCode?: BreakCode;
  }): Promise<TransactionResult<void>>;
  anchorAttestation(params: {
    attestor: string;
    caseId: string;
    role: AttestationRole;
    commitment: string;
  }): Promise<TransactionResult<void>>;
  anchorDispute(params: {
    initiator: string;
    caseId: string;
    disputeCommitment: string;
  }): Promise<TransactionResult<void>>;
  anchorResolution(params: {
    resolver: string;
    caseId: string;
    resolutionCommitment: string;
  }): Promise<TransactionResult<void>>;
  anchorFinalization(params: {
    caseId: string;
  }): Promise<TransactionResult<void>>;
}

export class SorobanSettlementAnchor implements OnChainAnchorService {
  constructor(private readonly registryOps?: SettlementRegistryOperations) {}

  public async anchorCaseCreation(
    terms: ExpectedSettlement
  ): Promise<TransactionResult<void>> {
    if (!this.registryOps) {
      return {
        txHash: `mock_create_tx_${terms.caseId.slice(0, 16)}`,
        status: "SUCCESS",
        result: undefined,
      };
    }
    return this.registryOps.createCase(terms);
  }

  public async anchorObservation(params: {
    observer: string;
    caseId: string;
    observation: ObservedSettlement;
  }): Promise<TransactionResult<void>> {
    if (!this.registryOps) {
      return {
        txHash: `mock_obs_tx_${params.observation.txHash.slice(0, 16)}`,
        status: "SUCCESS",
        result: undefined,
      };
    }
    return this.registryOps.recordObservation(params);
  }

  public async anchorReconciliation(params: {
    observer: string;
    caseId: string;
    status: ReconciliationStatus;
    breakCode?: BreakCode;
  }): Promise<TransactionResult<void>> {
    if (!this.registryOps) {
      return {
        txHash: `mock_rec_tx_${params.caseId.slice(0, 16)}`,
        status: "SUCCESS",
        result: undefined,
      };
    }

    if (params.status === "MATCHED") {
      return this.registryOps.recordMatch({
        observer: params.observer,
        caseId: params.caseId,
      });
    } else {
      return this.registryOps.recordBreak({
        observer: params.observer,
        caseId: params.caseId,
        breakCode: params.breakCode ?? "AMOUNT_MISMATCH",
      });
    }
  }

  public async anchorAttestation(params: {
    attestor: string;
    caseId: string;
    role: AttestationRole;
    commitment: string;
  }): Promise<TransactionResult<void>> {
    if (!this.registryOps) {
      return {
        txHash: `mock_attest_tx_${params.caseId.slice(0, 16)}`,
        status: "SUCCESS",
        result: undefined,
      };
    }
    return this.registryOps.submitAttestation(params);
  }

  public async anchorDispute(params: {
    initiator: string;
    caseId: string;
    disputeCommitment: string;
  }): Promise<TransactionResult<void>> {
    if (!this.registryOps) {
      return {
        txHash: `mock_dispute_tx_${params.caseId.slice(0, 16)}`,
        status: "SUCCESS",
        result: undefined,
      };
    }
    return this.registryOps.openDispute(params);
  }

  public async anchorResolution(params: {
    resolver: string;
    caseId: string;
    resolutionCommitment: string;
  }): Promise<TransactionResult<void>> {
    if (!this.registryOps) {
      return {
        txHash: `mock_resolve_tx_${params.caseId.slice(0, 16)}`,
        status: "SUCCESS",
        result: undefined,
      };
    }
    return this.registryOps.submitResolution(params);
  }

  public async anchorFinalization(params: {
    caseId: string;
  }): Promise<TransactionResult<void>> {
    if (!this.registryOps) {
      return {
        txHash: `mock_finalize_tx_${params.caseId.slice(0, 16)}`,
        status: "SUCCESS",
        result: undefined,
      };
    }
    return this.registryOps.finalizeCase(params.caseId);
  }
}
