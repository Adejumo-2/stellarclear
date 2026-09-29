import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setupLiveSettlementEnvironment } from "./helpers/soroban.js";
import type {
  ExpectedSettlement,
  ObservedSettlement,
  SettlementProof,
} from "@stellarclear/schemas";

describe("Live Integration - Settlement Break Workflow on Soroban", () => {
  it("detects asset breaks and persists authoritative break on Soroban", async () => {
    const { soroban, server } = setupLiveSettlementEnvironment();

    const terms: ExpectedSettlement = {
      caseId: "2222333344445555666677778888999922223333444455556666777788889999",
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      tradeReference: "TRADE-BREAK-LIVE-01",
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "300000.00",
      expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      reference: "INV-BREAK-01",
      deadline: 1900000,
    };

    // Asset mismatch
    const observed: ObservedSettlement = {
      txHash: "7777666655554444333322221111000077776666555544443333222211110000",
      ledger: 1850000,
      asset: "EURC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "300000.00",
      destination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      reference: "INV-BREAK-01",
      status: "SUCCESS",
      observedAt: "2026-09-29T15:15:00.000Z",
    };

    // 1. Create Case
    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: terms },
    });

    // 2. Observe Settlement
    await server.inject({
      method: "POST",
      url: `/v1/cases/${terms.caseId}/observe`,
      body: { observation: observed },
    });

    // 3. Reconcile
    const recRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${terms.caseId}/reconcile`,
    });
    assert.strictEqual(recRes.statusCode, 200);
    const recBody = recRes.body as { matched: boolean; breaks: { code: string }[] };
    assert.strictEqual(recBody.matched, false);
    assert.ok(recBody.breaks.some((b) => b.code === "ASSET_MISMATCH"));

    // Check Soroban state
    const onchainCase = await soroban.getOnChainCase(terms.caseId);
    if (!onchainCase) throw new Error("Expected onchainCase to exist");
    assert.strictEqual(onchainCase.status, "BREAK");
    assert.strictEqual(onchainCase.decision.type, "BREAK");
    if (onchainCase.decision.type === "BREAK") {
      assert.strictEqual(onchainCase.decision.breakCode, "ASSET_MISMATCH");
    }

    // 4. Generate Proof
    const proofRes = await server.inject({
      method: "GET",
      url: `/v1/cases/${terms.caseId}/proof`,
    });
    assert.strictEqual(proofRes.statusCode, 200);
    const proof = proofRes.body as SettlementProof;
    assert.strictEqual(proof.result, "BREAK");

    // 5. Verify Proof
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
  });
});
