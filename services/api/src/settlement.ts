import type {
  ExpectedSettlement,
  ObservedSettlement,
  BreakCode,
  ReconciliationStatus,
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
}
