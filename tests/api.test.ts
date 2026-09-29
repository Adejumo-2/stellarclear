import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDatabaseClient } from "@stellarclear/db";
import { createApiServer } from "@stellarclear/api";
import type { ExpectedSettlement, ObservedSettlement } from "@stellarclear/schemas";

const VALID_CASE_ID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const VALID_TX_HASH = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const VALID_OWNER = "GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6ZN7JMTXNZBEWBIXXX";
const VALID_DESTINATION = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const SAMPLE_EXPECTED: ExpectedSettlement = {
  caseId: VALID_CASE_ID,
  tradeReference: "TR-500",
  asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  amount: "500.0000000",
  expectedDestination: VALID_DESTINATION,
  reference: "INV-500",
  deadline: 600000,
  owner: VALID_OWNER,
  counterparty: VALID_DESTINATION,
};

const SAMPLE_OBSERVED: ObservedSettlement = {
  txHash: VALID_TX_HASH,
  ledger: 599990,
  asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  amount: "500.0000000",
  destination: VALID_DESTINATION,
  reference: "INV-500",
  status: "SUCCESS",
  observedAt: "2026-09-29T12:00:00.000Z",
};

describe("API Service - Health & Readiness", () => {
  const dbClient = createDatabaseClient({
    databaseUrl: "postgresql://postgres:postgres@localhost:5432/stellarclear_test",
    network: "testnet",
  });
  const server = createApiServer(
    {
      port: 3000,
      host: "0.0.0.0",
      network: "testnet",
      databaseUrl: "postgresql://localhost",
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
    },
    dbClient
  );

  it("responds to GET /health", async () => {
    const res = await server.inject({ method: "GET", url: "/health" });
    assert.strictEqual(res.statusCode, 200);
    const body = res.body as { status: string };
    assert.strictEqual(body.status, "ok");
  });

  it("responds to GET /ready", async () => {
    const res = await server.inject({ method: "GET", url: "/ready" });
    assert.strictEqual(res.statusCode, 200);
    const body = res.body as { status: string };
    assert.strictEqual(body.status, "ok");
  });
});

describe("API Service - Case Operations Endpoints", () => {
  const dbClient = createDatabaseClient({
    databaseUrl: "postgresql://postgres:postgres@localhost:5432/stellarclear_test",
    network: "testnet",
  });
  const server = createApiServer(
    {
      port: 3000,
      host: "0.0.0.0",
      network: "testnet",
      databaseUrl: "postgresql://localhost",
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
    },
    dbClient
  );

  it("creates a settlement case via POST /v1/cases and rejects duplicates", async () => {
    // 1. Success creation
    const res = await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: SAMPLE_EXPECTED },
    });
    assert.strictEqual(res.statusCode, 201);
    const body = res.body as { caseId: string; status: string; termsCommitment: string };
    assert.strictEqual(body.caseId, VALID_CASE_ID);
    assert.strictEqual(body.status, "OPEN");
    assert.strictEqual(body.termsCommitment.length, 64);

    // 2. Duplicate rejection -> 409 Conflict
    const dupRes = await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: SAMPLE_EXPECTED },
    });
    assert.strictEqual(dupRes.statusCode, 409);
  });

  it("returns 400 Bad Request on invalid case payload", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: { ...SAMPLE_EXPECTED, amount: "invalid-number" } },
    });
    assert.strictEqual(res.statusCode, 400);
  });

  it("retrieves an existing case via GET /v1/cases/:caseId", async () => {
    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${VALID_CASE_ID}`,
    });
    assert.strictEqual(res.statusCode, 200);
    const body = res.body as { caseId: string; status: string; tradeReference: string };
    assert.strictEqual(body.caseId, VALID_CASE_ID);
    assert.strictEqual(body.tradeReference, "TR-500");
  });

  it("returns 404 for non-existent case", async () => {
    const missingCaseId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${missingCaseId}`,
    });
    assert.strictEqual(res.statusCode, 404);
  });

  it("records observed transaction via POST /v1/cases/:caseId/observe", async () => {
    const res = await server.inject({
      method: "POST",
      url: `/v1/cases/${VALID_CASE_ID}/observe`,
      body: { observation: SAMPLE_OBSERVED },
    });
    assert.strictEqual(res.statusCode, 200);
    const body = res.body as { caseId: string; status: string };
    assert.strictEqual(body.status, "OBSERVED");
  });

  it("reconciles settlement via POST /v1/cases/:caseId/reconcile and lists breaks", async () => {
    const res = await server.inject({
      method: "POST",
      url: `/v1/cases/${VALID_CASE_ID}/reconcile`,
    });
    assert.strictEqual(res.statusCode, 200);
    const body = res.body as { status: string; matched: boolean };
    assert.strictEqual(body.status, "MATCHED");
    assert.strictEqual(body.matched, true);

    // GET /v1/cases/:caseId/breaks
    const breaksRes = await server.inject({
      method: "GET",
      url: `/v1/cases/${VALID_CASE_ID}/breaks`,
    });
    assert.strictEqual(breaksRes.statusCode, 200);
    const breaksBody = breaksRes.body as { breaks: unknown[] };
    assert.strictEqual(breaksBody.breaks.length, 0);
  });
});
