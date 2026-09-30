export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  requestId: string;
}

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface OnChainVerificationResult {
  valid: boolean;
  reason?: string;
  recomputedTermsCommitment?: string;
  recomputedObservationCommitment?: string;
  onChainState?: {
    caseId: string;
    status: string;
    termsCommitment: string;
    observationCommitment?: string;
    finalizedLedger?: number;
  };
  verifiedAt: string;
}

export interface OnChainCaseResponse {
  caseId: string;
  contractId: string;
  network: string;
  status: string;
  owner: string;
  counterparty?: string;
  termsCommitment: string;
  expiresAtLedger: number;
  createdAtLedger?: number;
  finalizedAtLedger?: number;
  observation?: {
    txHash: string;
    observationCommitment: string;
    observedLedger: number;
  };
  decision: {
    type: "NONE" | "MATCHED" | "BREAK";
    breakCode?: string;
  };
  transactionHashes?: {
    createTxHash?: string;
    observationTxHash?: string;
    reconciliationTxHash?: string;
    attestationTxHash?: string;
    disputeTxHash?: string;
    resolutionTxHash?: string;
    finalizationTxHash?: string;
  };
  fetchedAt: string;
}

export interface HistoryMilestone {
  event: string;
  status: string;
  timestamp: string;
  ledger?: number;
  txHash?: string;
  actor?: string;
  details?: unknown;
}

export interface CaseHistoryResponse {
  caseId: string;
  currentStatus: string;
  contractId: string;
  network: string;
  history: HistoryMilestone[];
  retrievedAt: string;
}

export type ConsistencyStatus =
  | "CONSISTENT"
  | "STALE_DATABASE"
  | "STALE_CHAIN_REFERENCE"
  | "COMMITMENT_MISMATCH"
  | "STATE_MISMATCH"
  | "MISSING_ONCHAIN_CASE";

export interface ConsistencyCheckDetails {
  termsCommitmentMatch: boolean;
  observationCommitmentMatch: boolean;
  statusMatch: boolean;
  onChainCaseExists: boolean;
  chainReferencePresent: boolean;
  attestationsConsistent?: boolean;
  disputeResolutionConsistent?: boolean;
  finalizationConsistent?: boolean;
  networkIdentityConsistent?: boolean;
  transactionReferences?: {
    createTxHash?: string;
    observationTxHash?: string;
    reconciliationTxHash?: string;
    attestationTxHash?: string;
    disputeTxHash?: string;
    resolutionTxHash?: string;
    finalizationTxHash?: string;
  };
  discrepancies: string[];
}

export interface CaseConsistencyResponse {
  caseId: string;
  contractId: string;
  network: string;
  consistencyStatus: ConsistencyStatus;
  isConsistent: boolean;
  databaseStatus?: string;
  onChainStatus?: string;
  details: ConsistencyCheckDetails;
  checkedAt: string;
}

export type AuditEventType =
  | "CASE_CREATED"
  | "OBSERVED"
  | "MATCHED"
  | "BREAK_RECORDED"
  | "ATTESTED"
  | "DISPUTED"
  | "RESOLVED"
  | "FINALIZED";

export interface AuditEventRecord {
  event: AuditEventType;
  status: string;
  timestamp: string;
  txHash?: string;
  ledger?: number;
  actor?: string;
  payload?: unknown;
}

export interface CaseAuditHistoryResponse {
  caseId: string;
  contractId: string;
  network: string;
  currentStatus: string;
  eventCount: number;
  events: AuditEventRecord[];
  generatedAt: string;
}

export type DependencyStatus = "up" | "down" | "degraded" | "simulated";

export interface ReadinessComponentReport {
  status: DependencyStatus;
  details?: Record<string, unknown>;
  error?: string;
}

export interface ReadinessResponse {
  status: "ready" | "degraded" | "not_ready";
  timestamp: string;
  version: string;
  network: string;
  contractId: string;
  services: {
    database: ReadinessComponentReport;
    sorobanRpc: ReadinessComponentReport;
    settlementRegistry: ReadinessComponentReport;
    indexer: ReadinessComponentReport;
  };
}

export interface HealthResponse {
  status: "ok" | "degraded";
  timestamp: string;
  version: string;
  uptimeSeconds: number;
}
