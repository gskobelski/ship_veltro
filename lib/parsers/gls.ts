/**
 * GLS Shipment File Parser
 *
 * Parses GLS Excel/CSV exports into normalized ShipmentRecord objects.
 * GLS Poland typically exports with these column names (may vary by config):
 * - Nr przesyłki / Numer przesyłki / Parcel number
 * - Data / Data nadania / Date
 * - Nazwa odbiorcy / Odbiorca
 * - Miasto / City
 * - Kod pocztowy / ZIP
 * - Waga / Weight (kg)
 * - Ilość paczek / Parcels
 * - Pobranie / COD
 * - Wartość / Value
 * - Typ usługi / Service
 * - Referencja 1 / Ref1
 * - Referencja 2 / Ref2
 * - Status
 */

import * as XLSX from "xlsx";
import { extractWzNumbers } from "../wz-normalizer";
import type { ParseResult, ShipmentRecord } from "../../types";

// Column name aliases — GLS exports vary in language and version
const COL_ALIASES: Record<keyof GlsRow, string[]> = {
  shipmentNumber: [
    "nr przesyłki", "numer przesyłki", "parcel number", "nr paczki",
    "shipment number", "nr", "numer", "parcel no",
  ],
  date: [
    "data", "data nadania", "date", "data wysyłki", "ship date",
    "data odbioru", "pickup date",
  ],
  receiverName: [
    "nazwa odbiorcy", "odbiorca", "receiver", "recipient", "nazwa",
    "odbiorca nazwa", "receiver name",
  ],
  receiverCity: [
    "miasto", "city", "miejscowość", "odbiorca miasto",
  ],
  receiverPostalCode: [
    "kod pocztowy", "postal code", "zip", "kod", "postcode",
  ],
  weightKg: [
    "waga", "waga (kg)", "weight", "weight (kg)", "kg",
    "masa", "masa (kg)",
  ],
  parcelsCount: [
    "ilość paczek", "ilosc paczek", "liczba paczek", "parcels",
    "quantity", "paczki", "szt",
  ],
  codAmount: [
    "pobranie", "cod", "kwota pobrania", "cash on delivery",
    "pobranie (zł)", "cod amount",
  ],
  declaredValue: [
    "wartość", "wartosc", "declared value", "wartość towaru",
    "value", "ubezpieczenie",
  ],
  shippingCost: [
    "koszt", "cena", "koszt przesyłki", "shipping cost", "opłata",
    "oplata", "netto", "kwota netto", "price",
  ],
  wzNumbers: [
    "nr wz", "numer wz", "wz", "[nr wz]",
  ],
  serviceType: [
    "typ usługi", "typ uslugi", "usługa", "service", "service type",
    "produkt", "product",
  ],
  reference1: [
    "referencja 1", "ref 1", "ref1", "reference 1", "reference1",
    "numer zamówienia", "order number", "nr zam",
  ],
  customerCode: [
    "kod klienta", "nr klienta", "id klienta", "id platnika", "kod platnika",
    "customer code", "customer id",
  ],
  reference2: [
    "referencja 2", "ref 2", "ref2", "reference 2", "reference2",
    "numer klienta", "customer number",
  ],
  carrierName: [
    "nazwa kuriera", "kurier", "carrier",
  ],
  carrierInvoiceNumber: [
    "numer faktury kuriera", "faktura kuriera", "nr faktury kuriera",
  ],
  status: [
    "status", "stan", "state",
  ],
};

interface GlsRow {
  shipmentNumber: string | null;
  date: string | null;
  receiverName: string | null;
  receiverCity: string | null;
  receiverPostalCode: string | null;
  weightKg: number | null;
  parcelsCount: number;
  codAmount: number | null;
  declaredValue: number | null;
  shippingCost: number | null;
  wzNumbers: string | null;
  serviceType: string | null;
  reference1: string | null;
  reference2: string | null;
  customerCode: string | null;
  carrierName: string | null;
  carrierInvoiceNumber: string | null;
  status: string | null;
}

