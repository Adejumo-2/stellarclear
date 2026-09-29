import type { IDatabaseClient, InMemoryDatabaseClient } from "../client.js";
import type { DbReconciliationResult } from "../types.js";

export class ReconciliationRepository {
  constructor(private client: IDatabaseClient) {}

  public async insert(result: DbReconciliationResult): Promise<DbReconciliationResult> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("reconciliation_results");
      const record = { ...result, id: table.length + 1 };
      table.push(record);
      return record;
    }

    const sql = `
      INSERT INTO reconciliation_results (network, case_id, status, matched, reconciled_at, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *;
    `;
    const res = await this.client.query<DbReconciliationResult>(sql, [
      result.network,
      result.case_id,
      result.status,
      result.matched,
      result.reconciled_at,
    ]);
    return res.rows[0];
  }

  public async findByCaseId(caseId: string, network: string): Promise<DbReconciliationResult | null> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("reconciliation_results");
      const row = table.find((r) => r["case_id"] === caseId && r["network"] === network);
      return (row as unknown as DbReconciliationResult) ?? null;
    }

    const sql = `SELECT * FROM reconciliation_results WHERE case_id = $1 AND network = $2 LIMIT 1;`;
    const res = await this.client.query<DbReconciliationResult>(sql, [caseId, network]);
    return res.rows[0] ?? null;
  }
}
