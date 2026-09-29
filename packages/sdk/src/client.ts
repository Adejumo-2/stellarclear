import { Client as RegistryClient, rpc } from "settlement-registry";
import {
  validateConfig,
  type StellarClearConfig,
  type StellarClearConfigInput,
} from "./config.js";
import { normalizeContractError, type StellarClearError } from "./errors.js";

/**
 * Core StellarClear SDK client configured for interaction with Soroban SettlementRegistry.
 */
export class StellarClearClient {
  public readonly config: StellarClearConfig;
  public readonly contractClient: RegistryClient;
  public readonly rpcServer: rpc.Server;

  constructor(configInput: StellarClearConfigInput) {
    this.config = validateConfig(configInput);
    this.contractClient = new RegistryClient({
      contractId: this.config.contractId,
      networkPassphrase: this.config.networkPassphrase,
      rpcUrl: this.config.rpcUrl,
      allowHttp: this.config.allowHttp,
      publicKey: this.config.publicKey,
    });
    this.rpcServer = new rpc.Server(this.config.rpcUrl, {
      allowHttp: this.config.allowHttp,
    });
  }

  /**
   * Returns the configured contract ID.
   */
  public get contractId(): string {
    return this.config.contractId;
  }

  /**
   * Returns the configured network identifier.
   */
  public get network(): string {
    return this.config.network;
  }

  /**
   * Returns the network passphrase.
   */
  public get networkPassphrase(): string {
    return this.config.networkPassphrase;
  }

  /**
   * Normalizes contract or RPC errors into domain-specific StellarClearError types.
   */
  public normalizeError(err: unknown): StellarClearError {
    return normalizeContractError(err);
  }
}
