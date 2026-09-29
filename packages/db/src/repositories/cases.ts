import type { IDatabaseClient, InMemoryDatabaseClient } from "../client.js";
import type { DbSettlementCase } from "../types.js";
import type { CaseStatus } from "@stellarclear/schemas";

export class CaseRepository {
  constructor(private client: IDatabaseClient) {}

  public async insert(caseData: DbSettlementCase): Promise<DbSettlementCase> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("settlement_cases");
      const existing = table.find((r) => r["id"] === caseData.id && r["network"] === caseData.network);
      if (existing) {
        throw new Error(`Duplicate case ${caseData.id} on network ${caseData.network}`);
      }
      table.push({ ...caseData });
      return caseData;
    }

    const sql = `
      INSERT INTO settlement_cases (
        id, network, owner, counterparty, trade_reference, asset, amount,
        expected_destination, reference, terms_commitment, expires_at_ledger,
        status, created_at_ledger, finalized_at_ledger, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      RETURNING *;
    `;
    const params = [
      caseData.id,
      caseData.network,
      caseData.owner,
      caseData.counterparty ?? null,
      caseData.trade_reference,
      caseData.asset,
      caseData.amount,
      caseData.expected_destination,
      caseData.reference ?? null,
      caseData.terms_commitment,
      caseData.expires_at_ledger,
      caseData.status,
      caseData.created_at_ledger ?? null,
      caseData.finalized_at_ledger ?? null,
    ];
    const res = await this.client.query<DbSettlementCase>(sql, params);
    return res.rows[0];
  }

  public async findById(id: string, network: string): Promise<DbSettlementCase | null> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("settlement_cases");
      const row = table.find((r) => r["id"] === id.toLowerCase() && r["network"] === network);
      return (row as unknown as DbSettlementCase) ?? null;
    }

    const sql = `SELECT * FROM settlement_cases WHERE id = $1 AND network = $2 LIMIT 1;`;
    const res = await this.client.query<DbSettlementCase>(sql, [id.toLowerCase(), network]);
    return res.rows[0] ?? null;
  }

  public async updateStatus(
    id: string,
    network: string,
    status: CaseStatus,
    finalizedLedger?: number
  ): Promise<void> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("settlement_cases");
      const row = table.find((r) => r["id"] === id.toLowerCase() && r["network"] === network);
      if (row) {
        row["status"] = status;
        row["updated_at"] = new Date();
        if (finalizedLedger !== undefined) {
          row["finalized_at_ledger"] = finalizedLedger;
        }
      }
      return;
    }

    const sql = `
      UPDATE settlement_cases
      SET status = $1, finalized_at_ledger = COALESCE($2, finalized_at_ledger), updated_at = NOW()
      WHERE id = $3 AND network = $4;
    `;
    await this.client.query(sql, [status, finalizedLedger ?? null, id.toLowerCase(), network]);
  }

  public async list(network: string, limit = 50, offset = 0): Promise<DbSettlementCase[]> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("settlement_cases");
      return table
        .filter((r) => r["network"] === network)
        .slice(offset, offset + limit) as unknown as DbSettlementCase[];
    }

    const sql = `
      SELECT * FROM settlement_cases
      WHERE network = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    const res = await this.client.query<DbSettlementCase>(sql, [network, limit, offset]);
    return res.rows;
  }
}
