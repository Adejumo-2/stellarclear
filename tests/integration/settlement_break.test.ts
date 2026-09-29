import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient } from "@stellarclear/db";
import { createApiServer, SorobanSettlementAnchor } from "@stellarclear/api";
import type { ExpectedSettlement, ObservedSettlement } from "@stellarclear/schemas";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";

describe("Integration - Settlement Break Detection & Querying", () => {
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

  const baseTerms: ExpectedSettlement = {
    caseId: "7777777777777777777777777777777777777777777777777777777777777777",
    owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    tradeReference: "FX-BREAK-TEST-001",
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "50000.00",
    expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    reference: "REF-VALID-001",
    deadline: 1000000,
  };

  it("detects and records DESTINATION_MISMATCH break", async () => {
    const { server } = setup();

    const terms = { ...baseTerms, caseId: "7777777777777777777777777777777777777777777777777777777777777771" };
    const wrongDestObs: ObservedSettlement = {
      txHash: "1111111111111111111111111111111111111111111111111111111111111111",
      ledger: 900000,
      asset: terms.asset,
      amount: terms.amount,
      destination: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", // Wrong destination
      reference: terms.reference,
      status: "SUCCESS",
      observedAt: "2026-09-29T10:00:00.000Z",
    };

    await server.inject({ method: "POST", url: "/v1/cases", body: { expected: terms } });
    await server.inject({ method: "POST", url: `/v1/cases/${terms.caseId}/observe`, body: { observation: wrongDestObs } });

    const recRes = await server.inject({ method: "POST", url: `/v1/cases/${terms.caseId}/reconcile` });
    assert.strictEqual(recRes.statusCode, 200);
    const recBody = recRes.body as { status: string; matched: boolean; breaks: Array<{ code: string }> };
    assert.strictEqual(recBody.status, "BREAK");
    assert.strictEqual(recBody.matched, false);
    assert.ok(recBody.breaks.some((b) => b.code === "DESTINATION_MISMATCH"));

    const breaksRes = await server.inject({ method: "GET", url: `/v1/cases/${terms.caseId}/breaks` });
    assert.strictEqual(breaksRes.statusCode, 200);
    const breaksBody = breaksRes.body as { breaks: Array<{ code: string; field?: string }> };
    assert.ok(breaksBody.breaks.some((b) => b.code === "DESTINATION_MISMATCH" && b.field === "destination"));
  });

  it("detects and records LATE_SETTLEMENT break", async () => {
    const { server } = setup();

    const terms = { ...baseTerms, caseId: "7777777777777777777777777777777777777777777777777777777777777772" };
    const lateObs: ObservedSettlement = {
      txHash: "2222222222222222222222222222222222222222222222222222222222222222",
      ledger: 1000500, // Beyond deadline 1000000
      asset: terms.asset,
      amount: terms.amount,
      destination: terms.expectedDestination,
      reference: terms.reference,
      status: "SUCCESS",
      observedAt: "2026-09-29T10:00:00.000Z",
    };

    await server.inject({ method: "POST", url: "/v1/cases", body: { expected: terms } });
    await server.inject({ method: "POST", url: `/v1/cases/${terms.caseId}/observe`, body: { observation: lateObs } });

    const recRes = await server.inject({ method: "POST", url: `/v1/cases/${terms.caseId}/reconcile` });
    const recBody = recRes.body as { status: string; breaks: Array<{ code: string }> };
    assert.strictEqual(recBody.status, "BREAK");
    assert.ok(recBody.breaks.some((b) => b.code === "LATE_SETTLEMENT"));
  });
});
