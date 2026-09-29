import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryDatabaseClient,
  CaseRepository,
  ObservationRepository,
  ReconciliationRepository,
} from "@stellarclear/db";

const TEST_NETWORK = "testnet";
const TEST_CASE_ID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const TEST_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

describe("DB Package - Soroban Settlement References Persistence", () => {
  it("persists and retrieves full on-chain transaction references on settlement cases", async () => {
    const db = new InMemoryDatabaseClient();
    const caseRepo = new CaseRepository(db);

    const now = new Date();
    await caseRepo.insert({
      id: TEST_CASE_ID,
      network: TEST_NETWORK,
      contract_id: TEST_CONTRACT_ID,
      owner: "GA2C5RFPE6GCKMY3US5PAB6UZLKIGAHWKXX2G6VRZZ63OOENWPQA7D75",
      counterparty: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      trade_reference: "TR-REFS-001",
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "5000.00",
      expected_destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      reference: "INV-REFS-001",
      terms_commitment: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      expires_at_ledger: 600000,
      status: "OPEN",
      create_tx_hash: "0x_create_tx_hash_123",
      submission_status: "CONFIRMED",
      confirmed_at_ledger: 590000,
      created_at: now,
      updated_at: now,
    });

    const found = await caseRepo.findById(TEST_CASE_ID, TEST_NETWORK);
    assert.ok(found !== null);
    if (found) {
      assert.strictEqual(found.contract_id, TEST_CONTRACT_ID);
      assert.strictEqual(found.create_tx_hash, "0x_create_tx_hash_123");
      assert.strictEqual(found.submission_status, "CONFIRMED");
      assert.strictEqual(found.confirmed_at_ledger, 590000);
    }

    // Update chain references
    await caseRepo.updateChainReferences(TEST_CASE_ID, TEST_NETWORK, {
      observation_tx_hash: "0x_obs_tx_hash_456",
      reconciliation_tx_hash: "0x_rec_tx_hash_789",
      attestation_tx_hash: "0x_att_tx_hash_101",
      dispute_tx_hash: "0x_disp_tx_hash_202",
      resolution_tx_hash: "0x_res_tx_hash_303",
      finalization_tx_hash: "0x_fin_tx_hash_404",
    });

    const updated = await caseRepo.findById(TEST_CASE_ID, TEST_NETWORK);
    assert.ok(updated !== null);
    if (updated) {
      assert.strictEqual(updated.observation_tx_hash, "0x_obs_tx_hash_456");
      assert.strictEqual(updated.reconciliation_tx_hash, "0x_rec_tx_hash_789");
      assert.strictEqual(updated.attestation_tx_hash, "0x_att_tx_hash_101");
      assert.strictEqual(updated.dispute_tx_hash, "0x_disp_tx_hash_202");
      assert.strictEqual(updated.resolution_tx_hash, "0x_res_tx_hash_303");
      assert.strictEqual(updated.finalization_tx_hash, "0x_fin_tx_hash_404");
    }
  });

  it("persists and retrieves transaction references on observations and reconciliations", async () => {
    const db = new InMemoryDatabaseClient();
    const obsRepo = new ObservationRepository(db);
    const recRepo = new ReconciliationRepository(db);

    await obsRepo.insert({
      network: TEST_NETWORK,
      case_id: TEST_CASE_ID,
      observer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      tx_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      observed_ledger: 590100,
      observation_commitment: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      observation_tx_hash: "0x_soroban_obs_anchor_hash",
      confirmed_at_ledger: 590105,
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "5000.00",
      destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      status: "SUCCESS",
      observed_at: new Date().toISOString(),
    });

    const foundObs = await obsRepo.findByCaseId(TEST_CASE_ID, TEST_NETWORK);
    assert.ok(foundObs !== null);
    if (foundObs) {
      assert.strictEqual(foundObs.observation_tx_hash, "0x_soroban_obs_anchor_hash");
      assert.strictEqual(foundObs.confirmed_at_ledger, 590105);
    }

    await recRepo.insert({
      network: TEST_NETWORK,
      case_id: TEST_CASE_ID,
      status: "MATCHED",
      matched: true,
      reconciliation_tx_hash: "0x_soroban_rec_anchor_hash",
      confirmed_at_ledger: 590110,
      reconciled_at: new Date().toISOString(),
    });

    const foundRec = await recRepo.findByCaseId(TEST_CASE_ID, TEST_NETWORK);
    assert.ok(foundRec !== null);
    if (foundRec) {
      assert.strictEqual(foundRec.reconciliation_tx_hash, "0x_soroban_rec_anchor_hash");
      assert.strictEqual(foundRec.confirmed_at_ledger, 590110);
    }
  });
});
