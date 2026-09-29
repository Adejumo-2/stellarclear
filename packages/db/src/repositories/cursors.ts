import type { IDatabaseClient, InMemoryDatabaseClient } from "../client.js";
import type { DbIngestionCursor } from "../types.js";

export class CursorRepository {
  constructor(private client: IDatabaseClient) {}

  public async getCursor(network: string): Promise<DbIngestionCursor | null> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("ingestion_cursors");
      const row = table.find((r) => r["network"] === network);
      return (row as unknown as DbIngestionCursor) ?? null;
    }

    const sql = `SELECT * FROM ingestion_cursors WHERE network = $1 LIMIT 1;`;
    const res = await this.client.query<DbIngestionCursor>(sql, [network]);
    return res.rows[0] ?? null;
  }

  public async updateCursor(
    network: string,
    lastProcessedLedger: number,
    lastProcessedEventCursor?: string
  ): Promise<DbIngestionCursor> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("ingestion_cursors");
      let row = table.find((r) => r["network"] === network) as unknown as DbIngestionCursor | undefined;
      if (!row) {
        row = {
          network,
          last_processed_ledger: lastProcessedLedger,
          last_processed_event_cursor: lastProcessedEventCursor ?? null,
          updated_at: new Date(),
        };
        table.push(row as unknown as Record<string, unknown>);
      } else {
        row.last_processed_ledger = lastProcessedLedger;
        if (lastProcessedEventCursor !== undefined) {
          row.last_processed_event_cursor = lastProcessedEventCursor;
        }
        row.updated_at = new Date();
      }
      return row;
    }

    const sql = `
      INSERT INTO ingestion_cursors (network, last_processed_ledger, last_processed_event_cursor, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (network) DO UPDATE SET
        last_processed_ledger = EXCLUDED.last_processed_ledger,
        last_processed_event_cursor = COALESCE(EXCLUDED.last_processed_event_cursor, ingestion_cursors.last_processed_event_cursor),
        updated_at = NOW()
      RETURNING *;
    `;
    const res = await this.client.query<DbIngestionCursor>(sql, [
      network,
      lastProcessedLedger,
      lastProcessedEventCursor ?? null,
    ]);
    return res.rows[0];
  }
}
