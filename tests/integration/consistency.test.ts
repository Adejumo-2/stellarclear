import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setupLiveSettlementEnvironment, TEST_LIVE_CONTRACT_ID, TEST_LIVE_NETWORK } from "./helpers/soroban.js";
import { computeTermsCommitment, computeObservationCommitment, createSettlementProof } from "@stellarclear/proof";
import type {
  ExpectedSettlement,
  ObservedSettlement,
  SettlementProof,
} from "@stellarclear/schemas";
import type { CaseConsistencyResponse } from "@stellarclear/api";

describe("Integration - Cross-Layer Settlement Consistency Verification", () => {
  it("verifies consistent agreement between Database, Soroban state, and SettlementProof", async () => {
    const { caseRepo, obsRepo, soroban, server } = setupLiveSettlementEnvironment();

    const caseId = "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1";
    const terms: ExpectedSettlement = {
      caseId,
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      tradeReference: "TRADE-CONSISTENCY-001",
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "750000.00",
      expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      reference: "INV-CONSISTENCY-101",
      deadline: 1800000,
    };

    // 1. Create Case
    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: terms },
    });

    // 2. Observe Settlement
    const observation: ObservedSettlement = {
      txHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ledger: 1550000,
      asset: terms.asset,
      amount: terms.amount,
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

    // 3. Reconcile -> MATCHED
    await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/reconcile`,
    });

    // 4. Attest
    await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/attest`,
      body: {
        attestor: terms.owner,
        role: "OWNER",
        commitment: computeTermsCommitment(terms),
      },
    });

    // 5. Finalize
    await server.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/finalize`,
      body: { finalizer: terms.owner },
    });

    // 6. Query consistency endpoint
    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${caseId}/consistency`,
    });
    assert.strictEqual(res.statusCode, 200);
    const body = res.body as CaseConsistencyResponse;

    assert.strictEqual(body.isConsistent, true);
    assert.strictEqual(body.consistencyStatus, "CONSISTENT");
    assert.strictEqual(body.databaseStatus, "FINALIZED");
    assert.strictEqual(body.onChainStatus, "FINALIZED");
    assert.strictEqual(body.details.termsCommitmentMatch, true);
    assert.strictEqual(body.details.observationCommitmentMatch, true);
    assert.strictEqual(body.details.statusMatch, true);
    assert.strictEqual(body.details.onChainCaseExists, true);
    assert.strictEqual(body.details.chainReferencePresent, true);
    assert.strictEqual(body.details.finalizationConsistent, true);
    assert.strictEqual(body.details.networkIdentityConsistent, true);
    assert.ok(body.details.transactionReferences?.createTxHash);
    assert.ok(body.details.transactionReferences?.observationTxHash);
    assert.ok(body.details.transactionReferences?.reconciliationTxHash);
    assert.ok(body.details.transactionReferences?.attestationTxHash);
    assert.ok(body.details.transactionReferences?.finalizationTxHash);
  });

  it("detects MISSING_ONCHAIN_CASE when case is only in DB", async () => {
    const { caseRepo, server } = setupLiveSettlementEnvironment();

    const caseId = "c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2";
    const now = new Date();
    await caseRepo.insert({
      id: caseId,
      network: TEST_LIVE_NETWORK,
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      trade_reference: "TR-MISSING-CHAIN",
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "10000.00",
      expected_destination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      terms_commitment: "a".repeat(64),
      expires_at_ledger: 1000000,
      status: "OPEN",
      create_tx_hash: "0x_dummy_create",
      created_at: now,
      updated_at: now,
    });

    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${caseId}/consistency`,
    });
    assert.strictEqual(res.statusCode, 200);
    const body = res.body as CaseConsistencyResponse;

    assert.strictEqual(body.isConsistent, false);
    assert.strictEqual(body.consistencyStatus, "MISSING_ONCHAIN_CASE");
    assert.strictEqual(body.details.onChainCaseExists, false);
  });

  it("detects COMMITMENT_MISMATCH when DB terms commitment differs from Soroban", async () => {
    const { caseRepo, soroban, server } = setupLiveSettlementEnvironment();

    const caseId = "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3";
    const terms: ExpectedSettlement = {
      caseId,
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      tradeReference: "TRADE-MISMATCH",
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

    // Corrupt DB terms commitment
    await caseRepo.updateChainReferences(caseId, TEST_LIVE_NETWORK, {
      terms_commitment: "ff".repeat(32),
    });

    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${caseId}/consistency`,
    });
    assert.strictEqual(res.statusCode, 200);
    const body = res.body as CaseConsistencyResponse;

    assert.strictEqual(body.isConsistent, false);
    assert.strictEqual(body.consistencyStatus, "COMMITMENT_MISMATCH");
    assert.strictEqual(body.details.termsCommitmentMatch, false);
  });

  it("detects STALE_DATABASE when Soroban state advanced beyond DB", async () => {
    const { caseRepo, soroban, server } = setupLiveSettlementEnvironment();

    const caseId = "c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4";
    const terms: ExpectedSettlement = {
      caseId,
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      tradeReference: "TRADE-STALE",
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

    // Advance Soroban state directly without updating DB
    await soroban.anchorReconciliation({
      observer: terms.owner,
      caseId,
      status: "MATCHED",
    });

    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${caseId}/consistency`,
    });
    assert.strictEqual(res.statusCode, 200);
    const body = res.body as CaseConsistencyResponse;

    assert.strictEqual(body.isConsistent, false);
    assert.strictEqual(body.consistencyStatus, "STALE_DATABASE");
  });
});
