// lib/parsers/column-detector.ts

export type FileType = "impuls" | "gls" | "customers";

// Internal field name → list of accepted column header aliases (lowercased, no diacritics)
const FIELD_ALIASES: Record<FileType, Record<string, string[]>> = {
  impuls: {
    invoice_number: [
      "pelny numer faktury", "numer faktury", "nr faktury", "faktura",
      "dokument", "nr dokumentu",
    ],
    invoice_date: [
      "data sprzedazy", "data wystawienia", "data faktury", "2025", "2024", "2026",
    ],
    customer_code: [
      "kod platnika", "kod kontrahenta", "id platnika", "kod klienta",
      "platnik", "kontrahent kod",
    ],
    nip: ["nip", "[nip]"],
    net_value: ["wartosc netto", "netto", "kwota netto"],
    wz_numbers: ["nr wz", "[nr wz]", "numer wz", "wz"],
  },
  gls: {
    wz_number: ["nr wz", "numer wz", "wz", "[nr wz]"],
    shipping_cost: ["koszt netto", "koszt przesylki", "cena netto", "kwota netto", "netto"],
    shipment_number: ["nr przesylki", "numer przesylki", "przesylka", "shipment"],
    customer_code: ["nr klienta", "kod klienta", "id klienta", "klient"],
    shipment_date: ["data wysylki", "data nadania", "data"],
    carrier_name: ["nazwa kuriera", "kurier", "carrier"],
    carrier_invoice_number: ["numer faktury kuriera", "faktura kuriera", "nr faktury kuriera"],
  },
  customers: {
    customer_code: ["id platnika", "kod platnika", "kod klienta", "id klienta", "kod kontrahenta"],
    customer_name: ["pelna nazwa klienta", "nazwa klienta", "nazwa", "pelna nazwa", "firma"],
    nip: ["nip"],
  },
};

// Which fields are required (import will warn if missing)
export const REQUIRED_FIELDS: Record<FileType, string[]> = {
  impuls: ["invoice_number", "invoice_date", "customer_code", "net_value"],
  gls: ["wz_number", "shipping_cost", "shipment_number", "shipment_date"],
  customers: ["customer_code", "customer_name"],
};

function normalizeHeader(h: string): string {
  // Map of Polish/special characters to ASCII equivalents
  const charMap: Record<string, string> = {
    'ą': 'a',
    'ć': 'c',
    'ę': 'e',
    'ł': 'l',
    'ń': 'n',
    'ó': 'o',
    'ś': 's',
    'ź': 'z',
    'ż': 'z',
  };

  let result = h
    .toLowerCase()
    .trim()
    .replace(/[()[\]]/g, "");

  for (const [from, to] of Object.entries(charMap)) {
    result = result.replace(new RegExp(from, 'g'), to);
  }

  return result.replace(/\s+/g, " ");
}

export interface DetectResult {
  /** internal field → original file header */
  mapped: Record<string, string>;
  /** list of required internal field names that couldn't be mapped */
  unmapped: string[];
}

/**
 * Attempts to map file headers to internal field names.
 * Falls back to `savedMapping` for fields not auto-detected.
 */
export function detectColumns(
  fileType: FileType,
  headers: string[],
  savedMapping: Record<string, string>
): DetectResult {
  const aliases = FIELD_ALIASES[fileType];
  const required = REQUIRED_FIELDS[fileType];
  const mapped: Record<string, string> = {};

  const normalizedHeaders = headers.map((h) => ({ original: h, normalized: normalizeHeader(h) }));

  for (const [field, fieldAliases] of Object.entries(aliases)) {
    // 1. Try auto-detect
    for (const alias of fieldAliases) {
      const found = normalizedHeaders.find((h) => h.normalized === alias);
      if (found) {
        mapped[field] = found.original;
        break;
      }
    }
    // 2. Fall back to saved mapping
    if (!mapped[field] && savedMapping[field] && headers.includes(savedMapping[field])) {
      mapped[field] = savedMapping[field];
    }
  }

  const unmapped = required.filter((f) => !mapped[f]);
  return { mapped, unmapped };
}
