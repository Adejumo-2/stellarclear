import { z } from "zod";
import {
  Bytes32HexSchema,
  StellarAddressSchema,
  LedgerSequenceSchema,
  AttestationRoleSchema,
  type AttestationRole,
} from "@stellarclear/schemas";
import type { AttestationRepository, CaseRepository } from "@stellarclear/db";
import type { OnChainAnchorService } from "./settlement.js";

export const SubmitAttestationRequestSchema = z.object({
  role: AttestationRoleSchema,
  attestor: StellarAddressSchema,
  commitment: Bytes32HexSchema,
  attestedAtLedger: LedgerSequenceSchema.optional(),
});
export type SubmitAttestationRequest = z.infer<typeof SubmitAttestationRequestSchema>;

export const SubmitAttestationResponseSchema = z.object({
  caseId: Bytes32HexSchema,
  role: AttestationRoleSchema,
  attestor: StellarAddressSchema,
  commitment: Bytes32HexSchema,
  attestedAtLedger: LedgerSequenceSchema,
  txHash: z.string().optional(),
  recordedAt: z.string(),
});
export type SubmitAttestationResponse = z.infer<typeof SubmitAttestationResponseSchema>;

export class AttestationService {
  constructor(
    private readonly caseRepo: CaseRepository,
    private readonly attestationRepo: AttestationRepository,
    private readonly anchorService: OnChainAnchorService,
    private readonly network: string
  ) {}

  public async submitAttestation(
    caseId: string,
    req: SubmitAttestationRequest
  ): Promise<{
    attestation: {
      caseId: string;
      role: AttestationRole;
      attestor: string;
      commitment: string;
      attestedAtLedger: number;
    };
    txHash?: string;
  }> {
    const existingCase = await this.caseRepo.findById(caseId, this.network);
    if (!existingCase) {
      throw new Error(`Case ${caseId} not found`);
    }

    // Role authorization check
    if (req.role === "OWNER" && req.attestor !== existingCase.owner) {
      throw new Error(`Attestor ${req.attestor} is not the owner of case ${caseId}`);
    }
    if (
      req.role === "COUNTERPARTY" &&
      existingCase.counterparty &&
      req.attestor !== existingCase.counterparty
    ) {
      throw new Error(`Attestor ${req.attestor} is not the counterparty of case ${caseId}`);
    }

    const attestedLedger = req.attestedAtLedger ?? Number(existingCase.expires_at_ledger);

    // 1. Off-chain persistence
    await this.attestationRepo.insert({
      network: this.network,
      case_id: caseId,
      role: req.role,
      attestor: req.attestor,
      commitment: req.commitment,
      attested_at_ledger: attestedLedger,
    });

    // 2. On-chain anchoring
    const anchorResult = await this.anchorService.anchorAttestation({
      attestor: req.attestor,
      caseId,
      role: req.role,
      commitment: req.commitment,
    });

    // 3. Update DB case references
    await this.caseRepo.updateChainReferences(caseId, this.network, {
      attestation_tx_hash: anchorResult.txHash,
      confirmed_at_ledger: anchorResult.ledger ?? attestedLedger,
    });

    return {
      attestation: {
        caseId,
        role: req.role,
        attestor: req.attestor,
        commitment: req.commitment,
        attestedAtLedger: attestedLedger,
      },
      txHash: anchorResult.txHash,
    };
  }

  public async getAttestations(caseId: string) {
    const existingCase = await this.caseRepo.findById(caseId, this.network);
    if (!existingCase) {
      throw new Error(`Case ${caseId} not found`);
    }

    const records = await this.attestationRepo.listByCaseId(caseId, this.network);
    return records.map((r) => ({
      caseId: r.case_id,
      role: r.role as AttestationRole,
      attestor: r.attestor,
      commitment: r.commitment,
      attestedAtLedger: Number(r.attested_at_ledger),
    }));
  }
}
