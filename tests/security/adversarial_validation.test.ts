import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryDatabaseClient,
  CaseRepository,
  ObservationRepository,
  ReconciliationRepository,
  BreakRepository,
  AttestationRepository,
  DisputeRepository,
  ResolutionRepository,
  ContractEventRepository,
} from "@stellarclear/db";
import {
  createApiServer,
  SorobanSettlementAnchor,
  SettlementConsistencyChecker,
  type ApiErrorEnvelope,
  type CaseConsistencyResponse,
} from "@stellarclear/api";
import { SettlementStateSynchronizer, decodeContractEvent, type DecodedContractEvent } from "@stellarclear/indexer";
import {
  computeTermsCommitment,
  computeObservationCommitment,
  createSettlementProof,
  verifySettlementProof,
  canonicalStringify,
} from "@stellarclear/proof";
import { normalizeContractError, mapContractErrorCode } from "@stellarclear/sdk";
import type { ExpectedSettlement, ObservedSettlement, Attestation } from "@stellarclear/schemas";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";
const VALID_CASE_ID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const VALID_OWNER = "GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6ZN7JMTXNZBEWBIXXX";
const VALID_DESTINATION = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

function buildExpected(caseId = VALID_CASE_ID, overrides: Partial<ExpectedSettlement> = {}): ExpectedSettlement {
  return {
    caseId,
    tradeReference: `TR-ADV-${caseId.slice(0, 6)}`,
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "5000.0000000",
    expectedDestination: VALID_DESTINATION,
    reference: "INV-ADV-001",
    deadline: 600000,
    owner: VALID_OWNER,
    counterparty: VALID_DESTINATION,
    ...overrides,
  };
}

