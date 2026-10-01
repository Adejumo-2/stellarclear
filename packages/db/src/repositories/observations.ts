import type { IDatabaseClient, InMemoryDatabaseClient } from "../client.js";
import type { DbSettlementObservation } from "../types.js";

export class ObservationRepository {
  constructor(private client: IDatabaseClient) {}

  public async insert(obs: DbSettlementObservation): Promise<DbSettlementObservation> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("settlement_observations");
      const existing = table.find((r) => r["network"] === obs.network && r["case_id"] === obs.case_id && r["tx_hash"] === obs.tx_hash);
      if (existing) {
        Object.assign(existing, obs);
        return existing as unknown as DbSettlementObservation;
      }
      const record = { ...obs, id: table.length + 1 };
      table.push(record);
      return record;
    }

    const sql = `
      INSERT INTO settlement_observations (
        network, case_id, observer, tx_hash, observed_ledger,
        observation_commitment, observation_tx_hash, confirmed_at_ledger,
        asset, amount, destination, reference,
        status, observed_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (network, case_id, tx_hash) DO UPDATE SET
        observation_tx_hash = COALESCE(EXCLUDED.observation_tx_hash, settlement_observations.observation_tx_hash),
        confirmed_at_ledger = COALESCE(EXCLUDED.confirmed_at_ledger, settlement_observations.confirmed_at_ledger),
        observed_ledger = EXCLUDED.observed_ledger,
        observation_commitment = EXCLUDED.observation_commitment,
        asset = EXCLUDED.asset,
        amount = EXCLUDED.amount,
        destination = EXCLUDED.destination,
        reference = COALESCE(EXCLUDED.reference, settlement_observations.reference),
        status = EXCLUDED.status,
        observed_at = EXCLUDED.observed_at
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

  public async updateChainReferences(
    caseId: string,
    network: string,
    refs: { observation_tx_hash?: string; confirmed_at_ledger?: number }
  ): Promise<void> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("settlement_observations");
      const row = table.find((r) => r["case_id"] === caseId && r["network"] === network);
      if (row) {
        Object.assign(row, refs);
      }
      return;
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (refs.observation_tx_hash !== undefined) {
      setClauses.push(`observation_tx_hash = $${idx++}`);
      values.push(refs.observation_tx_hash);
    }
    if (refs.confirmed_at_ledger !== undefined) {
      setClauses.push(`confirmed_at_ledger = $${idx++}`);
      values.push(refs.confirmed_at_ledger);
    }
    if (setClauses.length === 0) return;
    values.push(caseId, network);
    const sql = `UPDATE settlement_observations SET ${setClauses.join(", ")} WHERE case_id = $${idx++} AND network = $${idx};`;
    await this.client.query(sql, values);
  }
}
