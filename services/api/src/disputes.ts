import { z } from "zod";
import {
  Bytes32HexSchema,
  StellarAddressSchema,
  DecimalAmountSchema,
} from "@stellarclear/schemas";
import { formatDomainDocument, sha256Hex, computeResolutionCommitment } from "@stellarclear/proof";
import type { CaseRepository } from "@stellarclear/db";
import type { OnChainAnchorService } from "./settlement.js";

const DISPUTE_DOMAIN_PREFIX = "STELLARCLEAR/DISPUTE/V1";

export const OpenDisputeRequestSchema = z.object({
  initiator: StellarAddressSchema,
  reason: z.string().min(1),
  evidence: z.record(z.string(), z.unknown()).optional(),
});
export type OpenDisputeRequest = z.infer<typeof OpenDisputeRequestSchema>;

export const SubmitResolutionRequestSchema = z.object({
  resolver: StellarAddressSchema,
  resolutionType: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  agreedAmount: DecimalAmountSchema.optional(),
  resolutionCommitment: Bytes32HexSchema.optional(),
});
export type SubmitResolutionRequest = z.infer<typeof SubmitResolutionRequestSchema>;

export interface DisputeDetails {
  caseId: string;
  status: string;
  disputeState?: string;
  dispute?: {
    initiator: string;
    reason: string;
    disputeCommitment: string;
    disputeTxHash?: string;
    openedAt: string;
  };
  resolution?: {
    resolver: string;
    resolutionType?: string;
    resolutionCommitment: string;
    resolutionTxHash?: string;
    resolvedAt: string;
  };
  resolutions?: Array<{
    resolver: string;
    resolutionType?: string;
    resolutionCommitment: string;
    resolutionTxHash?: string;
    submittedAt: string;
  }>;
  disputeCommitment?: string | null;
  resolutionCommitmentsObserved?: string[];
  mutualResolutionAchieved?: boolean;
}

interface StoredResolution {
  resolver: string;
  resolutionType?: string;
  resolutionCommitment: string;
  resolutionTxHash?: string;
  submittedAt: string;
}

export class DisputeService {
  private disputeStore: Map<string, {
    initiator: string;
    reason: string;
    disputeCommitment: string;
    disputeTxHash?: string;
    openedAt: string;
  }> = new Map();

  private resolutionStore: Map<string, StoredResolution[]> = new Map();

  constructor(
    private readonly caseRepo: CaseRepository,
    private readonly anchorService: OnChainAnchorService,
    private readonly network: string
  ) {}

  public async openDispute(caseId: string, req: OpenDisputeRequest) {
    // Step 1: Load case
    const existingCase = await this.caseRepo.findById(caseId, this.network);
    if (!existingCase) {
      throw new Error(`Case ${caseId} not found`);
    }

    // Step 2: Validate case state — strictly BREAK only
    if (existingCase.status !== "BREAK") {
      throw new Error(
        `INVALID_STATE: Cannot open dispute on case ${caseId}. ` +
        `Current status is ${existingCase.status}; disputes may only be opened from BREAK status.`
      );
    }

    // Step 3 & 4: Compute canonical dispute commitment
    const disputeCommitment = sha256Hex(
      formatDomainDocument(DISPUTE_DOMAIN_PREFIX, {
        caseId,
        initiator: req.initiator,
        reason: req.reason,
        evidence: req.evidence ?? null,
      })
    );

    // Step 5 & 6: Submit on-chain transaction first — throws if fails
    const anchorResult = await this.anchorService.anchorDispute({
      initiator: req.initiator,
      caseId,
      disputeCommitment,
    });

    const now = new Date().toISOString();

    // Step 7: Persist durable off-chain state only after on-chain transaction succeeds
    await this.caseRepo.updateStatus(caseId, this.network, "DISPUTED");
    await this.caseRepo.updateChainReferences(caseId, this.network, {
      dispute_tx_hash: anchorResult.txHash,
    });

    const record = {
      initiator: req.initiator,
      reason: req.reason,
      disputeCommitment,
      disputeTxHash: anchorResult.txHash,
      openedAt: now,
    };
    this.disputeStore.set(caseId.toLowerCase(), record);

    // Step 8: Return response
    return {
      caseId,
      status: "DISPUTED",
      disputeCommitment,
      txHash: anchorResult.txHash,
      openedAt: now,
    };
  }

