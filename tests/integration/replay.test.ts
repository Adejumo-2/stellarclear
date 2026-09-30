import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setupLiveSettlementEnvironment, TEST_LIVE_CONTRACT_ID, TEST_LIVE_NETWORK } from "./helpers/soroban.js";
import { computeTermsCommitment, computeObservationCommitment } from "@stellarclear/proof";
import type {
  ExpectedSettlement,
  ObservedSettlement,
} from "@stellarclear/schemas";
import { SettlementStateSynchronizer, type DecodedContractEvent } from "@stellarclear/indexer";

describe("Integration - Replay Protection and State Mutation Safety", () => {
  it("enforces idempotency across duplicate API request submissions", async () => {
    const { caseRepo, server } = setupLiveSettlementEnvironment();

    const caseId = "e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1";
    const terms: ExpectedSettlement = {
      caseId,
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      tradeReference: "TRADE-REPLAY-001",
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "200000.00",
      expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      deadline: 1800000,
    };

    const idempotencyKey = "idemp-create-case-e1";

    // 1. First submission
    const res1 = await server.inject({
      method: "POST",
      url: "/v1/cases",
      headers: { "idempotency-key": idempotencyKey },
      body: { expected: terms },
    });
    assert.strictEqual(res1.statusCode, 201);
    const body1 = res1.body as { caseId: string; txHash?: string };

    // 2. Replayed submission with same Idempotency-Key
    const res2 = await server.inject({
      method: "POST",
      url: "/v1/cases",
      headers: { "idempotency-key": idempotencyKey },
      body: { expected: terms },
    });
    assert.strictEqual(res2.statusCode, 201);
    const body2 = res2.body as { caseId: string; txHash?: string };

    // Cached responses must be identical
    assert.strictEqual(body1.caseId, body2.caseId);
    assert.strictEqual(body1.txHash, body2.txHash);

    // Verify only 1 database case row exists
    const cases = await caseRepo.list(TEST_LIVE_NETWORK, 10);
    const matchingCases = cases.filter((c) => c.id === caseId);
    assert.strictEqual(matchingCases.length, 1);
  });

  it("handles repeated indexer duplicate event replay without state corruption", async () => {
    const { db, caseRepo, server } = setupLiveSettlementEnvironment();
    const synchronizer = new SettlementStateSynchronizer(db, TEST_LIVE_NETWORK);

    const caseId = "e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2";
    const terms: ExpectedSettlement = {
      caseId,
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      tradeReference: "TRADE-REPLAY-INDEXER",
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

    const event: DecodedContractEvent = {
      type: "CaseFinalized",
      contractId: TEST_LIVE_CONTRACT_ID,
      ledger: 1600000,
      txHash: "0x_fin_tx_replay",
      cursor: "cursor-replay-1",
      topicXdr: "AAA=",
      dataXdr: "BBB=",
      caseId,
      payload: { caseId, finalizedAtLedger: 1600000 },
    };

    // First ingestion
    const stats1 = await synchronizer.syncBatch([event]);
    assert.strictEqual(stats1.eventsProcessed, 1);
    assert.strictEqual(stats1.casesUpdated, 1);

    // Replay same event 3 times
    const stats2 = await synchronizer.syncBatch([event, event, event]);
    assert.strictEqual(stats2.eventsProcessed, 3);

    const dbCase = await caseRepo.findById(caseId, TEST_LIVE_NETWORK);
    assert.strictEqual(dbCase?.status, "FINALIZED");
    assert.strictEqual(dbCase?.finalization_tx_hash, "0x_fin_tx_replay");
    assert.strictEqual(Number(dbCase?.finalized_at_ledger), 1600000);
  });
});
