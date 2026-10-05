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
  dispute?: {
    initiator: string;
    reason: string;
    disputeCommitment: string;
    disputeTxHash?: string;
    openedAt: string;
  };
  resolution?: {
    resolver: string;
    resolutionType: string;
    resolutionCommitment: string;
    resolutionTxHash?: string;
    resolvedAt: string;
  };
}

export class DisputeService {
  private disputeStore: Map<string, {
    initiator: string;
    reason: string;
    disputeCommitment: string;
    disputeTxHash?: string;
    openedAt: string;
  }> = new Map();

  private resolutionStore: Map<string, {
    resolver: string;
    resolutionType: string;
    resolutionCommitment: string;
    resolutionTxHash?: string;
    resolvedAt: string;
  }> = new Map();

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
    const existingCase = await this.caseRepo.findById(caseId, this.network);
    if (!existingCase) {
      throw new Error(`Case ${caseId} not found`);
    }

    if (existingCase.status !== "DISPUTED") {
      throw new Error(
        `INVALID_STATE: Cannot submit resolution on case with status ${existingCase.status}. Expected status: DISPUTED.`
      );
    }

    // Compute canonical resolution commitment
    const resolutionCommitment =
      req.resolutionCommitment ??
      computeResolutionCommitment({
        caseId,
        resolver: req.resolver,
        resolutionType: req.resolutionType,
        agreedAmount: req.agreedAmount ?? null,
        details: req.details ?? null,
      });

    // Anchor on-chain
    const anchorResult = await this.anchorService.anchorResolution({
      resolver: req.resolver,
      caseId,
      resolutionCommitment,
    });

    const now = new Date().toISOString();

    // Update case in DB
    await this.caseRepo.updateStatus(caseId, this.network, "RESOLVED");
    await this.caseRepo.updateChainReferences(caseId, this.network, {
      resolution_tx_hash: anchorResult.txHash,
    });

    const record = {
      resolver: req.resolver,
      resolutionType: req.resolutionType,
      resolutionCommitment,
      resolutionTxHash: anchorResult.txHash,
      resolvedAt: now,
    };
    this.resolutionStore.set(caseId.toLowerCase(), record);

    return {
      caseId,
      status: "RESOLVED",
      resolutionCommitment,
      txHash: anchorResult.txHash,
      resolvedAt: now,
    };
  }

  public async getDispute(caseId: string): Promise<DisputeDetails> {
    const existingCase = await this.caseRepo.findById(caseId, this.network);
    if (!existingCase) {
      throw new Error(`Case ${caseId} not found`);
    }

    const dispute = this.disputeStore.get(caseId.toLowerCase());
    const resolution = this.resolutionStore.get(caseId.toLowerCase());

    return {
      caseId,
      status: existingCase.status,
      dispute: dispute ?? (existingCase.dispute_tx_hash ? {
        initiator: existingCase.owner,
        reason: "Dispute opened",
        disputeCommitment: "0".repeat(64),
        disputeTxHash: existingCase.dispute_tx_hash,
        openedAt: typeof existingCase.updated_at === "string" ? existingCase.updated_at : existingCase.updated_at.toISOString(),
      } : undefined),
      resolution: resolution ?? (existingCase.resolution_tx_hash ? {
        resolver: existingCase.owner,
        resolutionType: "MUTUAL_AGREEMENT",
        resolutionCommitment: "0".repeat(64),
        resolutionTxHash: existingCase.resolution_tx_hash,
        resolvedAt: typeof existingCase.updated_at === "string" ? existingCase.updated_at : existingCase.updated_at.toISOString(),
      } : undefined),
    };
  }
}
