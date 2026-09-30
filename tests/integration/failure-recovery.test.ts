import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setupLiveSettlementEnvironment, TEST_LIVE_CONTRACT_ID, TEST_LIVE_NETWORK } from "./helpers/soroban.js";
import { computeTermsCommitment, computeObservationCommitment } from "@stellarclear/proof";
import type {
  ExpectedSettlement,
  ObservedSettlement,
  SettlementProof,
} from "@stellarclear/schemas";
import { SettlementStateSynchronizer, type DecodedContractEvent } from "@stellarclear/indexer";

describe("Integration - Failure and Recovery Scenarios", () => {
  it("handles RPC / transaction submission failure during case creation cleanly without corrupting DB", async () => {
    const { caseRepo, soroban, server } = setupLiveSettlementEnvironment();

    const caseId = "f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1";
    const terms: ExpectedSettlement = {
      caseId,
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      tradeReference: "TRADE-FAIL-001",
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "100000.00",
      expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      deadline: 1800000,
    };

    // Simulate transient failure by temporarily overriding anchorCaseCreation
    const originalAnchor = soroban.anchorCaseCreation.bind(soroban);
    soroban.anchorCaseCreation = async () => {
      throw new Error("RPC_SIMULATION_ERROR: Connection timed out to Soroban RPC node");
    };

    const failRes = await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: terms },
    });
    assert.strictEqual(failRes.statusCode, 500);

    // Verify DB does not contain incomplete case
    const dbCase = await caseRepo.findById(caseId, TEST_LIVE_NETWORK);
    assert.strictEqual(dbCase, null);

    // Restore anchor and retry successfully
    soroban.anchorCaseCreation = originalAnchor;
    const retryRes = await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: terms },
    });
    assert.strictEqual(retryRes.statusCode, 201);
    const retryBody = retryRes.body as { caseId: string; status: string };
    assert.strictEqual(retryBody.caseId, caseId);
    assert.strictEqual(retryBody.status, "OPEN");

    const recoveredDbCase = await caseRepo.findById(caseId, TEST_LIVE_NETWORK);
    if (!recoveredDbCase) throw new Error("Expected recoveredDbCase to exist");
    assert.strictEqual(recoveredDbCase.status, "OPEN");
  });

  it("recovers from indexer delay and out-of-order event ingestion safely", async () => {
    const { db, caseRepo, soroban, server } = setupLiveSettlementEnvironment();
    const synchronizer = new SettlementStateSynchronizer(db, TEST_LIVE_NETWORK);

    const caseId = "f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2";
    const terms: ExpectedSettlement = {
      caseId,
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      tradeReference: "TRADE-INDEXER-DELAY",
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "50000.00",
      expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      deadline: 1800000,
    };

    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: terms },
    });

    const events: DecodedContractEvent[] = [
      {
        type: "CaseFinalized",
        contractId: TEST_LIVE_CONTRACT_ID,
        ledger: 1600050,
        txHash: "0x_delayed_fin_tx",
        cursor: "cur_50",
        topicXdr: "AAA=",
        dataXdr: "BBB=",
        caseId,
        payload: { caseId, finalizedAtLedger: 1600050 },
      },
      {
        type: "CaseMatched",
        contractId: TEST_LIVE_CONTRACT_ID,
        ledger: 1600020,
        txHash: "0x_delayed_match_tx",
        cursor: "cur_20",
        topicXdr: "AAA=",
        dataXdr: "BBB=",
        caseId,
        payload: { caseId, observer: terms.owner },
      },
    ];

    // Sync out of order batch
    const syncStats = await synchronizer.syncBatch(events);
    assert.strictEqual(syncStats.eventsProcessed, 2);

    const dbCase = await caseRepo.findById(caseId, TEST_LIVE_NETWORK);
    if (!dbCase) throw new Error("Expected dbCase to exist");
    assert.strictEqual(dbCase.finalization_tx_hash, "0x_delayed_fin_tx");
  });

  it("detects and diagnoses proof vs on-chain state mismatches", async () => {
    const { caseRepo, soroban, server } = setupLiveSettlementEnvironment();

    const caseId = "f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3";
    const terms: ExpectedSettlement = {
      caseId,
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      tradeReference: "TRADE-MISMATCH-DIAG",
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "100000.00",
      expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      deadline: 1800000,
    };

    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: terms },
    });

    const forgedProof: SettlementProof = {
      protocol: "STELLARCLEAR",
      version: "1.0.0",
      caseId,
      termsCommitment: "00".repeat(32), // Forged commitment
      observationCommitment: "11".repeat(32),
      txHash: "aa".repeat(32),
      finalizedLedger: 1600000,
      result: "MATCHED",
      attestations: [],
      contractId: TEST_LIVE_CONTRACT_ID,
      network: TEST_LIVE_NETWORK,
    };

    const verifyRes = await server.inject({
      method: "POST",
      url: "/v1/proofs/verify/onchain",
      body: {
        proof: forgedProof,
        termsDocument: terms,
      },
    });
    assert.strictEqual(verifyRes.statusCode, 200);
    const verifyBody = verifyRes.body as { valid: boolean; reason?: string };
    assert.strictEqual(verifyBody.valid, false);
    assert.ok(verifyBody.reason?.includes("commitment mismatch") || verifyBody.reason?.includes("Terms commitment"));
  });
});
