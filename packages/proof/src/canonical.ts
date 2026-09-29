export const TERMS_DOMAIN_PREFIX = "STELLARCLEAR/TERMS/V1";
export const OBSERVATION_DOMAIN_PREFIX = "STELLARCLEAR/OBSERVATION/V1";
export const RESOLUTION_DOMAIN_PREFIX = "STELLARCLEAR/RESOLUTION/V1";

/**
 * Recursively normalizes a data structure so that:
 * 1. Object keys are lexicographically sorted.
 * 2. Undefined values are normalized to null or omitted consistently.
 * 3. Exact primitive representations are preserved.
 */
export function canonicalizeValue(val: unknown): unknown {
  if (val === null || val === undefined) {
    return null;
  }

  if (typeof val === "boolean" || typeof val === "number" || typeof val === "string") {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map((item) => canonicalizeValue(item));
  }

  if (typeof val === "object") {
    const sortedObj: Record<string, unknown> = {};
    const keys = Object.keys(val as Record<string, unknown>).sort();
    for (const k of keys) {
      const v = (val as Record<string, unknown>)[k];
      if (v !== undefined) {
        sortedObj[k] = canonicalizeValue(v);
      } else {
        sortedObj[k] = null;
      }
    }
    return sortedObj;
  }

  return String(val);
}

/**
 * Produces a deterministic canonical UTF-8 JSON string with zero extraneous whitespace.
 */
export function canonicalStringify(val: unknown): string {
  const normalized = canonicalizeValue(val);
  return JSON.stringify(normalized);
}

/**
 * Formats a domain document with its protocol prefix and UTF-8 encoding.
 */
export function formatDomainDocument(domainPrefix: string, payload: unknown): string {
  const serialized = canonicalStringify(payload);
  return `${domainPrefix}\n${serialized}`;
}
