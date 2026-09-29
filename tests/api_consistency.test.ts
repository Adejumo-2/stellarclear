import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient, CaseRepository, ObservationRepository } from "@stellarclear/db";
import { createApiServer, SorobanSettlementAnchor, type CaseConsistencyResponse } from "@stellarclear/api";
import { computeTermsCommitment, computeObservationCommitment } from "@stellarclear/proof";
import type { ExpectedSettlement, ObservedSettlement } from "@stellarclear/schemas";
import type { CaseRecord } from "@stellarclear/sdk";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";

class StatefulMockAnchor extends SorobanSettlementAnchor {
  public cases = new Map<string, CaseRecord>();

  public override async getOnChainCase(caseId: string): Promise<CaseRecord | null> {
    return this.cases.get(caseId.toLowerCase()) ?? null;
  }
}

describe("API Service - Settlement Consistency Checks", () => {
  const sampleTerms: ExpectedSettlement = {
    caseId: "9999888877776666555544443333222211110000999988887777666655554444",
    owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    tradeReference: "TRADE-CONSISTENCY-01",
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "150000.00",
    expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    reference: "INV-CONSIST-01",
    deadline: 1500000,
  };

  const sampleObserved: ObservedSettlement = {
    txHash: "8888777766665555444433332222111100009999888877776666555544443333",
    ledger: 1450000,
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "150000.00",
    destination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    reference: "INV-CONSIST-01",
    status: "SUCCESS",
    observedAt: "2026-09-29T12:00:00.000Z",
  };

  function setup() {
    const db = new InMemoryDatabaseClient();
    const anchor = new StatefulMockAnchor();
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

  it("reports CONSISTENT when database and on-chain state match", async () => {
    const { anchor, server } = setup();

    // 1. Create case in API
    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: sampleTerms },
    });

    // 2. Set identical on-chain case in anchor
    const termsCommitment = computeTermsCommitment(sampleTerms);
    anchor.cases.set(sampleTerms.caseId.toLowerCase(), {
      caseId: sampleTerms.caseId,
      owner: sampleTerms.owner,
      counterparty: sampleTerms.counterparty,
      termsCommitment,
      expiresAtLedger: sampleTerms.deadline,
      status: "OPEN",
      decision: { type: "NONE" },
      createdAtLedger: 1400000,
    });

    // 3. Check consistency endpoint
    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${sampleTerms.caseId}/consistency`,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.body as CaseConsistencyResponse;
    assert.strictEqual(body.isConsistent, true);
    assert.strictEqual(body.consistencyStatus, "CONSISTENT");
    assert.strictEqual(body.details.termsCommitmentMatch, true);
    assert.strictEqual(body.details.statusMatch, true);
    assert.strictEqual(body.details.onChainCaseExists, true);
    assert.strictEqual(body.details.chainReferencePresent, true);
    assert.strictEqual(body.details.discrepancies.length, 0);
  });

  it("reports MISSING_ONCHAIN_CASE when case exists in DB but not on chain", async () => {
    const { server } = setup();

    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: sampleTerms },
    });

    // anchor.cases is empty, so on-chain case returns null
    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${sampleTerms.caseId}/consistency`,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.body as CaseConsistencyResponse;
    assert.strictEqual(body.isConsistent, false);
    assert.strictEqual(body.consistencyStatus, "MISSING_ONCHAIN_CASE");
    assert.strictEqual(body.details.onChainCaseExists, false);
  });

  it("reports COMMITMENT_MISMATCH when terms commitment differs", async () => {
    const { anchor, server } = setup();

    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: sampleTerms },
    });

    // On-chain case with forged/different terms commitment
    const forgedCommitment = "1111111111111111111111111111111111111111111111111111111111111111";
    anchor.cases.set(sampleTerms.caseId.toLowerCase(), {
      caseId: sampleTerms.caseId,
      owner: sampleTerms.owner,
      counterparty: sampleTerms.counterparty,
      termsCommitment: forgedCommitment,
      expiresAtLedger: sampleTerms.deadline,
      status: "OPEN",
      decision: { type: "NONE" },
      createdAtLedger: 1400000,
    });

    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${sampleTerms.caseId}/consistency`,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.body as CaseConsistencyResponse;
    assert.strictEqual(body.isConsistent, false);
    assert.strictEqual(body.consistencyStatus, "COMMITMENT_MISMATCH");
    assert.strictEqual(body.details.termsCommitmentMatch, false);
    assert.ok(body.details.discrepancies.length > 0);
  });

  it("reports STALE_DATABASE when on-chain case has progressed beyond database", async () => {
    const { anchor, server } = setup();

    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: sampleTerms },
    });

    const termsCommitment = computeTermsCommitment(sampleTerms);
    const obsCommitment = computeObservationCommitment(sampleObserved);

    // On-chain case is already OBSERVED, but DB is still OPEN
    anchor.cases.set(sampleTerms.caseId.toLowerCase(), {
      caseId: sampleTerms.caseId,
      owner: sampleTerms.owner,
      counterparty: sampleTerms.counterparty,
      termsCommitment,
      expiresAtLedger: sampleTerms.deadline,
      status: "OBSERVED",
      observation: {
        txHash: sampleObserved.txHash,
        observationCommitment: obsCommitment,
        observedLedger: sampleObserved.ledger,
      },
      decision: { type: "NONE" },
      createdAtLedger: 1400000,
    });

    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${sampleTerms.caseId}/consistency`,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.body as CaseConsistencyResponse;
    assert.strictEqual(body.isConsistent, false);
    assert.strictEqual(body.consistencyStatus, "STALE_DATABASE");
    assert.strictEqual(body.details.statusMatch, false);
  });

  it("reports 404 when querying consistency for a non-existent case", async () => {
    const { server } = setup();

    const nonExistentCaseId = "0000000000000000000000000000000000000000000000000000000000000000";
    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${nonExistentCaseId}/consistency`,
    });

    assert.strictEqual(res.statusCode, 404);
  });
});