describe("Security Assurance - Comprehensive Adversarial Validation", () => {
  // 1. Smart-contract integration boundaries & Error normalization
  it("Scenario 1: Normalizes contract errors and protects against raw simulation leakage", () => {
    // Known contract error discriminants
    const err1 = mapContractErrorCode(1);
    assert.strictEqual(err1.code, "CONFLICT");

    const err6 = mapContractErrorCode(6);
    assert.strictEqual(err6.code, "UNAUTHORIZED");

    // Object with contract code
    const normalizedCode = normalizeContractError({ code: 3 });
    assert.strictEqual(normalizedCode.code, "CONFLICT");

    // Simulation error string containing contract error code
    const simError = { message: "HostError: Error(Contract, #4)" };
    const normalizedSim = normalizeContractError(simError);
    assert.strictEqual(normalizedSim.code, "CONFLICT");

    // RPC failure
    const rpcError = normalizeContractError(new Error("RPC fetch failed: ECONNREFUSED"));
    assert.strictEqual(rpcError.code, "RPC_ERROR");
  });

  // 2. Indexer Event Ingestion Malformed & Hostile Payloads
  it("Scenario 2: Safely handles malformed and hostile indexer event payloads without crashing", () => {
    // Malformed topics
    assert.strictEqual(decodeContractEvent({
      type: "contract",
      ledger: 100,
      contractId: TEST_CONTRACT_ID,
      id: "1",
      topic: [],
    }), null);

    assert.strictEqual(decodeContractEvent({
      type: "contract",
      ledger: 100,
      contractId: TEST_CONTRACT_ID,
      id: "2",
      topic: undefined,
    }), null);

    // Unknown event name
    assert.strictEqual(decodeContractEvent({
      type: "contract",
      ledger: 100,
      contractId: TEST_CONTRACT_ID,
      id: "3",
      topic: ["UnknownHostEvent", "extra"],
    }), null);
  });

  // 3. Replay and Duplicate-Event Handling
  it("Scenario 3: Replaying identical event batches multiple times creates no duplicate database records", async () => {
    const db = new InMemoryDatabaseClient();
    const synchronizer = new SettlementStateSynchronizer(db, TEST_NETWORK);
    const caseRepo = new CaseRepository(db);
    const obsRepo = new ObservationRepository(db);
    const recRepo = new ReconciliationRepository(db);
    const breakRepo = new BreakRepository(db);
    const attestationRepo = new AttestationRepository(db);
    const eventRepo = new ContractEventRepository(db);

    const replayCaseId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const batch: DecodedContractEvent[] = [
      {
        type: "CaseCreated",
        contractId: TEST_CONTRACT_ID,
        ledger: 100,
        txHash: "0x_create_tx",
        cursor: "c_1",
        topicXdr: "A==",
        dataXdr: "A==",
        caseId: replayCaseId,
        payload: { caseId: replayCaseId, owner: VALID_OWNER, tradeReference: "TR-REPLAY" },
      },
      {
        type: "ObservationRecorded",
        contractId: TEST_CONTRACT_ID,
        ledger: 105,
        txHash: "0x_obs_tx",
        cursor: "c_2",
        topicXdr: "A==",
        dataXdr: "A==",
        caseId: replayCaseId,
        payload: { caseId: replayCaseId, observer: VALID_OWNER, txHash: "0x_payment_tx", observedLedger: 104 },
      },
      {
        type: "CaseMatched",
        contractId: TEST_CONTRACT_ID,
        ledger: 110,
        txHash: "0x_match_tx",
        cursor: "c_3",
        topicXdr: "A==",
        dataXdr: "A==",
        caseId: replayCaseId,
        payload: { caseId: replayCaseId, observer: VALID_OWNER },
      },
      {
        type: "AttestationSubmitted",
        contractId: TEST_CONTRACT_ID,
        ledger: 115,
        txHash: "0x_attest_tx",
        cursor: "c_4",
        topicXdr: "A==",
        dataXdr: "A==",
        caseId: replayCaseId,
        payload: { caseId: replayCaseId, attestor: VALID_OWNER, role: "OWNER" },
      },
      {
        type: "CaseFinalized",
        contractId: TEST_CONTRACT_ID,
        ledger: 120,
        txHash: "0x_finalize_tx",
        cursor: "c_5",
        topicXdr: "A==",
        dataXdr: "A==",
        caseId: replayCaseId,
        payload: { caseId: replayCaseId, finalizedAtLedger: 120 },
      },
    ];

    // Ingest 5 times in a row
    for (let i = 0; i < 5; i++) {
      await synchronizer.syncBatch(batch);
    }

    // Verify row counts
    const cases = await caseRepo.list(TEST_NETWORK);
    assert.strictEqual(cases.length, 1);
    assert.strictEqual(cases[0].status, "FINALIZED");

    const obs = await obsRepo.findByCaseId(replayCaseId, TEST_NETWORK);
    assert.ok(obs);

    const rec = await recRepo.findByCaseId(replayCaseId, TEST_NETWORK);
    assert.ok(rec);

    const attestations = await attestationRepo.listByCaseId(replayCaseId, TEST_NETWORK);
    assert.strictEqual(attestations.length, 1);

    const events = await eventRepo.listByCaseId(replayCaseId, TEST_NETWORK);
    assert.strictEqual(events.length, 5); // 5 unique cursors
  });

  // 4. Out-of-Order Lifecycle Events & Status Regression Protection
  it("Scenario 4: Replaying older events after case finalization does not regress case status", async () => {
    const db = new InMemoryDatabaseClient();
    const synchronizer = new SettlementStateSynchronizer(db, TEST_NETWORK);
    const caseRepo = new CaseRepository(db);

    const outOfOrderCaseId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    // 1. Ingest CaseFinalized first
    await synchronizer.syncEvent({
      type: "CaseFinalized",
      contractId: TEST_CONTRACT_ID,
      ledger: 300,
      txHash: "0x_final_tx",
      cursor: "c_final",
      topicXdr: "A==",
      dataXdr: "A==",
      caseId: outOfOrderCaseId,
      payload: { caseId: outOfOrderCaseId, finalizedAtLedger: 300 },
    });

    const finalCase = await caseRepo.findById(outOfOrderCaseId, TEST_NETWORK);
    assert.strictEqual(finalCase?.status, "FINALIZED");

    // 2. Replay older ObservationRecorded event
    await synchronizer.syncEvent({
      type: "ObservationRecorded",
      contractId: TEST_CONTRACT_ID,
      ledger: 250,
      txHash: "0x_obs_older",
      cursor: "c_obs_older",
      topicXdr: "A==",
      dataXdr: "A==",
      caseId: outOfOrderCaseId,
      payload: { caseId: outOfOrderCaseId, observer: VALID_OWNER, txHash: "0x_older_tx", observedLedger: 240 },
    });

    const afterObs = await caseRepo.findById(outOfOrderCaseId, TEST_NETWORK);
    assert.strictEqual(afterObs?.status, "FINALIZED"); // Must remain FINALIZED
    assert.strictEqual(afterObs?.observation_tx_hash, "0x_obs_older"); // References updated

    // 3. Replay older DisputeOpened event
    await synchronizer.syncEvent({
      type: "DisputeOpened",
      contractId: TEST_CONTRACT_ID,
      ledger: 270,
      txHash: "0x_dispute_older",
      cursor: "c_dispute_older",
      topicXdr: "A==",
      dataXdr: "A==",
      caseId: outOfOrderCaseId,
      payload: { caseId: outOfOrderCaseId, initiator: VALID_OWNER, disputeCommitment: "11".repeat(32) },
    });

    const afterDispute = await caseRepo.findById(outOfOrderCaseId, TEST_NETWORK);
    assert.strictEqual(afterDispute?.status, "FINALIZED"); // Must remain FINALIZED
  });

  // 5. API Authorization, Validation & Path Normalization
  it("Scenario 5: Rejects path traversal and malformed hex IDs consistently", async () => {
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

    const traversalPaths = [
      "/v1/cases/../../etc/passwd",
      "/v1/cases/12345/observe",
      "/v1/cases/ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ/consistency",
    ];

    for (const path of traversalPaths) {
      const res = await server.inject({
        method: "GET",
        url: path,
      });
      assert.ok(res.statusCode === 400 || res.statusCode === 404);
      const body = res.body as ApiErrorEnvelope;
      assert.ok(body.error && body.error.code);
    }
  });

  // 6. Settlement Lifecycle Transition Enforcement
  it("Scenario 6: Enforces valid state transitions on dispute, resolve, and finalize API endpoints", async () => {
    const db = new InMemoryDatabaseClient();
    const anchor = new SorobanSettlementAnchor();
    const caseRepo = new CaseRepository(db);
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

    const testCaseId = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    const expected = buildExpected(testCaseId);

    // 1. Create case (status: OPEN)
    await server.inject({
      method: "POST",
      url: "/v1/cases",
      body: { expected },
    });

    // 2. Attempt to resolve when case is OPEN (must be DISPUTED)
    const badResolveRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${testCaseId}/resolve`,
      body: {
        resolver: VALID_OWNER,
        resolutionType: "ARBITRATION",
      },
    });
    assert.strictEqual(badResolveRes.statusCode, 400);
    const badResolveBody = badResolveRes.body as ApiErrorEnvelope;
    assert.strictEqual(badResolveBody.error.code, "INVALID_STATE");

    // 3. Attempt to finalize when case is OPEN (must be MATCHED or RESOLVED)
    const badFinalizeRes = await server.inject({
      method: "POST",
      url: `/v1/cases/${testCaseId}/finalize`,
      body: { finalizer: VALID_OWNER },
    });
    assert.strictEqual(badFinalizeRes.statusCode, 400);
    const badFinalizeBody = badFinalizeRes.body as ApiErrorEnvelope;
    assert.strictEqual(badFinalizeBody.error.code, "INVALID_STATE");
  });

  // 7. Settlement Proof Cryptographic Verification Security
  it("Scenario 7: Rejects tampered settlement proof payloads", () => {
    const expected = buildExpected();
    const observed: ObservedSettlement = {
      txHash: "33".repeat(32),
      ledger: 500,
      asset: expected.asset,
      amount: expected.amount,
      destination: expected.expectedDestination,
      status: "SUCCESS",
      observedAt: new Date().toISOString(),
    };

    const proof = createSettlementProof({
      caseId: expected.caseId,
      terms: expected,
      observation: observed,
      finalizedLedger: 510,
      result: "MATCHED",
      attestations: [],
      contractId: TEST_CONTRACT_ID,
      network: TEST_NETWORK,
    });

    // 1. Tamper with terms document
    const tamperedTerms = { ...expected, amount: "99999.0000000" };
    const v1 = verifySettlementProof(proof, {
      terms: tamperedTerms,
      observation: observed,
      expectedContractId: TEST_CONTRACT_ID,
      expectedNetwork: TEST_NETWORK,
    });
    assert.strictEqual(v1.valid, false);

    // 2. Tamper with observation document
    const tamperedObs = { ...observed, destination: "GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6ZN7JMTXNZBEWBIXXX" };
    const v2 = verifySettlementProof(proof, {
      terms: expected,
      observation: tamperedObs,
      expectedContractId: TEST_CONTRACT_ID,
      expectedNetwork: TEST_NETWORK,
    });
    assert.strictEqual(v2.valid, false);

    // 3. Tamper with contract ID
    const v3 = verifySettlementProof(proof, {
      terms: expected,
      observation: observed,
      expectedContractId: "CBAD000000000000000000000000000000000000000000000000000000000000",
      expectedNetwork: TEST_NETWORK,
    });
    assert.strictEqual(v3.valid, false);
  });

  // 8. Error Handling & Information Leakage
  it("Scenario 8: API error envelopes sanitize internal messages and omit sensitive details", async () => {
    const db = new InMemoryDatabaseClient();
    const anchor = new SorobanSettlementAnchor();
    const server = createApiServer(
      {
        port: 3000,
        host: "0.0.0.0",
        network: TEST_NETWORK,
        databaseUrl: "postgres://user:supersecretpassword@localhost:5432/testdb",
        contractId: TEST_CONTRACT_ID,
      },
      db,
      anchor
    );

    const notFoundRes = await server.inject({
      method: "GET",
      url: `/v1/cases/${VALID_CASE_ID}`,
    });
    assert.strictEqual(notFoundRes.statusCode, 404);
    const body = notFoundRes.body as ApiErrorEnvelope;
    assert.ok(body.error.requestId);
    assert.strictEqual(typeof body.error.message, "string");
    assert.ok(!JSON.stringify(body).includes("supersecretpassword"));
  });
});