  public async submitResolution(caseId: string, req: SubmitResolutionRequest) {
    // Step 1: Load case
    const existingCase = await this.caseRepo.findById(caseId, this.network);
    if (!existingCase) {
      throw new Error(`Case ${caseId} not found`);
    }

    // Step 2: Validate case status
    if (existingCase.status !== "DISPUTED") {
      throw new Error(
        `INVALID_STATE: Cannot submit resolution on case with status ${existingCase.status}. Expected status: DISPUTED.`
      );
    }

    // Step 4: Compute canonical resolution commitment
    const resolutionCommitment =
      req.resolutionCommitment ??
      computeResolutionCommitment({
        caseId,
        resolver: req.resolver,
        resolutionType: req.resolutionType,
        agreedAmount: req.agreedAmount ?? null,
        details: req.details ?? null,
      });

    // Step 5 & 6: Submit on-chain — throws if transaction fails
    const anchorResult = await this.anchorService.anchorResolution({
      resolver: req.resolver,
      caseId,
      resolutionCommitment,
    });

    const now = new Date().toISOString();

    await this.caseRepo.updateChainReferences(caseId, this.network, {
      resolution_tx_hash: anchorResult.txHash,
    });

    const newRes: StoredResolution = {
      resolver: req.resolver,
      resolutionType: req.resolutionType,
      resolutionCommitment,
      resolutionTxHash: anchorResult.txHash,
      submittedAt: now,
    };

    const caseKey = caseId.toLowerCase();
    const stored = this.resolutionStore.get(caseKey) ?? [];
    // Replace if resolver already submitted, otherwise append
    const existingIndex = stored.findIndex((r) => r.resolver === req.resolver);
    if (existingIndex >= 0) {
      stored[existingIndex] = newRes;
    } else {
      stored.push(newRes);
    }
    this.resolutionStore.set(caseKey, stored);

    // Mutual agreement check: both owner and counterparty must submit matching commitments
    const ownerRes = stored.find((r) => r.resolver === existingCase.owner);
    const cpRes = existingCase.counterparty
      ? stored.find((r) => r.resolver === existingCase.counterparty)
      : null;

    let currentStatus: string = existingCase.status;
    const isMutual = Boolean(
      ownerRes &&
      cpRes &&
      ownerRes.resolutionCommitment.toLowerCase() === cpRes.resolutionCommitment.toLowerCase()
    );

    if (isMutual) {
      await this.caseRepo.updateStatus(caseId, this.network, "RESOLVED");
      currentStatus = "RESOLVED";
    }

    return {
      caseId,
      status: currentStatus,
      resolutionCommitment,
      txHash: anchorResult.txHash,
      submittedAt: now,
      mutualResolutionAchieved: currentStatus === "RESOLVED",
    };
  }

  public async getDispute(caseId: string): Promise<DisputeDetails> {
    const existingCase = await this.caseRepo.findById(caseId, this.network);
    if (!existingCase) {
      throw new Error(`Case ${caseId} not found`);
    }

    const dispute = this.disputeStore.get(caseId.toLowerCase());
    const storedResolutions = this.resolutionStore.get(caseId.toLowerCase()) ?? [];

    let resolution: DisputeDetails["resolution"] = undefined;
    if (storedResolutions.length > 0) {
      const lastRes = storedResolutions[storedResolutions.length - 1];
      resolution = {
        resolver: lastRes.resolver,
        resolutionType: lastRes.resolutionType,
        resolutionCommitment: lastRes.resolutionCommitment,
        resolutionTxHash: lastRes.resolutionTxHash,
        resolvedAt: lastRes.submittedAt,
      };
    } else if (existingCase.resolution_tx_hash) {
      resolution = {
        resolver: existingCase.owner,
        resolutionType: "MUTUAL_AGREEMENT",
        resolutionCommitment: "0".repeat(64),
        resolutionTxHash: existingCase.resolution_tx_hash,
        resolvedAt: typeof existingCase.updated_at === "string" ? existingCase.updated_at : existingCase.updated_at.toISOString(),
      };
    }

    return {
      caseId,
      status: existingCase.status,
      disputeState: existingCase.status,
      dispute: dispute ?? (existingCase.dispute_tx_hash ? {
        initiator: existingCase.owner,
        reason: "Dispute opened",
        disputeCommitment: "0".repeat(64),
        disputeTxHash: existingCase.dispute_tx_hash,
        openedAt: typeof existingCase.updated_at === "string" ? existingCase.updated_at : existingCase.updated_at.toISOString(),
      } : undefined),
      resolution,
      resolutions: storedResolutions,
      disputeCommitment: dispute?.disputeCommitment ?? null,
      resolutionCommitmentsObserved: storedResolutions.map((r) => r.resolutionCommitment),
      mutualResolutionAchieved: existingCase.status === "RESOLVED",
    };
  }
}
