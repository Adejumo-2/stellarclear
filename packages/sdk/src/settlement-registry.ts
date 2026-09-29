import { Buffer } from "buffer";
import {
  Client as RegistryClient,
  contract,
  type SettlementCase,
} from "settlement-registry";
import {
  ExpectedSettlementSchema,
  ObservedSettlementSchema,
  type ExpectedSettlement,
  type ObservedSettlement,
  type BreakCode,
  type AttestationRole,
} from "@stellarclear/schemas";
import {
  computeTermsCommitmentBuffer,
  computeObservationCommitmentBuffer,
  computeDeterministicCaseId,
} from "@stellarclear/proof";
import {
  breakCodeToContract,
  attestationRoleToContract,
  decodeCaseRecord,
  decodeAttestationRecord,
} from "./helpers.js";
import { normalizeContractError } from "./errors.js";
import type { CaseRecord, AttestationRecord, TransactionResult } from "./types.js";
import type { StellarClearConfig } from "./config.js";

function extractTxHash(tx: unknown): string {
  if (typeof tx === "object" && tx !== null) {
    const rec = tx as Record<string, unknown>;
    if (typeof rec["txHash"] === "string") return rec["txHash"];
    if (typeof rec["hash"] === "string") return rec["hash"];
    const raw = rec["raw"] as { hash?: () => { toString: (fmt: string) => string } } | undefined;
    if (typeof raw?.hash === "function") {
      try {
        return raw.hash().toString("hex");
      } catch {
        // ignore
      }
    }
  }
  return `sim_${Date.now()}`;
}

export interface SettlementRegistryOperationsOptions {
  client: RegistryClient;
  config: StellarClearConfig;
}

/**
 * High-level SettlementRegistry client operations wrapper directly connecting
 * the TypeScript SDK to Soroban SettlementRegistry bindings.
 */
export class SettlementRegistryOperations {
  private contractClient: RegistryClient;
  private config: StellarClearConfig;

  constructor(options: SettlementRegistryOperationsOptions) {
    this.contractClient = options.client;
    this.config = options.config;
  }

  /**
   * Generates a deterministic case ID from input parameters.
   */
  public generateCaseId(
    owner: string,
    tradeReference: string,
    asset: string,
    deadline: number
  ): string {
    return computeDeterministicCaseId(owner, tradeReference, asset, deadline);
  }

  /**
   * Constructs and executes create_case on Soroban SettlementRegistry contract.
   */
  public async createCase(
    terms: ExpectedSettlement,
    options?: contract.MethodOptions
  ): Promise<TransactionResult<void>> {
    try {
      const validated = ExpectedSettlementSchema.parse(terms);
      const termsCommitmentBuffer = computeTermsCommitmentBuffer(validated);
      const caseIdBuffer = Buffer.from(validated.caseId, "hex");

      const tx = await this.contractClient.create_case(
        {
          case_id: caseIdBuffer,
          owner: validated.owner,
          counterparty: validated.counterparty,
          terms_commitment: termsCommitmentBuffer,
          expires_at_ledger: validated.deadline,
        },
        options
      );

      return {
        txHash: extractTxHash(tx),
        status: "SUCCESS",
        result: undefined,
      };
    } catch (err: unknown) {
      throw normalizeContractError(err);
    }
  }

  /**
   * Constructs and executes record_observation on Soroban SettlementRegistry contract.
   */
  public async recordObservation(
    params: {
      observer: string;
      caseId: string;
      observation: ObservedSettlement;
    },
    options?: contract.MethodOptions
  ): Promise<TransactionResult<void>> {
    try {
      const validated = ObservedSettlementSchema.parse(params.observation);
      const obsCommitmentBuffer = computeObservationCommitmentBuffer(validated);
      const caseIdBuffer = Buffer.from(params.caseId, "hex");
      const txHashBuffer = Buffer.from(validated.txHash, "hex");

      const tx = await this.contractClient.record_observation(
        {
          observer: params.observer,
          case_id: caseIdBuffer,
          tx_hash: txHashBuffer,
          observed_ledger: validated.ledger,
          observation_commitment: obsCommitmentBuffer,
        },
        options
      );

      return {
        txHash: extractTxHash(tx),
        status: "SUCCESS",
        result: undefined,
      };
    } catch (err: unknown) {
      throw normalizeContractError(err);
    }
  }

  /**
   * Constructs and executes record_match on Soroban SettlementRegistry contract.
   */
  public async recordMatch(
    params: { observer: string; caseId: string },
    options?: contract.MethodOptions
  ): Promise<TransactionResult<void>> {
    try {
      const caseIdBuffer = Buffer.from(params.caseId, "hex");
      const tx = await this.contractClient.record_match(
        {
          observer: params.observer,
          case_id: caseIdBuffer,
        },
        options
      );

      return {
        txHash: extractTxHash(tx),
        status: "SUCCESS",
        result: undefined,
      };
    } catch (err: unknown) {
      throw normalizeContractError(err);
    }
  }

  /**
   * Constructs and executes record_break on Soroban SettlementRegistry contract.
   */
  public async recordBreak(
    params: {
      observer: string;
      caseId: string;
      breakCode: BreakCode;
    },
    options?: contract.MethodOptions
  ): Promise<TransactionResult<void>> {
    try {
      const caseIdBuffer = Buffer.from(params.caseId, "hex");
      const breakCodeTag = breakCodeToContract(params.breakCode);

      const tx = await this.contractClient.record_break(
        {
          observer: params.observer,
          case_id: caseIdBuffer,
          break_code: breakCodeTag,
        },
        options
      );

      return {
        txHash: extractTxHash(tx),
        status: "SUCCESS",
        result: undefined,
      };
    } catch (err: unknown) {
      throw normalizeContractError(err);
    }
  }

