import type { CaseRepository, ObservationRepository } from "@stellarclear/db";
import type { OnChainAnchorService } from "./settlement.js";
import type { CaseConsistencyResponse, ConsistencyStatus, ConsistencyCheckDetails } from "./types.js";

export class SettlementConsistencyChecker {
  constructor(
    private readonly caseRepo: CaseRepository,
    private readonly obsRepo: ObservationRepository,
    private readonly anchorService: OnChainAnchorService,
    private readonly defaultContractId: string,
    private readonly network: string
  ) {}

  public async checkCaseConsistency(caseId: string): Promise<CaseConsistencyResponse> {
    const checkedAt = new Date().toISOString();
    const dbCase = await this.caseRepo.findById(caseId, this.network);
    if (!dbCase) {
      throw new Error(`Case ${caseId} not found in database`);
    }

    const onChainCase = await this.anchorService.getOnChainCase(caseId);
    const dbObs = await this.obsRepo.findByCaseId(caseId, this.network);

    const contractId = dbCase.contract_id ?? this.defaultContractId;

    if (!onChainCase) {
      const details: ConsistencyCheckDetails = {
        termsCommitmentMatch: false,
        observationCommitmentMatch: false,
        statusMatch: false,
        onChainCaseExists: false,
        chainReferencePresent: Boolean(dbCase.create_tx_hash),
        discrepancies: ["Case does not exist on-chain in SettlementRegistry"],
      };

      return {
        caseId,
        contractId,
        network: this.network,
        consistencyStatus: "MISSING_ONCHAIN_CASE",
        isConsistent: false,
        databaseStatus: dbCase.status,
        onChainStatus: undefined,
        details,
        checkedAt,
      };
    }

    // 1. Terms commitment matching
    const termsCommitmentMatch =
      dbCase.terms_commitment.toLowerCase() === onChainCase.termsCommitment.toLowerCase();

    // 2. Observation commitment matching
    const onChainObsCommitment = onChainCase.observation?.observationCommitment;
    let observationCommitmentMatch = true;
    if (dbObs && onChainObsCommitment) {
      observationCommitmentMatch =
        dbObs.observation_commitment.toLowerCase() === onChainObsCommitment.toLowerCase();
    } else if (!dbObs && onChainObsCommitment) {
      observationCommitmentMatch = false;
    } else if (dbObs && !onChainObsCommitment) {
      observationCommitmentMatch = true;
    }

    // 3. Status match
    const statusMatch = dbCase.status === onChainCase.status;

    // 4. Chain reference check
    const chainReferencePresent = Boolean(dbCase.create_tx_hash);

    // Build discrepancies list
    const discrepancies: string[] = [];
    if (!termsCommitmentMatch) {
      discrepancies.push(
        `Terms commitment mismatch: DB=${dbCase.terms_commitment}, OnChain=${onChainCase.termsCommitment}`
      );
    }
    if (!observationCommitmentMatch) {
      discrepancies.push(
        `Observation commitment mismatch: DB=${dbObs?.observation_commitment}, OnChain=${onChainObsCommitment}`
      );
    }
    if (!chainReferencePresent) {
      discrepancies.push("Case is missing create transaction hash reference in database");
    }
    if (!statusMatch) {
      discrepancies.push(
        `Status mismatch: DB is ${dbCase.status}, OnChain is ${onChainCase.status}`
      );
    }

    // Determine consistency status
    let consistencyStatus: ConsistencyStatus = "CONSISTENT";

    if (!termsCommitmentMatch || (dbObs && onChainObsCommitment && !observationCommitmentMatch)) {
      consistencyStatus = "COMMITMENT_MISMATCH";
    } else if (!chainReferencePresent) {
      consistencyStatus = "STALE_CHAIN_REFERENCE";
    } else if (!dbObs && onChainObsCommitment) {
      consistencyStatus = "STALE_DATABASE";
    } else if (!statusMatch) {
      // If onChain has advanced state compared to DB
      const order = ["OPEN", "OBSERVED", "MATCHED", "BREAK", "DISPUTED", "RESOLVED", "FINALIZED"];
      const dbIdx = order.indexOf(dbCase.status);
      const chainIdx = order.indexOf(onChainCase.status);
      if (chainIdx > dbIdx && dbIdx >= 0) {
        consistencyStatus = "STALE_DATABASE";
      } else {
        consistencyStatus = "STATE_MISMATCH";
      }
    }

    const isConsistent = consistencyStatus === "CONSISTENT";

    return {
      caseId,
      contractId,
      network: this.network,
      consistencyStatus,
      isConsistent,
      databaseStatus: dbCase.status,
      onChainStatus: onChainCase.status,
      details: {
        termsCommitmentMatch,
        observationCommitmentMatch,
        statusMatch,
        onChainCaseExists: true,
        chainReferencePresent,
        discrepancies,
      },
      checkedAt,
    };
  }
}
