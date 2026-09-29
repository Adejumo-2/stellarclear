import type { IDatabaseClient, InMemoryDatabaseClient } from "../client.js";
import type { DbIndexedTransaction } from "../types.js";

export class IndexedTransactionRepository {
  constructor(private client: IDatabaseClient) {}

  public async insert(tx: DbIndexedTransaction): Promise<DbIndexedTransaction> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("indexed_transactions");
      const existing = table.find((r) => r["tx_hash"] === tx.tx_hash && r["network"] === tx.network);
      if (existing) {
        return existing as unknown as DbIndexedTransaction;
      }
      const record = { ...tx, id: table.length + 1 };
      table.push(record);
      return record;
    }

    const sql = `
      INSERT INTO indexed_transactions (network, tx_hash, ledger, status, memo, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (network, tx_hash) DO NOTHING
      RETURNING *;
    `;
    const res = await this.client.query<DbIndexedTransaction>(sql, [
      tx.network,
      tx.tx_hash,
      tx.ledger,
      tx.status,
      tx.memo ?? null,
    ]);
    return res.rows[0] ?? tx;
  }

  public async findByHash(txHash: string, network: string): Promise<DbIndexedTransaction | null> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("indexed_transactions");
      const row = table.find((r) => r["tx_hash"] === txHash && r["network"] === network);
      return (row as unknown as DbIndexedTransaction) ?? null;
    }

    const sql = `SELECT * FROM indexed_transactions WHERE tx_hash = $1 AND network = $2 LIMIT 1;`;
    const res = await this.client.query<DbIndexedTransaction>(sql, [txHash, network]);
    return res.rows[0] ?? null;
  }
}
