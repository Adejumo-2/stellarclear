import { z } from "zod";

/**
 * Validates a 32-byte hexadecimal hash / identifier (64 hex characters).
 * Normalizes to lowercase.
 */
export const Bytes32HexSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "Must be a 32-byte hex string (64 hexadecimal characters)")
  .transform((val) => val.toLowerCase());

export type Bytes32Hex = z.infer<typeof Bytes32HexSchema>;

/**
 * Validates a Stellar StrKey address (Account G... or Contract C...).
 */
export const StellarAddressSchema = z
  .string()
  .regex(/^[GC][A-Z0-9]{55}$/, "Must be a valid 56-character Stellar StrKey address (G... or C...)");

export type StellarAddress = z.infer<typeof StellarAddressSchema>;

/**
 * Validates exact decimal amounts represented as non-negative strings.
 * Disallows JavaScript floating-point numbers, negative values, and exponent notations.
 */
export const DecimalAmountSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)(\.\d+)?$/,
    "Amount must be a non-negative decimal string (e.g. '100', '100.5000000', or '0.0000001')"
  )
  .refine((val) => {
    // Avoid double dot or invalid parsing
    const parts = val.split(".");
    return parts.length <= 2;
  }, "Invalid decimal format");

export type DecimalAmount = z.infer<typeof DecimalAmountSchema>;

/**
 * Validates a Stellar ledger sequence number (u32 integer).
 */
export const LedgerSequenceSchema = z
  .number()
  .int("Ledger sequence must be an integer")
  .min(1, "Ledger sequence must be greater than 0")
  .max(4294967295, "Ledger sequence must fit in u32");

export type LedgerSequence = z.infer<typeof LedgerSequenceSchema>;
