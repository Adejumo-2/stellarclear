# @stellarclear/indexer

Durable event ingestion and historical state indexing service for StellarClear SettlementRegistry.

## Handled Events

- `ObserverAdded`, `ObserverRemoved`
- `CaseCreated`, `ObservationRecorded`
- `CaseMatched`, `CaseBroken`
- `AttestationSubmitted`
- `DisputeOpened`, `ResolutionSubmitted`, `DisputeResolved`
- `CaseFinalized`

## Checkpointing & Idempotency

Maintains durable cursors in `ingestion_cursors` table. Safe on restart and replayed event batches.
