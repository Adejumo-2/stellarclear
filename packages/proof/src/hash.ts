import { Buffer } from "buffer";
import { createHash } from "node:crypto";

/**
 * Computes the SHA-256 hash of a string or byte array and returns a 64-character lowercase hex string.
 */
export function sha256Hex(content: string | Uint8Array): string {
  const hash = createHash("sha256");
  if (typeof content === "string") {
    hash.update(content, "utf8");
  } else {
    hash.update(content);
  }
  return hash.digest("hex").toLowerCase();
}

/**
 * Computes the SHA-256 hash of a string or byte array and returns exactly 32 bytes as a Uint8Array.
 */
export function sha256Bytes(content: string | Uint8Array): Uint8Array {
  const hash = createHash("sha256");
  if (typeof content === "string") {
    hash.update(content, "utf8");
  } else {
    hash.update(content);
  }
  return new Uint8Array(hash.digest());
}

/**
 * Computes the SHA-256 hash of a string or byte array and returns a 32-byte Buffer.
 */
export function sha256Buffer(content: string | Uint8Array): Buffer {
  const hash = createHash("sha256");
  if (typeof content === "string") {
    hash.update(content, "utf8");
  } else {
    hash.update(content);
  }
  return Buffer.from(hash.digest());
}
