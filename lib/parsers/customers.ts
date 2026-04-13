/**
 * Customer Base (Baza Klientów) Parser
 *
 * Parses the customer master file into normalized CustomerRecord objects.
 * Expected columns (flexible naming):
 * - Kod klienta / Customer code
 * - Nazwa / Name
 * - NIP
 * - Adres / Address
 * - Miasto / City
 * - Kod pocztowy
 * - Region / Województwo
 * - Przedstawiciel / Trade rep
 * - Termin płatności / Payment days
 * - Limit kredytowy / Credit limit
 */

import * as XLSX from "xlsx";
import type { ParseResult, CustomerRecord } from "../../types";

const COL_ALIASES: Record<keyof CustomerRow, string[]> = {
  customerCode: [
    "kod klienta", "kod", "customer code", "id klienta", "klient kod",
    "nr klienta", "indeks", "symbol",
  ],
  customerName: [
    "nazwa", "nazwa klienta", "customer name", "firma", "name",
    "pełna nazwa", "kontrahent",
  ],
  nip: ["nip", "tax id", "vat number", "numer nip", "nr nip"],
  address: [
    "adres", "ulica", "address", "street", "adres (ulica)",
  ],
  city: ["miasto", "city", "miejscowość"],
  postalCode: ["kod pocztowy", "postal code", "zip", "kod"],
  region: [
    "region", "województwo", "voivodeship", "obszar", "strefa",
  ],
  tradeRep: [
    "przedstawiciel", "handlowiec", "trade rep", "opiekun", "representant",
    "salesperson",
  ],
  paymentDays: [
    "termin płatności", "termin platnosci", "payment days", "dni",
    "termin", "credit days",
  ],
  creditLimit: [
    "limit kredytowy", "limit", "credit limit", "kredyt",
  ],
};

interface CustomerRow {
  customerCode: string | null;
  customerName: string | null;
  nip: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  region: string | null;
  tradeRep: string | null;
  paymentDays: number | null;
  creditLimit: number | null;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildColumnMap(headers: string[]): Map<string, keyof CustomerRow> {
  const map = new Map<string, keyof CustomerRow>();
  for (const [field, aliases] of Object.entries(COL_ALIASES) as [keyof CustomerRow, string[]][]) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeHeader(alias);
      for (const header of headers) {
        if (normalizeHeader(header) === normalizedAlias && !map.has(header)) {
          map.set(header, field);
        }
      }
    }
  }
  return map;
}

function findHeaderIndex(headers: string[], targetHeader: string): number {
  const normalizedTarget = normalizeHeader(targetHeader);
  return headers.findIndex((header) => normalizeHeader(header) === normalizedTarget);
}

function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return val;
  const str = String(val).replace(/\s/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function parseString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === "" ? null : s;
}

export function parseCustomersFile(
  fileBuffer: Buffer,
  uploadId: string,
  orgId: string,
  mapping: Record<string, string> = {}
): ParseResult<Omit<CustomerRecord, "id">> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const records: Omit<CustomerRecord, "id">[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: "buffer" });
  } catch (e) {
    return { records: [], errors: [`Nie można odczytać pliku Bazy Klientów: ${String(e)}`], warnings: [], rowCount: 0 };
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });

  if (raw.length < 2) {
    return { records: [], errors: ["Plik Bazy Klientów jest pusty."], warnings: [], rowCount: 0 };
  }

  // Find header row
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const row = raw[i];
    const joined = row.map((c) => String(c ?? "").toLowerCase()).join(" ");
    if (joined.includes("kod") && (joined.includes("nazwa") || joined.includes("klient"))) {
      headerRowIndex = i;
      break;
    }
  }

  const headerRow = raw[headerRowIndex] as string[];
  const fieldIndex = new Map<keyof CustomerRow, number>();
  const usedIndexes = new Set<number>();

  for (const [field, headerName] of Object.entries(mapping) as [keyof CustomerRow, string][]) {
    const idx = findHeaderIndex(headerRow, headerName);
    if (idx >= 0 && !fieldIndex.has(field) && !usedIndexes.has(idx)) {
      fieldIndex.set(field, idx);
      usedIndexes.add(idx);
    }
  }

  const columnMap = buildColumnMap(headerRow);
  headerRow.forEach((h, idx) => {
    const field = columnMap.get(h);
    if (!field || usedIndexes.has(idx)) return;
    if (!fieldIndex.has(field)) fieldIndex.set(field, idx);
    usedIndexes.add(idx);
  });

  const dataRows = raw.slice(headerRowIndex + 1);

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx];
    if (!row || row.every((c) => c === null || c === "")) continue;

    const get = (field: keyof CustomerRow): unknown => {
      const idx = fieldIndex.get(field);
      return idx !== undefined ? row[idx] : null;
    };

    const customerCode = parseString(get("customerCode"));
    const customerName = parseString(get("customerName"));

    if (!customerCode && !customerName) continue;

    const rawData: Record<string, unknown> = {};
    headerRow.forEach((h, i) => { if (h) rawData[h] = row[i]; });

    records.push({
      org_id: orgId,
      upload_id: uploadId,
      customer_code: customerCode ?? `ROW-${rowIdx + 1}`,
      customer_name: customerName ?? "",
      nip: parseString(get("nip")),
      address: parseString(get("address")),
      city: parseString(get("city")),
      postal_code: parseString(get("postalCode")),
      region: parseString(get("region")),
      trade_rep: parseString(get("tradeRep")),
      payment_days: parseNumber(get("paymentDays")) ? Math.round(parseNumber(get("paymentDays"))!) : null,
      credit_limit: parseNumber(get("creditLimit")),
      raw_data: rawData,
    });
  }

  if (records.length === 0) errors.push("Brak rekordów w Bazie Klientów.");

  return { records, errors, warnings, rowCount: dataRows.length };
}
