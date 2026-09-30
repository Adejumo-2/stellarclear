import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeTermsCommitment,
  computeObservationCommitment,
  createSettlementProof,
  verifySettlementProof,
} from "@stellarclear/proof";
import type { ExpectedSettlement, ObservedSettlement, Attestation } from "@stellarclear/schemas";

const VALID_CASE_ID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const NETWORK = "testnet";
const VALID_OWNER = "GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6ZN7JMTXNZBEWBIXXX";
const VALID_DESTINATION = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

function getExpected(): ExpectedSettlement {
  return {
    caseId: VALID_CASE_ID,
    tradeReference: "TR-PROOF-SEC-01",
    asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    amount: "5000.0000000",
    expectedDestination: VALID_DESTINATION,
    reference: "INV-PROOF-SEC-01",
    deadline: 600000,
    owner: VALID_OWNER,
    counterparty: VALID_DESTINATION,
  };
}

function getObserved(): ObservedSettlement {
  return {
    txHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ledger: 500100,
    asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    amount: "5000.0000000",
    destination: VALID_DESTINATION,
    reference: "INV-PROOF-SEC-01",
    status: "SUCCESS",
    observedAt: "2026-09-30T00:00:00.000Z",
  };
}

describe("Security Regression - Settlement Proof Verification Security", () => {
  it("rejects proof when termsDocument has been tampered with after proof creation", () => {
    const expected = getExpected();
    const observed = getObserved();

    const proof = createSettlementProof({
      caseId: VALID_CASE_ID,
      terms: expected,
      observation: observed,
      finalizedLedger: 500110,
      result: "MATCHED",
      attestations: [],
      contractId: CONTRACT_ID,
      network: NETWORK,
    });

    // Tampered terms with modified amount
    const tamperedExpected = {
      ...expected,
      amount: "99999.0000000",
    };

    const verification = verifySettlementProof(proof, {
      terms: tamperedExpected,
      observation: observed,
      expectedContractId: CONTRACT_ID,
      expectedNetwork: NETWORK,
    });

    assert.strictEqual(verification.valid, false);
    assert.ok(verification.reason?.includes("Terms commitment mismatch"));
  });

  it("rejects proof when observationDocument has been tampered with", () => {
    const expected = getExpected();
    const observed = getObserved();

    const proof = createSettlementProof({
      caseId: VALID_CASE_ID,
      terms: expected,
      observation: observed,
      finalizedLedger: 500110,
      result: "MATCHED",
      attestations: [],
      contractId: CONTRACT_ID,
      network: NETWORK,
    });

    // Tampered observation destination
    const tamperedObserved = {
      ...observed,
      destination: VALID_OWNER,
    };

    const verification = verifySettlementProof(proof, {
      terms: expected,
      observation: tamperedObserved,
      expectedContractId: CONTRACT_ID,
      expectedNetwork: NETWORK,
    });

    assert.strictEqual(verification.valid, false);
    assert.ok(verification.reason?.includes("Observation commitment mismatch"));
  });

  it("rejects proof with mismatched contract ID or network binding", () => {
    const expected = getExpected();
    const observed = getObserved();

    const proof = createSettlementProof({
      caseId: VALID_CASE_ID,
      terms: expected,
      observation: observed,
      finalizedLedger: 500110,
      result: "MATCHED",
      attestations: [],
      contractId: CONTRACT_ID,
      network: "mainnet", // Proof was created for mainnet
    });

    // Verification targeting testnet must reject the mainnet proof
    const verification = verifySettlementProof(proof, {
      terms: expected,
      observation: observed,
      expectedContractId: CONTRACT_ID,
      expectedNetwork: "testnet",
    });

    assert.strictEqual(verification.valid, false);
    assert.ok(verification.reason?.includes("Network mismatch"));
  });

  it("attaches valid multi-party attestations to proof payload and preserves integrity", () => {
    const expected = getExpected();
    const observed = getObserved();

    const attestation: Attestation = {
      caseId: VALID_CASE_ID,
      attestor: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFXYORMA3Y4H3EL2PUGQY",
      role: "OWNER",
      commitment: "0000000000000000000000000000000000000000000000000000000000000000",
      attestedAtLedger: 500105,
    };

    const proof = createSettlementProof({
      caseId: VALID_CASE_ID,
      terms: expected,
      observation: observed,
      finalizedLedger: 500110,
      result: "MATCHED",
      attestations: [attestation],
      contractId: CONTRACT_ID,
      network: NETWORK,
    });

    assert.strictEqual(proof.attestations.length, 1);
    assert.strictEqual(proof.attestations[0]?.role, "OWNER");
    assert.strictEqual(proof.attestations[0]?.attestor, "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFXYORMA3Y4H3EL2PUGQY");
  });
});

