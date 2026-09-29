import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient, type IDatabaseClient, type QueryResult } from "@stellarclear/db";
import {
  createApiServer,
  SorobanSettlementAnchor,
  type HealthResponse,
  type ReadinessResponse,
} from "@stellarclear/api";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";

describe("API Service - Health and Readiness Checks", () => {
  it("returns 200 OK and health statistics on GET /health", async () => {
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
      url: "/health",
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.body as HealthResponse;
    assert.strictEqual(body.status, "ok");
    assert.strictEqual(body.version, "0.1.0");
    assert.ok(typeof body.uptimeSeconds === "number");
    assert.ok(body.timestamp);
  });

  it("returns 200 ready on GET /ready when all dependencies are healthy", async () => {
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
      url: "/ready",
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.body as ReadinessResponse;
    assert.strictEqual(body.status, "ready");
    assert.strictEqual(body.network, TEST_NETWORK);
    assert.strictEqual(body.contractId, TEST_CONTRACT_ID);
    assert.strictEqual(body.services.database.status, "up");
    assert.strictEqual(body.services.sorobanRpc.status, "up");
    assert.strictEqual(body.services.settlementRegistry.status, "up");
    assert.strictEqual(body.services.indexer.status, "up");
  });

  it("returns 503 not_ready on GET /ready when database query fails", async () => {
    const failingDb: IDatabaseClient = {
      async query<T = unknown>(_sql: string, _params?: unknown[]): Promise<QueryResult<T>> {
        throw new Error("Connection refused: database offline");
      },
      async withTransaction<T>(_fn: (tx: IDatabaseClient) => Promise<T>): Promise<T> {
        throw new Error("Connection refused");
      },
      async close(): Promise<void> {},
    };

    const anchor = new SorobanSettlementAnchor();
    const server = createApiServer(
      {
        port: 3000,
        host: "0.0.0.0",
        network: TEST_NETWORK,
        databaseUrl: "postgres://localhost:5432/test",
        contractId: TEST_CONTRACT_ID,
      },
      failingDb,
      anchor
    );

    const res = await server.inject({
      method: "GET",
      url: "/ready",
    });

    assert.strictEqual(res.statusCode, 503);
    const body = res.body as ReadinessResponse;
    assert.strictEqual(body.status, "not_ready");
    assert.strictEqual(body.services.database.status, "down");
    assert.ok(body.services.database.error?.includes("Connection refused"));
  });
});
