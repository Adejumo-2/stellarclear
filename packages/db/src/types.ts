import type {
  CaseStatus,
  BreakCode,
  AttestationRole,
  ReconciliationStatus,
  TransactionStatus,
} from "@stellarclear/schemas";

export interface DbSettlementCase {
  id: string;
  network: string;
  owner: string;
  counterparty?: string | null;
  trade_reference: string;
  asset: string;
  amount: string;
  expected_destination: string;
  reference?: string | null;
  terms_commitment: string;
  expires_at_ledger: number;
  status: CaseStatus;
  created_at_ledger?: number | null;
  finalized_at_ledger?: number | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface DbSettlementObservation {
  id?: number;
  network: string;
  case_id: string;
  observer: string;
  tx_hash: string;
  observed_ledger: number;
  observation_commitment: string;
  asset: string;
  amount: string;
  destination: string;
  reference?: string | null;
  status: TransactionStatus;
  observed_at: Date | string;
  created_at?: Date | string;
}

export interface DbReconciliationResult {
  id?: number;
  network: string;
  case_id: string;
  status: ReconciliationStatus;
  matched: boolean;
  reconciled_at: Date | string;
  created_at?: Date | string;
}

export interface DbBreak {
  id?: number;
  network: string;
  case_id: string;
  reconciliation_id?: number | null;
  code: BreakCode;
  field: string;
  expected_value?: string | null;
  observed_value?: string | null;
  message: string;
  created_at?: Date | string;
}

export interface DbContractEvent {
  id?: number;
  network: string;
  contract_id: string;
  ledger: number;
  tx_hash: string;
  event_type: string;
  case_id?: string | null;
  topic_xdr: string;
  data_xdr: string;
  cursor: string;
  created_at?: Date | string;
}

export interface DbIndexedTransaction {
  id?: number;
  network: string;
  tx_hash: string;
  ledger: number;
  status: string;
  memo?: string | null;
  created_at?: Date | string;
}

export interface DbAttestation {
  id?: number;
  network: string;
  case_id: string;
  role: AttestationRole;
  attestor: string;
  commitment: string;
  attested_at_ledger: number;
  created_at?: Date | string;
}

export interface DbDispute {
  id?: number;
  network: string;
  case_id: string;
  initiator: string;
  dispute_commitment: string;
  opened_at_ledger?: number | null;
  created_at?: Date | string;
}

export interface DbResolution {
  id?: number;
  network: string;
  case_id: string;
  resolver: string;
  resolution_commitment: string;
  submitted_at_ledger?: number | null;
  created_at?: Date | string;
}

export interface DbIngestionCursor {
  id?: number;
  network: string;
  last_processed_ledger: number;
  last_processed_event_cursor?: string | null;
  updated_at: Date | string;
}
