import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient } from "@stellarclear/db";
import {
  createApiServer,
  SorobanSettlementAnchor,
  type ApiErrorEnvelope,
} from "@stellarclear/api";
import type { ExpectedSettlement } from "@stellarclear/schemas";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";
const VALID_CASE_ID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const VALID_OWNER = "GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6ZN7JMTXNZBEWBIXXX";
const VALID_DESTINATION = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

function buildExpected(caseId = VALID_CASE_ID, amount = "1000.0000000"): ExpectedSettlement {
  return {
    caseId,
    tradeReference: `TR-REPLAY-${caseId.slice(0, 6)}`,
    asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    amount,
    expectedDestination: VALID_DESTINATION,
    reference: "INV-REPLAY",
    deadline: 600000,
    owner: VALID_OWNER,
    counterparty: VALID_DESTINATION,
  };
}

describe("Security Regression - Replay Protection and Idempotency Isolation", () => {
  it("isolates idempotency keys across different endpoint routes", async () => {
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

    const sharedKey = "shared-idempotency-key-01";
    const expected = buildExpected();

    // 1. Create case with sharedKey
    const createRes = await server.inject({
      method: "POST",
      url: "/v1/cases",
      headers: { "idempotency-key": sharedKey },
      body: { expected },
    });
    assert.strictEqual(createRes.statusCode, 201);

    // 2. Submit observation using the same sharedKey on a different route
    const obsRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${VALID_CASE_ID}/observe`,
      headers: { "idempotency-key": sharedKey },
      body: {
        observation: {
          txHash: "1111111111111111111111111111111111111111111111111111111111111111",
          ledger: 100,
          asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          amount: "1000.0000000",
          destination: VALID_DESTINATION,
          reference: "INV-REPLAY",
          status: "SUCCESS",
          observedAt: "2026-09-30T00:00:00.000Z",
        },
      },
    });
    assert.strictEqual(obsRes.statusCode, 200);
  });

  it("detects payload alteration even when keys are sorted differently in JSON payload", async () => {
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

    const idemKey = "reorder-keys-idem-key";
    const payload1 = {
      expected: {
        caseId: VALID_CASE_ID,
        tradeReference: "TR-01",
        asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        amount: "100.0000000",
        expectedDestination: VALID_DESTINATION,
        reference: "INV-01",
        deadline: 600000,
        owner: VALID_OWNER,
        counterparty: VALID_DESTINATION,
      },
    };

    const res1 = await server.inject({
      method: "POST",
      url: "/v1/cases",
      headers: { "idempotency-key": idemKey },
      body: payload1,
    });
    assert.strictEqual(res1.statusCode, 201);

    // Identical data with different key order should still hit idempotency cache
    const payload2 = {
      expected: {
        owner: VALID_OWNER,
        counterparty: VALID_DESTINATION,
        deadline: 600000,
        reference: "INV-01",
        expectedDestination: VALID_DESTINATION,
        amount: "100.0000000",
        asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        tradeReference: "TR-01",
        caseId: VALID_CASE_ID,
      },
    };

    const res2 = await server.inject({
      method: "POST",
      url: "/v1/cases",
      headers: { "idempotency-key": idemKey },
      body: payload2,
    });
    assert.strictEqual(res2.statusCode, 201);
    assert.strictEqual(res2.headers["x-idempotent-replay"], "true");
  });
});
