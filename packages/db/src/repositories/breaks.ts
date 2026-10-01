import type { IDatabaseClient, InMemoryDatabaseClient } from "../client.js";
import type { DbBreak } from "../types.js";

export class BreakRepository {
  constructor(private client: IDatabaseClient) {}

  public async insertMany(breaks: DbBreak[]): Promise<DbBreak[]> {
    if (breaks.length === 0) return [];

    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("breaks");
      const inserted: DbBreak[] = [];
      for (const b of breaks) {
        const existing = table.find((r) => r["case_id"] === b.case_id && r["network"] === b.network && r["code"] === b.code);
        if (existing) {
          Object.assign(existing, b);
          inserted.push(existing as unknown as DbBreak);
        } else {
          const item = { ...b, id: table.length + 1 };
          table.push(item);
          inserted.push(item);
        }
      }
      return inserted;
    }

    const inserted: DbBreak[] = [];
    for (const b of breaks) {
      const sql = `
        INSERT INTO breaks (
          network, case_id, reconciliation_id, code, field,
          expected_value, observed_value, message, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *;
      `;
      const res = await this.client.query<DbBreak>(sql, [
        b.network,
        b.case_id,
        b.reconciliation_id ?? null,
        b.code,
        b.field,
        b.expected_value ?? null,
        b.observed_value ?? null,
        b.message,
      ]);
      inserted.push(res.rows[0]);
    }
    return inserted;
  }

  public async findByCaseId(caseId: string, network: string): Promise<DbBreak[]> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("breaks");
      return table.filter((r) => r["case_id"] === caseId && r["network"] === network) as unknown as DbBreak[];
    }

    const sql = `SELECT * FROM breaks WHERE case_id = $1 AND network = $2 ORDER BY id ASC;`;
    const res = await this.client.query<DbBreak>(sql, [caseId, network]);
    return res.rows;
  }
}
