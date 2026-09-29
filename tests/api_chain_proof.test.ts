import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryDatabaseClient } from "@stellarclear/db";
import {
  computeTermsCommitment,
  computeObservationCommitment,
  createSettlementProof,
} from "@stellarclear/proof";
import type { ExpectedSettlement, ObservedSettlement, Attestation } from "@stellarclear/schemas";
import type { CaseRecord, AttestationRecord } from "@stellarclear/sdk";
import {
  createApiServer,
  SorobanChainVerifier,
  type OnChainStateProvider,
} from "@stellarclear/api";

const DUMMY_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const DUMMY_NETWORK = "testnet";

describe("API Service - Verify Settlement Proof against Soroban State", () => {
  const sampleTerms: ExpectedSettlement = {
    caseId: "1111111111111111111111111111111111111111111111111111111111111111",
    owner: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    counterparty: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    tradeReference: "TRADE-ONCHAIN-001",
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "50000.00",
    expectedDestination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    reference: "INV-999",
    deadline: 1234567,
  };

  const sampleObserved: ObservedSettlement = {
    txHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ledger: 1234560,
    asset: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    amount: "50000.00",
    destination: "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGOBKGOTQTV4HXY5SLQ",
    reference: "INV-999",
    status: "SUCCESS",
    observedAt: "2026-09-29T12:00:00.000Z",
  };

  const termsCommitment = computeTermsCommitment(sampleTerms);
  const observationCommitment = computeObservationCommitment(sampleObserved);

  const sampleAttestation: Attestation = {
    caseId: sampleTerms.caseId,
    role: "OWNER",
    attestor: sampleTerms.owner,
    commitment: termsCommitment,
    attestedAtLedger: 1234565,
  };

  const proof = createSettlementProof({
    caseId: sampleTerms.caseId,
    terms: sampleTerms,
    observation: sampleObserved,
    finalizedLedger: 1234565,
    result: "MATCHED",
    attestations: [sampleAttestation],
    contractId: DUMMY_CONTRACT_ID,
    network: DUMMY_NETWORK,
  });

  it("successfully verifies valid proof matching Soroban on-chain state", async () => {
    const mockStateProvider: OnChainStateProvider = {
      async getCase(caseId: string): Promise<CaseRecord | null> {
        if (caseId === sampleTerms.caseId) {
          return {
            caseId,
            owner: sampleTerms.owner,
            counterparty: sampleTerms.counterparty,
            termsCommitment,
            observation: {
              txHash: sampleObserved.txHash,
              observationCommitment,
              observedLedger: sampleObserved.ledger,
            },
            decision: { type: "MATCHED" },
            status: "MATCHED",
            createdAtLedger: 1234500,
            expiresAtLedger: 1234567,
            finalizedAtLedger: 1234565,
          };
        }
        return null;
      },
      async getAttestation(caseId: string, attestor: string): Promise<AttestationRecord | null> {
        if (caseId === sampleTerms.caseId && attestor === sampleTerms.owner) {
          return {
            caseId,
            attestor,
            role: "OWNER",
            commitment: termsCommitment,
            attestedAtLedger: 1234565,
          };
        }
        return null;
      },
    };

    const verifier = new SorobanChainVerifier(mockStateProvider, DUMMY_CONTRACT_ID, DUMMY_NETWORK);
    const result = await verifier.verifyOnChainProof({
      proof,
      termsDocument: sampleTerms,
      observedDocument: sampleObserved,
    });

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.recomputedTermsCommitment, termsCommitment);
    assert.strictEqual(result.recomputedObservationCommitment, observationCommitment);
    assert.strictEqual(result.onChainState?.status, "MATCHED");
  });

  it("rejects proof when case does not exist on Soroban", async () => {
    const mockStateProvider: OnChainStateProvider = {
      async getCase(): Promise<CaseRecord | null> {
        return null;
      },
    };

    const verifier = new SorobanChainVerifier(mockStateProvider, DUMMY_CONTRACT_ID, DUMMY_NETWORK);
    const result = await verifier.verifyOnChainProof({
      proof,
      termsDocument: sampleTerms,
      observedDocument: sampleObserved,
    });

    assert.strictEqual(result.valid, false);
    assert.ok((result.reason ?? "").includes("does not exist on Soroban"));
  });

  it("rejects proof when on-chain terms commitment does not match", async () => {
    const mockStateProvider: OnChainStateProvider = {
      async getCase(caseId: string): Promise<CaseRecord | null> {
        return {
          caseId,
          owner: sampleTerms.owner,
          counterparty: sampleTerms.counterparty,
          termsCommitment: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          observation: {
            txHash: sampleObserved.txHash,
            observationCommitment,
            observedLedger: sampleObserved.ledger,
          },
          decision: { type: "MATCHED" },
          status: "MATCHED",
          createdAtLedger: 1234500,
          expiresAtLedger: 1234567,
          finalizedAtLedger: 1234565,
        };
      },
    };

    const verifier = new SorobanChainVerifier(mockStateProvider, DUMMY_CONTRACT_ID, DUMMY_NETWORK);
    const result = await verifier.verifyOnChainProof({
      proof,
      termsDocument: sampleTerms,
      observedDocument: sampleObserved,
    });

    assert.strictEqual(result.valid, false);
    assert.ok((result.reason ?? "").includes("terms commitment mismatch"));
  });

  it("rejects proof when on-chain reconciliation status contradicts proof result", async () => {
    const mockStateProvider: OnChainStateProvider = {
      async getCase(caseId: string): Promise<CaseRecord | null> {
        return {
          caseId,
          owner: sampleTerms.owner,
          counterparty: sampleTerms.counterparty,
          termsCommitment,
          observation: {
            txHash: sampleObserved.txHash,
            observationCommitment,
            observedLedger: sampleObserved.ledger,
          },
          decision: { type: "BREAK" },
          status: "BREAK",
          createdAtLedger: 1234500,
          expiresAtLedger: 1234567,
          finalizedAtLedger: 1234565,
        };
      },
    };

    const verifier = new SorobanChainVerifier(mockStateProvider, DUMMY_CONTRACT_ID, DUMMY_NETWORK);
    const result = await verifier.verifyOnChainProof({
      proof,
      termsDocument: sampleTerms,
      observedDocument: sampleObserved,
    });

    assert.strictEqual(result.valid, false);
    assert.ok((result.reason ?? "").includes("Reconciliation status mismatch"));
  });

  it("verifies via HTTP POST /v1/proofs/verify/onchain", async () => {
    const mockStateProvider: OnChainStateProvider = {
      async getCase(caseId: string): Promise<CaseRecord | null> {
        return {
          caseId,
          owner: sampleTerms.owner,
          counterparty: sampleTerms.counterparty,
          termsCommitment,
          observation: {
            txHash: sampleObserved.txHash,
            observationCommitment,
            observedLedger: sampleObserved.ledger,
          },
          decision: { type: "MATCHED" },
          status: "MATCHED",
          createdAtLedger: 1234500,
          expiresAtLedger: 1234567,
          finalizedAtLedger: 1234565,
        };
      },
      async getAttestation(caseId: string, attestor: string): Promise<AttestationRecord | null> {
        return {
          caseId,
          attestor,
          role: "OWNER",
          commitment: termsCommitment,
          attestedAtLedger: 1234565,
        };
      },
    };

    const verifier = new SorobanChainVerifier(mockStateProvider, DUMMY_CONTRACT_ID, DUMMY_NETWORK);
    const dbClient = new InMemoryDatabaseClient();
    const server = createApiServer(
      {
        port: 3000,
        host: "127.0.0.1",
        network: DUMMY_NETWORK,
        databaseUrl: "postgres://localhost",
        contractId: DUMMY_CONTRACT_ID,
        rpcUrl: "https://soroban-testnet.stellar.org",
      },
      dbClient,
      undefined,
      verifier
    );

    const response = await server.inject({
      method: "POST",
      url: "/v1/proofs/verify/onchain",
      body: {
        proof,
        termsDocument: sampleTerms,
        observedDocument: sampleObserved,
      },
    });

    assert.strictEqual(response.statusCode, 200);
    const body = response.body as { valid: boolean; onChainState?: { status: string } };
    assert.strictEqual(body.valid, true);
    assert.strictEqual(body.onChainState?.status, "MATCHED");
  });
});
