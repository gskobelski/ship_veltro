import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { buildTemplateWorkbook } from "../templates/excel-templates";

function extractHeaders(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as string[][];
  return rows[0] ?? [];
}

describe("buildTemplateWorkbook", () => {
  it("builds an IMPULS template with required headers", () => {
    const headers = extractHeaders(buildTemplateWorkbook("impuls"));
    expect(headers).toEqual([
      "Numer faktury",
      "Data wystawienia faktury",
      "ID płatnika",
      "NIP",
      "Wartość netto",
      "Nr WZ",
    ]);
  });

  it("builds a GLS template with required headers", () => {
    const headers = extractHeaders(buildTemplateWorkbook("gls"));
    expect(headers).toEqual([
      "Nr WZ",
      "Koszt netto",
      "Nr przesyłki",
      "Nr klienta",
      "Data wysyłki",
      "Nazwa kuriera",
      "Nr faktury kuriera",
    ]);
  });

  it("builds a customers template with required headers", () => {
    const headers = extractHeaders(buildTemplateWorkbook("customers"));
    expect(headers).toEqual([
      "ID płatnika",
      "Pełna nazwa klienta",
      "NIP",
    ]);
  });
});
