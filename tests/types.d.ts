declare module "node:test" {
  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
}

declare module "node:assert/strict" {
  export function ok(value: unknown, message?: string): void;
  export function strictEqual<T>(actual: unknown, expected: T, message?: string): void;
  export function notStrictEqual<T>(actual: unknown, expected: T, message?: string): void;
  export function deepStrictEqual<T>(actual: unknown, expected: T, message?: string): void;
  export function notDeepStrictEqual<T>(actual: unknown, expected: T, message?: string): void;
  export function rejects(asyncFn: () => Promise<unknown>, error?: unknown, message?: string): Promise<void>;
  export function throws(fn: () => unknown, error?: unknown, message?: string): void;
}
