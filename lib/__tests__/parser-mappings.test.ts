import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseImpulsFile } from "../parsers/impuls";
import { parseGlsFile } from "../parsers/gls";
import { parseCustomersFile } from "../parsers/customers";

function buildWorkbook(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("parser column mappings", () => {
  it("lets IMPULS mapping override alias-based WZ detection", () => {
    const buffer = buildWorkbook([
      ["Nr faktury", "Data sprzedaży", "Kod płatnika", "Wartość netto", "Nr WZ", "Mapped WZ"],
      ["FV/1/2026", "2026-04-01", "K-1", "100", "WZ/000001/2026", "WZ/000482/2026; WZ/000483/2026"],
    ]);

    const result = parseImpulsFile(buffer, "upload-1", "org-1", {
      wzNumbers: "Mapped WZ",
    });

    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].wz_numbers).toEqual(["WZ000482", "WZ000483"]);
  });

  it("lets GLS mapping override alias-based WZ detection and fills carrier fields", () => {
    const buffer = buildWorkbook([
      [
        "Nr przesyłki",
        "Data wysyłki",
        "Nazwa odbiorcy",
        "Miasto",
        "Kod pocztowy",
        "Waga",
        "Ilość paczek",
        "Koszt netto",
        "Nr WZ",
        "Mapped WZ",
        "Carrier Source",
        "Carrier Invoice Source",
      ],
      [
        "SHP/1/2026",
        "2026-04-01",
        "Odbiorca",
        "Warszawa",
        "00-001",
        "2.5",
        "1",
        "25.5",
        "WZ/000001/2026",
        "WZ/000100/2026",
        "Kurier X",
        "FV/KUR/2026/77",
      ],
    ]);

    const result = parseGlsFile(buffer, "upload-1", "org-1", {
      wzNumber: "Mapped WZ",
      carrierName: "Carrier Source",
      carrierInvoiceNumber: "Carrier Invoice Source",
    });

    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].wz_number).toBe("WZ000100");
    expect(result.records[0].carrier_name).toBe("Kurier X");
    expect(result.records[0].carrier_invoice_number).toBe("FV/KUR/2026/77");
  });

  it("lets customers mapping override alias-based detection", () => {
    const buffer = buildWorkbook([
      ["Kod klienta", "Mapped code", "Nazwa klienta", "NIP"],
      ["AUTO-IGNORED", "CUST-42", "Klient Test", "1234567890"],
    ]);

    const result = parseCustomersFile(buffer, "upload-1", "org-1", {
      customerCode: "Mapped code",
    });

    expect(result.errors).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].customer_code).toBe("CUST-42");
    expect(result.records[0].customer_name).toBe("Klient Test");
  });
});
