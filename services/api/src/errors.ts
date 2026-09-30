export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_STATE"
  | "IDEMPOTENCY_CONFLICT"
  | "MALFORMED_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "ROUTE_NOT_FOUND"
  | "INTERNAL_SERVER_ERROR";

/**
 * Sanitizes and formats an API error response without leaking internal server/stack details.
 */
export function formatApiError(
  code: ApiErrorCode | string,
  message: string,
  requestId: string,
  details?: unknown
): ApiErrorEnvelope {
  // Sanitize internal details if any sensitive paths or credentials might appear
  let sanitizedDetails = details;
  if (typeof details === "string" && (details.includes("password") || details.includes("postgres://") || details.includes("stack"))) {
    sanitizedDetails = undefined;
  }

  return {
    error: {
      code,
      message,
      requestId,
      details: sanitizedDetails,
    },
  };
}

export class ApiSecurityError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "ApiSecurityError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
