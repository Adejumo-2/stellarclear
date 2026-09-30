import type { HttpResponse } from "./types.js";
import { computePayloadHash, IdempotencyKeySchema } from "./validation.js";

export interface CachedIdempotentResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  payloadHash: string;
  cachedAt: string;
}

export type IdempotencyLookupResult =
  | { status: "HIT"; response: HttpResponse }
  | { status: "CONFLICT"; message: string }
  | { status: "MISS" };

/**
 * IdempotencyManager provides memory-cached idempotency key tracking, payload fingerprinting,
 * and conflict protection for mutating HTTP operations across StellarClear API services.
 */
export class IdempotencyManager {
  private cache = new Map<string, CachedIdempotentResponse>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = 86400000) {
    this.ttlMs = ttlMs;
  }

  private buildKey(method: string, pathname: string, idempotencyKey: string): string {
    return `${method.toUpperCase()}:${pathname}:${idempotencyKey.trim()}`;
  }

  /**
   * Validates an idempotency key format.
   */
  public validateKey(key: string): { valid: boolean; error?: string } {
    const parsed = IdempotencyKeySchema.safeParse(key);
    if (!parsed.success) {
      return { valid: false, error: parsed.error.issues[0]?.message ?? "Invalid Idempotency-Key" };
    }
    return { valid: true };
  }

  /**
   * Looks up a cached response, validating payload fingerprint equality.
   */
  public evaluate(
    method: string,
    pathname: string,
    idempotencyKey: string,
    payload: unknown
  ): IdempotencyLookupResult {
    const key = this.buildKey(method, pathname, idempotencyKey);
    const cached = this.cache.get(key);
    if (!cached) {
      return { status: "MISS" };
    }

    const currentHash = computePayloadHash(payload);
    if (cached.payloadHash !== currentHash) {
      return {
        status: "CONFLICT",
        message: `Idempotency key '${idempotencyKey}' was already used with a different request payload`,
      };
    }

    return {
      status: "HIT",
      response: {
        statusCode: cached.statusCode,
        headers: {
          ...cached.headers,
          "x-idempotent-replay": "true",
        },
        body: cached.body,
      },
    };
  }

  public get(method: string, pathname: string, idempotencyKey: string): HttpResponse | null {
    const key = this.buildKey(method, pathname, idempotencyKey);
    const cached = this.cache.get(key);
    if (!cached) return null;

    return {
      statusCode: cached.statusCode,
      headers: {
        ...cached.headers,
        "x-idempotent-replay": "true",
      },
      body: cached.body,
    };
  }

  public set(
    method: string,
    pathname: string,
    idempotencyKey: string,
    payload: unknown,
    response: HttpResponse
  ): void {
    const key = this.buildKey(method, pathname, idempotencyKey);
    const payloadHash = computePayloadHash(payload);
    this.cache.set(key, {
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body,
      payloadHash,
      cachedAt: new Date().toISOString(),
    });
  }

  public has(method: string, pathname: string, idempotencyKey: string): boolean {
    const key = this.buildKey(method, pathname, idempotencyKey);
    return this.cache.has(key);
  }

  public clear(): void {
    this.cache.clear();
  }
}
