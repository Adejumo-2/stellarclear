import { z } from "zod";

export const ApiConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default("0.0.0.0"),
  network: z.string().default("testnet"),
  databaseUrl: z.string().min(1, "databaseUrl is required"),
  contractId: z.string().min(1, "contractId is required"),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;
export type ApiConfigInput = z.input<typeof ApiConfigSchema>;

export function validateApiConfig(input: ApiConfigInput): ApiConfig {
  return ApiConfigSchema.parse(input);
}
