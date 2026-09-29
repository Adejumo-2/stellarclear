declare module "node:crypto" {
  export interface Hash {
    update(data: string | Uint8Array, inputEncoding?: string): Hash;
    digest(): Buffer;
    digest(encoding: "hex" | "base64"): string;
  }
  export function createHash(algorithm: string): Hash;
}
