-- ==========================================================
-- StellarClear Initial PostgreSQL Schema
-- Version: 001
-- ==========================================================

-- 1. Settlement Cases
CREATE TABLE IF NOT EXISTS settlement_cases (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    network VARCHAR(32) NOT NULL,
    owner VARCHAR(56) NOT NULL,
    counterparty VARCHAR(56),
    trade_reference VARCHAR(128) NOT NULL,
    asset VARCHAR(128) NOT NULL,
    amount VARCHAR(64) NOT NULL,
    expected_destination VARCHAR(56) NOT NULL,
    reference VARCHAR(128),
    terms_commitment VARCHAR(64) NOT NULL,
    expires_at_ledger BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    created_at_ledger BIGINT,
    finalized_at_ledger BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_settlement_cases_network_id UNIQUE (network, id)
);

CREATE INDEX IF NOT EXISTS idx_settlement_cases_network_status ON settlement_cases(network, status);
CREATE INDEX IF NOT EXISTS idx_settlement_cases_owner ON settlement_cases(owner);
CREATE INDEX IF NOT EXISTS idx_settlement_cases_counterparty ON settlement_cases(counterparty);

-- 2. Settlement Observations
CREATE TABLE IF NOT EXISTS settlement_observations (
    id BIGSERIAL PRIMARY KEY,
    network VARCHAR(32) NOT NULL,
    case_id VARCHAR(64) NOT NULL REFERENCES settlement_cases(id) ON DELETE CASCADE,
    observer VARCHAR(56) NOT NULL,
    tx_hash VARCHAR(64) NOT NULL,
    observed_ledger BIGINT NOT NULL,
    observation_commitment VARCHAR(64) NOT NULL,
    asset VARCHAR(128) NOT NULL,
    amount VARCHAR(64) NOT NULL,
    destination VARCHAR(56) NOT NULL,
    reference VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
    observed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_settlement_observations_network_case_tx UNIQUE (network, case_id, tx_hash)
);

CREATE INDEX IF NOT EXISTS idx_settlement_observations_case_id ON settlement_observations(case_id);

-- 3. Reconciliation Results
CREATE TABLE IF NOT EXISTS reconciliation_results (
    id BIGSERIAL PRIMARY KEY,
    network VARCHAR(32) NOT NULL,
    case_id VARCHAR(64) NOT NULL REFERENCES settlement_cases(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL,
    matched BOOLEAN NOT NULL,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_reconciliation_results_network_case UNIQUE (network, case_id)
);

-- 4. Breaks
CREATE TABLE IF NOT EXISTS breaks (
    id BIGSERIAL PRIMARY KEY,
    network VARCHAR(32) NOT NULL,
    case_id VARCHAR(64) NOT NULL REFERENCES settlement_cases(id) ON DELETE CASCADE,
    reconciliation_id BIGINT REFERENCES reconciliation_results(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL,
    field VARCHAR(64) NOT NULL,
    expected_value TEXT,
    observed_value TEXT,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_breaks_case_id ON breaks(case_id);

-- 5. Contract Events
CREATE TABLE IF NOT EXISTS contract_events (
    id BIGSERIAL PRIMARY KEY,
    network VARCHAR(32) NOT NULL,
    contract_id VARCHAR(56) NOT NULL,
    ledger BIGINT NOT NULL,
    tx_hash VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    case_id VARCHAR(64),
    topic_xdr TEXT NOT NULL,
    data_xdr TEXT NOT NULL,
    cursor VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contract_events_network_cursor UNIQUE (network, cursor)
);

CREATE INDEX IF NOT EXISTS idx_contract_events_case_id ON contract_events(case_id);
CREATE INDEX IF NOT EXISTS idx_contract_events_ledger ON contract_events(network, ledger);

-- 6. Indexed Transactions
CREATE TABLE IF NOT EXISTS indexed_transactions (
    id BIGSERIAL PRIMARY KEY,
    network VARCHAR(32) NOT NULL,
    tx_hash VARCHAR(64) NOT NULL,
    ledger BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,
    memo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_indexed_transactions_network_hash UNIQUE (network, tx_hash)
);

-- 7. Attestations
CREATE TABLE IF NOT EXISTS attestations (
    id BIGSERIAL PRIMARY KEY,
    network VARCHAR(32) NOT NULL,
    case_id VARCHAR(64) NOT NULL REFERENCES settlement_cases(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL,
    attestor VARCHAR(56) NOT NULL,
    commitment VARCHAR(64) NOT NULL,
    attested_at_ledger BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_attestations_network_case_attestor UNIQUE (network, case_id, attestor)
);

-- 8. Disputes
CREATE TABLE IF NOT EXISTS disputes (
    id BIGSERIAL PRIMARY KEY,
    network VARCHAR(32) NOT NULL,
    case_id VARCHAR(64) NOT NULL REFERENCES settlement_cases(id) ON DELETE CASCADE,
    initiator VARCHAR(56) NOT NULL,
    dispute_commitment VARCHAR(64) NOT NULL,
    opened_at_ledger BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_disputes_network_case_initiator UNIQUE (network, case_id, initiator)
);

-- 9. Resolutions
CREATE TABLE IF NOT EXISTS resolutions (
    id BIGSERIAL PRIMARY KEY,
    network VARCHAR(32) NOT NULL,
    case_id VARCHAR(64) NOT NULL REFERENCES settlement_cases(id) ON DELETE CASCADE,
    resolver VARCHAR(56) NOT NULL,
    resolution_commitment VARCHAR(64) NOT NULL,
    submitted_at_ledger BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_resolutions_network_case_resolver UNIQUE (network, case_id, resolver)
);

-- 10. Ingestion Cursors
CREATE TABLE IF NOT EXISTS ingestion_cursors (
    id BIGSERIAL PRIMARY KEY,
    network VARCHAR(32) NOT NULL UNIQUE,
    last_processed_ledger BIGINT NOT NULL DEFAULT 0,
    last_processed_event_cursor VARCHAR(128),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
