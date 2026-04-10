import { describe, it, expect } from "vitest";
import { normalizeWz, extractWzNumbers } from "../wz-normalizer";

describe("normalizeWz", () => {
  it("normalizes WZ/000482/2025 to WZ000482", () => {
    expect(normalizeWz("WZ/000482/2025")).toBe("WZ000482");
  });

  it("normalizes ZZ/000201/... to ZZ000201", () => {
    expect(normalizeWz("ZZ/000201/2025")).toBe("ZZ000201");
  });

  it("pads short numbers to 6 digits", () => {
    expect(normalizeWz("WZ/482/2025")).toBe("WZ000482");
  });

  it("handles lowercase input", () => {
    expect(normalizeWz("wz/000482/2025")).toBe("WZ000482");
  });

  it("returns null for unrecognized strings", () => {
    expect(normalizeWz("BRAK")).toBeNull();
    expect(normalizeWz("")).toBeNull();
    expect(normalizeWz("   ")).toBeNull();
  });
});

describe("extractWzNumbers", () => {
  it("extracts multiple WZ from semicolon-separated string", () => {
    const result = extractWzNumbers("WZ/000482/2025; WZ/000483/2025");
    expect(result).toEqual(["WZ000482", "WZ000483"]);
  });

  it("deduplicates WZ numbers", () => {
    const result = extractWzNumbers("WZ/000482/2025; WZ/000482/2025");
    expect(result).toEqual(["WZ000482"]);
  });

  it("returns empty array when no WZ found", () => {
    expect(extractWzNumbers("")).toEqual([]);
    expect(extractWzNumbers(null)).toEqual([]);
  });

  it("handles mixed WZ and ZZ in one string", () => {
    const result = extractWzNumbers("WZ/000100/2025; ZZ/000201/2025");
    expect(result).toEqual(["WZ000100", "ZZ000201"]);
  });
});
