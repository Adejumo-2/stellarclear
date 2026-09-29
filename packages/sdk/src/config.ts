import { z } from "zod";
import { StellarAddressSchema } from "@stellarclear/schemas";

export const Networks = {
  TESTNET: {
    network: "testnet",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
  },
  MAINNET: {
    network: "mainnet",
    networkPassphrase: "Public Global Stellar Network ; July 2015",
    rpcUrl: "https://mainnet.stellar.org",
  },
  LOCAL: {
    network: "local",
    networkPassphrase: "Standalone Network ; February 2017",
    rpcUrl: "http://localhost:8000/soroban/rpc",
    allowHttp: true,
  },
} as const;

export const StellarClearConfigSchema = z.object({
  network: z.string().min(1, "network is required"),
  networkPassphrase: z.string().min(1, "networkPassphrase is required"),
  rpcUrl: z.string().url("rpcUrl must be a valid URL"),
  contractId: StellarAddressSchema.refine(
    (addr) => addr.startsWith("C"),
    "Contract ID must be a valid Stellar contract address starting with 'C'"
  ),
  allowHttp: z.boolean().default(false),
  publicKey: StellarAddressSchema.optional(),
});

export type StellarClearConfig = z.infer<typeof StellarClearConfigSchema>;
export type StellarClearConfigInput = z.input<typeof StellarClearConfigSchema>;

/**
 * Validates and normalizes SDK client configuration.
 */
export function validateConfig(config: StellarClearConfigInput): StellarClearConfig {
  return StellarClearConfigSchema.parse(config);
}
