import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalStringify,
  computeTermsCommitment,
  computeObservationCommitment,
  computeResolutionCommitment,
  computeDeterministicCaseId,
  createSettlementProof,
  verifySettlementProof,
  sha256Hex,
} from "@stellarclear/proof";
import type { ExpectedSettlement, ObservedSettlement } from "@stellarclear/schemas";

const SAMPLE_TERMS_A: ExpectedSettlement = {
  caseId: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  tradeReference: "TRADE-1001",
  asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  amount: "1000.5000000",
  expectedDestination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  reference: "INV-001",
  deadline: 500000,
  owner: "GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6ZN7JMTXNZBEWBIXXX",
  counterparty: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
};

const SAMPLE_TERMS_PERMUTED_KEYS: ExpectedSettlement = {
  owner: "GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6ZN7JMTXNZBEWBIXXX",
  deadline: 500000,
  amount: "1000.5000000",
  caseId: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  counterparty: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  expectedDestination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  tradeReference: "TRADE-1001",
  reference: "INV-001",
};

const SAMPLE_OBSERVATION: ObservedSettlement = {
  txHash: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
  ledger: 499990,
  asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  amount: "1000.5000000",
  destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  reference: "INV-001",
  status: "SUCCESS",
  observedAt: "2026-09-29T12:00:00.000Z",
};

describe("Proof Package - Canonicalization & Commitments", () => {
  it("produces deterministic canonical serialization invariant to object key order", () => {
    const serializedA = canonicalStringify(SAMPLE_TERMS_A);
    const serializedB = canonicalStringify(SAMPLE_TERMS_PERMUTED_KEYS);
    assert.strictEqual(serializedA, serializedB);
  });

  it("same input yields exactly same terms commitment hash", () => {
    const hash1 = computeTermsCommitment(SAMPLE_TERMS_A);
    const hash2 = computeTermsCommitment(SAMPLE_TERMS_PERMUTED_KEYS);
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
  });

  it("changed field in terms produces different hash", () => {
    const modifiedTerms: ExpectedSettlement = {
      ...SAMPLE_TERMS_A,
      amount: "1000.5000001",
    };
    const hashOriginal = computeTermsCommitment(SAMPLE_TERMS_A);
    const hashModified = computeTermsCommitment(modifiedTerms);
    assert.notStrictEqual(hashOriginal, hashModified);
  });

  it("computes observation and resolution commitments", () => {
    const obsHash = computeObservationCommitment(SAMPLE_OBSERVATION);
    assert.strictEqual(obsHash.length, 64);

    const resHash = computeResolutionCommitment({
      caseId: SAMPLE_TERMS_A.caseId,
      agreedAmount: "1000.5000000",
      resolutionTerms: "Settled in full",
    });
    assert.strictEqual(resHash.length, 64);
  });

  it("computes deterministic caseId from parameters", () => {
    const id1 = computeDeterministicCaseId(
      SAMPLE_TERMS_A.owner,
      SAMPLE_TERMS_A.tradeReference,
      SAMPLE_TERMS_A.asset,
      SAMPLE_TERMS_A.deadline
    );
    const id2 = computeDeterministicCaseId(
      SAMPLE_TERMS_A.owner,
      SAMPLE_TERMS_A.tradeReference,
      SAMPLE_TERMS_A.asset,
      SAMPLE_TERMS_A.deadline
    );
    assert.strictEqual(id1, id2);
    assert.strictEqual(id1.length, 64);
  });
});

describe("Proof Package - Proof Creation & Verification", () => {
  const contractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
  const network = "testnet";

  it("creates and independently verifies a valid settlement proof", () => {
    const proof = createSettlementProof({
      caseId: SAMPLE_TERMS_A.caseId,
      terms: SAMPLE_TERMS_A,
      observation: SAMPLE_OBSERVATION,
      finalizedLedger: 500010,
      result: "MATCHED",
      attestations: [
        {
          caseId: SAMPLE_TERMS_A.caseId,
          role: "OWNER",
          attestor: SAMPLE_TERMS_A.owner,
          commitment: computeTermsCommitment(SAMPLE_TERMS_A),
          attestedAtLedger: 500005,
        },
      ],
      contractId,
      network,
    });

    const verification = verifySettlementProof(proof, {
      terms: SAMPLE_TERMS_A,
      observation: SAMPLE_OBSERVATION,
      expectedContractId: contractId,
      expectedNetwork: network,
    });

    assert.strictEqual(verification.valid, true);
    assert.strictEqual(verification.reason, undefined);
  });

  it("rejects tampered proof with mismatched terms commitment", () => {
    const proof = createSettlementProof({
      caseId: SAMPLE_TERMS_A.caseId,
      terms: SAMPLE_TERMS_A,
      observation: SAMPLE_OBSERVATION,
      finalizedLedger: 500010,
      result: "MATCHED",
      attestations: [],
      contractId,
      network,
    });

    const tamperedProof = {
      ...proof,
      termsCommitment: "0000000000000000000000000000000000000000000000000000000000000000",
    };

    const verification = verifySettlementProof(tamperedProof, {
      terms: SAMPLE_TERMS_A,
      observation: SAMPLE_OBSERVATION,
    });

    assert.strictEqual(verification.valid, false);
    assert.ok(verification.reason?.includes("Terms commitment mismatch"));
  });

  it("rejects proof with mismatched observation document", () => {
    const proof = createSettlementProof({
      caseId: SAMPLE_TERMS_A.caseId,
      terms: SAMPLE_TERMS_A,
      observation: SAMPLE_OBSERVATION,
      finalizedLedger: 500010,
      result: "MATCHED",
      attestations: [],
      contractId,
      network,
    });

    const wrongObservation: ObservedSettlement = {
      ...SAMPLE_OBSERVATION,
      amount: "999.0000000",
    };

    const verification = verifySettlementProof(proof, {
      terms: SAMPLE_TERMS_A,
      observation: wrongObservation,
    });

    assert.strictEqual(verification.valid, false);
    assert.ok(verification.reason?.includes("Observation commitment mismatch"));
  });

  it("rejects proof with wrong contract or network", () => {
    const proof = createSettlementProof({
      caseId: SAMPLE_TERMS_A.caseId,
      terms: SAMPLE_TERMS_A,
      observation: SAMPLE_OBSERVATION,
      finalizedLedger: 500010,
      result: "MATCHED",
      attestations: [],
      contractId,
      network,
    });

    const wrongContractVerification = verifySettlementProof(proof, {
      expectedContractId: "CBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    });
    assert.strictEqual(wrongContractVerification.valid, false);

    const wrongNetworkVerification = verifySettlementProof(proof, {
      expectedNetwork: "mainnet",
    });
    assert.strictEqual(wrongNetworkVerification.valid, false);
  });
});
