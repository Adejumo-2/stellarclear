import type { IDatabaseClient, InMemoryDatabaseClient } from "../client.js";
import type { DbAttestation } from "../types.js";

export class AttestationRepository {
  constructor(private client: IDatabaseClient) {}

  public async insert(attestation: DbAttestation): Promise<DbAttestation> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("attestations");
      const record = { ...attestation, id: table.length + 1 };
      table.push(record);
      return record;
    }

    const sql = `
      INSERT INTO attestations (network, case_id, role, attestor, commitment, attested_at_ledger, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (network, case_id, attestor) DO NOTHING
      RETURNING *;
    `;
    const res = await this.client.query<DbAttestation>(sql, [
      attestation.network,
      attestation.case_id,
      attestation.role,
      attestation.attestor,
      attestation.commitment,
      attestation.attested_at_ledger,
    ]);
    return res.rows[0] ?? attestation;
  }

  public async listByCaseId(caseId: string, network: string): Promise<DbAttestation[]> {
    if ("getTable" in this.client) {
      const mem = this.client as unknown as InMemoryDatabaseClient;
      const table = mem.getTable("attestations");
      return table.filter((r) => r["case_id"] === caseId && r["network"] === network) as unknown as DbAttestation[];
    }

    const sql = `SELECT * FROM attestations WHERE case_id = $1 AND network = $2 ORDER BY id ASC;`;
    const res = await this.client.query<DbAttestation>(sql, [caseId, network]);
    return res.rows;
  }
}
