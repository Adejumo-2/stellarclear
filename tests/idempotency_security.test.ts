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

function sampleExpectedSettlement(): ExpectedSettlement {
  return {
    caseId: VALID_CASE_ID,
    tradeReference: "TR-SEC-101",
    asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    amount: "10000.0000000",
    expectedDestination: VALID_DESTINATION,
    reference: "INV-SEC-101",
    deadline: 600000,
    owner: VALID_OWNER,
    counterparty: VALID_DESTINATION,
  };
}

describe("API Service - Idempotency and Replay Security", () => {
  it("rejects invalid idempotency key syntax with 400 MALFORMED_REQUEST", async () => {
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

    const res = await server.inject({
      method: "POST",
      url: "/v1/cases",
      headers: {
        "idempotency-key": "invalid key with spaces and #!$",
      },
      body: {
        expected: sampleExpectedSettlement(),
      },
    });

    assert.strictEqual(res.statusCode, 400);
    const body = res.body as ApiErrorEnvelope;
    assert.strictEqual(body.error.code, "MALFORMED_REQUEST");
  });

  it("returns cached response with x-idempotent-replay header on identical replayed requests", async () => {
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

    const idempotencyKey = "idem-case-create-001";
    const payload = { expected: sampleExpectedSettlement() };

    const firstRes = await server.inject({
      method: "POST",
      url: "/v1/cases",
      headers: {
        "idempotency-key": idempotencyKey,
      },
      body: payload,
    });

    assert.strictEqual(firstRes.statusCode, 201);
    const firstBody = firstRes.body as { caseId: string; termsCommitment: string };
    assert.strictEqual(firstRes.headers["x-idempotent-replay"], undefined);

    const secondRes = await server.inject({
      method: "POST",
      url: "/v1/cases",
      headers: {
        "idempotency-key": idempotencyKey,
      },
      body: payload,
    });

    assert.strictEqual(secondRes.statusCode, 201);
    assert.strictEqual(secondRes.headers["x-idempotent-replay"], "true");
    const secondBody = secondRes.body as { caseId: string; termsCommitment: string };
    assert.strictEqual(secondBody.caseId, firstBody.caseId);
    assert.strictEqual(secondBody.termsCommitment, firstBody.termsCommitment);
  });

  it("rejects reused idempotency key with conflicting payload with 409 IDEMPOTENCY_CONFLICT", async () => {
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

    const idempotencyKey = "idem-case-conflict-002";
    const payload1 = { expected: sampleExpectedSettlement() };
    const payload2 = {
      expected: {
        ...sampleExpectedSettlement(),
        amount: "99999.0000000",
      },
    };

    const res1 = await server.inject({
      method: "POST",
      url: "/v1/cases",
      headers: {
        "idempotency-key": idempotencyKey,
      },
      body: payload1,
    });
    assert.strictEqual(res1.statusCode, 201);

    const res2 = await server.inject({
      method: "POST",
      url: "/v1/cases",
      headers: {
        "idempotency-key": idempotencyKey,
      },
      body: payload2,
    });

    assert.strictEqual(res2.statusCode, 409);
    const body2 = res2.body as ApiErrorEnvelope;
    assert.strictEqual(body2.error.code, "IDEMPOTENCY_CONFLICT");
    assert.ok(body2.error.message.includes("already used with a different request payload"));
  });
});
