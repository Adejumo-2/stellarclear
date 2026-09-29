import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient } from "@stellarclear/db";
import { createApiServer, SorobanSettlementAnchor, type CaseAuditHistoryResponse } from "@stellarclear/api";
import { computeTermsCommitment } from "@stellarclear/proof";
import type { ExpectedSettlement, ObservedSettlement } from "@stellarclear/schemas";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";

describe("API Service - Settlement Audit History", () => {
  const sampleTerms: ExpectedSettlement = {
    caseId: "7777666655554444333322221111000077776666555544443333222211110000",
    owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    tradeReference: "TRADE-AUDIT-001",
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "800000.00",
    expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    reference: "INV-AUDIT-01",
    deadline: 1600000,
  };

  const sampleObserved: ObservedSettlement = {
    txHash: "5555444433332222111100007777666655554444333322221111000077776666",
    ledger: 1550000,
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "800000.00",
    destination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    reference: "INV-AUDIT-01",
    status: "SUCCESS",
    observedAt: "2026-09-29T13:00:00.000Z",
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

  it("builds a full audit history trail through all settlement lifecycle stages", async () => {
    const { server } = setup();

    // 1. Create case
    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: sampleTerms },
    });

    // 2. Observe
    await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/observe`,
      body: { observation: sampleObserved },
    });

    // 3. Reconcile -> Match
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

    // 6. Query Audit History
    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${sampleTerms.caseId}/audit`,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.body as CaseAuditHistoryResponse;
    assert.strictEqual(body.caseId, sampleTerms.caseId);
    assert.strictEqual(body.currentStatus, "FINALIZED");
    assert.ok(body.eventCount >= 5);

    const events = body.events.map((e) => e.event);
    assert.ok(events.includes("CASE_CREATED"));
    assert.ok(events.includes("OBSERVED"));
    assert.ok(events.includes("MATCHED"));
    assert.ok(events.includes("ATTESTED"));
    assert.ok(events.includes("FINALIZED"));

    const createEvt = body.events.find((e) => e.event === "CASE_CREATED");
    if (!createEvt) throw new Error("Expected CASE_CREATED event");
    assert.strictEqual(createEvt.actor, sampleTerms.owner);

    const obsEvt = body.events.find((e) => e.event === "OBSERVED");
    if (!obsEvt) throw new Error("Expected OBSERVED event");
    assert.strictEqual(obsEvt.ledger, sampleObserved.ledger);
  });

  it("builds audit history for break, dispute and resolution lifecycle", async () => {
    const { server } = setup();

    const breakTerms: ExpectedSettlement = {
      ...sampleTerms,
      caseId: "6666555544443333222211110000999966665555444433332222111100009999",
      amount: "200000.00",
    };

    const breakObserved: ObservedSettlement = {
      ...sampleObserved,
      amount: "180000.00",
    };

    // 1. Create case
    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: breakTerms },
    });

    // 2. Observe
    await server.inject({
      method: "POST",
      url: `/v1/cases/${breakTerms.caseId}/observe`,
      body: { observation: breakObserved },
    });

    // 3. Reconcile -> Break
    await server.inject({
      method: "POST",
      url: `/v1/cases/${breakTerms.caseId}/reconcile`,
    });

    // 4. Open Dispute
    await server.inject({
      method: "POST",
      url: `/v1/cases/${breakTerms.caseId}/dispute`,
      body: {
        initiator: breakTerms.owner,
        reason: "Underpaid settlement by 20000 USDC",
      },
    });

    // 5. Submit Resolution
    await server.inject({
      method: "POST",
      url: `/v1/cases/${breakTerms.caseId}/resolve`,
      body: {
        resolver: breakTerms.counterparty ?? "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        resolutionType: "ACCEPT_MODIFIED_AMOUNT",
        agreedAmount: "180000.00",
        resolutionCommitment: "3333333333333333333333333333333333333333333333333333333333333333",
      },
    });

    // 6. Query Audit History
    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${breakTerms.caseId}/audit`,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.body as CaseAuditHistoryResponse;
    const events = body.events.map((e) => e.event);
    assert.ok(events.includes("CASE_CREATED"));
    assert.ok(events.includes("OBSERVED"));
    assert.ok(events.includes("BREAK_RECORDED"));
    assert.ok(events.includes("DISPUTED"));
    assert.ok(events.includes("RESOLVED"));
  });

  it("returns 404 for unknown case ID audit query", async () => {
    const { server } = setup();

    const unknownCaseId = "0000111122223333444455556666777700001111222233334444555566667777";
    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${unknownCaseId}/audit`,
    });

    assert.strictEqual(res.statusCode, 404);
  });
});
