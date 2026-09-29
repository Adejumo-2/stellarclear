import type { HttpResponse } from "./types.js";

export interface CachedIdempotentResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  cachedAt: string;
}

/**
 * IdempotencyManager provides memory-cached idempotency key tracking and response replay protection
 * for mutating HTTP operations (POST / PUT / DELETE) across StellarClear API services.
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
    response: HttpResponse
  ): void {
    const key = this.buildKey(method, pathname, idempotencyKey);
    this.cache.set(key, {
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body,
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
