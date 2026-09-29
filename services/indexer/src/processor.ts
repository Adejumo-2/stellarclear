import type { IDatabaseClient } from "@stellarclear/db";
import {
  CaseRepository,
  ContractEventRepository,
  AttestationRepository,
  DisputeRepository,
  ResolutionRepository,
} from "@stellarclear/db";
import type { DecodedContractEvent } from "./types.js";
import type { BreakCode, AttestationRole } from "@stellarclear/schemas";

export class EventProcessor {
  private caseRepo: CaseRepository;
  private eventRepo: ContractEventRepository;
  private attestationRepo: AttestationRepository;
  private disputeRepo: DisputeRepository;
  private resolutionRepo: ResolutionRepository;

  constructor(private client: IDatabaseClient, private network: string) {
    this.caseRepo = new CaseRepository(client);
    this.eventRepo = new ContractEventRepository(client);
    this.attestationRepo = new AttestationRepository(client);
    this.disputeRepo = new DisputeRepository(client);
    this.resolutionRepo = new ResolutionRepository(client);
  }

  public async processEvent(event: DecodedContractEvent): Promise<void> {
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

    // 2. Handle state transitions
    if (!event.caseId) {
      return;
    }

    switch (event.type) {
      case "CaseCreated": {
        const existing = await this.caseRepo.findById(event.caseId, this.network);
        if (existing) {
          await this.caseRepo.updateStatus(event.caseId, this.network, "OPEN");
        }
        break;
      }

      case "ObservationRecorded": {
        await this.caseRepo.updateStatus(event.caseId, this.network, "OBSERVED");
        break;
      }

      case "CaseMatched": {
        await this.caseRepo.updateStatus(event.caseId, this.network, "MATCHED");
        break;
      }

      case "CaseBroken": {
        await this.caseRepo.updateStatus(event.caseId, this.network, "BREAK");
        break;
      }

      case "AttestationSubmitted": {
        const attestor = String(event.payload["attestor"]);
        const role = event.payload["role"] as AttestationRole;
        await this.attestationRepo.insert({
          network: this.network,
          case_id: event.caseId,
          role,
          attestor,
          commitment: event.txHash,
          attested_at_ledger: event.ledger,
        });
        break;
      }

      case "DisputeOpened": {
        const initiator = String(event.payload["initiator"]);
        const disputeCommitment = String(event.payload["disputeCommitment"]);
        await this.disputeRepo.insert({
          network: this.network,
          case_id: event.caseId,
          initiator,
          dispute_commitment: disputeCommitment,
          opened_at_ledger: event.ledger,
        });
        await this.caseRepo.updateStatus(event.caseId, this.network, "DISPUTED");
        break;
      }

      case "ResolutionSubmitted": {
        const resolver = String(event.payload["resolver"]);
        const resolutionCommitment = String(event.payload["resolutionCommitment"]);
        await this.resolutionRepo.insert({
          network: this.network,
          case_id: event.caseId,
          resolver,
          resolution_commitment: resolutionCommitment,
          submitted_at_ledger: event.ledger,
        });
        break;
      }

      case "DisputeResolved": {
        await this.caseRepo.updateStatus(event.caseId, this.network, "RESOLVED");
        break;
      }

      case "CaseFinalized": {
        const finalizedLedger = Number(event.payload["finalizedAtLedger"] || event.ledger);
        await this.caseRepo.updateStatus(event.caseId, this.network, "FINALIZED", finalizedLedger);
        break;
      }

      default:
        break;
    }
  }
}
