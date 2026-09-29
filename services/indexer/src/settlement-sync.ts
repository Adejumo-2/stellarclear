import type { IDatabaseClient } from "@stellarclear/db";
import {
  CaseRepository,
  ObservationRepository,
  ReconciliationRepository,
  AttestationRepository,
  DisputeRepository,
  ResolutionRepository,
  ContractEventRepository,
} from "@stellarclear/db";
import type { DecodedContractEvent } from "./types.js";
import type { AttestationRole, BreakCode } from "@stellarclear/schemas";

export interface SyncStats {
  eventsProcessed: number;
  casesUpdated: number;
  lastLedgerSequence: number;
}

export class SettlementStateSynchronizer {
  private caseRepo: CaseRepository;
  private obsRepo: ObservationRepository;
  private recRepo: ReconciliationRepository;
  private attestationRepo: AttestationRepository;
  private disputeRepo: DisputeRepository;
  private resolutionRepo: ResolutionRepository;
  private eventRepo: ContractEventRepository;

  constructor(
    private readonly client: IDatabaseClient,
    private readonly network: string
  ) {
    this.caseRepo = new CaseRepository(client);
    this.obsRepo = new ObservationRepository(client);
    this.recRepo = new ReconciliationRepository(client);
    this.attestationRepo = new AttestationRepository(client);
    this.disputeRepo = new DisputeRepository(client);
    this.resolutionRepo = new ResolutionRepository(client);
    this.eventRepo = new ContractEventRepository(client);
  }

  /**
   * Synchronizes settlement state from a decoded Soroban contract event.
   * Performs idempotent state updates preserving existing proof references.
   */
  public async syncEvent(event: DecodedContractEvent): Promise<boolean> {
    // 1. Ingest into contract_events table (idempotent ON CONFLICT)
    await this.eventRepo.insert({
      network: this.network,
      contract_id: event.contractId,
      ledger: event.ledger,
      tx_hash: event.txHash,
      event_type: event.type,
      case_id: event.caseId,
      topic_xdr: event.topicXdr,
      data_xdr: event.dataXdr,
      cursor: event.cursor,
    });

    if (!event.caseId) {
      return false;
    }

    const caseId = event.caseId;
    const existingCase = await this.caseRepo.findById(caseId, this.network);

    switch (event.type) {
      case "CaseCreated": {
        if (existingCase) {
          await this.caseRepo.updateChainReferences(caseId, this.network, {
            create_tx_hash: event.txHash,
            created_at_ledger: event.ledger,
            submission_status: "CONFIRMED",
            confirmed_at_ledger: event.ledger,
          });
        }
        return true;
      }

      case "ObservationRecorded": {
        if (existingCase) {
          await this.caseRepo.updateStatus(caseId, this.network, "OBSERVED");
          await this.caseRepo.updateChainReferences(caseId, this.network, {
            observation_tx_hash: event.txHash,
            confirmed_at_ledger: event.ledger,
          });
        }
        await this.obsRepo.updateChainReferences(caseId, this.network, {
          observation_tx_hash: event.txHash,
          confirmed_at_ledger: event.ledger,
        });
        return true;
      }

      case "CaseMatched": {
        if (existingCase) {
          await this.caseRepo.updateStatus(caseId, this.network, "MATCHED");
          await this.caseRepo.updateChainReferences(caseId, this.network, {
            reconciliation_tx_hash: event.txHash,
            confirmed_at_ledger: event.ledger,
          });
        }
        await this.recRepo.updateChainReferences(caseId, this.network, {
          reconciliation_tx_hash: event.txHash,
          confirmed_at_ledger: event.ledger,
        });
        return true;
      }

      case "CaseBroken": {
        if (existingCase) {
          await this.caseRepo.updateStatus(caseId, this.network, "BREAK");
          await this.caseRepo.updateChainReferences(caseId, this.network, {
            reconciliation_tx_hash: event.txHash,
            confirmed_at_ledger: event.ledger,
          });
        }
        await this.recRepo.updateChainReferences(caseId, this.network, {
          reconciliation_tx_hash: event.txHash,
          confirmed_at_ledger: event.ledger,
        });
        return true;
      }

      case "AttestationSubmitted": {
        const attestor = String(event.payload["attestor"]);
        const role = event.payload["role"] as AttestationRole;
        await this.attestationRepo.insert({
          network: this.network,
          case_id: caseId,
          role,
          attestor,
          commitment: event.txHash,
          attested_at_ledger: event.ledger,
        });
        if (existingCase) {
          await this.caseRepo.updateChainReferences(caseId, this.network, {
            attestation_tx_hash: event.txHash,
          });
        }
        return true;
      }

      case "DisputeOpened": {
        const initiator = String(event.payload["initiator"]);
        const disputeCommitment = String(event.payload["disputeCommitment"]);
        await this.disputeRepo.insert({
          network: this.network,
          case_id: caseId,
          initiator,
          dispute_commitment: disputeCommitment,
          opened_at_ledger: event.ledger,
        });
        if (existingCase) {
          await this.caseRepo.updateStatus(caseId, this.network, "DISPUTED");
          await this.caseRepo.updateChainReferences(caseId, this.network, {
            dispute_tx_hash: event.txHash,
          });
        }
        return true;
      }

      case "ResolutionSubmitted": {
        const resolver = String(event.payload["resolver"]);
        const resolutionCommitment = String(event.payload["resolutionCommitment"]);
        await this.resolutionRepo.insert({
          network: this.network,
          case_id: caseId,
          resolver,
          resolution_commitment: resolutionCommitment,
          submitted_at_ledger: event.ledger,
        });
        return true;
      }

      case "DisputeResolved": {
        if (existingCase) {
          await this.caseRepo.updateStatus(caseId, this.network, "RESOLVED");
          await this.caseRepo.updateChainReferences(caseId, this.network, {
            resolution_tx_hash: event.txHash,
          });
        }
        return true;
      }

      case "CaseFinalized": {
        const finalizedLedger = Number(event.payload["finalizedAtLedger"] || event.ledger);
        if (existingCase) {
          await this.caseRepo.updateStatus(caseId, this.network, "FINALIZED", finalizedLedger);
          await this.caseRepo.updateChainReferences(caseId, this.network, {
            finalization_tx_hash: event.txHash,
            finalized_at_ledger: finalizedLedger,
          });
        }
        return true;
      }

      default:
        return false;
    }
  }

  /**
   * Synchronizes a batch of decoded contract events.
   */
  public async syncBatch(events: DecodedContractEvent[]): Promise<SyncStats> {
    let processed = 0;
    let updated = 0;
    let lastLedger = 0;

    for (const ev of events) {
      const changed = await this.syncEvent(ev);
      processed++;
      if (changed) updated++;
      if (ev.ledger > lastLedger) {
        lastLedger = ev.ledger;
      }
    }

    return {
      eventsProcessed: processed,
      casesUpdated: updated,
      lastLedgerSequence: lastLedger,
    };
  }
}