// Build reverse lookup: normalized alias → field key
function buildColumnMap(headers: string[]): Map<string, keyof GlsRow> {
  const map = new Map<string, keyof GlsRow>();

  for (const [field, aliases] of Object.entries(COL_ALIASES) as [keyof GlsRow, string[]][]) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeHeader(alias);
      for (const header of headers) {
        if (normalizeHeader(header) === normalizedAlias) {
          if (!map.has(header)) {
            map.set(header, field);
          }
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

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[()[\]]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // strip diacritics for fuzzy match
}

function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return val;
  const str = String(val)
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function parseDate(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;

  // XLSX serial date number
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, "0");
      const d = String(date.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(val).trim();

  // DD.MM.YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function parseString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === "" ? null : s;
}

function parsePositiveInt(val: unknown): number {
  const n = parseNumber(val);
  if (n === null || n < 1) return 1;
  return Math.round(n);
}

/**
 * Extract customer code from reference fields.
 * GLS references often contain the customer code / order number.
 * Adjust this regex to match your specific reference format.
 */
function extractCustomerCode(ref1: string | null, ref2: string | null): string | null {
  // Try ref1 first — often contains order number or customer code
  const candidates = [ref1, ref2].filter(Boolean) as string[];
  for (const ref of candidates) {
    // Pattern: starts with digits or known prefix like KL/CU/etc.
    const match = ref.match(/^([A-Z]{0,3}\d{4,})/);
    if (match) return match[1];
  }
  return null;
}

export function parseGlsFile(
  fileBuffer: Buffer,
  uploadId: string,
  orgId: string,
  mapping: Record<string, string> = {}
): ParseResult<Omit<ShipmentRecord, "id">> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const records: Omit<ShipmentRecord, "id">[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: false });
  } catch (e) {
    return {
      records: [],
      errors: [`Nie można odczytać pliku GLS: ${String(e)}`],
      warnings: [],
      rowCount: 0,
    };
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to array-of-arrays to find header row
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });

  if (raw.length < 2) {
    return {
      records: [],
      errors: ["Plik GLS jest pusty lub nie zawiera danych."],
      warnings: [],
      rowCount: 0,
    };
  }

  // Find header row — look for row containing "nr przesyłki" or "parcel"
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const row = raw[i];
    const joined = row.map((c) => String(c ?? "").toLowerCase()).join(" ");
    if (
      joined.includes("przesyłki") ||
      joined.includes("przesylki") ||
      joined.includes("parcel") ||
      joined.includes("shipment")
    ) {
      headerRowIndex = i;
      break;
    }
  }

  const headerRow = raw[headerRowIndex] as string[];
  const columnMap = buildColumnMap(headerRow);
  const fieldIndex = new Map<keyof GlsRow, number>();
  const usedIndexes = new Set<number>();

  for (const [field, headerName] of Object.entries(mapping) as [keyof GlsRow, string][]) {
    const idx = findHeaderIndex(headerRow, headerName);
    if (idx >= 0 && !fieldIndex.has(field) && !usedIndexes.has(idx)) {
      fieldIndex.set(field, idx);
      usedIndexes.add(idx);
    }
  }

  headerRow.forEach((header, idx) => {
    const field = columnMap.get(header);
    if (field && !fieldIndex.has(field) && !usedIndexes.has(idx)) {
      fieldIndex.set(field, idx);
      usedIndexes.add(idx);
    }
  });

  if (columnMap.size === 0 && fieldIndex.size === 0) {
    warnings.push(
      "Nie rozpoznano nagłówków kolumn GLS — dane mogą być niepoprawne. " +
      `Znalezione nagłówki: ${headerRow.join(", ")}`
    );
  }

  const dataRows = raw.slice(headerRowIndex + 1);

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx];
    if (!row || row.every((c) => c === null || c === "")) continue;

    const get = (field: keyof GlsRow): unknown => {
      const idx = fieldIndex.get(field);
      return idx !== undefined ? row[idx] : null;
    };

    const shipmentNumber = parseString(get("shipmentNumber"));
    if (!shipmentNumber) {
      // Skip summary rows or empty rows without shipment number
      continue;
    }

    const date = parseDate(get("date"));
    if (!date) {
      warnings.push(
        `Wiersz ${rowIdx + headerRowIndex + 2}: brak lub nieprawidłowa data dla przesyłki ${shipmentNumber}`
      );
    }

    const ref1 = parseString(get("reference1"));
    const ref2 = parseString(get("reference2"));
    const customerCode = parseString(get("customerCode")) ?? extractCustomerCode(ref1, ref2);

    const rawData: Record<string, unknown> = {};
    headerRow.forEach((h, i) => {
      if (h) rawData[h] = row[i];
    });

    records.push({
      org_id: orgId,
      upload_id: uploadId,
      shipment_number: shipmentNumber,
      shipment_date: date ?? new Date().toISOString().slice(0, 10),
      customer_code: customerCode,
      receiver_name: parseString(get("receiverName")) ?? "",
      receiver_city: parseString(get("receiverCity")),
      receiver_postal_code: parseString(get("receiverPostalCode")),
      weight_kg: parseNumber(get("weightKg")),
      parcels_count: parsePositiveInt(get("parcelsCount")),
      cod_amount: parseNumber(get("codAmount")),
      declared_value: parseNumber(get("declaredValue")),
      shipping_cost: parseNumber(get("shippingCost")),
      wz_numbers: extractWzNumbers(parseString(get("wzNumbers"))),
      service_type: parseString(get("serviceType")),
      carrier_name: parseString(get("carrierName")),
      carrier_invoice_number: parseString(get("carrierInvoiceNumber")),
      status: parseString(get("status")),
      reference1: ref1,
      reference2: ref2,
      raw_data: rawData,
    });
  }

  if (records.length === 0) {
    errors.push("Brak poprawnych rekordów przesyłek w pliku GLS.");
  }

  return {
    records,
    errors,
    warnings,
    rowCount: dataRows.length,
  };
}
