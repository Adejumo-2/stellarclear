import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseClient,
  runMigrations,
  CaseRepository,
  ObservationRepository,
  ReconciliationRepository,
  BreakRepository,
  ContractEventRepository,
  CursorRepository,
  type DbSettlementCase,
} from "@stellarclear/db";

describe("DB Package - Schema Migrations & In-Memory Client", () => {
  it("executes initial schema migrations without error", async () => {
    const client = createDatabaseClient({
      databaseUrl: "postgresql://postgres:postgres@localhost:5432/stellarclear_test",
      network: "testnet",
    });

    await assert.doesNotReject(async () => {
      await runMigrations(client);
    });
  });

  it("handles case creation, lookup, status updates, and duplicate rejection", async () => {
    const client = createDatabaseClient({
      databaseUrl: "postgresql://postgres:postgres@localhost:5432/stellarclear_test",
      network: "testnet",
    });
    const repo = new CaseRepository(client);

    const caseData: DbSettlementCase = {
      id: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      network: "testnet",
      owner: "GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6ZN7JMTXNZBEWBIXXX",
      counterparty: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      trade_reference: "TR-200",
      asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      amount: "10000.0000000",
      expected_destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      reference: "INV-200",
      terms_commitment: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      expires_at_ledger: 600000,
      status: "OPEN",
      created_at_ledger: 550000,
      finalized_at_ledger: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const created = await repo.insert(caseData);
    assert.strictEqual(created.id, caseData.id);

    const found = await repo.findById(caseData.id, "testnet");
    assert.ok(found);
    if (found) {
      assert.strictEqual(found.status, "OPEN");
    }

    // Update status
    await repo.updateStatus(caseData.id, "testnet", "MATCHED");
    const updated = await repo.findById(caseData.id, "testnet");
    assert.strictEqual(updated?.status, "MATCHED");

    // Reject duplicate insert
    await assert.rejects(async () => {
      await repo.insert(caseData);
    });
  });

  it("persists observations, reconciliations, and breaks", async () => {
    const client = createDatabaseClient({
      databaseUrl: "postgresql://postgres:postgres@localhost:5432/stellarclear_test",
      network: "testnet",
    });
    const obsRepo = new ObservationRepository(client);
    const recRepo = new ReconciliationRepository(client);
    const breakRepo = new BreakRepository(client);

    const caseId = "case-12345";
    const network = "testnet";

    const obs = await obsRepo.insert({
      network,
      case_id: caseId,
      observer: "GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6ZN7JMTXNZBEWBIXXX",
      tx_hash: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
      observed_ledger: 550010,
      observation_commitment: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
      asset: "USDC",
      amount: "9999.0000000",
      destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      status: "SUCCESS",
      observed_at: new Date(),
    });
    assert.ok(obs);

    const rec = await recRepo.insert({
      network,
      case_id: caseId,
      status: "BREAK",
      matched: false,
      reconciled_at: new Date(),
    });
    assert.strictEqual(rec.matched, false);

    const breaks = await breakRepo.insertMany([
      {
        network,
        case_id: caseId,
        reconciliation_id: rec.id,
        code: "AMOUNT_MISMATCH",
        field: "amount",
        expected_value: "10000.0000000",
        observed_value: "9999.0000000",
        message: "Settlement amount mismatch",
      },
    ]);
    assert.strictEqual(breaks.length, 1);

    const foundBreaks = await breakRepo.findByCaseId(caseId, network);
    assert.strictEqual(foundBreaks.length, 1);
    assert.strictEqual(foundBreaks[0].code, "AMOUNT_MISMATCH");
  });

  it("manages ingestion cursors and contract event indexing", async () => {
    const client = createDatabaseClient({
      databaseUrl: "postgresql://postgres:postgres@localhost:5432/stellarclear_test",
      network: "testnet",
    });
    const cursorRepo = new CursorRepository(client);
    const eventRepo = new ContractEventRepository(client);

    const network = "testnet";

    // Initial cursor
    const c1 = await cursorRepo.updateCursor(network, 1000, "cursor_1000");
    assert.strictEqual(c1.last_processed_ledger, 1000);

    const fetched = await cursorRepo.getCursor(network);
    assert.strictEqual(fetched?.last_processed_ledger, 1000);

    // Ingest event
    const event = await eventRepo.insert({
      network,
      contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      ledger: 1001,
      tx_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      event_type: "CaseCreated",
      case_id: "case-001",
      topic_xdr: "AAAAAA==",
      data_xdr: "BBBBBB==",
      cursor: "cursor_1001_01",
    });
    assert.ok(event);

    const events = await eventRepo.listByCaseId("case-001", network);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].event_type, "CaseCreated");
  });
});
