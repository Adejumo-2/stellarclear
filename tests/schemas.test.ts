import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Bytes32HexSchema,
  StellarAddressSchema,
  DecimalAmountSchema,
  LedgerSequenceSchema,
  CaseStatusSchema,
  BreakCodeSchema,
  AttestationRoleSchema,
  ExpectedSettlementSchema,
  ObservedSettlementSchema,
  ReconciliationRequestSchema,
  ReconciliationResultSchema,
  BreakSchema,
  AttestationSchema,
  SettlementProofSchema,
  CreateCaseRequestSchema,
  VerifyProofRequestSchema,
} from "@stellarclear/schemas";

const VALID_CASE_ID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const VALID_TX_HASH = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const VALID_OWNER = "GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6ZN7JMTXNZBEWBIXXX";
const VALID_CP = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const VALID_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

describe("Protocol Schemas - Primitives & Enums", () => {
  it("validates 32-byte hex hashes and normalizes to lowercase", () => {
    const uppercaseHash = "A".repeat(64);
    const parsed = Bytes32HexSchema.safeParse(uppercaseHash);
    assert.ok(parsed.success);
    assert.strictEqual(parsed.data, "a".repeat(64));

    // Invalid length
    assert.strictEqual(Bytes32HexSchema.safeParse("1234").success, false);
    // Non-hex chars
    assert.strictEqual(Bytes32HexSchema.safeParse("g".repeat(64)).success, false);
  });

  it("validates Stellar StrKey addresses", () => {
    assert.ok(StellarAddressSchema.safeParse(VALID_OWNER).success);
    assert.ok(StellarAddressSchema.safeParse(VALID_CONTRACT_ID).success);

    // Invalid prefixes or lengths
    assert.strictEqual(StellarAddressSchema.safeParse("MA2C5RFPE6GC").success, false);
    assert.strictEqual(StellarAddressSchema.safeParse("GA2C5").success, false);
    assert.strictEqual(StellarAddressSchema.safeParse(12345).success, false);
  });

  it("validates exact decimal amounts and rejects floating-point formats", () => {
    assert.ok(DecimalAmountSchema.safeParse("100").success);
    assert.ok(DecimalAmountSchema.safeParse("100.5000000").success);
    assert.ok(DecimalAmountSchema.safeParse("0.0000001").success);
    assert.ok(DecimalAmountSchema.safeParse("0").success);

    // Rejects negative amounts
    assert.strictEqual(DecimalAmountSchema.safeParse("-100").success, false);
    // Rejects exponential notation
    assert.strictEqual(DecimalAmountSchema.safeParse("1e-5").success, false);
    // Rejects numbers (must be exact string)
    assert.strictEqual(DecimalAmountSchema.safeParse(100.5).success, false);
    // Rejects empty string
    assert.strictEqual(DecimalAmountSchema.safeParse("").success, false);
  });

  it("validates ledger sequences", () => {
    assert.ok(LedgerSequenceSchema.safeParse(1000).success);
    assert.strictEqual(LedgerSequenceSchema.safeParse(0).success, false);
    assert.strictEqual(LedgerSequenceSchema.safeParse(-1).success, false);
    assert.strictEqual(LedgerSequenceSchema.safeParse(100.5).success, false);
    assert.strictEqual(LedgerSequenceSchema.safeParse(5000000000).success, false);
  });

  it("validates protocol enums", () => {
    assert.ok(CaseStatusSchema.safeParse("OPEN").success);
    assert.ok(CaseStatusSchema.safeParse("FINALIZED").success);
    assert.strictEqual(CaseStatusSchema.safeParse("UNKNOWN_STATUS").success, false);

    assert.ok(BreakCodeSchema.safeParse("AMOUNT_MISMATCH").success);
    assert.ok(BreakCodeSchema.safeParse("UNEXPECTED_TRANSACTION").success);
    assert.strictEqual(BreakCodeSchema.safeParse("SOMETHING_WENT_WRONG").success, false);

    assert.ok(AttestationRoleSchema.safeParse("OWNER").success);
    assert.ok(AttestationRoleSchema.safeParse("OBSERVER").success);
    assert.strictEqual(AttestationRoleSchema.safeParse("ADMIN").success, false);
  });
});

