/**
 * IMPULS Invoice Parser
 *
 * Parses IMPULS ERP invoice export into normalized InvoiceRecord objects.
 * IMPULS (Polish ERP system) exports typically include:
 * - Nr faktury / Invoice number
 * - Data wystawienia / Invoice date
 * - Kod klienta / Customer code
 * - Nazwa klienta / Customer name
 * - Kod towaru / Product code
 * - Nazwa towaru / Product name
 * - Ilość / Quantity
 * - Jednostka / Unit
 * - Wartość netto / Net value
 * - Wartość brutto / Gross value
 * - VAT
 */

import * as XLSX from "xlsx";
import { extractWzNumbers } from "../wz-normalizer";
import type { ParseResult, InvoiceRecord } from "../../types";

const COL_ALIASES: Record<keyof ImpulsRow, string[]> = {
  invoiceNumber: [
    "nr faktury", "numer faktury", "faktura", "invoice number", "invoice no",
    "dokument", "nr dokumentu", "numer dokumentu",
    "pełny numer faktury", "pelny numer faktury", "pełna nazwa faktury",
  ],
  invoiceDate: [
    "data wystawienia", "data faktury", "data", "invoice date", "date",
    "data sprzedaży", "data sprzedazy",
  ],
  customerCode: [
    "kod klienta", "kod kontrahenta", "klient", "customer code", "kontrahent kod",
    "indeks klienta", "symbol klienta", "kod płatnika", "kod platnika",
  ],
  customerName: [
    "nazwa klienta", "kontrahent", "klient nazwa", "customer name", "nazwa",
    "nazwa płatnika", "nazwa platnika",
  ],
  productCode: [
    "kod towaru", "indeks", "symbol", "kod produktu", "product code",
    "kod artykułu", "sku",
  ],
  productName: [
    "nazwa towaru", "opis", "produkt", "product name", "artykuł",
    "nazwa artykułu", "towar",
  ],
  quantity: [
    "ilość", "ilosc", "qty", "quantity", "il.", "szt",
  ],
  unit: [
    "jednostka", "jm", "unit", "j.m.", "miara",
  ],
  netValue: [
    "wartość netto", "wartosc netto", "netto", "net value", "net amount",
    "kwota netto",
  ],
  wzNumbers: [
    "nr wz", "[nr wz]", "numer wz", "wz",
  ],
  grossValue: [
    "wartość brutto", "wartosc brutto", "brutto", "gross value", "gross amount",
    "kwota brutto",
  ],
  vatValue: [
    "vat", "wartość vat", "wartosc vat", "kwota vat", "podatek vat",
    "tax amount",
  ],
};

interface ImpulsRow {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  customerCode: string | null;
  customerName: string | null;
  productCode: string | null;
  productName: string | null;
  quantity: number | null;
  unit: string | null;
  netValue: number | null;
  wzNumbers: string | null;
  grossValue: number | null;
  vatValue: number | null;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildColumnMap(headers: string[]): Map<string, keyof ImpulsRow> {
  const map = new Map<string, keyof ImpulsRow>();
  for (const [field, aliases] of Object.entries(COL_ALIASES) as [keyof ImpulsRow, string[]][]) {
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

function parseDate(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const str = String(val).trim();
  const dmyMatch = str.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === "" ? null : s;
}

export function parseImpulsFile(
  fileBuffer: Buffer,
  uploadId: string,
  orgId: string,
  mapping: Record<string, string> = {}
): ParseResult<Omit<InvoiceRecord, "id">> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const records: Omit<InvoiceRecord, "id">[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: false });
  } catch (e) {
    return { records: [], errors: [`Nie można odczytać pliku IMPULS: ${String(e)}`], warnings: [], rowCount: 0 };
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });

  if (raw.length < 2) {
    return { records: [], errors: ["Plik IMPULS jest pusty."], warnings: [], rowCount: 0 };
  }

  // Find header row
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const row = raw[i];
    const joined = row.map((c) => String(c ?? "").toLowerCase()).join(" ");
    if (joined.includes("faktura") || joined.includes("invoice")) {
      headerRowIndex = i;
      break;
    }
  }

  const headerRow = raw[headerRowIndex] as string[];
  const fieldIndex = new Map<keyof ImpulsRow, number>();
  const usedIndexes = new Set<number>();

  for (const [field, headerName] of Object.entries(mapping) as [keyof ImpulsRow, string][]) {
    const idx = findHeaderIndex(headerRow, headerName);
    if (idx >= 0 && !fieldIndex.has(field) && !usedIndexes.has(idx)) {
      fieldIndex.set(field, idx);
      usedIndexes.add(idx);
    }
  }

  const columnMap = buildColumnMap(headerRow);
  headerRow.forEach((h, idx) => {
    const field = columnMap.get(h);
    if (field && !fieldIndex.has(field) && !usedIndexes.has(idx)) {
      fieldIndex.set(field, idx);
      usedIndexes.add(idx);
    }
  });

  if (fieldIndex.size === 0) {
    warnings.push(`Nie rozpoznano nagłówków IMPULS. Nagłówki: ${headerRow.join(", ")}`);
  }

  const dataRows = raw.slice(headerRowIndex + 1);

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx];
    if (!row || row.every((c) => c === null || c === "")) continue;

    const get = (field: keyof ImpulsRow): unknown => {
      const idx = fieldIndex.get(field);
      return idx !== undefined ? row[idx] : null;
    };

    const invoiceNumber = parseString(get("invoiceNumber"));
    if (!invoiceNumber) continue; // skip summary/total rows

    const netValue = parseNumber(get("netValue")) ?? 0;
    const grossValue = parseNumber(get("grossValue")) ?? netValue * 1.23;
    const vatValue = parseNumber(get("vatValue")) ?? grossValue - netValue;

    const rawData: Record<string, unknown> = {};
    headerRow.forEach((h, i) => { if (h) rawData[h] = row[i]; });

    records.push({
      org_id: orgId,
      upload_id: uploadId,
      invoice_number: invoiceNumber,
      invoice_date: parseDate(get("invoiceDate")) ?? new Date().toISOString().slice(0, 10),
      customer_code: parseString(get("customerCode")) ?? "",
      customer_name: parseString(get("customerName")),
      net_value: netValue,
      wz_numbers: extractWzNumbers(parseString(get("wzNumbers"))),
      gross_value: grossValue,
      vat_value: vatValue,
      product_code: parseString(get("productCode")),
      product_name: parseString(get("productName")),
      quantity: parseNumber(get("quantity")),
      unit: parseString(get("unit")),
      raw_data: rawData,
    });
  }

  if (records.length === 0) errors.push("Brak rekordów faktur w pliku IMPULS.");

  return { records, errors, warnings, rowCount: dataRows.length };
}
