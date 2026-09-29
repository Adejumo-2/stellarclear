import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient } from "@stellarclear/db";
import { createApiServer, SorobanSettlementAnchor, type ApiServer } from "@stellarclear/api";
import type { ExpectedSettlement, ObservedSettlement, ReconciliationResult } from "@stellarclear/schemas";
import type { OnChainAnchorService } from "@stellarclear/api";
import type { TransactionResult } from "@stellarclear/sdk";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";

class MockOnChainAnchor extends SorobanSettlementAnchor {
  public caseCreatedCalls: ExpectedSettlement[] = [];
  public observationCalls: Array<{ observer: string; caseId: string; observation: ObservedSettlement }> = [];
  public reconciliationCalls: Array<{ observer: string; caseId: string; status: string; breakCode?: string }> = [];

  public override async anchorCaseCreation(terms: ExpectedSettlement): Promise<TransactionResult<void>> {
    this.caseCreatedCalls.push(terms);
    return {
      txHash: "0x_create_tx_" + terms.caseId.slice(0, 8),
      status: "SUCCESS",
      result: undefined,
    };
  }

  public async anchorObservation(params: {
    observer: string;
    caseId: string;
    observation: ObservedSettlement;
  }): Promise<TransactionResult<void>> {
    this.observationCalls.push(params);
    return {
      txHash: "0x_obs_tx_" + params.observation.txHash.slice(0, 8),
      status: "SUCCESS",
      result: undefined,
    };
  }

  public async anchorReconciliation(params: {
    observer: string;
    caseId: string;
    status: string;
    breakCode?: string;
  }): Promise<TransactionResult<void>> {
    this.reconciliationCalls.push(params);
    return {
      txHash: "0x_rec_tx_" + params.caseId.slice(0, 8),
      status: "SUCCESS",
      result: undefined,
    };
  }
}

describe("API Service - Anchor Settlement Cases on Soroban", () => {
  const validTerms: ExpectedSettlement = {
    caseId: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    tradeReference: "TR-CHAIN-001",
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "1000.00",
    expectedDestination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    reference: "INV-CHAIN-1",
    deadline: 500000,
    owner: "GA2C5RFPE6GCKMY3US5PAB6UZLKIGAHWKXX2G6VRZZ63OOENWPQA7D75",
  };

  const validObs: ObservedSettlement = {
    txHash: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    ledger: 499990,
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "1000.00",
    destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    reference: "INV-CHAIN-1",
    status: "SUCCESS",
    observedAt: "2026-09-29T12:00:00.000Z",
  };

  it("case created → anchors on-chain transaction and returns txHash", async () => {
    const db = new InMemoryDatabaseClient();
    const anchor = new MockOnChainAnchor();
    const server = createApiServer(
      {
        port: 3000,
        host: "0.0.0.0",
        network: TEST_NETWORK,
        databaseUrl: "postgres://localhost",
        contractId: TEST_CONTRACT_ID,
        enableAnchoring: true,
      },
      db,
      anchor
    );

    const res = await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: validTerms },
    });

    assert.strictEqual(res.statusCode, 201);
    const body = res.body as { caseId: string; status: string; txHash: string };
    assert.strictEqual(body.caseId, validTerms.caseId);
    assert.strictEqual(body.status, "OPEN");
    assert.strictEqual(body.txHash, "0x_create_tx_" + validTerms.caseId.slice(0, 8));
    assert.strictEqual(anchor.caseCreatedCalls.length, 1);
  });

  it("observation → anchors on-chain observation and returns txHash", async () => {
    const db = new InMemoryDatabaseClient();
    const anchor = new MockOnChainAnchor();
    const server = createApiServer(
      {
        port: 3000,
        host: "0.0.0.0",
        network: TEST_NETWORK,
        databaseUrl: "postgres://localhost",
        contractId: TEST_CONTRACT_ID,
        enableAnchoring: true,
      },
      db,
      anchor
    );

    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: validTerms },
    });

    const res = await server.inject({
      method: "POST",
      url: `/v1/cases/${validTerms.caseId}/observe`,
      body: { observation: validObs },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.body as { caseId: string; status: string; txHash: string };
    assert.strictEqual(body.status, "OBSERVED");
    assert.strictEqual(body.txHash, "0x_obs_tx_" + validObs.txHash.slice(0, 8));
    assert.strictEqual(anchor.observationCalls.length, 1);
  });

  it("match → anchors on-chain match decision and returns txHash", async () => {
    const db = new InMemoryDatabaseClient();
    const anchor = new MockOnChainAnchor();
    const server = createApiServer(
      {
        port: 3000,
        host: "0.0.0.0",
        network: TEST_NETWORK,
        databaseUrl: "postgres://localhost",
        contractId: TEST_CONTRACT_ID,
        enableAnchoring: true,
      },
      db,
      anchor
    );

    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: validTerms },
    });
    await server.inject({
      method: "POST",
      url: `/v1/cases/${validTerms.caseId}/observe`,
      body: { observation: validObs },
    });

    const res = await server.inject({
      method: "POST",
      url: `/v1/cases/${validTerms.caseId}/reconcile`,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.body as ReconciliationResult & { txHash: string };
    assert.strictEqual(body.status, "MATCHED");
    assert.strictEqual(body.matched, true);
    assert.strictEqual(body.txHash, "0x_rec_tx_" + validTerms.caseId.slice(0, 8));
    assert.strictEqual(anchor.reconciliationCalls.length, 1);
    assert.strictEqual(anchor.reconciliationCalls[0]?.status, "MATCHED");
  });

  it("break → anchors on-chain break decision with break code and returns txHash", async () => {
    const db = new InMemoryDatabaseClient();
    const anchor = new MockOnChainAnchor();
    const server = createApiServer(
      {
        port: 3000,
        host: "0.0.0.0",
        network: TEST_NETWORK,
        databaseUrl: "postgres://localhost",
        contractId: TEST_CONTRACT_ID,
        enableAnchoring: true,
      },
      db,
      anchor
    );

    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: validTerms },
    });
    // Observation with mismatched amount
    const breakObs: ObservedSettlement = {
      ...validObs,
      amount: "500.00",
    };
    await server.inject({
      method: "POST",
      url: `/v1/cases/${validTerms.caseId}/observe`,
      body: { observation: breakObs },
    });

    const res = await server.inject({
      method: "POST",
      url: `/v1/cases/${validTerms.caseId}/reconcile`,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.body as ReconciliationResult & { txHash: string };
    assert.strictEqual(body.status, "BREAK");
    assert.strictEqual(body.matched, false);
    assert.strictEqual(body.breaks[0]?.code, "AMOUNT_MISMATCH");
    assert.strictEqual(anchor.reconciliationCalls.length, 1);
    assert.strictEqual(anchor.reconciliationCalls[0]?.status, "BREAK");
    assert.strictEqual(anchor.reconciliationCalls[0]?.breakCode, "AMOUNT_MISMATCH");
  });
});
