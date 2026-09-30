import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setupLiveSettlementEnvironment, TEST_LIVE_CONTRACT_ID, TEST_LIVE_NETWORK } from "./helpers/soroban.js";
import { computeTermsCommitment, computeObservationCommitment, verifySettlementProof } from "@stellarclear/proof";
import {
  SETTLEMENT_REGISTRY_RELEASE,
  getPinnedContractRelease,
  verifyContractReleaseCompatibility,
} from "@stellarclear/sdk";
import type {
  ExpectedSettlement,
  ObservedSettlement,
  SettlementProof,
} from "@stellarclear/schemas";
import type { CaseConsistencyResponse } from "@stellarclear/api";

const VALID_OWNER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFXYORMA3Y4H3EL2PUGQY";
const VALID_CP = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const VALID_ASSET = "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

describe("Integration - Pinned SettlementRegistry Release End-to-End Lifecycle", () => {
  it("verifies pinned release metadata integrity and compatibility", () => {
    const release = getPinnedContractRelease();
    assert.strictEqual(release.name, "settlement_registry");
    assert.strictEqual(release.version, "0.1.0");
    assert.strictEqual(release.releaseTag, "v0.1.0");
    assert.strictEqual(release.specVersion, 1);
    assert.strictEqual(typeof release.wasmHash, "string");
    assert.strictEqual(release.wasmHash.length, 64);
    assert.ok(release.features.includes("case_creation"));
    assert.ok(release.features.includes("onchain_finalization"));
    assert.ok(release.features.includes("multi_party_attestations"));

    // Check deployment records
    assert.ok(release.deployedNetworks.testnet);
    assert.ok(release.deployedNetworks.local);
    assert.strictEqual(release.deployedNetworks.testnet.contractId.startsWith("C"), true);

    // Test compatibility validator
    assert.strictEqual(verifyContractReleaseCompatibility("testnet").compatible, true);
    assert.strictEqual(verifyContractReleaseCompatibility("local").compatible, true);
    assert.strictEqual(verifyContractReleaseCompatibility("mainnet").compatible, true);
    assert.strictEqual(verifyContractReleaseCompatibility("unknown_net").compatible, false);
  });

  it("executes full match lifecycle bound to pinned contract release", async () => {
    const pinned = SETTLEMENT_REGISTRY_RELEASE;
    const { server } = setupLiveSettlementEnvironment();

    const caseId = "f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1";
    const terms: ExpectedSettlement = {
      caseId,
      owner: VALID_OWNER,
      counterparty: VALID_CP,
      tradeReference: "TRADE-PINNED-001",
      asset: VALID_ASSET,
      amount: "500000.0000000",
      expectedDestination: VALID_OWNER,
      reference: "INV-PINNED-001",
      deadline: 2000000,
    };

    // 1. Create Case
    const createRes = await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: terms },
    });
    assert.strictEqual(createRes.statusCode, 201);
    const createBody = createRes.body as { caseId: string; status: string; txHash?: string };
    assert.strictEqual(createBody.caseId, caseId);
    assert.strictEqual(createBody.status, "OPEN");

    // 2. Observe Settlement
    const observation: ObservedSettlement = {
      txHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ledger: 1700000,
      asset: terms.asset,
      amount: terms.amount,
      destination: terms.expectedDestination,
      reference: terms.reference,
      status: "SUCCESS",
      observedAt: new Date().toISOString(),
    };

    const obsRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/observe`,
      body: { observation },
    });
    assert.strictEqual(obsRes.statusCode, 200);

    // 3. Reconcile -> MATCHED
    const recRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/reconcile`,
    });
    assert.strictEqual(recRes.statusCode, 200);
    const recBody = recRes.body as { status: string; matched: boolean };
    assert.strictEqual(recBody.matched, true);
    assert.strictEqual(recBody.status, "MATCHED");

    // 4. Submit Attestations from Owner & Counterparty
    const termsCommitment = computeTermsCommitment(terms);
    const attestRes1 = await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/attest`,
      body: {
        attestor: terms.owner,
        role: "OWNER",
        commitment: termsCommitment,
      },
    });
    assert.strictEqual(attestRes1.statusCode, 201);

    const attestRes2 = await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/attest`,
      body: {
        attestor: terms.counterparty!,
        role: "COUNTERPARTY",
        commitment: termsCommitment,
      },
    });
    assert.strictEqual(attestRes2.statusCode, 201);

    // 5. Generate Proof via API & Verify against Pinned Release Contract ID
    const proofRes = await server.inject({
      method: "GET",
      url: `/v1/cases/${caseId}/proof`,
    });
    assert.strictEqual(proofRes.statusCode, 200);
    const proof = proofRes.body as SettlementProof;
    assert.strictEqual(proof.contractId, TEST_LIVE_CONTRACT_ID);
    assert.strictEqual(proof.network, TEST_LIVE_NETWORK);
    assert.strictEqual(proof.attestations.length, 2);

    const isProofValid = verifySettlementProof(proof);
    assert.strictEqual(isProofValid.valid, true);

    // 6. Verify proof via API endpoint
    const verifyRes = await server.inject({
      method: "POST",
      url: "/v1/proofs/verify/onchain",
      body: {
        proof,
        termsDocument: terms,
        observedDocument: observation,
      },
    });
    assert.strictEqual(verifyRes.statusCode, 200);
    const verifyBody = verifyRes.body as { valid: boolean };
    assert.strictEqual(verifyBody.valid, true);

    // 7. Finalize Case on Soroban
    const finRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/finalize`,
    });
    assert.strictEqual(finRes.statusCode, 200);
    const finBody = finRes.body as { status: string; finalizationTxHash?: string };
    assert.strictEqual(finBody.status, "FINALIZED");
    assert.ok(finBody.finalizationTxHash);

    // 8. Cross-layer consistency check
    const consRes = await server.inject({
      method: "GET",
      url: `/v1/cases/${caseId}/consistency`,
    });
    assert.strictEqual(consRes.statusCode, 200);
    const consistency = consRes.body as CaseConsistencyResponse;
    assert.strictEqual(consistency.isConsistent, true);
    assert.strictEqual(consistency.databaseStatus, "FINALIZED");
    assert.strictEqual(consistency.contractId, TEST_LIVE_CONTRACT_ID);
    assert.strictEqual(consistency.details.discrepancies.length, 0);
  });

  it("executes break and dispute resolution lifecycle under pinned release specification", async () => {
    const { server } = setupLiveSettlementEnvironment();

    const caseId = "f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2";
    const terms: ExpectedSettlement = {
      caseId,
      owner: VALID_OWNER,
      counterparty: VALID_CP,
      tradeReference: "TRADE-PINNED-002",
      asset: VALID_ASSET,
      amount: "100000.0000000",
      expectedDestination: VALID_OWNER,
      reference: "INV-PINNED-002",
      deadline: 2000000,
    };

    // 1. Create Case
    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: terms },
    });

    // 2. Observe Break (underpayment)
    const observation: ObservedSettlement = {
      txHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      ledger: 1750000,
      asset: terms.asset,
      amount: "80000.0000000", // Amount mismatch
      destination: terms.expectedDestination,
      reference: terms.reference,
      status: "SUCCESS",
      observedAt: new Date().toISOString(),
    };

    await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/observe`,
      body: { observation },
    });

    // 3. Reconcile -> BREAK
    const recRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/reconcile`,
    });
    assert.strictEqual(recRes.statusCode, 200);
    const recBody = recRes.body as { status: string; matched: boolean; breaks?: Array<{ code: string }> };
    assert.strictEqual(recBody.matched, false);
    assert.strictEqual(recBody.status, "BREAK");
    assert.strictEqual(recBody.breaks?.[0]?.code, "AMOUNT_MISMATCH");

    // 4. Open Dispute
    const disputeRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/dispute`,
      body: {
        initiator: VALID_CP,
        reason: "Partial settlement delivered with remaining balance pending",
      },
    });
    assert.strictEqual(disputeRes.statusCode, 201);
    const disputeBody = disputeRes.body as { status: string };
    assert.strictEqual(disputeBody.status, "DISPUTED");

    // 5. Submit Resolution
    const resRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/resolve`,
      body: {
        resolver: terms.counterparty!,
        resolutionType: "MUTUAL_AGREEMENT",
        details: { summary: "Parties agreed on discounted fee terms of 80,000 USDC" },
        agreedAmount: "80000.0000000",
      },
    });
    assert.strictEqual(resRes.statusCode, 200);
    const resBody = resRes.body as { status: string };
    assert.strictEqual(resBody.status, "RESOLVED");

    // 6. Generate proof and finalize
    const proofRes = await server.inject({
      method: "GET",
      url: `/v1/cases/${caseId}/proof`,
    });
    assert.strictEqual(proofRes.statusCode, 200);
    const proof = proofRes.body as SettlementProof;
    assert.strictEqual(proof.result, "BREAK");
    assert.strictEqual(verifySettlementProof(proof).valid, true);

    const finRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/finalize`,
    });
    assert.strictEqual(finRes.statusCode, 200);
    const finBody = finRes.body as { status: string; finalizationTxHash?: string };
    assert.strictEqual(finBody.status, "FINALIZED");
    assert.ok(finBody.finalizationTxHash);
  });
});
