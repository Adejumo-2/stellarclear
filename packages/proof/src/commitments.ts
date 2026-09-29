import { Buffer } from "buffer";
import {
  ExpectedSettlementSchema,
  ObservedSettlementSchema,
  type ExpectedSettlement,
  type ObservedSettlement,
} from "@stellarclear/schemas";
import {
  TERMS_DOMAIN_PREFIX,
  OBSERVATION_DOMAIN_PREFIX,
  RESOLUTION_DOMAIN_PREFIX,
  formatDomainDocument,
} from "./canonical.js";
import { sha256Hex } from "./hash.js";

/**
 * Computes the canonical SHA-256 terms commitment for an ExpectedSettlement.
 */
export function computeTermsCommitment(terms: ExpectedSettlement): string {
  const validated = ExpectedSettlementSchema.parse(terms);
  const formatted = formatDomainDocument(TERMS_DOMAIN_PREFIX, {
    caseId: validated.caseId,
    tradeReference: validated.tradeReference,
    asset: validated.asset,
    amount: validated.amount,
    expectedDestination: validated.expectedDestination,
    reference: validated.reference ?? null,
    deadline: validated.deadline,
    owner: validated.owner,
    counterparty: validated.counterparty ?? null,
  });
  return sha256Hex(formatted);
}

/**
 * Computes the canonical SHA-256 observation commitment for an ObservedSettlement.
 */
export function computeObservationCommitment(obs: ObservedSettlement): string {
  const validated = ObservedSettlementSchema.parse(obs);
  const formatted = formatDomainDocument(OBSERVATION_DOMAIN_PREFIX, {
    txHash: validated.txHash,
    ledger: validated.ledger,
    asset: validated.asset,
    amount: validated.amount,
    destination: validated.destination,
    reference: validated.reference ?? null,
    status: validated.status,
    observedAt: validated.observedAt,
  });
  return sha256Hex(formatted);
}

/**
 * Computes the canonical SHA-256 resolution commitment for a dispute resolution agreement.
 */
export function computeResolutionCommitment(payload: unknown): string {
  const formatted = formatDomainDocument(RESOLUTION_DOMAIN_PREFIX, payload);
  return sha256Hex(formatted);
}

/**
 * Computes a deterministic 32-byte caseId from origin details.
 */
export function computeDeterministicCaseId(
  owner: string,
  tradeReference: string,
  asset: string,
  deadline: number
): string {
  const raw = `STELLARCLEAR/CASE_ID/V1\n${owner}\n${tradeReference}\n${asset}\n${deadline}`;
  return sha256Hex(raw);
}

/**
 * Helper to get 32-byte Buffer commitments directly for Soroban bindings.
 */
export function computeTermsCommitmentBuffer(terms: ExpectedSettlement): Buffer {
  return Buffer.from(computeTermsCommitment(terms), "hex");
}

export function computeObservationCommitmentBuffer(obs: ObservedSettlement): Buffer {
  return Buffer.from(computeObservationCommitment(obs), "hex");
}
