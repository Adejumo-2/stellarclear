import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient } from "@stellarclear/db";
import { createApiServer, SorobanSettlementAnchor } from "@stellarclear/api";
import type { ExpectedSettlement, ObservedSettlement } from "@stellarclear/schemas";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";

describe("API Service - Idempotency and Replay Protection", () => {
  const sampleTerms: ExpectedSettlement = {
    caseId: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    tradeReference: "TRADE-IDEMP-001",
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "100000.00",
    expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    reference: "INV-IDEMP-01",
    deadline: 1500000,
  };

  const sampleObserved: ObservedSettlement = {
    txHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    ledger: 1450000,
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "100000.00",
    destination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    reference: "INV-IDEMP-01",
    status: "SUCCESS",
    observedAt: "2026-09-29T12:00:00.000Z",
  };

  function setup() {
    const db = new InMemoryDatabaseClient();
    const anchor = new SorobanSettlementAnchor();
    const server = createApiServer(
      {
        port: 3000,
        host: "0.0.0.0",
        network: TEST_NETWORK,
        databaseUrl: "postgres://localhost:5432/test",
        contractId: TEST_CONTRACT_ID,
      },
      db,
      anchor
    );
    return { db, server };
  }

  it("replays cached response when Idempotency-Key header is supplied", async () => {
    const { server } = setup();
    const idempotencyKey = "key-create-case-001";

    // First request
    const firstRes = await server.inject({
      method: "POST",
      url: "/v1/cases",
      headers: { "idempotency-key": idempotencyKey },
      body: { expected: sampleTerms },
    });
    assert.strictEqual(firstRes.statusCode, 201);
    const firstBody = firstRes.body as { caseId: string; txHash?: string };

    // Second request with same idempotency key
    const secondRes = await server.inject({
      method: "POST",
      url: "/v1/cases",
      headers: { "idempotency-key": idempotencyKey },
      body: { expected: sampleTerms },
    });

    assert.strictEqual(secondRes.statusCode, 201);
    assert.strictEqual(secondRes.headers["x-idempotent-replay"], "true");
    const secondBody = secondRes.body as { caseId: string; txHash?: string };
    assert.strictEqual(secondBody.caseId, firstBody.caseId);
    assert.strictEqual(secondBody.txHash, firstBody.txHash);
  });

  it("handles duplicate observation idempotently without throwing error", async () => {
    const { server } = setup();

    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: sampleTerms },
    });

    // First observation
    const obsRes1 = await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/observe`,
      body: { observation: sampleObserved },
    });
    assert.strictEqual(obsRes1.statusCode, 200);

    // Duplicate observation submission for same txHash
    const obsRes2 = await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/observe`,
      body: { observation: sampleObserved },
    });
    assert.strictEqual(obsRes2.statusCode, 200);
    const obsBody2 = obsRes2.body as { caseId: string; status: string };
    assert.strictEqual(obsBody2.caseId, sampleTerms.caseId);
  });

  it("handles duplicate finalization idempotently", async () => {
    const { server } = setup();

    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: sampleTerms },
    });

    await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/observe`,
      body: { observation: sampleObserved },
    });

    await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/reconcile`,
    });

    // First finalization
    const finRes1 = await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/finalize`,
    });
    assert.strictEqual(finRes1.statusCode, 200);
    const finBody1 = finRes1.body as { status: string; caseId: string };
    assert.strictEqual(finBody1.status, "FINALIZED");

    // Second duplicate finalization
    const finRes2 = await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/finalize`,
    });
    assert.strictEqual(finRes2.statusCode, 200);
    const finBody2 = finRes2.body as { status: string; caseId: string };
    assert.strictEqual(finBody2.status, "FINALIZED");
    assert.strictEqual(finBody2.caseId, sampleTerms.caseId);
  });
});
