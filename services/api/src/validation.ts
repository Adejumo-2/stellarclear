import { z } from "zod";
import { Bytes32HexSchema, StellarAddressSchema } from "@stellarclear/schemas";
import { sha256Hex, canonicalStringify } from "@stellarclear/proof";

export const MAX_BODY_SIZE_BYTES = 1024 * 1024; // 1 MB limit

export const IdempotencyKeySchema = z
  .string()
  .min(1, "Idempotency-Key cannot be empty")
  .max(256, "Idempotency-Key must not exceed 256 characters")
  .regex(/^[a-zA-Z0-9_\-.:]+$/, "Idempotency-Key contains invalid characters");

/**
 * Validates whether a request body string/object exceeds the maximum permitted payload size.
 */
export function validatePayloadSize(body: unknown): boolean {
  if (!body) return true;
  const serialized = typeof body === "string" ? body : JSON.stringify(body);
  return new TextEncoder().encode(serialized).length <= MAX_BODY_SIZE_BYTES;
}

/**
 * Computes a deterministic SHA-256 fingerprint of a request payload for idempotency verification.
 */
export function computePayloadHash(payload: unknown): string {
  if (payload === undefined || payload === null) {
    return "empty";
  }
  const serialized = typeof payload === "string" ? payload : canonicalStringify(payload);
  return sha256Hex(serialized);
}

/**
 * Validates and normalizes 32-byte hex Case IDs.
 */
export function sanitizeCaseId(caseId: unknown): string {
  return Bytes32HexSchema.parse(caseId);
}

/**
 * Validates Stellar public keys (StrKey G... or C...).
 */
export function sanitizeStellarAddress(address: unknown): string {
  return StellarAddressSchema.parse(address);
}

