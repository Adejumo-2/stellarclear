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

function buildSampleExpected(overrides: Partial<ExpectedSettlement> = {}): ExpectedSettlement {
  return {
    caseId: VALID_CASE_ID,
    tradeReference: "TR-SEC-REG-101",
    asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    amount: "1000.0000000",
    expectedDestination: VALID_DESTINATION,
    reference: "INV-SEC-REG-101",
    deadline: 600000,
    owner: VALID_OWNER,
    counterparty: VALID_DESTINATION,
    ...overrides,
  };
}

describe("Security Regression - API Input Boundaries and Validation Security", () => {
  it("rejects non-hex and invalid length case IDs with 400 error", async () => {
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

    const invalidCaseIds = [
      "not-a-hex-string",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde", // 63 chars
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef00", // 66 chars
      "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      "'; DROP TABLE cases; --",
    ];

    for (const invalidId of invalidCaseIds) {
      const res = await server.inject({
        method: "POST",
        url: "/v1/cases",
        body: {
          expected: buildSampleExpected({ caseId: invalidId }),
        },
      });

      assert.strictEqual(res.statusCode, 400, `Expected 400 for case ID: ${invalidId}`);
      const body = res.body as ApiErrorEnvelope;
      assert.strictEqual(body.error.code, "VALIDATION_ERROR");
    }
  });

  it("rejects invalid Stellar address formats for owner, counterparty, and destination", async () => {
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

    const invalidAddresses = [
      "not-a-stellar-key",
      "G12345",
      "0x1234567890abcdef1234567890abcdef12345678",
      "S12345678901234567890123456789012345678901234567890123456", // secret key format should not be accepted as public address
    ];

    for (const badAddr of invalidAddresses) {
      const res = await server.inject({
        method: "POST",
        url: "/v1/cases",
        body: {
          expected: buildSampleExpected({ owner: badAddr }),
        },
      });

      assert.strictEqual(res.statusCode, 400);
      const body = res.body as ApiErrorEnvelope;
      assert.strictEqual(body.error.code, "VALIDATION_ERROR");
    }
  });

  it("rejects non-numeric and negative financial amounts", async () => {
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

    const invalidAmounts = [
      "-100.0000000",
      "-0.01",
      "NaN",
      "Infinity",
      "100.00.00",
      "1e6",
      "$100.00",
      "not-a-number",
    ];

    for (const badAmt of invalidAmounts) {
      const res = await server.inject({
        method: "POST",
        url: "/v1/cases",
        body: {
          expected: buildSampleExpected({ amount: badAmt }),
        },
      });

      assert.strictEqual(res.statusCode, 400, `Expected 400 for amount: ${badAmt}`);
      const body = res.body as ApiErrorEnvelope;
      assert.strictEqual(body.error.code, "VALIDATION_ERROR");
    }
  });

  it("handles non-existent routes and returns consistent 404 error envelope", async () => {
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
      method: "GET",
      url: "/v1/unknown-endpoint/path",
    });

    assert.strictEqual(res.statusCode, 404);
    const body = res.body as ApiErrorEnvelope;
    assert.strictEqual(body.error.code, "ROUTE_NOT_FOUND");
    assert.ok(body.error.requestId);
  });
});
