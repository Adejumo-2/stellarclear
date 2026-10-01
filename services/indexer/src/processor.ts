import type { IDatabaseClient } from "@stellarclear/db";
import { SettlementStateSynchronizer } from "./settlement-sync.js";
import type { DecodedContractEvent } from "./types.js";

/**
 * Event processor that coordinates contract event persistence and settlement
 * state synchronization across database repositories.
 */
export class EventProcessor {
  private synchronizer: SettlementStateSynchronizer;

  constructor(private client: IDatabaseClient, private network: string) {
    this.synchronizer = new SettlementStateSynchronizer(client, network);
  }

  /**
   * Processes a decoded Soroban contract event and idempotently updates
   * settlement cases, observations, attestations, disputes, and chain references.
   */
  public async processEvent(event: DecodedContractEvent): Promise<void> {
    await this.synchronizer.syncEvent(event);
  }
}
