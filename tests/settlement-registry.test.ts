import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as registry from "settlement-registry";

describe("SettlementRegistry TypeScript Bindings", () => {
  it("exports contract spec and client", () => {
    assert.ok(registry.Client, "Client should be exported");
    assert.ok(registry.Networks, "Networks should be exported");
    assert.ok(registry.Errors, "Errors should be exported");
  });

  it("exports correct contract error discriminants", () => {
    assert.strictEqual(registry.Errors[1].message, "AlreadyInitialized");
    assert.strictEqual(registry.Errors[2].message, "NotFound");
    assert.strictEqual(registry.Errors[3].message, "CaseAlreadyExists");
    assert.strictEqual(registry.Errors[4].message, "ObserverAlreadyRegistered");
    assert.strictEqual(registry.Errors[5].message, "ObserverNotRegistered");
    assert.strictEqual(registry.Errors[6].message, "Unauthorized");
    assert.strictEqual(registry.Errors[7].message, "InvalidState");
    assert.strictEqual(registry.Errors[8].message, "InvalidExpiration");
    assert.strictEqual(registry.Errors[9].message, "InvalidCommitment");
    assert.strictEqual(registry.Errors[10].message, "CounterpartyRequired");
    assert.strictEqual(registry.Errors[11].message, "CounterpartyNotAllowed");
    assert.strictEqual(registry.Errors[12].message, "AttestationAlreadyExists");
    assert.strictEqual(registry.Errors[13].message, "ResolutionAlreadySubmitted");
    assert.strictEqual(registry.Errors[14].message, "ResolutionMismatch");
    assert.strictEqual(registry.Errors[15].message, "MissingRequiredAttestation");
    assert.strictEqual(registry.Errors[16].message, "InvalidDecision");
    assert.strictEqual(registry.Errors[17].message, "InvalidLedger");
  });

  it("initializes client with dummy contract ID and testnet RPC", () => {
    const dummyContractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
    const client = new registry.Client({
      contractId: dummyContractId,
      networkPassphrase: "Test SDF Network ; September 2015",
      rpcUrl: "https://soroban-testnet.stellar.org",
    });

    assert.ok(client, "client instance should be created");
    assert.strictEqual(typeof client.add_observer, "function");
    assert.strictEqual(typeof client.remove_observer, "function");
    assert.strictEqual(typeof client.create_case, "function");
    assert.strictEqual(typeof client.record_observation, "function");
    assert.strictEqual(typeof client.record_match, "function");
    assert.strictEqual(typeof client.record_break, "function");
    assert.strictEqual(typeof client.submit_attestation, "function");
    assert.strictEqual(typeof client.open_dispute, "function");
    assert.strictEqual(typeof client.submit_resolution, "function");
    assert.strictEqual(typeof client.finalize_case, "function");
    assert.strictEqual(typeof client.get_case, "function");
    assert.strictEqual(typeof client.get_attestation, "function");
    assert.strictEqual(typeof client.is_observer, "function");
    assert.strictEqual(typeof client.get_resolution, "function");
  });
});
