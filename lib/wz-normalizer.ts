// lib/wz-normalizer.ts

const WZ_REGEX = /\b(WZ|ZZ)\s*\/\s*(\d{1,6})\b/gi;

/**
 * Normalizes a single WZ/ZZ string to canonical form: WZ000123 / ZZ000201
 * Returns null if the input doesn't match the expected pattern.
 */
export function normalizeWz(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.trim().toUpperCase().match(/^(WZ|ZZ)\s*\/\s*(\d{1,6})/);
  if (!match) {
    // Try matching anywhere in the string
    const m = raw.toUpperCase().match(/\b(WZ|ZZ)\s*\/\s*(\d{1,6})\b/);
    if (!m) return null;
    const prefix = m[1];
    const num = m[2].padStart(6, "0");
    return `${prefix}${num}`;
  }
  const prefix = match[1];
  const num = match[2].padStart(6, "0");
  return `${prefix}${num}`;
}

/**
 * Extracts all WZ/ZZ numbers from a field value (may be semicolon-separated).
 * Returns deduplicated, normalized array.
 */
export function extractWzNumbers(raw: string | null | undefined): string[] {
  if (!raw) return [];

  const results = new Set<string>();
  const text = raw.toString().toUpperCase();
  let match: RegExpExecArray | null;

  const re = /\b(WZ|ZZ)\s*\/\s*(\d{1,6})\b/g;
  while ((match = re.exec(text)) !== null) {
    const prefix = match[1];
    const num = match[2].padStart(6, "0");
    results.add(`${prefix}${num}`);
  }

  return Array.from(results);
}
