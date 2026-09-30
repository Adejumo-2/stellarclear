import { z } from "zod";

export const ApiConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default("0.0.0.0"),
  network: z.string().default("testnet"),
  databaseUrl: z.string().min(1, "databaseUrl is required"),
  contractId: z.string().min(1, "contractId is required"),
  rpcUrl: z.string().default("https://soroban-testnet.stellar.org"),
  networkPassphrase: z.string().default("Test SDF Network ; September 2015"),
  enableAnchoring: z.boolean().default(false),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;
export type ApiConfigInput = z.input<typeof ApiConfigSchema>;

export function validateApiConfig(input: ApiConfigInput): ApiConfig {
  return ApiConfigSchema.parse(input);
}

export function loadApiConfigFromEnv(env: Record<string, string | undefined> = {}): ApiConfig {
  return ApiConfigSchema.parse({
    port: env["API_PORT"] ? parseInt(env["API_PORT"], 10) : 3000,
    host: env["API_HOST"] || "0.0.0.0",
    network: env["STELLAR_NETWORK"] || "testnet",
    databaseUrl: env["DATABASE_URL"] || "postgres://localhost:5432/stellarclear_db",
    contractId: env["STELLAR_CONTRACT_ID"] || "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
    rpcUrl: env["STELLAR_RPC_URL"] || "https://soroban-testnet.stellar.org",
    networkPassphrase: env["STELLAR_NETWORK_PASSPHRASE"] || "Test SDF Network ; September 2015",
    enableAnchoring: env["ENABLE_ANCHORING"] === "true" || env["ENABLE_ANCHORING"] === "1",
  });
}
