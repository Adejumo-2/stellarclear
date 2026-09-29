import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient } from "@stellarclear/db";
import { createApiServer, SorobanSettlementAnchor } from "@stellarclear/api";
import { computeTermsCommitment } from "@stellarclear/proof";
import type { ExpectedSettlement } from "@stellarclear/schemas";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";

describe("API Service - Replay Protection & Conflict Detection", () => {
  const sampleTerms: ExpectedSettlement = {
    caseId: "aabbccddeeff0011aabbccddeeff0011aabbccddeeff0011aabbccddeeff0011",
    owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    tradeReference: "TRADE-REPLAY-01",
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "50000.00",
    expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    reference: "INV-REPLAY-01",
    deadline: 1500000,
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

  it("rejects duplicate case creation with 409 CONFLICT when no idempotency key is supplied", async () => {
    const { server } = setup();

    const res1 = await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: sampleTerms },
    });
    assert.strictEqual(res1.statusCode, 201);

    // Second creation attempt without idempotency key
    const res2 = await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: sampleTerms },
    });
    assert.strictEqual(res2.statusCode, 409);
    const body2 = res2.body as { error: { code: string; message: string } };
    assert.strictEqual(body2.error.code, "CONFLICT");
  });

  it("handles duplicate attestation from the same attestor appropriately", async () => {
    const { server } = setup();

    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: sampleTerms },
    });

    const termsCommitment = computeTermsCommitment(sampleTerms);

    // First attestation
    const attest1 = await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/attest`,
      body: {
        role: "OWNER",
        attestor: sampleTerms.owner,
        commitment: termsCommitment,
      },
    });
    assert.strictEqual(attest1.statusCode, 201);

    // Second attestation from same attestor
    const attest2 = await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/attest`,
      body: {
        role: "OWNER",
        attestor: sampleTerms.owner,
        commitment: termsCommitment,
      },
    });
    // Should succeed idempotently or return recorded attestation
    assert.strictEqual(attest2.statusCode, 201);
  });

  it("isolates idempotency keys across different paths and methods", async () => {
    const { server } = setup();
    const sharedIdempotencyKey = "shared-idemp-key-100";

    // 1. Create case with key
    const createRes = await server.inject({
      method: "POST",
      url: "/v1/cases",
      headers: { "idempotency-key": sharedIdempotencyKey },
      body: { expected: sampleTerms },
    });
    assert.strictEqual(createRes.statusCode, 201);

    // 2. Different path with same key should not return cached creation response
    const obsRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${sampleTerms.caseId}/observe`,
      headers: { "idempotency-key": sharedIdempotencyKey },
      body: {
        observation: {
          txHash: "1111222233334444555566667777888811112222333344445555666677778888",
          ledger: 1450000,
          asset: sampleTerms.asset,
          amount: sampleTerms.amount,
          destination: sampleTerms.expectedDestination,
          status: "SUCCESS",
          observedAt: "2026-09-29T12:00:00.000Z",
        },
      },
    });
    assert.strictEqual(obsRes.statusCode, 200);
    const obsBody = obsRes.body as { status: string };
    assert.strictEqual(obsBody.status, "OBSERVED");
  });
});
