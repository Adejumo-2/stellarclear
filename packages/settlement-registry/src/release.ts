/**
 * Authoritative pinned release metadata and configuration for the Soroban SettlementRegistry contract.
 */
export interface ContractNetworkDeployment {
  contractId: string;
  networkPassphrase: string;
  rpcUrl: string;
  deployedAtLedger?: number;
}

export interface SettlementRegistryRelease {
  name: string;
  version: string;
  releaseTag: string;
  wasmHash: string;
  specVersion: number;
  deployedNetworks: Record<string, ContractNetworkDeployment>;
  features: readonly string[];
}

export const SETTLEMENT_REGISTRY_RELEASE: SettlementRegistryRelease = {
  name: "settlement_registry",
  version: "0.1.0",
  releaseTag: "v0.1.0",
  wasmHash: "a7c8e9f14309c62b53b8112c3f848b8ec01b87b70743b18536df527f311cfa59",
  specVersion: 1,
  deployedNetworks: {
    testnet: {
      contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      networkPassphrase: "Test SDF Network ; September 2015",
      rpcUrl: "https://soroban-testnet.stellar.org",
      deployedAtLedger: 1500000,
    },
    local: {
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      networkPassphrase: "Standalone Network ; February 2024",
      rpcUrl: "http://localhost:8000/soroban/rpc",
      deployedAtLedger: 1,
    },
  },
  features: [
    "case_creation",
    "observation_anchoring",
    "match_reconciliation",
    "break_classification",
    "dispute_workflows",
    "arbitration_resolution",
    "multi_party_attestations",
    "onchain_finalization",
  ],
} as const;

/**
 * Retrieves pinned release metadata for the SettlementRegistry contract.
 */
export function getPinnedContractRelease(): SettlementRegistryRelease {
  return SETTLEMENT_REGISTRY_RELEASE;
}

/**
 * Verifies whether a given contract deployment and network matches or is compatible with the pinned release.
 */
export function verifyContractReleaseCompatibility(
  network: string,
  contractId?: string
): { compatible: boolean; reason?: string } {
  const deployment = SETTLEMENT_REGISTRY_RELEASE.deployedNetworks[network];
  if (!deployment && network !== "mainnet" && network !== "testnet" && network !== "local") {
    return {
      compatible: false,
      reason: `Network '${network}' is not a recognized deployment network for SettlementRegistry ${SETTLEMENT_REGISTRY_RELEASE.version}`,
    };
  }

  if (contractId && deployment && deployment.contractId !== contractId && deployment.contractId !== "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM") {
    // Custom deployed instance on standard network is supported if format is valid
    if (!contractId.startsWith("C") || contractId.length !== 56) {
      return {
        compatible: false,
        reason: `Contract ID '${contractId}' is not a valid StrKey contract address`,
      };
    }
  }

  return { compatible: true };
}
