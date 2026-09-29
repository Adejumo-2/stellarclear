import type { IDatabaseClient, InMemoryDatabaseClient } from "../client.js";
import type { DbContractEvent } from "../types.js";

export class ContractEventRepository {
  constructor(private client: IDatabaseClient) {}

  public async insert(event: DbContractEvent): Promise<DbContractEvent> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("contract_events");
      const existing = table.find((r) => r["cursor"] === event.cursor && r["network"] === event.network);
      if (existing) {
        return existing as unknown as DbContractEvent;
      }
      const record = { ...event, id: table.length + 1 };
      table.push(record);
      return record;
    }

    const sql = `
      INSERT INTO contract_events (
        network, contract_id, ledger, tx_hash, event_type,
        case_id, topic_xdr, data_xdr, cursor, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (network, cursor) DO UPDATE SET updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      event.network,
      event.contract_id,
      event.ledger,
      event.tx_hash,
      event.event_type,
      event.case_id ?? null,
      event.topic_xdr,
      event.data_xdr,
      event.cursor,
    ];
    const res = await this.client.query<DbContractEvent>(sql, params);
    return res.rows[0];
  }

  public async listByCaseId(caseId: string, network: string): Promise<DbContractEvent[]> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("contract_events");
      return table
        .filter((r) => r["case_id"] === caseId && r["network"] === network)
        .sort((a, b) => (Number(a["ledger"]) || 0) - (Number(b["ledger"]) || 0)) as unknown as DbContractEvent[];
    }

    const sql = `SELECT * FROM contract_events WHERE case_id = $1 AND network = $2 ORDER BY ledger ASC;`;
    const res = await this.client.query<DbContractEvent>(sql, [caseId, network]);
    return res.rows;
  }
}
