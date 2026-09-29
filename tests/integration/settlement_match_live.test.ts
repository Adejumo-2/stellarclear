import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setupLiveSettlementEnvironment } from "./helpers/soroban.js";
import { computeTermsCommitment, computeObservationCommitment } from "@stellarclear/proof";
import type {
  ExpectedSettlement,
  ObservedSettlement,
  SettlementProof,
} from "@stellarclear/schemas";

describe("Live Integration - Settlement Match & Multi-party Verification", () => {
  it("processes multi-party attestations and confirms on-chain proof verification against Soroban", async () => {
    const { soroban, server } = setupLiveSettlementEnvironment();

    const terms: ExpectedSettlement = {
      caseId: "1111222233334444555566667777888811112222333344445555666677778888",
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      tradeReference: "FX-MATCH-LIVE-001",
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "750000.00",
      expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      reference: "INV-MATCH-LIVE-01",
      deadline: 1800000,
    };

    const observed: ObservedSettlement = {
      txHash: "9999888877776666555544443333222299998888777766665555444433332222",
      ledger: 1750000,
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "750000.00",
      destination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      reference: "INV-MATCH-LIVE-01",
      status: "SUCCESS",
      observedAt: "2026-09-29T15:00:00.000Z",
    };

    // 1. Create Case
    const createRes = await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: terms },
    });
    assert.strictEqual(createRes.statusCode, 201);

    // 2. Observe Settlement
    const obsRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${terms.caseId}/observe`,
      body: { observation: observed },
    });
    assert.strictEqual(obsRes.statusCode, 200);

    // 3. Reconcile
    const recRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${terms.caseId}/reconcile`,
    });
    assert.strictEqual(recRes.statusCode, 200);

    // 4. Submit Owner Attestation
    const termsCommitment = computeTermsCommitment(terms);
    const ownerAttestRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${terms.caseId}/attest`,
      body: {
        role: "OWNER",
        attestor: terms.owner,
        commitment: termsCommitment,
      },
    });
    assert.strictEqual(ownerAttestRes.statusCode, 201);

    // 5. Submit Counterparty Attestation
    const obsCommitment = computeObservationCommitment(observed);
    const counterparty = terms.counterparty ?? "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
    const cpAttestRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${terms.caseId}/attest`,
      body: {
        role: "COUNTERPARTY",
        attestor: counterparty,
        commitment: obsCommitment,
      },
    });
    assert.strictEqual(cpAttestRes.statusCode, 201);

    // Verify Soroban state has both attestations recorded
    const ownerAttest = await soroban.getOnChainAttestation(terms.caseId, terms.owner);
    const cpAttest = await soroban.getOnChainAttestation(terms.caseId, counterparty);
    if (!ownerAttest) throw new Error("Expected ownerAttest to exist");
    if (!cpAttest) throw new Error("Expected cpAttest to exist");
    assert.strictEqual(ownerAttest.role, "OWNER");
    assert.strictEqual(cpAttest.role, "COUNTERPARTY");

    // 6. Generate Proof & Verify against Soroban state
    const proofRes = await server.inject({
      method: "GET",
      url: `/v1/cases/${terms.caseId}/proof`,
    });
    assert.strictEqual(proofRes.statusCode, 200);
    const proof = proofRes.body as SettlementProof;

    const verifyRes = await server.inject({
      method: "POST",
      url: "/v1/proofs/verify",
      body: { proof },
    });
    assert.strictEqual(verifyRes.statusCode, 200);
    const verifyBody = verifyRes.body as { valid: boolean };
    assert.strictEqual(verifyBody.valid, true);

    const verifyOnchainRes = await server.inject({
      method: "POST",
      url: "/v1/proofs/verify/onchain",
      body: { proof },
    });
    assert.strictEqual(verifyOnchainRes.statusCode, 200);
    const verifyOnchainBody = verifyOnchainRes.body as { valid: boolean };
    assert.strictEqual(verifyOnchainBody.valid, true);

    // 7. Finalize
    const finalizeRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${terms.caseId}/finalize`,
    });
    assert.strictEqual(finalizeRes.statusCode, 200);

    const onchainCase = await soroban.getOnChainCase(terms.caseId);
    if (!onchainCase) throw new Error("Expected onchainCase to exist");
    assert.strictEqual(onchainCase.status, "FINALIZED");
  });
});
