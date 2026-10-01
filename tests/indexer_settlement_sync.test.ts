import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient, CaseRepository, ObservationRepository, ReconciliationRepository } from "@stellarclear/db";
import { SettlementStateSynchronizer, type DecodedContractEvent } from "@stellarclear/indexer";

const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const TEST_NETWORK = "testnet";

describe("Indexer Service - Settlement State Synchronization", () => {
  const caseId = "1010101010101010101010101010101010101010101010101010101010101010";

  function setup() {
    const db = new InMemoryDatabaseClient();
    const caseRepo = new CaseRepository(db);
    const obsRepo = new ObservationRepository(db);
    const recRepo = new ReconciliationRepository(db);
    const synchronizer = new SettlementStateSynchronizer(db, TEST_NETWORK);
    return { db, caseRepo, obsRepo, recRepo, synchronizer };
  }

  it("synchronizes case creation and updates ledger checkpoints", async () => {
    const { caseRepo, synchronizer } = setup();

    // 1. Initial DB case
    const now = new Date();
    await caseRepo.insert({
      id: caseId,
      network: TEST_NETWORK,
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      trade_reference: "TR-SYNC-001",
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "10000.00",
      expected_destination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      terms_commitment: "a".repeat(64),
      expires_at_ledger: 1000000,
      status: "OPEN",
      created_at: now,
      updated_at: now,
    });

    // 2. Process CaseCreated event
    const event: DecodedContractEvent = {
      type: "CaseCreated",
      contractId: TEST_CONTRACT_ID,
      ledger: 990000,
      txHash: "0x_create_tx_hash_1",
      cursor: "cursor_1",
      topicXdr: "AAAAAA==",
      dataXdr: "AAAAAA==",
      caseId,
      payload: {
        caseId,
        owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
        expiresAtLedger: 1000000,
      },
    };

    const synced = await synchronizer.syncEvent(event);
    assert.strictEqual(synced, true);

    const updated = await caseRepo.findById(caseId, TEST_NETWORK);
    assert.strictEqual(updated?.create_tx_hash, "0x_create_tx_hash_1");
    assert.strictEqual(Number(updated?.confirmed_at_ledger), 990000);
    assert.strictEqual(updated?.submission_status, "CONFIRMED");
  });

  it("synchronizes observation, match, attestation, and finalization in batch idempotently", async () => {
    const { caseRepo, obsRepo, recRepo, synchronizer } = setup();

    const now = new Date();
    await caseRepo.insert({
      id: caseId,
      network: TEST_NETWORK,
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      trade_reference: "TR-SYNC-002",
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "50000.00",
      expected_destination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      terms_commitment: "b".repeat(64),
      expires_at_ledger: 1000000,
      status: "OPEN",
      created_at: now,
      updated_at: now,
    });

    await obsRepo.insert({
      network: TEST_NETWORK,
      case_id: caseId,
      observer: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      tx_hash: "tx_obs_123",
      observed_ledger: 991000,
      observation_commitment: "c".repeat(64),
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "50000.00",
      destination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      status: "SUCCESS",
      observed_at: now,
    });

    const events: DecodedContractEvent[] = [
      {
        type: "ObservationRecorded",
        contractId: TEST_CONTRACT_ID,
        ledger: 991000,
        txHash: "0x_obs_tx_chain",
        cursor: "cursor_2",
        topicXdr: "AAAAAA==",
        dataXdr: "AAAAAA==",
        caseId,
        payload: { caseId, observer: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ", observedLedger: 991000 },
      },
      {
        type: "CaseMatched",
        contractId: TEST_CONTRACT_ID,
        ledger: 992000,
        txHash: "0x_match_tx_chain",
        cursor: "cursor_3",
        topicXdr: "AAAAAA==",
        dataXdr: "AAAAAA==",
        caseId,
        payload: { caseId, observer: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ" },
      },
      {
        type: "AttestationSubmitted",
        contractId: TEST_CONTRACT_ID,
        ledger: 993000,
        txHash: "0x_attest_tx_chain",
        cursor: "cursor_4",
        topicXdr: "AAAAAA==",
        dataXdr: "AAAAAA==",
        caseId,
        payload: { caseId, attestor: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ", role: "OWNER" },
      },
      {
        type: "CaseFinalized",
        contractId: TEST_CONTRACT_ID,
        ledger: 994000,
        txHash: "0x_finalize_tx_chain",
        cursor: "cursor_5",
        topicXdr: "AAAAAA==",
        dataXdr: "AAAAAA==",
        caseId,
        payload: { caseId, finalizedAtLedger: 994000 },
      },
    ];

    const stats = await synchronizer.syncBatch(events);
    assert.strictEqual(stats.eventsProcessed, 4);
    assert.strictEqual(stats.casesUpdated, 4);
    assert.strictEqual(stats.lastLedgerSequence, 994000);

    const finalizedCase = await caseRepo.findById(caseId, TEST_NETWORK);
    assert.strictEqual(finalizedCase?.status, "FINALIZED");
    assert.strictEqual(finalizedCase?.observation_tx_hash, "0x_obs_tx_chain");
    assert.strictEqual(finalizedCase?.reconciliation_tx_hash, "0x_match_tx_chain");
    assert.strictEqual(finalizedCase?.attestation_tx_hash, "0x_attest_tx_chain");
    assert.strictEqual(finalizedCase?.finalization_tx_hash, "0x_finalize_tx_chain");
    assert.strictEqual(Number(finalizedCase?.finalized_at_ledger), 994000);

    // Replay same batch - must be completely idempotent
    const replayStats = await synchronizer.syncBatch(events);
    assert.strictEqual(replayStats.eventsProcessed, 4);

    const replayedCase = await caseRepo.findById(caseId, TEST_NETWORK);
    assert.strictEqual(replayedCase?.status, "FINALIZED");
    assert.strictEqual(replayedCase?.finalization_tx_hash, "0x_finalize_tx_chain");
  });

  it("discovers on-chain case and observation when no prior database record exists", async () => {
    const { caseRepo, obsRepo, synchronizer } = setup();
    const externalCaseId = "2020202020202020202020202020202020202020202020202020202020202020";

    // 1. Process CaseCreated for an unrecorded case
    const caseCreatedEvent: DecodedContractEvent = {
      type: "CaseCreated",
      contractId: TEST_CONTRACT_ID,
      ledger: 888000,
      txHash: "0x_ext_create_tx",
      cursor: "cursor_ext_1",
      topicXdr: "AAAAAA==",
      dataXdr: "AAAAAA==",
      caseId: externalCaseId,
      payload: {
        caseId: externalCaseId,
        owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
        counterparty: "GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6ZN7JIBKTRUXZLVTH5",
        tradeReference: "TR-CHAIN-DISCOVERED",
        asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        amount: "75000.00",
        expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
        termsCommitment: "d".repeat(64),
        expiresAtLedger: 999999,
      },
    };

    const caseSynced = await synchronizer.syncEvent(caseCreatedEvent);
    assert.strictEqual(caseSynced, true);

    const createdCase = await caseRepo.findById(externalCaseId, TEST_NETWORK);
    assert.ok(createdCase);
    assert.strictEqual(createdCase!.id, externalCaseId);
    assert.strictEqual(createdCase!.trade_reference, "TR-CHAIN-DISCOVERED");
    assert.strictEqual(createdCase!.status, "OPEN");
    assert.strictEqual(createdCase!.submission_status, "CONFIRMED");
    assert.strictEqual(createdCase!.create_tx_hash, "0x_ext_create_tx");
    assert.strictEqual(Number(createdCase!.confirmed_at_ledger), 888000);

    // 2. Process ObservationRecorded for unrecorded observation
    const obsEvent: DecodedContractEvent = {
      type: "ObservationRecorded",
      contractId: TEST_CONTRACT_ID,
      ledger: 888500,
      txHash: "0x_ext_obs_tx",
      cursor: "cursor_ext_2",
      topicXdr: "AAAAAA==",
      dataXdr: "AAAAAA==",
      caseId: externalCaseId,
      payload: {
        caseId: externalCaseId,
        observer: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
        txHash: "0x_payment_tx",
        observedLedger: 888400,
        observationCommitment: "e".repeat(64),
        asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        amount: "75000.00",
        destination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      },
    };

    const obsSynced = await synchronizer.syncEvent(obsEvent);
    assert.strictEqual(obsSynced, true);

    const createdObs = await obsRepo.findByCaseId(externalCaseId, TEST_NETWORK);
    assert.ok(createdObs);
    assert.strictEqual(createdObs!.case_id, externalCaseId);
    assert.strictEqual(createdObs!.observer, "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ");
    assert.strictEqual(createdObs!.observation_tx_hash, "0x_ext_obs_tx");
    assert.strictEqual(Number(createdObs!.confirmed_at_ledger), 888500);

    // 3. Process ObserverAdded/ObserverRemoved events
    const observerEvent: DecodedContractEvent = {
      type: "ObserverAdded",
      contractId: TEST_CONTRACT_ID,
      ledger: 888600,
      txHash: "0x_observer_tx",
      cursor: "cursor_ext_3",
      topicXdr: "AAAAAA==",
      dataXdr: "AAAAAA==",
      payload: {
        observer: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      },
    };
    const observerSynced = await synchronizer.syncEvent(observerEvent);
    assert.strictEqual(observerSynced, true);
  });
});

