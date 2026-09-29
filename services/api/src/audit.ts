import type {
  CaseRepository,
  ObservationRepository,
  ReconciliationRepository,
  BreakRepository,
  AttestationRepository,
} from "@stellarclear/db";
import type { DisputeService } from "./disputes.js";
import type { OnChainAnchorService } from "./settlement.js";
import type {
  CaseAuditHistoryResponse,
  AuditEventRecord,
} from "./types.js";

export class SettlementAuditService {
  constructor(
    private readonly caseRepo: CaseRepository,
    private readonly obsRepo: ObservationRepository,
    private readonly recRepo: ReconciliationRepository,
    private readonly breakRepo: BreakRepository,
    private readonly attestationRepo: AttestationRepository,
    private readonly disputeService: DisputeService,
    private readonly anchorService: OnChainAnchorService,
    private readonly defaultContractId: string,
    private readonly network: string
  ) {}

  public async getAuditHistory(caseId: string): Promise<CaseAuditHistoryResponse> {
    const generatedAt = new Date().toISOString();
    const dbCase = await this.caseRepo.findById(caseId, this.network);
    if (!dbCase) {
      throw new Error(`Case ${caseId} not found`);
    }

    const obs = await this.obsRepo.findByCaseId(caseId, this.network);
    const rec = await this.recRepo.findByCaseId(caseId, this.network);
    const breaks = await this.breakRepo.findByCaseId(caseId, this.network);
    const rawAttestations = await this.attestationRepo.listByCaseId(caseId, this.network);
    const disputeInfo = await this.disputeService.getDispute(caseId).catch(() => null);
    const onChainCase = await this.anchorService.getOnChainCase(caseId).catch(() => null);

    const contractId = dbCase.contract_id ?? this.defaultContractId;
    const events: AuditEventRecord[] = [];

    // 1. Case Creation
    events.push({
      event: "CASE_CREATED",
      status: "OPEN",
      timestamp:
        typeof dbCase.created_at === "string"
          ? dbCase.created_at
          : new Date(dbCase.created_at).toISOString(),
      txHash: dbCase.create_tx_hash ?? undefined,
      ledger: dbCase.created_at_ledger
        ? Number(dbCase.created_at_ledger)
        : onChainCase?.createdAtLedger ?? undefined,
      actor: dbCase.owner,
      payload: {
        owner: dbCase.owner,
        counterparty: dbCase.counterparty ?? undefined,
        tradeReference: dbCase.trade_reference,
        asset: dbCase.asset,
        amount: dbCase.amount,
        expectedDestination: dbCase.expected_destination,
        reference: dbCase.reference ?? undefined,
        termsCommitment: dbCase.terms_commitment,
        expiresAtLedger: Number(dbCase.expires_at_ledger),
      },
    });

    // 2. Observation
    if (obs) {
      events.push({
        event: "OBSERVED",
        status: "OBSERVED",
        timestamp:
          typeof obs.observed_at === "string"
            ? obs.observed_at
            : new Date(obs.observed_at).toISOString(),
        txHash: obs.observation_tx_hash ?? dbCase.observation_tx_hash ?? undefined,
        ledger: Number(obs.observed_ledger),
        actor: obs.observer ?? obs.destination,
        payload: {
          txHash: obs.tx_hash,
          asset: obs.asset,
          amount: obs.amount,
          destination: obs.destination,
          reference: obs.reference ?? undefined,
          status: obs.status,
          observationCommitment: obs.observation_commitment,
        },
      });
    }

    // 3. Reconciliation
    if (rec) {
      events.push({
        event: rec.matched ? "MATCHED" : "BREAK_RECORDED",
        status: rec.status,
        timestamp:
          typeof rec.reconciled_at === "string"
            ? rec.reconciled_at
            : new Date(rec.reconciled_at).toISOString(),
        txHash: rec.reconciliation_tx_hash ?? dbCase.reconciliation_tx_hash ?? undefined,
        ledger: rec.confirmed_at_ledger ? Number(rec.confirmed_at_ledger) : undefined,
        actor: dbCase.owner,
        payload: {
          matched: rec.matched,
          status: rec.status,
          breaks: breaks.map((b) => ({
            code: b.code,
            field: b.field,
            expectedValue: b.expected_value ?? undefined,
            observedValue: b.observed_value ?? undefined,
            message: b.message,
          })),
        },
      });
    }

    // 4. Attestations
    for (const att of rawAttestations) {
      events.push({
        event: "ATTESTED",
        status: dbCase.status,
        timestamp:
          typeof att.created_at === "string"
            ? att.created_at
            : att.created_at
            ? new Date(att.created_at).toISOString()
            : generatedAt,
        txHash: dbCase.attestation_tx_hash ?? undefined,
        ledger: Number(att.attested_at_ledger),
        actor: att.attestor,
        payload: {
          role: att.role,
          commitment: att.commitment,
        },
      });
    }

    // 5. Dispute & Resolution
    if (disputeInfo?.dispute) {
      events.push({
        event: "DISPUTED",
        status: "DISPUTED",
        timestamp: disputeInfo.dispute.openedAt,
        txHash: disputeInfo.dispute.disputeTxHash ?? dbCase.dispute_tx_hash ?? undefined,
        actor: disputeInfo.dispute.initiator,
        payload: {
          reason: disputeInfo.dispute.reason,
          disputeCommitment: disputeInfo.dispute.disputeCommitment,
        },
      });
    }

    if (disputeInfo?.resolution) {
      events.push({
        event: "RESOLVED",
        status: "RESOLVED",
        timestamp: disputeInfo.resolution.resolvedAt,
        txHash: disputeInfo.resolution.resolutionTxHash ?? dbCase.resolution_tx_hash ?? undefined,
        actor: disputeInfo.resolution.resolver,
        payload: {
          resolutionType: disputeInfo.resolution.resolutionType,
          resolutionCommitment: disputeInfo.resolution.resolutionCommitment,
        },
      });
    }

    // 6. Finalization
    if (dbCase.status === "FINALIZED" || onChainCase?.status === "FINALIZED") {
      events.push({
        event: "FINALIZED",
        status: "FINALIZED",
        timestamp:
          typeof dbCase.updated_at === "string"
            ? dbCase.updated_at
            : new Date(dbCase.updated_at).toISOString(),
        txHash: dbCase.finalization_tx_hash ?? undefined,
        ledger: dbCase.finalized_at_ledger
          ? Number(dbCase.finalized_at_ledger)
          : onChainCase?.finalizedAtLedger ?? undefined,
        payload: {
          finalizedStatus: dbCase.status,
        },
      });
    }

    return {
      caseId,
      contractId,
      network: this.network,
      currentStatus: dbCase.status,
      eventCount: events.length,
      events,
      generatedAt,
    };
  }
}
