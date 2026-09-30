import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setupLiveSettlementEnvironment, TEST_LIVE_CONTRACT_ID, TEST_LIVE_NETWORK } from "./helpers/soroban.js";
import {
  computeTermsCommitment,
  computeObservationCommitment,
  createSettlementProof,
  verifySettlementProof,
} from "@stellarclear/proof";
import {
  SETTLEMENT_REGISTRY_RELEASE,
  verifyContractReleaseCompatibility,
} from "@stellarclear/sdk";
import { decodeContractEvent } from "@stellarclear/indexer";
import type {
  ExpectedSettlement,
  ObservedSettlement,
  SettlementProof,
} from "@stellarclear/schemas";

const VALID_OWNER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFXYORMA3Y4H3EL2PUGQY";
const VALID_CP = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const VALID_ASSET = "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

describe("Integration - Release Upgrade Compatibility & Schema Evolution", () => {
  it("maintains deterministic commitment computation across version structures", () => {
    const baseTerms: ExpectedSettlement = {
      caseId: "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
      owner: VALID_OWNER,
      counterparty: VALID_CP,
      tradeReference: "TRADE-COMPAT-001",
      asset: VALID_ASSET,
      amount: "1000.0000000",
      expectedDestination: VALID_OWNER,
      reference: "INV-COMPAT-001",
      deadline: 1900000,
    };

    const commitment1 = computeTermsCommitment(baseTerms);
    assert.strictEqual(typeof commitment1, "string");
    assert.strictEqual(commitment1.length, 64);

    // Canonical representation must be invariant to JSON key order
    const reorderedTerms = {
      deadline: 1900000,
      amount: "1000.0000000",
      reference: "INV-COMPAT-001",
      tradeReference: "TRADE-COMPAT-001",
      caseId: "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
      expectedDestination: VALID_OWNER,
      counterparty: VALID_CP,
      owner: VALID_OWNER,
      asset: VALID_ASSET,
    } as ExpectedSettlement;

    const commitment2 = computeTermsCommitment(reorderedTerms);
    assert.strictEqual(commitment1, commitment2);
  });

  it("verifies contract release version compatibility validation rules", () => {
    // Current pinned release
    const testnetCheck = verifyContractReleaseCompatibility("testnet", SETTLEMENT_REGISTRY_RELEASE.deployedNetworks.testnet.contractId);
    assert.strictEqual(testnetCheck.compatible, true);

    // Any valid C-address on standard testnet/mainnet is accepted for deployment migration
    const upgradedContractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KN";
    const customCheck = verifyContractReleaseCompatibility("testnet", upgradedContractId);
    assert.strictEqual(customCheck.compatible, true);

    // Invalid contract address format should fail compatibility check
    const invalidCheck = verifyContractReleaseCompatibility("testnet", "INVALID_CONTRACT_ADDRESS");
    assert.strictEqual(invalidCheck.compatible, false);
    assert.ok(invalidCheck.reason?.includes("not a valid StrKey"));

    // Unsupported network name should fail
    const invalidNet = verifyContractReleaseCompatibility("unsupported_network");
    assert.strictEqual(invalidNet.compatible, false);
    assert.ok(invalidNet.reason?.includes("not a recognized deployment network"));
  });

  it("indexer gracefully decodes events across forward and legacy schema formats", () => {
    // Standard CaseCreated event
    const caseIdHex = "b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1";
    const termsCommitment = "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1";

    const event = {
      type: "contract",
      id: "evt-001",
      contractId: TEST_LIVE_CONTRACT_ID,
      ledger: 1500100,
      ledgerClosedAt: new Date().toISOString(),
      topic: ["CaseCreated", caseIdHex],
      value: {
        case_id: caseIdHex,
        owner: VALID_OWNER,
        counterparty: VALID_CP,
        terms_commitment: termsCommitment,
        expires_at_ledger: 1600000,
      },
      txHash: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    };

    const decoded = decodeContractEvent(event);
    if (!decoded) {
      throw new Error("Event should have been successfully decoded");
    }
    assert.strictEqual(decoded.type, "CaseCreated");
    assert.strictEqual(decoded.caseId, caseIdHex);

    // Event with unknown future topic/payload should return null gracefully rather than throwing
    const futureEvent = {
      type: "contract",
      id: "evt-future-002",
      contractId: TEST_LIVE_CONTRACT_ID,
      ledger: 1500200,
      ledgerClosedAt: new Date().toISOString(),
      topic: ["future_v2_feature_event", caseIdHex],
      value: { future_field: "value_v2" },
      txHash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    };

    const decodedFuture = decodeContractEvent(futureEvent);
    assert.strictEqual(decodedFuture, null);
  });

  it("verifies SettlementProof backward compatibility and cryptographic integrity", () => {
    const caseId = "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1";
    const terms: ExpectedSettlement = {
      caseId,
      owner: VALID_OWNER,
      counterparty: VALID_CP,
      tradeReference: "TRADE-PROOF-LEGACY-001",
      asset: VALID_ASSET,
      amount: "150000.0000000",
      expectedDestination: VALID_OWNER,
      reference: "INV-PROOF-001",
      deadline: 1800000,
    };

    const observation: ObservedSettlement = {
      txHash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      ledger: 1650000,
      asset: terms.asset,
      amount: terms.amount,
      destination: terms.expectedDestination,
      reference: terms.reference,
      status: "SUCCESS",
      observedAt: new Date().toISOString(),
    };

    const termsCommitment = computeTermsCommitment(terms);
    const legacyProof = createSettlementProof({
      caseId,
      terms,
      observation,
      finalizedLedger: observation.ledger,
      result: "MATCHED",
      attestations: [
        {
          caseId,
          role: "OWNER",
          attestor: VALID_OWNER,
          commitment: termsCommitment,
          attestedAtLedger: 1650100,
        },
      ],
      contractId: TEST_LIVE_CONTRACT_ID,
      network: TEST_LIVE_NETWORK,
      version: "0.1.0",
    });

    const verificationResult = verifySettlementProof(legacyProof, {
      terms,
      observation,
      expectedContractId: TEST_LIVE_CONTRACT_ID,
      expectedNetwork: TEST_LIVE_NETWORK,
    });
    assert.strictEqual(verificationResult.valid, true);

    // Tampering test: mismatched expected contract ID fails verification
    const tamperedResult = verifySettlementProof(legacyProof, {
      expectedContractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    });
    assert.strictEqual(tamperedResult.valid, false);
    assert.ok(tamperedResult.reason?.includes("Contract ID mismatch"));
  });

  it("ensures API handles backward-compatible optional payload fields smoothly", async () => {
    const { server } = setupLiveSettlementEnvironment();

    const caseId = "d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2";
    // Expected settlement with minimal required fields
    const minimalTerms: ExpectedSettlement = {
      caseId,
      owner: VALID_OWNER,
      counterparty: VALID_CP,
      tradeReference: "TRADE-OPT-001",
      asset: VALID_ASSET,
      amount: "75000.0000000",
      expectedDestination: VALID_OWNER,
      reference: "INV-OPT-001",
      deadline: 1800000,
    };

    const createRes = await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: minimalTerms },
    });
    assert.strictEqual(createRes.statusCode, 201);

    const obs: ObservedSettlement = {
      txHash: "1111111111111111111111111111111111111111111111111111111111111111",
      ledger: 1660000,
      asset: minimalTerms.asset,
      amount: minimalTerms.amount,
      destination: minimalTerms.expectedDestination,
      reference: minimalTerms.reference,
      status: "SUCCESS",
      observedAt: new Date().toISOString(),
    };

    const obsRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/observe`,
      body: { observation: obs },
    });
    assert.strictEqual(obsRes.statusCode, 200);

    const recRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/reconcile`,
    });
    assert.strictEqual(recRes.statusCode, 200);

    // Finalize
    const finRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/finalize`,
    });
    assert.strictEqual(finRes.statusCode, 200);
    const finBody = finRes.body as { status: string };
    assert.strictEqual(finBody.status, "FINALIZED");
  });
});
