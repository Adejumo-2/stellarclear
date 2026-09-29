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
