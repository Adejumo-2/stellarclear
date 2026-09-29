/**
 * Normalizes a decimal string by stripping redundant leading and trailing zeroes.
 * Examples:
 * - "00100.5000" -> "100.5"
 * - "100.000"    -> "100"
 * - "0.00"       -> "0"
 */
export function normalizeDecimalAmount(amount: string): string {
  const trimmed = amount.trim();
  if (!trimmed) return "0";

  const [intPart, fracPart] = trimmed.split(".");
  // Strip leading zeroes from integer part (keeping at least one digit)
  const cleanInt = (intPart ?? "").replace(/^0+(?=\d)/, "") || "0";

  if (!fracPart) {
    return cleanInt;
  }

  // Strip trailing zeroes from fractional part
  const cleanFrac = fracPart.replace(/0+$/, "");
  if (!cleanFrac) {
    return cleanInt;
  }

  return `${cleanInt}.${cleanFrac}`;
}

/**
 * Compares two decimal amount strings for exact numerical equality without floating point conversion.
 */
export function compareDecimalAmounts(a: string, b: string): boolean {
  return normalizeDecimalAmount(a) === normalizeDecimalAmount(b);
}
