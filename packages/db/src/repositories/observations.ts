import type { IDatabaseClient, InMemoryDatabaseClient } from "../client.js";
import type { DbSettlementObservation } from "../types.js";

export class ObservationRepository {
  constructor(private client: IDatabaseClient) {}

  public async insert(obs: DbSettlementObservation): Promise<DbSettlementObservation> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("settlement_observations");
      table.push({ ...obs, id: table.length + 1 });
      return obs;
    }

    const sql = `
      INSERT INTO settlement_observations (
        network, case_id, observer, tx_hash, observed_ledger,
        observation_commitment, observation_tx_hash, confirmed_at_ledger,
        asset, amount, destination, reference,
        status, observed_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      RETURNING *;
    `;
    const params = [
      obs.network,
      obs.case_id,
      obs.observer,
      obs.tx_hash,
      obs.observed_ledger,
      obs.observation_commitment,
      obs.observation_tx_hash ?? null,
      obs.confirmed_at_ledger ?? null,
      obs.asset,
      obs.amount,
      obs.destination,
      obs.reference ?? null,
      obs.status,
      obs.observed_at,
    ];
    const res = await this.client.query<DbSettlementObservation>(sql, params);
    return res.rows[0];
  }

  public async findByCaseId(caseId: string, network: string): Promise<DbSettlementObservation | null> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("settlement_observations");
      const row = table.find((r) => r["case_id"] === caseId && r["network"] === network);
      return (row as unknown as DbSettlementObservation) ?? null;
    }

    const sql = `SELECT * FROM settlement_observations WHERE case_id = $1 AND network = $2 LIMIT 1;`;
    const res = await this.client.query<DbSettlementObservation>(sql, [caseId, network]);
    return res.rows[0] ?? null;
  }
}
