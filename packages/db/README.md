# @stellarclear/db

PostgreSQL persistence layer and repository interfaces for StellarClear.

## Tables

- `settlement_cases`
- `settlement_observations`
- `reconciliation_results`
- `breaks`
- `contract_events`
- `indexed_transactions`
- `attestations`
- `disputes`
- `resolutions`
- `ingestion_cursors`

## Usage

```typescript
import { createDatabaseClient, CaseRepository, runMigrations } from "@stellarclear/db";

const dbClient = createDatabaseClient({ databaseUrl: process.env.DATABASE_URL! });
await runMigrations(dbClient);

const caseRepo = new CaseRepository(dbClient);
const settlement = await caseRepo.findById("case_id_here", "testnet");
```
