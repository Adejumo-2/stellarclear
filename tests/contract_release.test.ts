import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SETTLEMENT_REGISTRY_RELEASE,
  getPinnedContractRelease,
  verifyContractReleaseCompatibility,
} from "settlement-registry";
import {
  getPinnedContractRelease as getSdkPinnedRelease,
  verifyContractReleaseCompatibility as verifySdkCompatibility,
} from "@stellarclear/sdk";

describe("SettlementRegistry - Pinned Contract Release", () => {
  it("exports complete pinned release metadata", () => {
    const release = getPinnedContractRelease();
    assert.strictEqual(release.name, "settlement_registry");
    assert.strictEqual(release.version, "0.1.0");
    assert.strictEqual(release.releaseTag, "v0.1.0");
    assert.strictEqual(release.specVersion, 1);
    assert.ok(release.wasmHash.length === 64);
    assert.ok(release.features.includes("case_creation"));
    assert.ok(release.features.includes("observation_anchoring"));
    assert.ok(release.features.includes("match_reconciliation"));
    assert.ok(release.features.includes("break_classification"));
    assert.ok(release.features.includes("dispute_workflows"));
    assert.ok(release.features.includes("arbitration_resolution"));
    assert.ok(release.features.includes("multi_party_attestations"));
    assert.ok(release.features.includes("onchain_finalization"));
  });

  it("exposes pinned release metadata identically via @stellarclear/sdk", () => {
    const sdkRelease = getSdkPinnedRelease();
    assert.deepStrictEqual(sdkRelease, SETTLEMENT_REGISTRY_RELEASE);
  });

  it("verifies contract deployment compatibility against standard networks", () => {
    // Valid testnet
    const testnetCheck = verifyContractReleaseCompatibility("testnet");
    assert.strictEqual(testnetCheck.compatible, true);

    // Valid local
    const localCheck = verifyContractReleaseCompatibility("local");
    assert.strictEqual(localCheck.compatible, true);

    // Valid custom contract ID on testnet
    const customValid = verifyContractReleaseCompatibility(
      "testnet",
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
    );
    assert.strictEqual(customValid.compatible, true);

    // Invalid network
    const badNetwork = verifyContractReleaseCompatibility("unknown_chain");
    assert.strictEqual(badNetwork.compatible, false);
    assert.ok(badNetwork.reason?.includes("not a recognized deployment network"));

    // Invalid contract format
    const badContract = verifyContractReleaseCompatibility("testnet", "invalid_id");
    assert.strictEqual(badContract.compatible, false);
    assert.ok(badContract.reason?.includes("not a valid StrKey contract address"));
  });

  it("SDK re-export of verifyContractReleaseCompatibility functions correctly", () => {
    const check = verifySdkCompatibility("testnet");
    assert.strictEqual(check.compatible, true);
  });
});
