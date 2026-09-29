import { z } from "zod";

export const DatabaseConfigSchema = z.object({
  databaseUrl: z.string().min(1, "databaseUrl is required"),
  network: z.string().default("testnet"),
  maxConnections: z.number().int().positive().default(10),
  idleTimeoutMillis: z.number().int().positive().default(30000),
  connectionTimeoutMillis: z.number().int().positive().default(5000),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type DatabaseConfigInput = z.input<typeof DatabaseConfigSchema>;

export function validateDatabaseConfig(input: DatabaseConfigInput): DatabaseConfig {
  return DatabaseConfigSchema.parse(input);
}
