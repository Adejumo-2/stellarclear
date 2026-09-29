import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient } from "@stellarclear/db";
import { createApiServer, type ApiServer } from "@stellarclear/api";
import type { ExpectedSettlement, ObservedSettlement, SettlementProof } from "@stellarclear/schemas";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";

function createTestServer(): { db: InMemoryDatabaseClient; server: ApiServer } {
  const db = new InMemoryDatabaseClient();
  const server = createApiServer(
    {
      port: 3000,
      host: "0.0.0.0",
      network: TEST_NETWORK,
      databaseUrl: "postgres://localhost:5432/test",
      contractId: TEST_CONTRACT_ID,
    },
    db
  );
  return { db, server };
}

describe("API Service - Settlement Proof Retrieval & Verification", () => {
  const validTerms: ExpectedSettlement = {
    caseId: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    tradeReference: "TRADE-PROOFS-001",
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "15000.50",
    expectedDestination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    reference: "INV-9999",
    deadline: 123456,
    owner: "GA2C5RFPE6GCKMY3US5PAB6UZLKIGAHWKXX2G6VRZZ63OOENWPQA7D75",
  };

  const validObs: ObservedSettlement = {
    txHash: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    ledger: 123450,
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "15000.50",
    destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    reference: "INV-9999",
    status: "SUCCESS",
    observedAt: "2026-09-29T12:00:00Z",
  };

  it("returns 400 when requesting proof for unobserved case", async () => {
    const { server } = createTestServer();

    // 1. Create case
    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: validTerms },
    });

    // 2. Proof request before observation
    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${validTerms.caseId}/proof`,
    });

    assert.strictEqual(res.statusCode, 400);
    const body = res.body as { error: { code: string } };
    assert.strictEqual(body.error.code, "PROOF_NOT_AVAILABLE");
  });

  it("generates and exports canonical SettlementProof after observation and reconciliation", async () => {
    const { server } = createTestServer();

    // 1. Create case
    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: validTerms },
    });

    // 2. Observe transaction
    await server.inject({
      method: "POST",
      url: `/v1/cases/${validTerms.caseId}/observe`,
      body: { observation: validObs },
    });

    // 3. Reconcile
    await server.inject({
      method: "POST",
      url: `/v1/cases/${validTerms.caseId}/reconcile`,
    });

    // 4. Retrieve proof
    const res = await server.inject({
      method: "GET",
      url: `/v1/cases/${validTerms.caseId}/proof`,
    });

    assert.strictEqual(res.statusCode, 200);
    const proof = res.body as SettlementProof;
    assert.strictEqual(proof.protocol, "STELLARCLEAR");
    assert.strictEqual(proof.version, "1.0.0");
    assert.strictEqual(proof.caseId, validTerms.caseId.toLowerCase());
    assert.strictEqual(proof.txHash, validObs.txHash.toLowerCase());
    assert.strictEqual(proof.result, "MATCHED");
    assert.strictEqual(proof.contractId, TEST_CONTRACT_ID);
    assert.strictEqual(proof.network, TEST_NETWORK);
    assert.ok(proof.termsCommitment);
    assert.ok(proof.observationCommitment);
  });

  it("independently verifies valid proof via POST /v1/proofs/verify", async () => {
    const { server } = createTestServer();

    // Setup case & get proof
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
    await server.inject({
      method: "POST",
      url: `/v1/cases/${validTerms.caseId}/reconcile`,
    });

    const proofRes = await server.inject({
      method: "GET",
      url: `/v1/cases/${validTerms.caseId}/proof`,
    });
    const proof = proofRes.body as SettlementProof;

    // Verify independently with documents
    const verifyRes = await server.inject({
      method: "POST",
      url: "/v1/proofs/verify",
      body: {
        proof,
        termsDocument: validTerms,
        observedDocument: validObs,
      },
    });

    assert.strictEqual(verifyRes.statusCode, 200);
    const verifyBody = verifyRes.body as { valid: boolean; reason?: string; recomputedTermsCommitment?: string };
    assert.strictEqual(verifyBody.valid, true);
    assert.strictEqual(verifyBody.recomputedTermsCommitment, proof.termsCommitment);
  });

  it("rejects tampered proof via POST /v1/proofs/verify", async () => {
    const { server } = createTestServer();

    // Setup case & get proof
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

    const proofRes = await server.inject({
      method: "GET",
      url: `/v1/cases/${validTerms.caseId}/proof`,
    });
    const proof = proofRes.body as SettlementProof;

    // Tamper with proof commitment
    const tamperedProof = {
      ...proof,
      termsCommitment: "0000000000000000000000000000000000000000000000000000000000000000",
    };

    const verifyRes = await server.inject({
      method: "POST",
      url: "/v1/proofs/verify",
      body: {
        proof: tamperedProof,
        termsDocument: validTerms,
      },
    });

    assert.strictEqual(verifyRes.statusCode, 200);
    const verifyBody = verifyRes.body as { valid: boolean; reason?: string };
    assert.strictEqual(verifyBody.valid, false);
    assert.ok((verifyBody.reason ?? "").includes("Terms commitment mismatch"));
  });
});
