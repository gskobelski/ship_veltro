// lib/wz-normalizer.ts

const WZ_REGEX = /\b(WZ|ZZ)\s*\/?\s*(\d{1,6})(?:\s*\/\s*\d{1,6})*/gi;
const YEAR_SEGMENT_REGEX = /^(19|20)\d{2}$/;

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

  while ((match = WZ_REGEX.exec(text)) !== null) {
    const prefix = match[1];
    const numbers = Array.from(match[0].matchAll(/\d{1,6}/g), (numberMatch) => numberMatch[0]);

    const normalizedNumbers =
      numbers.length > 1 && YEAR_SEGMENT_REGEX.test(numbers[numbers.length - 1] ?? "")
        ? numbers.slice(0, -1)
        : numbers;

    for (const number of normalizedNumbers) {
      results.add(`${prefix}${number.padStart(6, "0")}`);
    }
  }

  return Array.from(results);
}