describe("Protocol Schemas - Domain Objects", () => {
  it("validates ExpectedSettlement with valid and optional fields", () => {
    const valid = {
      caseId: VALID_CASE_ID,
      tradeReference: "TR-2026-001",
      asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      amount: "50000.0000000",
      expectedDestination: VALID_CP,
      reference: "INV-9988",
      deadline: 1234567,
      owner: VALID_OWNER,
      counterparty: VALID_CP,
    };

    const parsed = ExpectedSettlementSchema.safeParse(valid);
    assert.ok(parsed.success);

    // Rejects invalid amount format
    const invalidAmount = { ...valid, amount: 50000 };
    assert.strictEqual(ExpectedSettlementSchema.safeParse(invalidAmount).success, false);

    // Rejects missing required owner
    const missingOwner = { ...valid, owner: undefined };
    assert.strictEqual(ExpectedSettlementSchema.safeParse(missingOwner).success, false);
  });

  it("validates ObservedSettlement", () => {
    const valid = {
      txHash: VALID_TX_HASH,
      ledger: 1234500,
      asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      amount: "50000.0000000",
      destination: VALID_CP,
      reference: "INV-9988",
      status: "SUCCESS" as const,
      observedAt: "2026-09-29T12:00:00.000Z",
    };

    const parsed = ObservedSettlementSchema.safeParse(valid);
    assert.ok(parsed.success);

    // Invalid txHash
    const invalidTx = { ...valid, txHash: "short_hash" };
    assert.strictEqual(ObservedSettlementSchema.safeParse(invalidTx).success, false);
  });

  it("validates ReconciliationResult and Break objects", () => {
    const validBreak = {
      code: "AMOUNT_MISMATCH" as const,
      field: "amount",
      expectedValue: "50000.0000000",
      observedValue: "49999.0000000",
      message: "Settlement amount does not match expected terms",
    };
    assert.ok(BreakSchema.safeParse(validBreak).success);

    const validResult = {
      caseId: VALID_CASE_ID,
      status: "BREAK" as const,
      matched: false,
      breaks: [validBreak],
      reconciledAt: "2026-09-29T12:01:00.000Z",
    };
    assert.ok(ReconciliationResultSchema.safeParse(validResult).success);
  });

  it("validates Attestation", () => {
    const validAttestation = {
      caseId: VALID_CASE_ID,
      role: "OWNER" as const,
      attestor: VALID_OWNER,
      commitment: VALID_TX_HASH,
      attestedAtLedger: 1234510,
    };
    assert.ok(AttestationSchema.safeParse(validAttestation).success);

    const invalidRole = { ...validAttestation, role: "INVALID" };
    assert.strictEqual(AttestationSchema.safeParse(invalidRole).success, false);
  });

  it("validates SettlementProof", () => {
    const validProof = {
      protocol: "STELLARCLEAR" as const,
      version: "1.0.0",
      caseId: VALID_CASE_ID,
      termsCommitment: VALID_CASE_ID,
      observationCommitment: VALID_TX_HASH,
      txHash: VALID_TX_HASH,
      finalizedLedger: 1234550,
      result: "MATCHED" as const,
      attestations: [
        {
          caseId: VALID_CASE_ID,
          role: "OWNER" as const,
          attestor: VALID_OWNER,
          commitment: VALID_CASE_ID,
          attestedAtLedger: 1234510,
        },
      ],
      contractId: VALID_CONTRACT_ID,
      network: "testnet",
    };

    assert.ok(SettlementProofSchema.safeParse(validProof).success);

    // Wrong protocol literal
    const wrongProtocol = { ...validProof, protocol: "OTHER" };
    assert.strictEqual(SettlementProofSchema.safeParse(wrongProtocol).success, false);
  });
});
