import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  StellarClearClient,
  Networks,
  ValidationError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  normalizeContractError,
} from "@stellarclear/sdk";

const VALID_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const VALID_ACCOUNT_ID = "GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6ZN7JMTXNZBEWBIXXX";

describe("SDK Package - Client Configuration & Creation", () => {
  it("initializes StellarClearClient with valid testnet configuration", () => {
    const client = new StellarClearClient({
      network: Networks.TESTNET.network,
      networkPassphrase: Networks.TESTNET.networkPassphrase,
      rpcUrl: Networks.TESTNET.rpcUrl,
      contractId: VALID_CONTRACT_ID,
    });

    assert.ok(client);
    assert.strictEqual(client.contractId, VALID_CONTRACT_ID);
    assert.strictEqual(client.network, "testnet");
    assert.strictEqual(client.networkPassphrase, "Test SDF Network ; September 2015");
    assert.ok(client.contractClient);
    assert.ok(client.rpcServer);
  });

  it("rejects invalid contract address (e.g. Account G... instead of Contract C...)", () => {
    assert.throws(() => {
      new StellarClearClient({
        network: "testnet",
        networkPassphrase: "Test SDF Network ; September 2015",
        rpcUrl: "https://soroban-testnet.stellar.org",
        contractId: VALID_ACCOUNT_ID, // Account key instead of Contract address
      });
    });
  });

  it("rejects invalid RPC URL", () => {
    assert.throws(() => {
      new StellarClearClient({
        network: "testnet",
        networkPassphrase: "Test SDF Network ; September 2015",
        rpcUrl: "not-a-valid-url",
        contractId: VALID_CONTRACT_ID,
      });
    });
  });

  it("provides generated SettlementRegistry binding methods", () => {
    const client = new StellarClearClient({
      network: Networks.TESTNET.network,
      networkPassphrase: Networks.TESTNET.networkPassphrase,
      rpcUrl: Networks.TESTNET.rpcUrl,
      contractId: VALID_CONTRACT_ID,
    });

    assert.strictEqual(typeof client.contractClient.create_case, "function");
    assert.strictEqual(typeof client.contractClient.record_observation, "function");
    assert.strictEqual(typeof client.contractClient.record_match, "function");
    assert.strictEqual(typeof client.contractClient.record_break, "function");
    assert.strictEqual(typeof client.contractClient.get_case, "function");
    assert.strictEqual(typeof client.contractClient.is_observer, "function");
  });
});

describe("SDK Package - Error Normalization", () => {
  it("normalizes numeric contract error codes into typed domain errors", () => {
    const err1 = normalizeContractError({ code: 1, message: "Already initialized" });
    assert.ok(err1 instanceof ConflictError);

    const err2 = normalizeContractError({ code: 2, message: "Not found" });
    assert.ok(err2 instanceof NotFoundError);

    const err6 = normalizeContractError({ code: 6, message: "Unauthorized" });
    assert.ok(err6 instanceof UnauthorizedError);

    const err7 = normalizeContractError({ code: 7, message: "Invalid state" });
    assert.ok(err7 instanceof ValidationError);
  });

  it("normalizes simulation strings containing contract error codes", () => {
    const simErr = normalizeContractError(new Error("HostError: Error(Contract, #6)"));
    assert.ok(simErr instanceof UnauthorizedError);
  });
});
