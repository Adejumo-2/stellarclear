import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient } from "@stellarclear/db";
import {
  createApiServer,
  SorobanSettlementAnchor,
  formatApiError,
  detectUnsafeDefaults,
  validateProductionConfig,
  type ApiErrorEnvelope,
} from "@stellarclear/api";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";

describe("API Service - Security and Payload Hardening", () => {
  it("rejects oversized request payloads with 413 PAYLOAD_TOO_LARGE", async () => {
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

    // Create a payload larger than 1MB
    const largeString = "x".repeat(1024 * 1024 + 50);
    const oversizedPayload = {
      expected: {
        largeField: largeString,
      },
    };

    const res = await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: oversizedPayload,
    });

    assert.strictEqual(res.statusCode, 413);
    const body = res.body as ApiErrorEnvelope;
    assert.strictEqual(body.error.code, "PAYLOAD_TOO_LARGE");
    assert.ok(body.error.message.includes("exceeds maximum allowed size"));
    assert.ok(body.error.requestId);
  });

  it("sanitizes error details to avoid leaking DB connection strings or credentials", () => {
    const sensitiveDetails = "Error connecting to postgres://user:secret_password@db.internal:5432/prod_db with stack at ...";
    const envelope = formatApiError("INTERNAL_SERVER_ERROR", "Database error", "req-123", sensitiveDetails);

    assert.strictEqual(envelope.error.code, "INTERNAL_SERVER_ERROR");
    assert.strictEqual(envelope.error.message, "Database error");
    assert.strictEqual(envelope.error.requestId, "req-123");
    assert.strictEqual(envelope.error.details, undefined);
  });

  it("detects unsafe defaults in production configuration", () => {
    const devConfig = {
      port: 3000,
      host: "0.0.0.0",
      network: "mainnet",
      databaseUrl: "postgres://localhost:5432/dev",
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: "Test SDF Network ; September 2015",
      enableAnchoring: true,
    };

    const warnings = detectUnsafeDefaults(devConfig, true);
    assert.ok(warnings.length >= 2);
    assert.ok(warnings.some((w: string) => w.includes("placeholder contractId")));
    assert.ok(warnings.some((w: string) => w.includes("Testnet network passphrase")));

    const validation = validateProductionConfig(devConfig, true);
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors.length > 0);
  });

  it("handles malformed JSON / invalid schemas gracefully with 400 error code", async () => {
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
      body: { invalid: "data" },
    });

    assert.strictEqual(res.statusCode, 400);
    const body = res.body as ApiErrorEnvelope;
    assert.strictEqual(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.error.requestId);
  });
});
