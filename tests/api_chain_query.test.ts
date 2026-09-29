import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient } from "@stellarclear/db";
import { createApiServer, SorobanSettlementAnchor } from "@stellarclear/api";
import { computeTermsCommitment } from "@stellarclear/proof";
import type { ExpectedSettlement, ObservedSettlement } from "@stellarclear/schemas";
import type { CaseRecord } from "@stellarclear/sdk";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";

class MockAnchorService extends SorobanSettlementAnchor {
  private mockCases = new Map<string, CaseRecord>();

  public setMockCase(caseRecord: CaseRecord) {
    this.mockCases.set(caseRecord.caseId.toLowerCase(), caseRecord);
  }

  public override async getOnChainCase(caseId: string): Promise<CaseRecord | null> {
    return this.mockCases.get(caseId.toLowerCase()) ?? null;
  }
}

describe("API Service - Settlement Registry Query Endpoints", () => {
  const sampleTerms: ExpectedSettlement = {
    caseId: "9999999999999999999999999999999999999999999999999999999999999999",
    owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    tradeReference: "TRADE-QUERY-001",
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "120000.00",
    expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    deadline: 1300000,
  };

  const sampleObserved: ObservedSettlement = {
    txHash: "8888888888888888888888888888888888888888888888888888888888888888",
    ledger: 1290000,
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "120000.00",
    destination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    status: "SUCCESS",
    observedAt: "2026-09-29T12:00:00.000Z",
  };

  function setup() {
    const db = new InMemoryDatabaseClient();
    const anchor = new MockAnchorService();
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
    return { db, anchor, server };
  }

  it("queries on-chain settlement state via GET /v1/cases/:caseId/onchain", async () => {
    const { server, anchor } = setup();

    // 1. Create case in API
    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: sampleTerms },
    });

    const termsCommitment = computeTermsCommitment(sampleTerms);
    anchor.setMockCase({
      caseId: sampleTerms.caseId,
      owner: sampleTerms.owner,
      counterparty: sampleTerms.counterparty,
      termsCommitment,
      expiresAtLedger: sampleTerms.deadline,
      status: "OPEN",
      decision: { type: "NONE" },
      createdAtLedger: 1280000,
    });

    // 2. Query on-chain endpoint
    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${sampleTerms.caseId}/onchain`,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.body as {
      caseId: string;
      contractId: string;
      network: string;
      status: string;
      termsCommitment: string;
      decision: { type: string };
      transactionHashes?: { createTxHash?: string };
    };
    assert.strictEqual(body.caseId, sampleTerms.caseId);
    assert.strictEqual(body.contractId, TEST_CONTRACT_ID);
    assert.strictEqual(body.network, TEST_NETWORK);
    assert.strictEqual(body.status, "OPEN");
    assert.strictEqual(body.termsCommitment, termsCommitment);
    assert.strictEqual(body.decision.type, "NONE");
    assert.ok(body.transactionHashes?.createTxHash);
  });

  it("queries settlement case lifecycle history via GET /v1/cases/:caseId/history", async () => {
    const { server } = setup();

    // 1. Create case
    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: sampleTerms },
    });

    // 2. Observe transaction
    await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/observe`,
      body: { observation: sampleObserved },
    });

    // 3. Reconcile
    await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/reconcile`,
    });

    // 4. Attest
    const termsCommitment = computeTermsCommitment(sampleTerms);
    await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/attest`,
      body: {
        role: "OWNER",
        attestor: sampleTerms.owner,
        commitment: termsCommitment,
      },
    });

    // 5. Finalize
    await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/finalize`,
    });

    // 6. Query History
    const historyRes = await server.inject({
      method: "GET",
      url: `/v1/cases/${sampleTerms.caseId}/history`,
    });

    assert.strictEqual(historyRes.statusCode, 200);
    const body = historyRes.body as {
      caseId: string;
      currentStatus: string;
      history: Array<{ event: string; status: string }>;
    };
    assert.strictEqual(body.caseId, sampleTerms.caseId);
    assert.strictEqual(body.currentStatus, "FINALIZED");
    assert.ok(body.history.some((h) => h.event === "CASE_CREATED"));
    assert.ok(body.history.some((h) => h.event === "OBSERVED"));
    assert.ok(body.history.some((h) => h.event === "MATCHED"));
    assert.ok(body.history.some((h) => h.event === "ATTESTED"));
    assert.ok(body.history.some((h) => h.event === "FINALIZED"));
  });

  it("returns 404 for non-existent case query", async () => {
    const { server } = setup();

    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${sampleTerms.caseId}/onchain`,
    });
    assert.strictEqual(res.statusCode, 404);

    const histRes = await server.inject({
      method: "GET",
      url: `/v1/cases/${sampleTerms.caseId}/history`,
    });
    assert.strictEqual(histRes.statusCode, 404);
  });
});
