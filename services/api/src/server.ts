function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

import {
  CreateCaseRequestSchema,
  SubmitObservationRequestSchema,
  VerifyProofRequestSchema,
  Bytes32HexSchema,
  type ExpectedSettlement,
  type ObservedSettlement,
  type Attestation,
  type ReconciliationStatus,
} from "@stellarclear/schemas";
import {
  computeTermsCommitment,
  computeObservationCommitment,
  createSettlementProof,
  verifySettlementProof,
} from "@stellarclear/proof";
import { reconcileSettlement } from "@stellarclear/matcher";
import type { IDatabaseClient } from "@stellarclear/db";
import {
  CaseRepository,
  ObservationRepository,
  ReconciliationRepository,
  BreakRepository,
  AttestationRepository,
} from "@stellarclear/db";
import { validateApiConfig, type ApiConfig, type ApiConfigInput } from "./config.js";
import type { HttpRequest, HttpResponse } from "./types.js";
import { SorobanSettlementAnchor, type OnChainAnchorService } from "./settlement.js";
import { SorobanChainVerifier } from "./chain-verifier.js";
import { AttestationService, SubmitAttestationRequestSchema } from "./attestations.js";
import {
  DisputeService,
  OpenDisputeRequestSchema,
  SubmitResolutionRequestSchema,
} from "./disputes.js";
import { FinalizationService } from "./finalization.js";

export interface InjectOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export class ApiServer {
  public readonly config: ApiConfig;
  private caseRepo: CaseRepository;
  private obsRepo: ObservationRepository;
  private recRepo: ReconciliationRepository;
  private breakRepo: BreakRepository;
  private attestationRepo: AttestationRepository;
  public readonly anchorService: OnChainAnchorService;
  public readonly chainVerifier: SorobanChainVerifier;
  public readonly attestationService: AttestationService;
  public readonly disputeService: DisputeService;
  public readonly finalizationService: FinalizationService;

  constructor(
    configInput: ApiConfigInput | ApiConfig,
    public readonly dbClient: IDatabaseClient,
    anchorService?: OnChainAnchorService,
    chainVerifier?: SorobanChainVerifier
  ) {
    this.config = validateApiConfig(configInput);
    this.caseRepo = new CaseRepository(dbClient);
    this.obsRepo = new ObservationRepository(dbClient);
    this.recRepo = new ReconciliationRepository(dbClient);
    this.breakRepo = new BreakRepository(dbClient);
    this.attestationRepo = new AttestationRepository(dbClient);
    this.anchorService = anchorService ?? new SorobanSettlementAnchor();
    this.chainVerifier =
      chainVerifier ??
      new SorobanChainVerifier(undefined, this.config.contractId, this.config.network);
    this.attestationService = new AttestationService(
      this.caseRepo,
      this.attestationRepo,
      this.anchorService,
      this.config.network
    );
    this.disputeService = new DisputeService(
      this.caseRepo,
      this.anchorService,
      this.config.network
    );
    this.finalizationService = new FinalizationService(
      this.caseRepo,
      this.anchorService,
      this.config.network
    );
  }

  /**
   * Internal request dispatcher executing routing and middleware.
   */
  public async handleRequest(req: HttpRequest): Promise<HttpResponse> {
    const requestId = req.requestId || (req.headers["x-request-id"] as string) || generateUuid();
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;
    const method = req.method.toUpperCase();

    try {
      // 1. GET /health
      if (method === "GET" && pathname === "/health") {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json", "x-request-id": requestId },
          body: {
            status: "ok",
            timestamp: new Date().toISOString(),
            version: "0.1.0",
          },
        };
      }

      // 2. GET /ready
      if (method === "GET" && pathname === "/ready") {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json", "x-request-id": requestId },
          body: {
            status: "ok",
            timestamp: new Date().toISOString(),
            version: "0.1.0",
            services: {
              database: { status: "up" },
            },
          },
        };
      }

      // 3. POST /v1/cases
      if (method === "POST" && pathname === "/v1/cases") {
        const parsed = CreateCaseRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", parsed.error.message, requestId, parsed.error.issues);
        }

        const expected: ExpectedSettlement = parsed.data.expected;
        const termsCommitment = computeTermsCommitment(expected);

