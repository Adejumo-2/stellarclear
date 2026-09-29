import { z } from "zod";
import { Bytes32HexSchema, LedgerSequenceSchema } from "@stellarclear/schemas";
import type { CaseRepository } from "@stellarclear/db";
import type { OnChainAnchorService } from "./settlement.js";

export const FinalizeCaseResponseSchema = z.object({
  caseId: Bytes32HexSchema,
  status: z.literal("FINALIZED"),
  finalizationTxHash: z.string().optional(),
  finalizedAtLedger: LedgerSequenceSchema.optional(),
  finalizedAt: z.string(),
});
export type FinalizeCaseResponse = z.infer<typeof FinalizeCaseResponseSchema>;

export class FinalizationService {
  constructor(
    private readonly caseRepo: CaseRepository,
    private readonly anchorService: OnChainAnchorService,
    private readonly network: string
  ) {}

  public async finalizeCase(caseId: string): Promise<FinalizeCaseResponse> {
    const existingCase = await this.caseRepo.findById(caseId, this.network);
    if (!existingCase) {
      throw new Error(`Case ${caseId} not found`);
    }

    if (existingCase.status !== "MATCHED" && existingCase.status !== "RESOLVED") {
      throw new Error(`Cannot finalize case with status ${existingCase.status}. Expected status: MATCHED or RESOLVED.`);
    }

    // Anchor on-chain finalization
    const anchorResult = await this.anchorService.anchorFinalization({ caseId });
    const finalizedLedger = anchorResult.ledger ?? Number(existingCase.expires_at_ledger);
    const now = new Date().toISOString();

    // Update case in DB
    await this.caseRepo.updateStatus(caseId, this.network, "FINALIZED", finalizedLedger);
    await this.caseRepo.updateChainReferences(caseId, this.network, {
      finalization_tx_hash: anchorResult.txHash,
      confirmed_at_ledger: finalizedLedger,
    });

    return {
      caseId,
      status: "FINALIZED",
      finalizationTxHash: anchorResult.txHash,
      finalizedAtLedger: finalizedLedger,
      finalizedAt: now,
    };
  }
}