  /**
   * Constructs and executes submit_attestation on Soroban SettlementRegistry contract.
   */
  public async submitAttestation(
    params: {
      caseId: string;
      role: AttestationRole;
      commitment: string | Buffer;
    },
    options?: contract.MethodOptions
  ): Promise<TransactionResult<void>> {
    try {
      const caseIdBuffer = Buffer.from(params.caseId, "hex");
      const commitmentBuffer =
        typeof params.commitment === "string"
          ? Buffer.from(params.commitment, "hex")
          : params.commitment;
      const roleTag = attestationRoleToContract(params.role);

      const tx = await this.contractClient.submit_attestation(
        {
          case_id: caseIdBuffer,
          role: roleTag,
          commitment: commitmentBuffer,
        },
        options
      );

      return {
        txHash: extractTxHash(tx),
        status: "SUCCESS",
        result: undefined,
      };
    } catch (err: unknown) {
      throw normalizeContractError(err);
    }
  }

  /**
   * Constructs and executes open_dispute on Soroban SettlementRegistry contract.
   */
  public async openDispute(
    params: {
      initiator: string;
      caseId: string;
      disputeCommitment: string | Buffer;
    },
    options?: contract.MethodOptions
  ): Promise<TransactionResult<void>> {
    try {
      const caseIdBuffer = Buffer.from(params.caseId, "hex");
      const commitmentBuffer =
        typeof params.disputeCommitment === "string"
          ? Buffer.from(params.disputeCommitment, "hex")
          : params.disputeCommitment;

      const tx = await this.contractClient.open_dispute(
        {
          initiator: params.initiator,
          case_id: caseIdBuffer,
          dispute_commitment: commitmentBuffer,
        },
        options
      );

      return {
        txHash: extractTxHash(tx),
        status: "SUCCESS",
        result: undefined,
      };
    } catch (err: unknown) {
      throw normalizeContractError(err);
    }
  }

  /**
   * Constructs and executes submit_resolution on Soroban SettlementRegistry contract.
   */
  public async submitResolution(
    params: {
      resolver: string;
      caseId: string;
      resolutionCommitment: string | Buffer;
    },
    options?: contract.MethodOptions
  ): Promise<TransactionResult<void>> {
    try {
      const caseIdBuffer = Buffer.from(params.caseId, "hex");
      const commitmentBuffer =
        typeof params.resolutionCommitment === "string"
          ? Buffer.from(params.resolutionCommitment, "hex")
          : params.resolutionCommitment;

      const tx = await this.contractClient.submit_resolution(
        {
          resolver: params.resolver,
          case_id: caseIdBuffer,
          resolution_commitment: commitmentBuffer,
        },
        options
      );

      return {
        txHash: extractTxHash(tx),
        status: "SUCCESS",
        result: undefined,
      };
    } catch (err: unknown) {
      throw normalizeContractError(err);
    }
  }

  /**
   * Constructs and executes finalize_case on Soroban SettlementRegistry contract.
   */
  public async finalizeCase(
    caseId: string,
    options?: contract.MethodOptions
  ): Promise<TransactionResult<void>> {
    try {
      const caseIdBuffer = Buffer.from(caseId, "hex");
      const tx = await this.contractClient.finalize_case(
        { case_id: caseIdBuffer },
        options
      );

      return {
        txHash: extractTxHash(tx),
        status: "SUCCESS",
        result: undefined,
      };
    } catch (err: unknown) {
      throw normalizeContractError(err);
    }
  }

  /**
   * Reads and decodes a settlement case from contract state.
   */
  public async getCase(
    caseId: string,
    options?: contract.MethodOptions
  ): Promise<CaseRecord> {
    try {
      const caseIdBuffer = Buffer.from(caseId, "hex");
      const tx = await this.contractClient.get_case({ case_id: caseIdBuffer }, options);
      const caseData: SettlementCase = tx.result.unwrap();
      return decodeCaseRecord(caseId, caseData);
    } catch (err: unknown) {
      throw normalizeContractError(err);
    }
  }

  /**
   * Reads an attestation record from contract state.
   */
  public async getAttestation(
    caseId: string,
    attestor: string,
    options?: contract.MethodOptions
  ): Promise<AttestationRecord | null> {
    try {
      const caseIdBuffer = Buffer.from(caseId, "hex");
      const tx = await this.contractClient.get_attestation(
        { case_id: caseIdBuffer, attestor },
        options
      );
      if (!tx.result) {
        return null;
      }
      return decodeAttestationRecord(caseId, attestor, tx.result);
    } catch (err: unknown) {
      throw normalizeContractError(err);
    }
  }

  /**
   * Checks if an address is an observer.
   */
  public async isObserver(
    observer: string,
    options?: contract.MethodOptions
  ): Promise<boolean> {
    try {
      const tx = await this.contractClient.is_observer({ observer }, options);
      return tx.result;
    } catch (err: unknown) {
      throw normalizeContractError(err);
    }
  }

  /**
   * Reads resolution commitment for a case and resolver.
   */
  public async getResolution(
    caseId: string,
    resolver: string,
    options?: contract.MethodOptions
  ): Promise<string | null> {
    try {
      const caseIdBuffer = Buffer.from(caseId, "hex");
      const tx = await this.contractClient.get_resolution(
        { case_id: caseIdBuffer, resolver },
        options
      );
      if (!tx.result) {
        return null;
      }
      return Buffer.from(tx.result).toString("hex").toLowerCase();
    } catch (err: unknown) {
      throw normalizeContractError(err);
    }
  }
}