        // Check if case exists
        const existing = await this.caseRepo.findById(expected.caseId, this.config.network);
        if (existing) {
          return this.errorResponse(409, "CONFLICT", `Case ${expected.caseId} already exists`, requestId);
        }

        const anchorResult = await this.anchorService.anchorCaseCreation(expected);
        const now = new Date();
        await this.caseRepo.insert({
          id: expected.caseId,
          network: this.config.network,
          contract_id: this.config.contractId,
          owner: expected.owner,
          counterparty: expected.counterparty ?? null,
          trade_reference: expected.tradeReference,
          asset: expected.asset,
          amount: expected.amount,
          expected_destination: expected.expectedDestination,
          reference: expected.reference ?? null,
          terms_commitment: termsCommitment,
          expires_at_ledger: expected.deadline,
          status: "OPEN",
          create_tx_hash: anchorResult.txHash,
          submission_status: "CONFIRMED",
          created_at: now,
          updated_at: now,
        });

        return {
          statusCode: 201,
          headers: { "content-type": "application/json", "x-request-id": requestId },
          body: {
            caseId: expected.caseId,
            status: "OPEN",
            termsCommitment,
            txHash: anchorResult.txHash,
            createdAt: now.toISOString(),
          },
        };
      }

      // 4. GET /v1/cases/:caseId
      const caseMatch = pathname.match(/^\/v1\/cases\/([a-zA-Z0-9_-]+)$/);
      if (method === "GET" && caseMatch) {
        const rawCaseId = caseMatch[1];
        const parsedId = Bytes32HexSchema.safeParse(rawCaseId);
        if (!parsedId.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", "Invalid case ID format", requestId);
        }

        const caseId = parsedId.data;
        const found = await this.caseRepo.findById(caseId, this.config.network);
        if (!found) {
          return this.errorResponse(404, "NOT_FOUND", `Case ${caseId} not found`, requestId);
        }

        return {
          statusCode: 200,
          headers: { "content-type": "application/json", "x-request-id": requestId },
          body: {
            caseId: found.id,
            network: found.network,
            contractId: found.contract_id ?? this.config.contractId,
            owner: found.owner,
            counterparty: found.counterparty,
            tradeReference: found.trade_reference,
            asset: found.asset,
            amount: found.amount,
            expectedDestination: found.expected_destination,
            reference: found.reference,
            termsCommitment: found.terms_commitment,
            expiresAtLedger: Number(found.expires_at_ledger),
            status: found.status,
            createTxHash: found.create_tx_hash ?? undefined,
            observationTxHash: found.observation_tx_hash ?? undefined,
            reconciliationTxHash: found.reconciliation_tx_hash ?? undefined,
            attestationTxHash: found.attestation_tx_hash ?? undefined,
            disputeTxHash: found.dispute_tx_hash ?? undefined,
            resolutionTxHash: found.resolution_tx_hash ?? undefined,
            finalizationTxHash: found.finalization_tx_hash ?? undefined,
            submissionStatus: found.submission_status ?? undefined,
            confirmedAtLedger: found.confirmed_at_ledger ? Number(found.confirmed_at_ledger) : undefined,
            createdAtLedger: found.created_at_ledger ? Number(found.created_at_ledger) : undefined,
            finalizedAtLedger: found.finalized_at_ledger ? Number(found.finalized_at_ledger) : undefined,
            createdAt: new Date(found.created_at).toISOString(),
            updatedAt: new Date(found.updated_at).toISOString(),
          },
        };
      }

      // 5. POST /v1/cases/:caseId/observe
      const observeMatch = pathname.match(/^\/v1\/cases\/([a-zA-Z0-9_-]+)\/observe$/);
      if (method === "POST" && observeMatch) {
        const rawCaseId = observeMatch[1];
        const parsedId = Bytes32HexSchema.safeParse(rawCaseId);
        if (!parsedId.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", "Invalid case ID format", requestId);
        }

        const caseId = parsedId.data;
        const found = await this.caseRepo.findById(caseId, this.config.network);
        if (!found) {
          return this.errorResponse(404, "NOT_FOUND", `Case ${caseId} not found`, requestId);
        }

        const parsedBody = SubmitObservationRequestSchema.safeParse(req.body);
        if (!parsedBody.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", parsedBody.error.message, requestId, parsedBody.error.issues);
        }

        const obs: ObservedSettlement = parsedBody.data.observation;
        const obsCommitment = computeObservationCommitment(obs);
        const anchorResult = await this.anchorService.anchorObservation({
          observer: obs.destination,
          caseId,
          observation: obs,
        });

        await this.obsRepo.insert({
          network: this.config.network,
          case_id: caseId,
          observer: obs.destination,
          tx_hash: obs.txHash,
          observed_ledger: obs.ledger,
          observation_commitment: obsCommitment,
          observation_tx_hash: anchorResult.txHash,
          asset: obs.asset,
          amount: obs.amount,
          destination: obs.destination,
          reference: obs.reference ?? null,
          status: obs.status,
          observed_at: obs.observedAt,
        });

        await this.caseRepo.updateStatus(caseId, this.config.network, "OBSERVED");
        await this.caseRepo.updateChainReferences(caseId, this.config.network, {
          observation_tx_hash: anchorResult.txHash,
        });

        return {
          statusCode: 200,
          headers: { "content-type": "application/json", "x-request-id": requestId },
          body: {
            caseId,
            status: "OBSERVED",
            txHash: anchorResult.txHash,
            observedAt: obs.observedAt,
          },
        };
      }

      // 6. POST /v1/cases/:caseId/reconcile
      const reconcileMatch = pathname.match(/^\/v1\/cases\/([a-zA-Z0-9_-]+)\/reconcile$/);
      if (method === "POST" && reconcileMatch) {
        const rawCaseId = reconcileMatch[1];
        const parsedId = Bytes32HexSchema.safeParse(rawCaseId);
        if (!parsedId.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", "Invalid case ID format", requestId);
        }

        const caseId = parsedId.data;
        const found = await this.caseRepo.findById(caseId, this.config.network);
        if (!found) {
          return this.errorResponse(404, "NOT_FOUND", `Case ${caseId} not found`, requestId);
        }

        const obs = await this.obsRepo.findByCaseId(caseId, this.config.network);
        const expected: ExpectedSettlement = {
          caseId: found.id,
          tradeReference: found.trade_reference,
          asset: found.asset,
          amount: found.amount,
          expectedDestination: found.expected_destination,
          reference: found.reference ?? undefined,
          deadline: Number(found.expires_at_ledger),
          owner: found.owner,
          counterparty: found.counterparty ?? undefined,
        };

        const observed: ObservedSettlement | undefined = obs
          ? {
              txHash: obs.tx_hash,
              ledger: Number(obs.observed_ledger),
              asset: obs.asset,
              amount: obs.amount,
              destination: obs.destination,
              reference: obs.reference ?? undefined,
              status: obs.status,
              observedAt: typeof obs.observed_at === "string" ? obs.observed_at : obs.observed_at.toISOString(),
            }
          : undefined;

        const result = reconcileSettlement(expected, observed);
        const anchorResult = await this.anchorService.anchorReconciliation({
          observer: expected.owner,
          caseId,
          status: result.status,
          breakCode: result.breaks[0]?.code,
        });

        // Persist reconciliation and breaks
        const recRecord = await this.recRepo.insert({
          network: this.config.network,
          case_id: caseId,
          status: result.status,
          matched: result.matched,
          reconciliation_tx_hash: anchorResult.txHash,
          reconciled_at: result.reconciledAt,
        });

        if (result.breaks.length > 0) {
          await this.breakRepo.insertMany(
            result.breaks.map((b) => ({
              network: this.config.network,
              case_id: caseId,
              reconciliation_id: recRecord.id,
              code: b.code,
              field: b.field,
              expected_value: b.expectedValue,
              observed_value: b.observedValue,
              message: b.message,
            }))
          );
        }

        await this.caseRepo.updateStatus(caseId, this.config.network, result.status);
        await this.caseRepo.updateChainReferences(caseId, this.config.network, {
          reconciliation_tx_hash: anchorResult.txHash,
        });

        return {
          statusCode: 200,
          headers: { "content-type": "application/json", "x-request-id": requestId },
          body: {
            ...result,
            txHash: anchorResult.txHash,
          },
        };
      }

      // 7. GET /v1/cases/:caseId/breaks
      const breaksMatch = pathname.match(/^\/v1\/cases\/([a-zA-Z0-9_-]+)\/breaks$/);
      if (method === "GET" && breaksMatch) {
        const rawCaseId = breaksMatch[1];
        const parsedId = Bytes32HexSchema.safeParse(rawCaseId);
        if (!parsedId.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", "Invalid case ID format", requestId);
        }

        const caseId = parsedId.data;
        const found = await this.caseRepo.findById(caseId, this.config.network);
        if (!found) {
          return this.errorResponse(404, "NOT_FOUND", `Case ${caseId} not found`, requestId);
        }

        const breaks = await this.breakRepo.findByCaseId(caseId, this.config.network);

        return {
          statusCode: 200,
          headers: { "content-type": "application/json", "x-request-id": requestId },
          body: {
            caseId,
            breaks: breaks.map((b) => ({
              code: b.code,
              field: b.field,
              expectedValue: b.expected_value ?? undefined,
              observedValue: b.observed_value ?? undefined,
              message: b.message,
            })),
          },
        };
      }

      // 8. GET /v1/cases/:caseId/proof
      const proofMatch = pathname.match(/^\/v1\/cases\/([a-zA-Z0-9_-]+)\/proof$/);
      if (method === "GET" && proofMatch) {
        const rawCaseId = proofMatch[1];
        const parsedId = Bytes32HexSchema.safeParse(rawCaseId);
        if (!parsedId.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", "Invalid case ID format", requestId);
        }

        const caseId = parsedId.data;
        const found = await this.caseRepo.findById(caseId, this.config.network);
        if (!found) {
          return this.errorResponse(404, "NOT_FOUND", `Case ${caseId} not found`, requestId);
        }

        const obs = await this.obsRepo.findByCaseId(caseId, this.config.network);
        if (!obs) {
          return this.errorResponse(400, "PROOF_NOT_AVAILABLE", `Observation not recorded yet for case ${caseId}`, requestId);
        }

        const rawAttestations = await this.attestationRepo.listByCaseId(caseId, this.config.network);
        const attestations: Attestation[] = rawAttestations.map((a) => ({
          caseId: a.case_id,
          role: a.role as "OWNER" | "COUNTERPARTY" | "OBSERVER",
          attestor: a.attestor,
          commitment: a.commitment,
          attestedAtLedger: Number(a.attested_at_ledger),
        }));

        const expected: ExpectedSettlement = {
          caseId: found.id,
          tradeReference: found.trade_reference,
          asset: found.asset,
          amount: found.amount,
          expectedDestination: found.expected_destination,
          reference: found.reference ?? undefined,
          deadline: Number(found.expires_at_ledger),
          owner: found.owner,
          counterparty: found.counterparty ?? undefined,
        };

        const observed: ObservedSettlement = {
          txHash: obs.tx_hash,
          ledger: Number(obs.observed_ledger),
          asset: obs.asset,
          amount: obs.amount,
          destination: obs.destination,
          reference: obs.reference ?? undefined,
          status: obs.status,
          observedAt: typeof obs.observed_at === "string" ? obs.observed_at : obs.observed_at.toISOString(),
        };

        const resultStatus: ReconciliationStatus = found.status === "BREAK" ? "BREAK" : "MATCHED";
        const finalizedLedger = Number(found.finalized_at_ledger ?? obs.observed_ledger ?? found.expires_at_ledger);

        const proof = createSettlementProof({
          caseId,
          terms: expected,
          observation: observed,
          finalizedLedger,
          result: resultStatus,
          attestations,
          contractId: this.config.contractId,
          network: this.config.network,
        });

        return {
          statusCode: 200,
          headers: { "content-type": "application/json", "x-request-id": requestId },
          body: proof,
        };
      }

      // 8a. POST /v1/cases/:caseId/attest
      const attestMatch = pathname.match(/^\/v1\/cases\/([a-zA-Z0-9_-]+)\/attest$/);
      if (method === "POST" && attestMatch) {
        const rawCaseId = attestMatch[1];
        const parsedId = Bytes32HexSchema.safeParse(rawCaseId);
        if (!parsedId.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", "Invalid case ID format", requestId);
        }
        const caseId = parsedId.data;
        const parsedBody = SubmitAttestationRequestSchema.safeParse(req.body);
        if (!parsedBody.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", parsedBody.error.message, requestId, parsedBody.error.issues);
        }

        try {
          const result = await this.attestationService.submitAttestation(caseId, parsedBody.data);
          return {
            statusCode: 201,
            headers: { "content-type": "application/json", "x-request-id": requestId },
            body: {
              ...result.attestation,
              txHash: result.txHash,
              recordedAt: new Date().toISOString(),
            },
          };
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message.includes("not found")) {
            return this.errorResponse(404, "NOT_FOUND", message, requestId);
          }
          if (message.includes("not the owner") || message.includes("not the counterparty")) {
            return this.errorResponse(403, "FORBIDDEN", message, requestId);
          }
          throw err;
        }
      }

      // 8b. GET /v1/cases/:caseId/attestations
      const attestListMatch = pathname.match(/^\/v1\/cases\/([a-zA-Z0-9_-]+)\/attestations$/);
      if (method === "GET" && attestListMatch) {
        const rawCaseId = attestListMatch[1];
        const parsedId = Bytes32HexSchema.safeParse(rawCaseId);
        if (!parsedId.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", "Invalid case ID format", requestId);
        }
        const caseId = parsedId.data;
        try {
          const attestations = await this.attestationService.getAttestations(caseId);
          return {
            statusCode: 200,
            headers: { "content-type": "application/json", "x-request-id": requestId },
            body: {
              caseId,
              attestations,
            },
          };
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message.includes("not found")) {
            return this.errorResponse(404, "NOT_FOUND", message, requestId);
          }
          throw err;
        }
      }

      // 8c. POST /v1/cases/:caseId/dispute
      const disputeMatch = pathname.match(/^\/v1\/cases\/([a-zA-Z0-9_-]+)\/dispute$/);
      if (method === "POST" && disputeMatch) {
        const rawCaseId = disputeMatch[1];
        const parsedId = Bytes32HexSchema.safeParse(rawCaseId);
        if (!parsedId.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", "Invalid case ID format", requestId);
        }
        const caseId = parsedId.data;
        const parsedBody = OpenDisputeRequestSchema.safeParse(req.body);
        if (!parsedBody.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", parsedBody.error.message, requestId, parsedBody.error.issues);
        }

        try {
          const result = await this.disputeService.openDispute(caseId, parsedBody.data);
          return {
            statusCode: 201,
            headers: { "content-type": "application/json", "x-request-id": requestId },
            body: result,
          };
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message.includes("not found")) {
            return this.errorResponse(404, "NOT_FOUND", message, requestId);
          }
          if (message.includes("Cannot open dispute") || message.includes("Expected status")) {
            return this.errorResponse(400, "INVALID_STATE", message, requestId);
          }
          throw err;
        }
      }

      // 8d. POST /v1/cases/:caseId/resolve
      const resolveMatch = pathname.match(/^\/v1\/cases\/([a-zA-Z0-9_-]+)\/resolve$/);
      if (method === "POST" && resolveMatch) {
        const rawCaseId = resolveMatch[1];
        const parsedId = Bytes32HexSchema.safeParse(rawCaseId);
        if (!parsedId.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", "Invalid case ID format", requestId);
        }
        const caseId = parsedId.data;
        const parsedBody = SubmitResolutionRequestSchema.safeParse(req.body);
        if (!parsedBody.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", parsedBody.error.message, requestId, parsedBody.error.issues);
        }

        try {
          const result = await this.disputeService.submitResolution(caseId, parsedBody.data);
          return {
            statusCode: 200,
            headers: { "content-type": "application/json", "x-request-id": requestId },
            body: result,
          };
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message.includes("not found")) {
            return this.errorResponse(404, "NOT_FOUND", message, requestId);
          }
          if (message.includes("Cannot submit resolution") || message.includes("Expected status")) {
            return this.errorResponse(400, "INVALID_STATE", message, requestId);
          }
          throw err;
        }
      }

      // 8e. GET /v1/cases/:caseId/dispute
      if (method === "GET" && disputeMatch) {
        const rawCaseId = disputeMatch[1];
        const parsedId = Bytes32HexSchema.safeParse(rawCaseId);
        if (!parsedId.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", "Invalid case ID format", requestId);
        }
        const caseId = parsedId.data;
        try {
          const result = await this.disputeService.getDispute(caseId);
          return {
            statusCode: 200,
            headers: { "content-type": "application/json", "x-request-id": requestId },
            body: result,
          };
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message.includes("not found")) {
            return this.errorResponse(404, "NOT_FOUND", message, requestId);
          }
          throw err;
        }
      }

      // 8f. POST /v1/cases/:caseId/finalize
      const finalizeMatch = pathname.match(/^\/v1\/cases\/([a-zA-Z0-9_-]+)\/finalize$/);
      if (method === "POST" && finalizeMatch) {
        const rawCaseId = finalizeMatch[1];
        const parsedId = Bytes32HexSchema.safeParse(rawCaseId);
        if (!parsedId.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", "Invalid case ID format", requestId);
        }
        const caseId = parsedId.data;
        try {
          const result = await this.finalizationService.finalizeCase(caseId);
          return {
            statusCode: 200,
            headers: { "content-type": "application/json", "x-request-id": requestId },
            body: result,
          };
        } catch (err: unknown) {
          const message = (err as Error).message;
          if (message.includes("not found")) {
            return this.errorResponse(404, "NOT_FOUND", message, requestId);
          }
          if (message.includes("Cannot finalize case") || message.includes("Expected status")) {
            return this.errorResponse(400, "INVALID_STATE", message, requestId);
          }
          throw err;
        }
      }

      // 9. POST /v1/proofs/verify
      if (method === "POST" && pathname === "/v1/proofs/verify") {
        const parsed = VerifyProofRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", parsed.error.message, requestId, parsed.error.issues);
        }

        const { proof, termsDocument, observedDocument } = parsed.data;
        const verification = verifySettlementProof(proof, {
          terms: termsDocument,
          observation: observedDocument,
          expectedContractId: this.config.contractId,
          expectedNetwork: this.config.network,
        });

        return {
          statusCode: 200,
          headers: { "content-type": "application/json", "x-request-id": requestId },
          body: {
            valid: verification.valid,
            reason: verification.reason,
            recomputedTermsCommitment: verification.recomputedTermsCommitment,
            recomputedObservationCommitment: verification.recomputedObservationCommitment,
            verifiedAt: new Date().toISOString(),
          },
        };
      }

      // 10. POST /v1/proofs/verify/onchain
      if (method === "POST" && pathname === "/v1/proofs/verify/onchain") {
        const parsed = VerifyProofRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return this.errorResponse(400, "VALIDATION_ERROR", parsed.error.message, requestId, parsed.error.issues);
        }

        const { proof, termsDocument, observedDocument } = parsed.data;
        const result = await this.chainVerifier.verifyOnChainProof({
          proof,
          termsDocument,
          observedDocument,
          expectedContractId: this.config.contractId,
          expectedNetwork: this.config.network,
        });

        return {
          statusCode: 200,
          headers: { "content-type": "application/json", "x-request-id": requestId },
          body: result,
        };
      }

      // 404 Route Not Found
      return this.errorResponse(404, "ROUTE_NOT_FOUND", `Cannot ${method} ${pathname}`, requestId);
    } catch (err: unknown) {
      return this.errorResponse(500, "INTERNAL_SERVER_ERROR", (err as Error).message || "Internal server error", requestId);
    }
  }

  /**
   * Fast in-process test injection method (equivalent to fastify.inject).
   */
  public async inject(options: InjectOptions): Promise<HttpResponse> {
    const req: HttpRequest = {
      method: options.method,
      url: options.url,
      headers: options.headers ?? {},
      body: options.body,
      requestId: options.headers?.["x-request-id"] || generateUuid(),
    };
    return this.handleRequest(req);
  }

  private errorResponse(
    statusCode: number,
    code: string,
    message: string,
    requestId: string,
    details?: unknown
  ): HttpResponse {
    return {
      statusCode,
      headers: { "content-type": "application/json", "x-request-id": requestId },
      body: {
        error: {
          code,
          message,
          requestId,
          details,
        },
      },
    };
  }
}

export function createApiServer(
  config: ApiConfigInput | ApiConfig,
  dbClient: IDatabaseClient,
  anchorService?: OnChainAnchorService,
  chainVerifier?: SorobanChainVerifier
): ApiServer {
  return new ApiServer(config, dbClient, anchorService, chainVerifier);
}
