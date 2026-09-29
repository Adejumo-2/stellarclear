import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient } from "@stellarclear/db";
import { createApiServer, SorobanSettlementAnchor } from "@stellarclear/api";
import { computeTermsCommitment, computeObservationCommitment } from "@stellarclear/proof";
import type { ExpectedSettlement, ObservedSettlement, SettlementProof } from "@stellarclear/schemas";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";

describe("Integration - Settlement Match Workflow", () => {
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

  it("handles multi-party attestation and complete settlement match verification pipeline", async () => {
    const { server } = setup();

    const terms: ExpectedSettlement = {
      caseId: "1212121212121212121212121212121212121212121212121212121212121212",
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      tradeReference: "FX-SPOT-EURUSD-001",
      asset: "EURC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "1000000.0000000",
      expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      reference: "TRADE-REF-100",
      deadline: 2000000,
    };

    const observed: ObservedSettlement = {
      txHash: "3434343434343434343434343434343434343434343434343434343434343434",
      ledger: 1999900,
      asset: "EURC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "1000000.0000000",
      destination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      reference: "TRADE-REF-100",
      status: "SUCCESS",
      observedAt: "2026-09-29T15:00:00.000Z",
    };

    // 1. Create Case
    const createRes = await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected: terms },
    });
    assert.strictEqual(createRes.statusCode, 201);

    // 2. Observe Settlement
    const obsRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${terms.caseId}/observe`,
      body: { observation: observed },
    });
    assert.strictEqual(obsRes.statusCode, 200);

    // 3. Reconcile
    const recRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${terms.caseId}/reconcile`,
    });
    assert.strictEqual(recRes.statusCode, 200);
    const recBody = recRes.body as { status: string; matched: boolean };
    assert.strictEqual(recBody.status, "MATCHED");
    assert.strictEqual(recBody.matched, true);

    // 4. Owner & Counterparty Attestations
    const termsCommitment = computeTermsCommitment(terms);
    const obsCommitment = computeObservationCommitment(observed);

    const ownerAttestRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${terms.caseId}/attest`,
      body: {
        role: "OWNER",
        attestor: terms.owner,
        commitment: termsCommitment,
      },
    });
    assert.strictEqual(ownerAttestRes.statusCode, 201);

    const cpAttestRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${terms.caseId}/attest`,
      body: {
        role: "COUNTERPARTY",
        attestor: terms.counterparty,
        commitment: obsCommitment,
      },
    });
    assert.strictEqual(cpAttestRes.statusCode, 201);

    // 5. Fetch Attestations List
    const attestListRes = await server.inject({
      method: "GET",
      url: `/v1/cases/${terms.caseId}/attestations`,
    });
    assert.strictEqual(attestListRes.statusCode, 200);
    const attestListBody = attestListRes.body as { attestations: unknown[] };
    assert.strictEqual(attestListBody.attestations.length, 2);

    // 6. Generate Proof
    const proofRes = await server.inject({
      method: "GET",
      url: `/v1/cases/${terms.caseId}/proof`,
    });
    assert.strictEqual(proofRes.statusCode, 200);
    const proof = proofRes.body as SettlementProof;
    assert.strictEqual(proof.attestations.length, 2);

    // 7. Verify Proof
    const verifyRes = await server.inject({
      method: "POST",
      url: "/v1/proofs/verify",
      body: {
        proof,
        termsDocument: terms,
        observedDocument: observed,
      },
    });
    assert.strictEqual(verifyRes.statusCode, 200);
    assert.strictEqual((verifyRes.body as { valid: boolean }).valid, true);

    // 8. Finalize Case
    const finRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${terms.caseId}/finalize`,
    });
    assert.strictEqual(finRes.statusCode, 200);
  });
});
