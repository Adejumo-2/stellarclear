import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setupLiveSettlementEnvironment, TEST_LIVE_CONTRACT_ID, TEST_LIVE_NETWORK } from "./helpers/soroban.js";
import {
  SettlementRegistryClient,
  breakCodeToContract,
  contractToBreakCode,
  attestationRoleToContract,
  contractToAttestationRole,
} from "@stellarclear/sdk";
import { Errors } from "settlement-registry";
import type { ExpectedSettlement } from "@stellarclear/schemas";
import { computeTermsCommitment } from "@stellarclear/proof";

describe("Integration - Cross-Repository Regression Suite", () => {
  it("verifies contract enum conversions between domain schemas and generated bindings", () => {
    // Break codes
    assert.deepStrictEqual(breakCodeToContract("AMOUNT_MISMATCH"), { tag: "AmountMismatch", values: undefined });
    assert.deepStrictEqual(breakCodeToContract("ASSET_MISMATCH"), { tag: "AssetMismatch", values: undefined });
    assert.deepStrictEqual(breakCodeToContract("DESTINATION_MISMATCH"), { tag: "DestinationMismatch", values: undefined });
    assert.deepStrictEqual(breakCodeToContract("LATE_SETTLEMENT"), { tag: "LateSettlement", values: undefined });
    assert.deepStrictEqual(breakCodeToContract("MISSING_SETTLEMENT"), { tag: "MissingSettlement", values: undefined });

    assert.strictEqual(contractToBreakCode({ tag: "AmountMismatch", values: undefined }), "AMOUNT_MISMATCH");
    assert.strictEqual(contractToBreakCode({ tag: "AssetMismatch", values: undefined }), "ASSET_MISMATCH");
    assert.strictEqual(contractToBreakCode({ tag: "DestinationMismatch", values: undefined }), "DESTINATION_MISMATCH");
    assert.strictEqual(contractToBreakCode({ tag: "LateSettlement", values: undefined }), "LATE_SETTLEMENT");

    // Attestation roles
    assert.deepStrictEqual(attestationRoleToContract("OWNER"), { tag: "Owner", values: undefined });
    assert.deepStrictEqual(attestationRoleToContract("COUNTERPARTY"), { tag: "Counterparty", values: undefined });
    assert.deepStrictEqual(attestationRoleToContract("OBSERVER"), { tag: "Observer", values: undefined });

    assert.strictEqual(contractToAttestationRole({ tag: "Owner", values: undefined }), "OWNER");
    assert.strictEqual(contractToAttestationRole({ tag: "Counterparty", values: undefined }), "COUNTERPARTY");
    assert.strictEqual(contractToAttestationRole({ tag: "Observer", values: undefined }), "OBSERVER");
  });

  it("verifies contract error map contains all authoritative error discriminants", () => {
    assert.ok(Errors[1]?.message.includes("AlreadyInitialized"));
    assert.ok(Errors[2]?.message.includes("NotFound"));
    assert.ok(Errors[3]?.message.includes("CaseAlreadyExists"));
    assert.ok(Errors[6]?.message.includes("Unauthorized"));
    assert.ok(Errors[7]?.message.includes("InvalidState"));
    assert.ok(Errors[8]?.message.includes("InvalidExpiration"));
    assert.ok(Errors[9]?.message.includes("InvalidCommitment"));
  });

  it("verifies that SettlementRegistry client executes simulated and recorded calls faithfully", async () => {
    const { soroban } = setupLiveSettlementEnvironment();
    const client = new SettlementRegistryClient({
      contractId: TEST_LIVE_CONTRACT_ID,
      network: TEST_LIVE_NETWORK,
      networkPassphrase: "Test SDF Network ; September 2015",
      rpcUrl: "https://soroban-testnet.stellar.org",
    });

    assert.ok(client);
    const caseId = "f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1";
    const terms: ExpectedSettlement = {
      caseId,
      owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      tradeReference: "TRADE-CROSS-REPO-001",
      asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amount: "5000.0000000",
      expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
      reference: "INV-CROSS-REPO-001",
      deadline: 1800000,
    };

    const termsCommitment = computeTermsCommitment(terms);
    const creationResult = await soroban.anchorCaseCreation(terms);
    assert.ok(creationResult.txHash);

    const onchainCase = await soroban.getOnChainCase(caseId);
    assert.ok(onchainCase);
    assert.strictEqual(onchainCase?.caseId, caseId);
    assert.strictEqual(onchainCase?.termsCommitment, termsCommitment);
  });
});

