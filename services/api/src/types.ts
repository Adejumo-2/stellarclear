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
