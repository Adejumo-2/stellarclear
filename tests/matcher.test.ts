import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reconcileSettlement, compareDecimalAmounts, normalizeDecimalAmount } from "@stellarclear/matcher";
import type { ExpectedSettlement, ObservedSettlement } from "@stellarclear/schemas";

const VALID_CASE_ID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const VALID_TX_HASH = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const VALID_OWNER = "GA2C5RFPE6GCKMY3US5PAB6UZLKIGSPIUKSLRB6ZN7JMTXNZBEWBIXXX";
const VALID_DESTINATION = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const BASE_EXPECTED: ExpectedSettlement = {
  caseId: VALID_CASE_ID,
  tradeReference: "TR-100",
  asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  amount: "100.0000000",
  expectedDestination: VALID_DESTINATION,
  reference: "INV-99",
  deadline: 500000,
  owner: VALID_OWNER,
  counterparty: VALID_DESTINATION,
};

const BASE_OBSERVED: ObservedSettlement = {
  txHash: VALID_TX_HASH,
  ledger: 499990,
  asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  amount: "100.0000000",
  destination: VALID_DESTINATION,
  reference: "INV-99",
  status: "SUCCESS",
  observedAt: "2026-09-29T12:00:00.000Z",
};

describe("Matcher Service - Decimal Amount Normalization", () => {
  it("normalizes decimals correctly without floating point inaccuracies", () => {
    assert.strictEqual(normalizeDecimalAmount("100"), "100");
    assert.strictEqual(normalizeDecimalAmount("100.0000000"), "100");
    assert.strictEqual(normalizeDecimalAmount("100.50000"), "100.5");
    assert.strictEqual(normalizeDecimalAmount("0.0000001"), "0.0000001");
    assert.strictEqual(normalizeDecimalAmount("0050.250"), "50.25");
  });

  it("compares decimal amounts accurately", () => {
    assert.strictEqual(compareDecimalAmounts("100", "100.0000000"), true);
    assert.strictEqual(compareDecimalAmounts("50.5", "50.5000"), true);
    assert.strictEqual(compareDecimalAmounts("100.0000001", "100.0000002"), false);
  });
});

describe("Matcher Service - All Reconciliation Break Codes", () => {
  it("produces MATCHED when all conditions are fulfilled", () => {
    const result = reconcileSettlement(BASE_EXPECTED, BASE_OBSERVED);
    assert.strictEqual(result.status, "MATCHED");
    assert.strictEqual(result.matched, true);
    assert.strictEqual(result.breaks.length, 0);
  });

  it("detects MISSING_SETTLEMENT when observed is null or missing", () => {
    const result = reconcileSettlement(BASE_EXPECTED, null);
    assert.strictEqual(result.status, "BREAK");
    assert.strictEqual(result.matched, false);
    assert.strictEqual(result.breaks.length, 1);
    assert.strictEqual(result.breaks[0].code, "MISSING_SETTLEMENT");
  });

  it("detects AMOUNT_MISMATCH", () => {
    const observed = { ...BASE_OBSERVED, amount: "99.9999999" };
    const result = reconcileSettlement(BASE_EXPECTED, observed);
    assert.strictEqual(result.status, "BREAK");
    assert.ok(result.breaks.some((b) => b.code === "AMOUNT_MISMATCH"));
  });

  it("detects ASSET_MISMATCH", () => {
    const observed = { ...BASE_OBSERVED, asset: "XLM" };
    const result = reconcileSettlement(BASE_EXPECTED, observed);
    assert.strictEqual(result.status, "BREAK");
    assert.ok(result.breaks.some((b) => b.code === "ASSET_MISMATCH"));
  });

  it("detects DESTINATION_MISMATCH", () => {
    const observed = { ...BASE_OBSERVED, destination: VALID_OWNER };
    const result = reconcileSettlement(BASE_EXPECTED, observed);
    assert.strictEqual(result.status, "BREAK");
    assert.ok(result.breaks.some((b) => b.code === "DESTINATION_MISMATCH"));
  });

  it("detects REFERENCE_MISMATCH", () => {
    const observed = { ...BASE_OBSERVED, reference: "INV-WRONG" };
    const result = reconcileSettlement(BASE_EXPECTED, observed);
    assert.strictEqual(result.status, "BREAK");
    assert.ok(result.breaks.some((b) => b.code === "REFERENCE_MISMATCH"));
  });

  it("detects LATE_SETTLEMENT", () => {
    const observed = { ...BASE_OBSERVED, ledger: 500001 }; // Deadline was 500000
    const result = reconcileSettlement(BASE_EXPECTED, observed);
    assert.strictEqual(result.status, "BREAK");
    assert.ok(result.breaks.some((b) => b.code === "LATE_SETTLEMENT"));
  });

  it("detects FAILED_TRANSACTION", () => {
    const observed = { ...BASE_OBSERVED, status: "FAILED" as const };
    const result = reconcileSettlement(BASE_EXPECTED, observed);
    assert.strictEqual(result.status, "BREAK");
    assert.ok(result.breaks.some((b) => b.code === "FAILED_TRANSACTION"));
  });

  it("detects DUPLICATE_SETTLEMENT when flag is set", () => {
    const result = reconcileSettlement(BASE_EXPECTED, BASE_OBSERVED, { isDuplicate: true });
    assert.strictEqual(result.status, "BREAK");
    assert.ok(result.breaks.some((b) => b.code === "DUPLICATE_SETTLEMENT"));
  });

  it("detects UNEXPECTED_TRANSACTION when flag is set", () => {
    const result = reconcileSettlement(BASE_EXPECTED, BASE_OBSERVED, { isUnexpected: true });
    assert.strictEqual(result.status, "BREAK");
    assert.ok(result.breaks.some((b) => b.code === "UNEXPECTED_TRANSACTION"));
  });
});
