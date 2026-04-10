# WZ Matching Engine & Zestawienia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement WZ-based invoice-to-shipment matching engine with aggregated reports and a redesigned navigation for Sprzedaż, Przesyłki, Klienci, and Zestawienia sections.

**Architecture:** Invoices (IMPULS) and shipments (GLS) are imported separately via individual actions. Each carries normalized WZ numbers. After each import, `rebuildWzMatchesAction(orgId)` recomputes the `wz_matches` table by joining invoices and shipments on WZ. Three report tabs query `wz_matches` with GROUP BY aggregations.

**Tech Stack:** Next.js 14, TypeScript, Supabase (PostgreSQL + RLS), xlsx, zod, Tailwind CSS, Vitest (added in Task 3)

---

## File Map

**New files:**
- `supabase/migrations/002_wz_matching.sql` — DB schema additions
- `lib/wz-normalizer.ts` — WZ/ZZ string normalization (pure functions)
- `lib/parsers/column-detector.ts` — auto-detects which file column → which required field
- `lib/templates/excel-templates.ts` — generates empty Excel template buffers
- `app/actions/rebuild-matches.ts` — deletes + reinserts wz_matches for an org
- `app/actions/import-impuls.ts` — parses & inserts invoices, calls rebuild
- `app/actions/import-gls.ts` — parses & inserts shipments, calls rebuild
- `app/actions/import-customers.ts` — upserts customers
- `app/actions/customers-crud.ts` — add / update / delete customer(s)
- `app/actions/column-mapping.ts` — load / save column_mappings per org+type
- `app/api/templates/[type]/route.ts` — GET endpoint to download Excel template
- `app/(dashboard)/[org]/sprzedaz/page.tsx` — Sprzedaż z systemu page
- `app/(dashboard)/[org]/przesylki/page.tsx` — Przesyłki page
- `app/(dashboard)/[org]/klienci/page.tsx` — Klienci page
- `app/(dashboard)/[org]/zestawienia/page.tsx` — Zestawienia page (3 sub-tabs)
- `components/import/import-button.tsx` — upload button + mapping modal trigger
- `components/import/column-mapping-modal.tsx` — modal to map undetected columns
- `components/customers/customers-table.tsx` — table with checkboxes + inline edit
- `components/zestawienia/report-table.tsx` — reusable sortable table for reports

**Modified files:**
- `supabase/migrations/001_initial.sql` — reference only, do NOT modify
- `lib/parsers/impuls.ts` — add `wz_numbers` extraction
- `lib/parsers/gls.ts` — add `wz_number`, `carrier_name`, `carrier_invoice_number`
- `lib/parsers/customers.ts` — simplify to 3 required fields, remove upload_id dep
- `types/index.ts` — add new types: `WzMatch`, `ColumnMapping`, report row types
- `components/layout/sidebar.tsx` — replace 2 nav items with 4 new tabs

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/002_wz_matching.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/002_wz_matching.sql
-- ============================================================
-- WZ Matching Engine — schema additions
-- ============================================================

-- 1. Add wz_numbers array to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS wz_numbers text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS invoices_wz_gin_idx ON invoices USING GIN(wz_numbers);

-- 2. Add WZ + carrier fields to shipments
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS wz_number text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_name text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_invoice_number text;
CREATE INDEX IF NOT EXISTS shipments_wz_idx ON shipments(org_id, wz_number);

-- 3. Make customers.upload_id nullable (customers live at org level)
ALTER TABLE customers ALTER COLUMN upload_id DROP NOT NULL;
-- Unique per (org, customer_code) for UPSERT
ALTER TABLE customers ADD CONSTRAINT IF NOT EXISTS customers_org_code_unique
  UNIQUE (org_id, customer_code);

-- 4. wz_matches — result of pairing invoices ↔ shipments
CREATE TABLE IF NOT EXISTS wz_matches (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wz_number              text NOT NULL,
  invoice_id             uuid REFERENCES invoices(id) ON DELETE SET NULL,
  shipment_id            uuid REFERENCES shipments(id) ON DELETE SET NULL,
  invoice_number         text,
  invoice_date           date,
  customer_code          text,
  customer_name          text,
  net_value              numeric(14,2) NOT NULL DEFAULT 0,
  shipping_cost          numeric(14,2) NOT NULL DEFAULT 0,
  parcels_count          smallint NOT NULL DEFAULT 0,
  carrier_name           text,
  carrier_invoice_number text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wz_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_can_read_wz_matches"
  ON wz_matches FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS wz_matches_org_idx      ON wz_matches(org_id);
CREATE INDEX IF NOT EXISTS wz_matches_wz_idx       ON wz_matches(org_id, wz_number);
CREATE INDEX IF NOT EXISTS wz_matches_invoice_idx  ON wz_matches(org_id, invoice_number);
CREATE INDEX IF NOT EXISTS wz_matches_customer_idx ON wz_matches(org_id, customer_code);

-- 5. column_mappings — saved column mapping per org + file type
CREATE TABLE IF NOT EXISTS column_mappings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_type  text NOT NULL CHECK (file_type IN ('impuls', 'gls', 'customers')),
  mapping    jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, file_type)
);

ALTER TABLE column_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_can_manage_column_mappings"
  ON column_mappings FOR ALL
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
```

- [ ] **Step 2: Apply migration to Supabase**

```bash
# Option A — Supabase CLI (if configured):
npx supabase db push

# Option B — paste into Supabase Dashboard → SQL Editor and run
```

Expected: no errors, tables created.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_wz_matching.sql
git commit -m "feat: add wz_matches, column_mappings tables and schema additions"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add new types to `types/index.ts`**

Append to the end of the file:

```typescript
// ---- WZ Matching ----

export interface WzMatch {
  id: string;
  org_id: string;
  wz_number: string;
  invoice_id: string | null;
  shipment_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  customer_code: string | null;
  customer_name: string | null;
  net_value: number;
  shipping_cost: number;
  parcels_count: number;
  carrier_name: string | null;
  carrier_invoice_number: string | null;
  created_at: string;
}

export interface ColumnMapping {
  id: string;
  org_id: string;
  file_type: "impuls" | "gls" | "customers";
  mapping: Record<string, string>; // { internalField: "fileColumnHeader" }
  updated_at: string;
}

// ---- Report row types (computed from wz_matches) ----

export interface ReportByInvoice {
  invoice_number: string;
  customer_code: string | null;
  customer_name: string | null;
  invoice_date: string | null;
  wartosc_fv: number;
  koszt_transportu: number;
  liczba_paczek: number;
  nr_wz: string; // comma-separated
}

export interface ReportByClient {
  customer_code: string | null;
  customer_name: string | null;
  wartosc_faktur: number;
  koszt_transportu: number;
  liczba_paczek: number;
}

export interface ReportByShipment {
  shipment_number: string | null;
  nr_faktur: string; // comma-separated
  customer_name: string | null;
  wartosc_fv: number;
  koszt_paczki: number;
  carrier_invoice_number: string | null;
}
```

Also update `InvoiceRecord` — add `wz_numbers`:

```typescript
export interface InvoiceRecord {
  id: string;
  org_id: string;
  upload_id: string;
  invoice_number: string;
  invoice_date: string;
  customer_code: string;
  customer_name: string | null;
  net_value: number;
  gross_value: number;
  vat_value: number;
  product_code: string | null;
  product_name: string | null;
  quantity: number | null;
  unit: string | null;
  wz_numbers: string[];   // ← NEW
  raw_data: Record<string, unknown>;
}
```

Also update `ShipmentRecord` — add `wz_number`, `carrier_name`, `carrier_invoice_number`:

```typescript
export interface ShipmentRecord {
  id: string;
  org_id: string;
  upload_id: string;
  shipment_number: string;
  shipment_date: string;
  customer_code: string | null;
  receiver_name: string;
  receiver_city: string | null;
  receiver_postal_code: string | null;
  weight_kg: number | null;
  parcels_count: number;
  cod_amount: number | null;
  declared_value: number | null;
  shipping_cost: number | null;
  service_type: string | null;
  status: string | null;
  reference1: string | null;
  reference2: string | null;
  wz_number: string | null;              // ← NEW
  carrier_name: string | null;           // ← NEW
  carrier_invoice_number: string | null; // ← NEW
  raw_data: Record<string, unknown>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: add WzMatch, ColumnMapping and report row types"
```

---

## Task 3: WZ Normalizer + Vitest Setup

**Files:**
- Create: `lib/wz-normalizer.ts`
- Create: `lib/__tests__/wz-normalizer.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Write failing tests**

Create `lib/__tests__/wz-normalizer.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run tests — verify they FAIL**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../wz-normalizer'`

- [ ] **Step 4: Implement `lib/wz-normalizer.ts`**

```typescript
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
```

- [ ] **Step 5: Run tests — verify they PASS**

```bash
npm test
```

Expected: all 9 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/wz-normalizer.ts lib/__tests__/wz-normalizer.test.ts package.json
git commit -m "feat: add WZ normalizer with Vitest tests"
```

---

## Task 4: Column Detector

**Files:**
- Create: `lib/parsers/column-detector.ts`
- Create: `lib/__tests__/column-detector.test.ts`

The detector maps file headers → required internal fields using aliases, with diacritic normalization.

- [ ] **Step 1: Write failing tests**

Create `lib/__tests__/column-detector.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { detectColumns, REQUIRED_FIELDS } from "../parsers/column-detector";

describe("detectColumns — impuls", () => {
  it("detects standard IMPULS headers", () => {
    const headers = ["Pełny numer faktury", "Data sprzedaży", "Kod płatnika", "Wartość netto", "NIP", "[Nr WZ]"];
    const { mapped, unmapped } = detectColumns("impuls", headers, {});
    expect(mapped.invoice_number).toBe("Pełny numer faktury");
    expect(mapped.invoice_date).toBe("Data sprzedaży");
    expect(mapped.customer_code).toBe("Kod płatnika");
    expect(mapped.net_value).toBe("Wartość netto");
    expect(mapped.wz_numbers).toBe("[Nr WZ]");
    expect(unmapped).toHaveLength(0);
  });

  it("reports unmapped required fields", () => {
    const headers = ["Kolumna A", "Kolumna B"];
    const { unmapped } = detectColumns("impuls", headers, {});
    expect(unmapped).toContain("invoice_number");
    expect(unmapped).toContain("invoice_date");
  });

  it("uses saved mapping to fill gaps", () => {
    const headers = ["MojaNazwaFaktury", "Data sprzedaży", "Kod płatnika", "Wartość netto"];
    const saved = { invoice_number: "MojaNazwaFaktury" };
    const { mapped, unmapped } = detectColumns("impuls", headers, saved);
    expect(mapped.invoice_number).toBe("MojaNazwaFaktury");
    expect(unmapped).not.toContain("invoice_number");
  });
});

describe("detectColumns — gls", () => {
  it("detects standard GLS headers", () => {
    const headers = ["Nr WZ", "Koszt netto", "Nr przesyłki", "Nr klienta", "Data wysyłki", "Nazwa kuriera", "Numer faktury kuriera"];
    const { mapped, unmapped } = detectColumns("gls", headers, {});
    expect(mapped.wz_number).toBe("Nr WZ");
    expect(mapped.shipping_cost).toBe("Koszt netto");
    expect(mapped.shipment_number).toBe("Nr przesyłki");
    expect(unmapped).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

```bash
npm test
```

Expected: FAIL — cannot find column-detector module.

- [ ] **Step 3: Implement `lib/parsers/column-detector.ts`**

```typescript
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
  return h
    .toLowerCase()
    .trim()
    .replace(/[()[\]]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
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
```

- [ ] **Step 4: Run — verify PASS**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parsers/column-detector.ts lib/__tests__/column-detector.test.ts
git commit -m "feat: add column detector for auto-mapping import headers"
```

---

## Task 5: Update IMPULS Parser

**Files:**
- Modify: `lib/parsers/impuls.ts`

Add `wz_numbers` field extraction using `extractWzNumbers` from the normalizer.

- [ ] **Step 1: Add WZ alias and update parser**

In `lib/parsers/impuls.ts`:

1. Add import at top:
```typescript
import { extractWzNumbers } from "@/lib/wz-normalizer";
```

2. Add `wzNumbers` to `COL_ALIASES`:
```typescript
  wzNumbers: [
    "nr wz", "[nr wz]", "numer wz", "wz",
  ],
```

3. Add `wzNumbers` to the `ImpulsRow` interface:
```typescript
  wzNumbers: string | null;
```

4. Inside the record push in `parseImpulsFile`, change the push to include:
```typescript
      wz_numbers: extractWzNumbers(parseString(get("wzNumbers"))),
```

The full updated record push block:
```typescript
    records.push({
      org_id: orgId,
      upload_id: uploadId,
      invoice_number: invoiceNumber,
      invoice_date: parseDate(get("invoiceDate")) ?? new Date().toISOString().slice(0, 10),
      customer_code: parseString(get("customerCode")) ?? "",
      customer_name: parseString(get("customerName")),
      net_value: netValue,
      gross_value: grossValue,
      vat_value: vatValue,
      product_code: parseString(get("productCode")),
      product_name: parseString(get("productName")),
      quantity: parseNumber(get("quantity")),
      unit: parseString(get("unit")),
      wz_numbers: extractWzNumbers(parseString(get("wzNumbers"))),
      raw_data: rawData,
    });
```

- [ ] **Step 2: Add `mapping` parameter to support custom column mapping**

The parser needs to accept an optional column mapping from the user. Update the function signature:

```typescript
export function parseImpulsFile(
  fileBuffer: Buffer,
  uploadId: string,
  orgId: string,
  columnMapping: Record<string, string> = {}
): ParseResult<Omit<InvoiceRecord, "id">> {
```

Inside the function, after `buildColumnMap(headerRow)`, merge saved mapping into fieldIndex.
Add after the `fieldIndex` is built from the columnMap loop:

```typescript
  // Apply explicit user mapping (overrides auto-detection)
  for (const [field, header] of Object.entries(columnMapping)) {
    const idx = headerRow.indexOf(header);
    if (idx !== -1) {
      fieldIndex.set(field as keyof ImpulsRow, idx);
    }
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/parsers/impuls.ts
git commit -m "feat: IMPULS parser extracts wz_numbers and accepts column mapping"
```

---

## Task 6: Update GLS Parser

**Files:**
- Modify: `lib/parsers/gls.ts`

Add `wz_number`, `carrier_name`, `carrier_invoice_number` fields.

- [ ] **Step 1: Add import and new field aliases**

At top of `lib/parsers/gls.ts` add:
```typescript
import { normalizeWz } from "@/lib/wz-normalizer";
```

Add to `COL_ALIASES`:
```typescript
  wzNumber: [
    "nr wz", "[nr wz]", "numer wz", "wz",
  ],
  carrierName: [
    "nazwa kuriera", "kurier", "carrier",
  ],
  carrierInvoiceNumber: [
    "numer faktury kuriera", "faktura kuriera", "nr faktury kuriera",
  ],
```

- [ ] **Step 2: Add new fields to `GlsRow` interface**

```typescript
  wzNumber: string | null;
  carrierName: string | null;
  carrierInvoiceNumber: string | null;
```

- [ ] **Step 3: Update record push in `parseGlsFile`**

Replace the `records.push({...})` block with:

```typescript
    records.push({
      org_id: orgId,
      upload_id: uploadId,
      shipment_number: shipmentNumber,
      shipment_date: date ?? new Date().toISOString().slice(0, 10),
      customer_code: parseString(get("reference1")) ? extractCustomerCode(ref1, ref2) : null,
      receiver_name: parseString(get("receiverName")) ?? "",
      receiver_city: parseString(get("receiverCity")),
      receiver_postal_code: parseString(get("receiverPostalCode")),
      weight_kg: parseNumber(get("weightKg")),
      parcels_count: parsePositiveInt(get("parcelsCount")),
      cod_amount: parseNumber(get("codAmount")),
      declared_value: parseNumber(get("declaredValue")),
      shipping_cost: parseNumber(get("shippingCost")),
      service_type: parseString(get("serviceType")),
      status: parseString(get("status")),
      reference1: ref1,
      reference2: ref2,
      wz_number: normalizeWz(parseString(get("wzNumber"))),
      carrier_name: parseString(get("carrierName")),
      carrier_invoice_number: parseString(get("carrierInvoiceNumber")),
      raw_data: rawData,
    });
```

- [ ] **Step 4: Add `columnMapping` parameter (same pattern as IMPULS)**

Update function signature:
```typescript
export function parseGlsFile(
  fileBuffer: Buffer,
  uploadId: string,
  orgId: string,
  columnMapping: Record<string, string> = {}
): ParseResult<Omit<ShipmentRecord, "id">> {
```

After `fieldIndex` is built from the columnMap, add:
```typescript
  // Apply explicit user mapping
  for (const [field, header] of Object.entries(columnMapping)) {
    const idx = headerRow.indexOf(header);
    if (idx !== -1) {
      fieldIndex.set(field as keyof GlsRow, idx);
    }
  }
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add lib/parsers/gls.ts
git commit -m "feat: GLS parser extracts wz_number and carrier fields"
```

---

## Task 7: Column Mapping Action

**Files:**
- Create: `app/actions/column-mapping.ts`

- [ ] **Step 1: Create the action**

```typescript
// app/actions/column-mapping.ts
"use server";

import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import type { FileType } from "@/lib/parsers/column-detector";

/**
 * Load saved column mapping for this org + file type.
 * Returns empty object if none saved yet.
 */
export async function loadColumnMapping(
  orgId: string,
  fileType: FileType
): Promise<Record<string, string>> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("column_mappings")
    .select("mapping")
    .eq("org_id", orgId)
    .eq("file_type", fileType)
    .single();

  return (data?.mapping as Record<string, string>) ?? {};
}

/**
 * Save (upsert) column mapping for this org + file type.
 */
export async function saveColumnMapping(
  orgId: string,
  fileType: FileType,
  mapping: Record<string, string>
): Promise<void> {
  const service = await createServiceClient();
  await service.from("column_mappings").upsert(
    {
      org_id: orgId,
      file_type: fileType,
      mapping,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,file_type" }
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/actions/column-mapping.ts
git commit -m "feat: add column mapping save/load actions"
```

---

## Task 8: Rebuild WZ Matches Action

**Files:**
- Create: `app/actions/rebuild-matches.ts`
- Create: `lib/__tests__/rebuild-matches.test.ts`

This is the core business logic. It takes all invoices + shipments for an org, pairs them on WZ number, and writes to `wz_matches`.

- [ ] **Step 1: Write unit tests for the pure pairing logic**

Create `lib/__tests__/rebuild-matches.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildWzMatchRows } from "../../app/actions/rebuild-matches";

const ORG = "org-1";

describe("buildWzMatchRows", () => {
  it("pairs invoice and shipment on the same WZ", () => {
    const invoices = [{
      id: "inv-1", invoice_number: "FV001", invoice_date: "2025-03-01",
      customer_code: "KL001", customer_name: "Firma A",
      net_value: 1000, wz_numbers: ["WZ000100"],
    }];
    const shipments = [{
      id: "ship-1", shipment_number: "123456",
      wz_number: "WZ000100", shipping_cost: 25,
      parcels_count: 1, carrier_name: "GLS", carrier_invoice_number: "FGLS001",
    }];
    const rows = buildWzMatchRows(ORG, invoices, shipments);
    expect(rows).toHaveLength(1);
    expect(rows[0].wz_number).toBe("WZ000100");
    expect(rows[0].invoice_id).toBe("inv-1");
    expect(rows[0].shipment_id).toBe("ship-1");
    expect(rows[0].net_value).toBe(1000);
    expect(rows[0].shipping_cost).toBe(25);
  });

  it("creates row with null shipment when WZ has no matching shipment", () => {
    const invoices = [{
      id: "inv-1", invoice_number: "FV001", invoice_date: "2025-03-01",
      customer_code: "KL001", customer_name: "Firma A",
      net_value: 500, wz_numbers: ["WZ000200"],
    }];
    const rows = buildWzMatchRows(ORG, invoices, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].shipment_id).toBeNull();
    expect(rows[0].shipping_cost).toBe(0);
  });

  it("creates row with null invoice when WZ has no matching invoice", () => {
    const shipments = [{
      id: "ship-1", shipment_number: "999",
      wz_number: "WZ000300", shipping_cost: 10,
      parcels_count: 1, carrier_name: "GLS", carrier_invoice_number: null,
    }];
    const rows = buildWzMatchRows(ORG, [], shipments);
    expect(rows).toHaveLength(1);
    expect(rows[0].invoice_id).toBeNull();
    expect(rows[0].net_value).toBe(0);
  });

  it("one invoice with two WZ creates two match rows", () => {
    const invoices = [{
      id: "inv-1", invoice_number: "FV002", invoice_date: "2025-03-05",
      customer_code: "KL001", customer_name: "Firma A",
      net_value: 2000, wz_numbers: ["WZ000400", "WZ000401"],
    }];
    const rows = buildWzMatchRows(ORG, invoices, []);
    expect(rows).toHaveLength(2);
    const wzNrs = rows.map((r) => r.wz_number).sort();
    expect(wzNrs).toEqual(["WZ000400", "WZ000401"]);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

```bash
npm test
```

Expected: FAIL — cannot find `buildWzMatchRows`.

- [ ] **Step 3: Create `app/actions/rebuild-matches.ts`**

```typescript
// app/actions/rebuild-matches.ts
"use server";

import { createServiceClient } from "@/lib/supabase/server";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_code: string;
  customer_name: string | null;
  net_value: number;
  wz_numbers: string[];
}

interface ShipmentRow {
  id: string;
  shipment_number: string;
  wz_number: string | null;
  shipping_cost: number | null;
  parcels_count: number;
  carrier_name: string | null;
  carrier_invoice_number: string | null;
}

interface WzMatchInsert {
  org_id: string;
  wz_number: string;
  invoice_id: string | null;
  shipment_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  customer_code: string | null;
  customer_name: string | null;
  net_value: number;
  shipping_cost: number;
  parcels_count: number;
  carrier_name: string | null;
  carrier_invoice_number: string | null;
}

/**
 * Pure function — builds wz_matches rows from invoices + shipments arrays.
 * Exported for unit testing.
 */
export function buildWzMatchRows(
  orgId: string,
  invoices: InvoiceRow[],
  shipments: ShipmentRow[]
): WzMatchInsert[] {
  // Index shipments by wz_number for O(1) lookup
  const shipmentByWz = new Map<string, ShipmentRow>();
  for (const s of shipments) {
    if (s.wz_number) shipmentByWz.set(s.wz_number, s);
  }

  // Collect all unique WZ numbers from both sources
  const allWz = new Set<string>();
  for (const inv of invoices) {
    for (const wz of inv.wz_numbers) allWz.add(wz);
  }
  for (const s of shipments) {
    if (s.wz_number) allWz.add(s.wz_number);
  }

  // Index invoices by wz (one wz can only belong to one invoice)
  const invoiceByWz = new Map<string, InvoiceRow>();
  for (const inv of invoices) {
    for (const wz of inv.wz_numbers) {
      if (!invoiceByWz.has(wz)) invoiceByWz.set(wz, inv);
    }
  }

  const rows: WzMatchInsert[] = [];

  for (const wz of allWz) {
    const inv = invoiceByWz.get(wz) ?? null;
    const ship = shipmentByWz.get(wz) ?? null;

    rows.push({
      org_id: orgId,
      wz_number: wz,
      invoice_id: inv?.id ?? null,
      shipment_id: ship?.id ?? null,
      invoice_number: inv?.invoice_number ?? null,
      invoice_date: inv?.invoice_date ?? null,
      customer_code: inv?.customer_code ?? null,
      customer_name: inv?.customer_name ?? null,
      net_value: inv?.net_value ?? 0,
      shipping_cost: ship?.shipping_cost ?? 0,
      parcels_count: ship?.parcels_count ?? 0,
      carrier_name: ship?.carrier_name ?? null,
      carrier_invoice_number: ship?.carrier_invoice_number ?? null,
    });
  }

  return rows;
}

/**
 * Server action — rebuilds wz_matches for an org from current DB state.
 * Called after every successful import.
 */
export async function rebuildWzMatchesAction(orgId: string): Promise<void> {
  const service = await createServiceClient();

  // Fetch all invoices for org with wz_numbers
  const { data: invoices, error: invErr } = await service
    .from("invoices")
    .select("id, invoice_number, invoice_date, customer_code, customer_name, net_value, wz_numbers")
    .eq("org_id", orgId)
    .not("wz_numbers", "eq", "{}");

  if (invErr) throw new Error(`Fetch invoices: ${invErr.message}`);

  // Fetch all shipments with wz_number
  const { data: shipments, error: shipErr } = await service
    .from("shipments")
    .select("id, shipment_number, wz_number, shipping_cost, parcels_count, carrier_name, carrier_invoice_number")
    .eq("org_id", orgId)
    .not("wz_number", "is", null);

  if (shipErr) throw new Error(`Fetch shipments: ${shipErr.message}`);

  const rows = buildWzMatchRows(orgId, invoices ?? [], shipments ?? []);

  // Delete existing matches and insert new ones
  const { error: delErr } = await service
    .from("wz_matches")
    .delete()
    .eq("org_id", orgId);

  if (delErr) throw new Error(`Delete wz_matches: ${delErr.message}`);

  if (rows.length === 0) return;

  // Insert in batches of 500
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error: insErr } = await service.from("wz_matches").insert(batch);
    if (insErr) throw new Error(`Insert wz_matches: ${insErr.message}`);
  }
}
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add app/actions/rebuild-matches.ts lib/__tests__/rebuild-matches.test.ts
git commit -m "feat: add WZ matching engine with unit tests"
```

---

## Task 9: Import IMPULS Action

**Files:**
- Create: `app/actions/import-impuls.ts`

- [ ] **Step 1: Create the action**

```typescript
// app/actions/import-impuls.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { parseImpulsFile } from "@/lib/parsers/impuls";
import { detectColumns } from "@/lib/parsers/column-detector";
import { loadColumnMapping, saveColumnMapping } from "@/app/actions/column-mapping";
import { rebuildWzMatchesAction } from "@/app/actions/rebuild-matches";
import * as XLSX from "xlsx";
import { z } from "zod";

const Schema = z.object({
  orgId: z.string().uuid(),
  orgSlug: z.string().min(1),
});

export type ImportResult =
  | { success: true; rowCount: number; warnings: string[] }
  | { success: false; error: string }
  | { needsMapping: true; headers: string[]; unmapped: string[]; savedMapping: Record<string, string> };

export async function importImpulsAction(formData: FormData): Promise<ImportResult> {
  const parsed = Schema.safeParse({
    orgId: formData.get("orgId"),
    orgSlug: formData.get("orgSlug"),
  });
  if (!parsed.success) return { success: false, error: "Nieprawidłowe dane." };
  const { orgId, orgSlug } = parsed.data;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Brak autoryzacji." };

  const { data: member } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();
  if (!member) return { success: false, error: "Brak dostępu." };

  const file = formData.get("file") as File | null;
  if (!file) return { success: false, error: "Brak pliku." };

  const buffer = Buffer.from(await file.arrayBuffer());

  // Read headers only (no full parse yet)
  const wb = XLSX.read(buffer, { type: "buffer", sheetRows: 15 });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  const headerRow = (raw.find((row) => {
    const joined = row.map((c) => String(c ?? "").toLowerCase()).join(" ");
    return joined.includes("faktura") || joined.includes("invoice") || joined.includes("numer");
  }) ?? raw[0] ?? []) as string[];

  const savedMapping = await loadColumnMapping(orgId, "impuls");
  const { mapped, unmapped } = detectColumns("impuls", headerRow, savedMapping);

  // If required fields are missing — return needsMapping so frontend shows modal
  if (unmapped.length > 0) {
    return { needsMapping: true, headers: headerRow.filter(Boolean), unmapped, savedMapping: mapped };
  }

  return await _doImportImpuls(orgId, orgSlug, buffer, mapped, user.id);
}

export async function importImpulsWithMappingAction(
  orgId: string,
  orgSlug: string,
  fileBase64: string,
  columnMapping: Record<string, string>
): Promise<ImportResult> {
  // Save the mapping for future use
  await saveColumnMapping(orgId, "impuls", columnMapping);

  const buffer = Buffer.from(fileBase64, "base64");
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Brak autoryzacji." };

  return await _doImportImpuls(orgId, orgSlug, buffer, columnMapping, user.id);
}

async function _doImportImpuls(
  orgId: string,
  orgSlug: string,
  buffer: Buffer,
  columnMapping: Record<string, string>,
  userId: string
): Promise<ImportResult> {
  const service = await createServiceClient();

  // Create upload record
  const { data: upload } = await service
    .from("monthly_uploads")
    .insert({ org_id: orgId, period_month: new Date().getMonth() + 1, period_year: new Date().getFullYear(), status: "processing", created_by: userId })
    .select("id")
    .single();

  if (!upload) return { success: false, error: "Błąd tworzenia wpisu importu." };

  const result = parseImpulsFile(buffer, upload.id, orgId, columnMapping);

  if (result.errors.length > 0) {
    await service.from("monthly_uploads").update({ status: "error", error_message: result.errors.join("; ") }).eq("id", upload.id);
    return { success: false, error: result.errors.join("\n") };
  }

  for (let i = 0; i < result.records.length; i += 500) {
    const batch = result.records.slice(i, i + 500);
    const { error } = await service.from("invoices").insert(batch);
    if (error) {
      await service.from("monthly_uploads").update({ status: "error", error_message: error.message }).eq("id", upload.id);
      return { success: false, error: `Błąd zapisu: ${error.message}` };
    }
  }

  await service.from("monthly_uploads").update({
    status: "completed",
    processed_at: new Date().toISOString(),
    invoices_row_count: result.records.length,
  }).eq("id", upload.id);

  await rebuildWzMatchesAction(orgId);

  revalidatePath(`/${orgSlug}/sprzedaz`);
  revalidatePath(`/${orgSlug}/zestawienia`);

  return { success: true, rowCount: result.records.length, warnings: result.warnings };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/actions/import-impuls.ts
git commit -m "feat: add import IMPULS server action with column mapping"
```

---

## Task 10: Import GLS Action

**Files:**
- Create: `app/actions/import-gls.ts`

- [ ] **Step 1: Create the action**

```typescript
// app/actions/import-gls.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { parseGlsFile } from "@/lib/parsers/gls";
import { detectColumns } from "@/lib/parsers/column-detector";
import { loadColumnMapping, saveColumnMapping } from "@/app/actions/column-mapping";
import { rebuildWzMatchesAction } from "@/app/actions/rebuild-matches";
import * as XLSX from "xlsx";
import { z } from "zod";

const Schema = z.object({
  orgId: z.string().uuid(),
  orgSlug: z.string().min(1),
});

export type GlsImportResult =
  | { success: true; rowCount: number; warnings: string[] }
  | { success: false; error: string }
  | { needsMapping: true; headers: string[]; unmapped: string[]; savedMapping: Record<string, string> };

export async function importGlsAction(formData: FormData): Promise<GlsImportResult> {
  const parsed = Schema.safeParse({
    orgId: formData.get("orgId"),
    orgSlug: formData.get("orgSlug"),
  });
  if (!parsed.success) return { success: false, error: "Nieprawidłowe dane." };
  const { orgId, orgSlug } = parsed.data;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Brak autoryzacji." };

  const { data: member } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();
  if (!member) return { success: false, error: "Brak dostępu." };

  const file = formData.get("file") as File | null;
  if (!file) return { success: false, error: "Brak pliku." };

  const buffer = Buffer.from(await file.arrayBuffer());

  const wb = XLSX.read(buffer, { type: "buffer", sheetRows: 15 });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  const headerRow = (raw.find((row) => {
    const joined = row.map((c) => String(c ?? "").toLowerCase()).join(" ");
    return joined.includes("przesylki") || joined.includes("przesyłki") || joined.includes("parcel");
  }) ?? raw[0] ?? []) as string[];

  const savedMapping = await loadColumnMapping(orgId, "gls");
  const { mapped, unmapped } = detectColumns("gls", headerRow, savedMapping);

  if (unmapped.length > 0) {
    return { needsMapping: true, headers: headerRow.filter(Boolean), unmapped, savedMapping: mapped };
  }

  return await _doImportGls(orgId, orgSlug, buffer, mapped, user.id);
}

export async function importGlsWithMappingAction(
  orgId: string,
  orgSlug: string,
  fileBase64: string,
  columnMapping: Record<string, string>
): Promise<GlsImportResult> {
  await saveColumnMapping(orgId, "gls", columnMapping);
  const buffer = Buffer.from(fileBase64, "base64");
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Brak autoryzacji." };
  return await _doImportGls(orgId, orgSlug, buffer, columnMapping, user.id);
}

async function _doImportGls(
  orgId: string,
  orgSlug: string,
  buffer: Buffer,
  columnMapping: Record<string, string>,
  userId: string
): Promise<GlsImportResult> {
  const service = await createServiceClient();

  const { data: upload } = await service
    .from("monthly_uploads")
    .insert({ org_id: orgId, period_month: new Date().getMonth() + 1, period_year: new Date().getFullYear(), status: "processing", created_by: userId })
    .select("id")
    .single();

  if (!upload) return { success: false, error: "Błąd tworzenia wpisu importu." };

  const result = parseGlsFile(buffer, upload.id, orgId, columnMapping);

  if (result.errors.length > 0) {
    await service.from("monthly_uploads").update({ status: "error", error_message: result.errors.join("; ") }).eq("id", upload.id);
    return { success: false, error: result.errors.join("\n") };
  }

  for (let i = 0; i < result.records.length; i += 500) {
    const { error } = await service.from("shipments").insert(result.records.slice(i, i + 500));
    if (error) {
      await service.from("monthly_uploads").update({ status: "error", error_message: error.message }).eq("id", upload.id);
      return { success: false, error: `Błąd zapisu: ${error.message}` };
    }
  }

  await service.from("monthly_uploads").update({
    status: "completed",
    processed_at: new Date().toISOString(),
    shipments_row_count: result.records.length,
  }).eq("id", upload.id);

  await rebuildWzMatchesAction(orgId);

  revalidatePath(`/${orgSlug}/przesylki`);
  revalidatePath(`/${orgSlug}/zestawienia`);

  return { success: true, rowCount: result.records.length, warnings: result.warnings };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/actions/import-gls.ts
git commit -m "feat: add import GLS server action with column mapping"
```

---

## Task 11: Customers CRUD + Import Action

**Files:**
- Create: `app/actions/import-customers.ts`
- Create: `app/actions/customers-crud.ts`

- [ ] **Step 1: Create `app/actions/import-customers.ts`**

```typescript
// app/actions/import-customers.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { parseCustomersFile } from "@/lib/parsers/customers";
import { detectColumns } from "@/lib/parsers/column-detector";
import { loadColumnMapping, saveColumnMapping } from "@/app/actions/column-mapping";
import * as XLSX from "xlsx";

export type CustomerImportResult =
  | { success: true; rowCount: number; warnings: string[] }
  | { success: false; error: string }
  | { needsMapping: true; headers: string[]; unmapped: string[]; savedMapping: Record<string, string> };

export async function importCustomersAction(formData: FormData): Promise<CustomerImportResult> {
  const orgId = formData.get("orgId") as string;
  const orgSlug = formData.get("orgSlug") as string;
  if (!orgId || !orgSlug) return { success: false, error: "Nieprawidłowe dane." };

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Brak autoryzacji." };

  const { data: member } = await supabase.from("org_members").select("role").eq("org_id", orgId).eq("user_id", user.id).single();
  if (!member) return { success: false, error: "Brak dostępu." };

  const file = formData.get("file") as File | null;
  if (!file) return { success: false, error: "Brak pliku." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer", sheetRows: 15 });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  const headerRow = (raw.find((row) => {
    const joined = row.map((c) => String(c ?? "").toLowerCase()).join(" ");
    return joined.includes("kod") || joined.includes("nazwa") || joined.includes("klient");
  }) ?? raw[0] ?? []) as string[];

  const savedMapping = await loadColumnMapping(orgId, "customers");
  const { mapped, unmapped } = detectColumns("customers", headerRow, savedMapping);

  if (unmapped.length > 0) {
    return { needsMapping: true, headers: headerRow.filter(Boolean), unmapped, savedMapping: mapped };
  }

  return await _doImportCustomers(orgId, orgSlug, buffer, mapped);
}

export async function importCustomersWithMappingAction(
  orgId: string,
  orgSlug: string,
  fileBase64: string,
  columnMapping: Record<string, string>
): Promise<CustomerImportResult> {
  await saveColumnMapping(orgId, "customers", columnMapping);
  const buffer = Buffer.from(fileBase64, "base64");
  return await _doImportCustomers(orgId, orgSlug, buffer, columnMapping);
}

async function _doImportCustomers(
  orgId: string,
  orgSlug: string,
  buffer: Buffer,
  columnMapping: Record<string, string>
): Promise<CustomerImportResult> {
  const service = await createServiceClient();
  const result = parseCustomersFile(buffer, "", orgId, columnMapping);

  if (result.errors.length > 0) return { success: false, error: result.errors.join("\n") };

  // UPSERT — customers live at org level, no upload_id required
  for (let i = 0; i < result.records.length; i += 500) {
    const batch = result.records.slice(i, i + 500).map((r) => ({ ...r, upload_id: null }));
    const { error } = await service
      .from("customers")
      .upsert(batch, { onConflict: "org_id,customer_code" });
    if (error) return { success: false, error: `Błąd zapisu: ${error.message}` };
  }

  revalidatePath(`/${orgSlug}/klienci`);
  return { success: true, rowCount: result.records.length, warnings: result.warnings };
}
```

- [ ] **Step 2: Create `app/actions/customers-crud.ts`**

```typescript
// app/actions/customers-crud.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

const CustomerSchema = z.object({
  customer_code: z.string().min(1),
  customer_name: z.string().min(1),
  nip: z.string().nullable().optional(),
});

export async function addCustomerAction(
  orgId: string,
  orgSlug: string,
  data: z.infer<typeof CustomerSchema>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Brak autoryzacji." };

  const parsed = CustomerSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: "Nieprawidłowe dane." };

  const service = await createServiceClient();
  const { error } = await service.from("customers").upsert(
    { org_id: orgId, upload_id: null, ...parsed.data, raw_data: {} },
    { onConflict: "org_id,customer_code" }
  );

  if (error) return { success: false, error: error.message };
  revalidatePath(`/${orgSlug}/klienci`);
  return { success: true };
}

export async function updateCustomerAction(
  customerId: string,
  orgSlug: string,
  data: z.infer<typeof CustomerSchema>
): Promise<{ success: boolean; error?: string }> {
  const parsed = CustomerSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: "Nieprawidłowe dane." };

  const service = await createServiceClient();
  const { error } = await service.from("customers").update(parsed.data).eq("id", customerId);

  if (error) return { success: false, error: error.message };
  revalidatePath(`/${orgSlug}/klienci`);
  return { success: true };
}

export async function deleteCustomersAction(
  customerIds: string[],
  orgSlug: string
): Promise<{ success: boolean; error?: string }> {
  if (customerIds.length === 0) return { success: true };

  const service = await createServiceClient();
  const { error } = await service.from("customers").delete().in("id", customerIds);

  if (error) return { success: false, error: error.message };
  revalidatePath(`/${orgSlug}/klienci`);
  return { success: true };
}
```

- [ ] **Step 3: Update `lib/parsers/customers.ts` to accept `columnMapping` parameter**

In `parseCustomersFile` function signature, add:
```typescript
export function parseCustomersFile(
  fileBuffer: Buffer,
  uploadId: string,
  orgId: string,
  columnMapping: Record<string, string> = {}
): ParseResult<Omit<CustomerRecord, "id">> {
```

After building `fieldIndex`, apply explicit mapping:
```typescript
  for (const [field, header] of Object.entries(columnMapping)) {
    const idx = headerRow.indexOf(header);
    if (idx !== -1) fieldIndex.set(field as keyof CustomerRow, idx);
  }
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/actions/import-customers.ts app/actions/customers-crud.ts lib/parsers/customers.ts
git commit -m "feat: add customer import and CRUD actions"
```

---

## Task 12: Excel Templates API Route

**Files:**
- Create: `lib/templates/excel-templates.ts`
- Create: `app/api/templates/[type]/route.ts`

- [ ] **Step 1: Create `lib/templates/excel-templates.ts`**

```typescript
// lib/templates/excel-templates.ts
import * as XLSX from "xlsx";

const TEMPLATES: Record<string, { name: string; headers: string[] }> = {
  impuls: {
    name: "szablon-sprzedaz.xlsx",
    headers: [
      "Pełny numer faktury",
      "Data sprzedaży",
      "Kod płatnika",
      "NIP",
      "Wartość netto",
      "Nr WZ",
    ],
  },
  gls: {
    name: "szablon-przesylki.xlsx",
    headers: [
      "Nr WZ",
      "Koszt netto",
      "Nr przesyłki",
      "Nr klienta",
      "Data wysyłki",
      "Nazwa kuriera",
      "Numer faktury kuriera",
    ],
  },
  customers: {
    name: "szablon-klienci.xlsx",
    headers: ["ID płatnika", "Pełna nazwa klienta", "NIP"],
  },
};

export function generateTemplate(type: string): { buffer: Buffer; filename: string } | null {
  const template = TEMPLATES[type];
  if (!template) return null;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([template.headers]);

  // Style header row bold (xlsx supports limited styling)
  ws["!cols"] = template.headers.map(() => ({ wch: 25 }));

  XLSX.utils.book_append_sheet(wb, ws, "Dane");
  const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

  return { buffer, filename: template.name };
}
```

- [ ] **Step 2: Create `app/api/templates/[type]/route.ts`**

```typescript
// app/api/templates/[type]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateTemplate } from "@/lib/templates/excel-templates";

export async function GET(
  _req: NextRequest,
  { params }: { params: { type: string } }
) {
  const result = generateTemplate(params.type);
  if (!result) {
    return NextResponse.json({ error: "Nieznany typ szablonu" }, { status: 404 });
  }

  return new NextResponse(result.buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    },
  });
}
```

- [ ] **Step 3: Test the endpoint manually**

Start dev server: `npm run dev`

Open in browser: `http://localhost:3000/api/templates/impuls`

Expected: Excel file `szablon-sprzedaz.xlsx` downloads with 6 column headers.

Test also: `/api/templates/gls` and `/api/templates/customers`.

- [ ] **Step 4: Commit**

```bash
git add lib/templates/excel-templates.ts app/api/templates/[type]/route.ts
git commit -m "feat: add Excel template download endpoint"
```

---

## Task 13: Update Sidebar Navigation

**Files:**
- Modify: `components/layout/sidebar.tsx`

- [ ] **Step 1: Replace nav items**

Replace the `navItems` array in `sidebar.tsx`:

```typescript
import { BarChart3, TrendingUp, Truck, Users, FileText, LogOut, Ship } from "lucide-react";

// inside Sidebar component:
  const navItems = [
    { href: `/${orgSlug}/sprzedaz`,    label: "Sprzedaż z systemu", icon: TrendingUp },
    { href: `/${orgSlug}/przesylki`,   label: "Przesyłki",          icon: Truck },
    { href: `/${orgSlug}/klienci`,     label: "Baza Klientów",      icon: Users },
    { href: `/${orgSlug}/zestawienia`, label: "Zestawienia",        icon: BarChart3 },
  ];
```

Remove the old `Upload` and old `BarChart3` imports if no longer used.

- [ ] **Step 2: Start dev server and verify navigation renders**

```bash
npm run dev
```

Open `http://localhost:3000` → login → verify 4 tabs appear in sidebar.

- [ ] **Step 3: Commit**

```bash
git add components/layout/sidebar.tsx
git commit -m "feat: update sidebar with 4 new navigation tabs"
```

---

## Task 14: Column Mapping Modal Component

**Files:**
- Create: `components/import/column-mapping-modal.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/import/column-mapping-modal.tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";

const FIELD_LABELS: Record<string, string> = {
  // IMPULS
  invoice_number: "Numer faktury",
  invoice_date: "Data wystawienia faktury",
  customer_code: "ID płatnika",
  nip: "NIP",
  net_value: "Wartość netto",
  wz_numbers: "Nr WZ",
  // GLS
  wz_number: "Nr WZ",
  shipping_cost: "Koszt netto (przesyłki)",
  shipment_number: "Nr przesyłki",
  shipment_date: "Data wysyłki",
  carrier_name: "Nazwa kuriera",
  carrier_invoice_number: "Nr faktury kuriera",
  // Customers
  customer_name: "Pełna nazwa klienta",
};

interface Props {
  unmapped: string[];
  headers: string[];
  initialMapping: Record<string, string>;
  onConfirm: (mapping: Record<string, string>) => void;
  onClose: () => void;
}

export function ColumnMappingModal({ unmapped, headers, initialMapping, onConfirm, onClose }: Props) {
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);

  function handleSelect(field: string, header: string) {
    setMapping((prev) => ({ ...prev, [field]: header }));
  }

  function handleConfirm() {
    const missingRequired = unmapped.filter((f) => !mapping[f]);
    if (missingRequired.length > 0) {
      alert(`Proszę dopasować wszystkie wymagane pola: ${missingRequired.map((f) => FIELD_LABELS[f] ?? f).join(", ")}`);
      return;
    }
    onConfirm(mapping);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Dopasuj kolumny pliku</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Nie rozpoznano poniższych wymaganych pól. Wybierz odpowiadające kolumny z Twojego pliku.
        </p>
        <div className="space-y-3">
          {unmapped.map((field) => (
            <div key={field} className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700 w-48 shrink-0">
                {FIELD_LABELS[field] ?? field}
              </span>
              <select
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={mapping[field] ?? ""}
                onChange={(e) => handleSelect(field, e.target.value)}
              >
                <option value="">— wybierz kolumnę —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-6 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            Anuluj
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Zapisz i importuj
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/import/column-mapping-modal.tsx
git commit -m "feat: add column mapping modal component"
```

---

## Task 15: Import Button Component

**Files:**
- Create: `components/import/import-button.tsx`

Reusable import button used on all three import pages. Handles file selection, calls the action, shows mapping modal if needed.

- [ ] **Step 1: Create the component**

```tsx
// components/import/import-button.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, Download } from "lucide-react";
import { ColumnMappingModal } from "./column-mapping-modal";

interface Props {
  orgId: string;
  orgSlug: string;
  fileType: "impuls" | "gls" | "customers";
  label: string;
  /** Server action: FormData → ImportResult */
  importAction: (fd: FormData) => Promise<ImportResult>;
  /** Server action: called after mapping confirmed */
  importWithMappingAction: (
    orgId: string,
    orgSlug: string,
    fileBase64: string,
    mapping: Record<string, string>
  ) => Promise<ImportResult>;
}

type ImportResult =
  | { success: true; rowCount: number; warnings: string[] }
  | { success: false; error: string }
  | { needsMapping: true; headers: string[]; unmapped: string[]; savedMapping: Record<string, string> };

export function ImportButton({ orgId, orgSlug, fileType, label, importAction, importWithMappingAction }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [mappingState, setMappingState] = useState<{
    headers: string[];
    unmapped: string[];
    savedMapping: Record<string, string>;
    fileBase64: string;
  } | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus(null);

    startTransition(async () => {
      const fd = new FormData();
      fd.append("orgId", orgId);
      fd.append("orgSlug", orgSlug);
      fd.append("file", file);

      const result = await importAction(fd);

      if ("needsMapping" in result && result.needsMapping) {
        // Read file as base64 for re-use after mapping
        const base64 = await fileToBase64(file);
        setMappingState({
          headers: result.headers,
          unmapped: result.unmapped,
          savedMapping: result.savedMapping,
          fileBase64: base64,
        });
      } else if ("success" in result && result.success) {
        setStatus({ type: "success", message: `Zaimportowano ${result.rowCount} rekordów.` });
      } else if ("success" in result && !result.success) {
        setStatus({ type: "error", message: result.error });
      }
    });

    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  async function handleMappingConfirm(mapping: Record<string, string>) {
    if (!mappingState) return;
    setMappingState(null);

    startTransition(async () => {
      const result = await importWithMappingAction(orgId, orgSlug, mappingState.fileBase64, mapping);
      if ("success" in result && result.success) {
        setStatus({ type: "success", message: `Zaimportowano ${result.rowCount} rekordów.` });
      } else if ("success" in result && !result.success) {
        setStatus({ type: "error", message: result.error });
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        <Upload className="h-4 w-4" />
        {isPending ? "Importowanie..." : label}
      </button>
      <a
        href={`/api/templates/${fileType}`}
        download
        className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Download className="h-4 w-4" />
        Pobierz szablon
      </a>

      {status && (
        <span className={`text-sm ${status.type === "success" ? "text-green-600" : "text-red-600"}`}>
          {status.message}
        </span>
      )}

      {mappingState && (
        <ColumnMappingModal
          unmapped={mappingState.unmapped}
          headers={mappingState.headers}
          initialMapping={mappingState.savedMapping}
          onConfirm={handleMappingConfirm}
          onClose={() => setMappingState(null)}
        />
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add components/import/import-button.tsx
git commit -m "feat: add reusable ImportButton component with mapping modal"
```

---

## Task 16: Sprzedaż z Systemu Page

**Files:**
- Create: `app/(dashboard)/[org]/sprzedaz/page.tsx`

- [ ] **Step 1: Create page**

```tsx
// app/(dashboard)/[org]/sprzedaz/page.tsx
import { createServerClient } from "@/lib/supabase/server";
import { ImportButton } from "@/components/import/import-button";
import { importImpulsAction, importImpulsWithMappingAction } from "@/app/actions/import-impuls";

interface Props { params: { org: string } }

export default async function SprzedazPage({ params }: Props) {
  const supabase = await createServerClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", params.org)
    .single();

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, customer_code, customer_name, net_value, wz_numbers")
    .eq("org_id", org!.id)
    .order("invoice_date", { ascending: false })
    .limit(500);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sprzedaż z systemu</h1>
          <p className="text-gray-500 text-sm mt-1">Faktury z systemu IMPULS</p>
        </div>
        <ImportButton
          orgId={org!.id}
          orgSlug={params.org}
          fileType="impuls"
          label="Importuj sprzedaż"
          importAction={importImpulsAction}
          importWithMappingAction={importImpulsWithMappingAction}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Nr faktury", "Data", "ID klienta", "Nazwa klienta", "Wartość netto", "Nr WZ"].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invoices?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Brak danych. Zaimportuj plik sprzedaży.</td></tr>
            )}
            {invoices?.map((inv) => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                <td className="px-4 py-3">{inv.invoice_date}</td>
                <td className="px-4 py-3">{inv.customer_code}</td>
                <td className="px-4 py-3">{inv.customer_name ?? "—"}</td>
                <td className="px-4 py-3 text-right">{inv.net_value.toFixed(2)} zł</td>
                <td className="px-4 py-3 text-xs font-mono">{inv.wz_numbers?.join(", ") ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify page loads at `/[org]/sprzedaz`**

Open `http://localhost:3000/[your-org-slug]/sprzedaz` — expect empty table + import button.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/[org]/sprzedaz/page.tsx
git commit -m "feat: add Sprzedaz z systemu page"
```

---

## Task 17: Przesyłki Page

**Files:**
- Create: `app/(dashboard)/[org]/przesylki/page.tsx`

- [ ] **Step 1: Create page**

```tsx
// app/(dashboard)/[org]/przesylki/page.tsx
import { createServerClient } from "@/lib/supabase/server";
import { ImportButton } from "@/components/import/import-button";
import { importGlsAction, importGlsWithMappingAction } from "@/app/actions/import-gls";

interface Props { params: { org: string } }

export default async function PrzesylkiPage({ params }: Props) {
  const supabase = await createServerClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", params.org)
    .single();

  const { data: shipments } = await supabase
    .from("shipments")
    .select("id, shipment_number, shipment_date, wz_number, customer_code, shipping_cost, carrier_name, carrier_invoice_number")
    .eq("org_id", org!.id)
    .order("shipment_date", { ascending: false })
    .limit(500);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Przesyłki</h1>
          <p className="text-gray-500 text-sm mt-1">Dane z systemu GLS</p>
        </div>
        <ImportButton
          orgId={org!.id}
          orgSlug={params.org}
          fileType="gls"
          label="Importuj przesyłki"
          importAction={importGlsAction}
          importWithMappingAction={importGlsWithMappingAction}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Nr przesyłki", "Data wysyłki", "Nr WZ", "Nr klienta", "Koszt netto", "Kurier", "Nr faktury kuriera"].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shipments?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Brak danych. Zaimportuj plik przesyłek.</td></tr>
            )}
            {shipments?.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{s.shipment_number}</td>
                <td className="px-4 py-3">{s.shipment_date}</td>
                <td className="px-4 py-3 font-mono text-xs">{s.wz_number ?? "—"}</td>
                <td className="px-4 py-3">{s.customer_code ?? "—"}</td>
                <td className="px-4 py-3 text-right">{s.shipping_cost != null ? `${s.shipping_cost.toFixed(2)} zł` : "—"}</td>
                <td className="px-4 py-3">{s.carrier_name ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{s.carrier_invoice_number ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(dashboard)/[org]/przesylki/page.tsx
git commit -m "feat: add Przesylki page"
```

---

## Task 18: Baza Klientów Page

**Files:**
- Create: `components/customers/customers-table.tsx`
- Create: `app/(dashboard)/[org]/klienci/page.tsx`

- [ ] **Step 1: Create `components/customers/customers-table.tsx`**

```tsx
// components/customers/customers-table.tsx
"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { updateCustomerAction, deleteCustomersAction, addCustomerAction } from "@/app/actions/customers-crud";

interface Customer {
  id: string;
  customer_code: string;
  customer_name: string;
  nip: string | null;
}

interface Props {
  customers: Customer[];
  orgId: string;
  orgSlug: string;
}

export function CustomersTable({ customers, orgId, orgSlug }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Customer>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ customer_code: "", customer_name: "", nip: "" });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const allSelected = customers.length > 0 && selected.size === customers.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(customers.map((c) => c.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function startEdit(c: Customer) {
    setEditingId(c.id);
    setEditValues({ customer_code: c.customer_code, customer_name: c.customer_name, nip: c.nip ?? "" });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  function saveEdit(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await updateCustomerAction(id, orgSlug, {
        customer_code: editValues.customer_code!,
        customer_name: editValues.customer_name!,
        nip: editValues.nip || null,
      });
      if (!res.success) setError(res.error ?? "Błąd zapisu.");
      else setEditingId(null);
    });
  }

  function deleteSelected() {
    if (!confirm(`Usunąć ${selected.size} klientów?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteCustomersAction(Array.from(selected), orgSlug);
      if (!res.success) setError(res.error ?? "Błąd usuwania.");
      else setSelected(new Set());
    });
  }

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const res = await addCustomerAction(orgId, orgSlug, {
        customer_code: newCustomer.customer_code,
        customer_name: newCustomer.customer_name,
        nip: newCustomer.nip || null,
      });
      if (!res.success) setError(res.error ?? "Błąd dodawania.");
      else {
        setShowAddForm(false);
        setNewCustomer({ customer_code: "", customer_name: "", nip: "" });
      }
    });
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Dodaj klienta
        </button>
        {selected.size > 0 && (
          <button
            onClick={deleteSelected}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Usuń zaznaczone ({selected.size})
          </button>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex gap-3 items-end">
          {(["customer_code", "customer_name", "nip"] as const).map((field) => (
            <div key={field} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">
                {field === "customer_code" ? "ID płatnika" : field === "customer_name" ? "Pełna nazwa" : "NIP"}
              </label>
              <input
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={newCustomer[field]}
                onChange={(e) => setNewCustomer((prev) => ({ ...prev, [field]: e.target.value }))}
              />
            </div>
          ))}
          <button onClick={handleAdd} disabled={isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
            Zapisz
          </button>
          <button onClick={() => setShowAddForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
            Anuluj
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 w-10">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              {["ID płatnika", "Pełna nazwa klienta", "NIP", "Akcje"].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Brak klientów. Zaimportuj plik lub dodaj ręcznie.</td></tr>
            )}
            {customers.map((c) => {
              const isEditing = editingId === c.id;
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
                  </td>
                  {isEditing ? (
                    <>
                      <td className="px-4 py-3"><input className="border rounded px-2 py-1 text-sm w-full" value={editValues.customer_code ?? ""} onChange={(e) => setEditValues((p) => ({ ...p, customer_code: e.target.value }))} /></td>
                      <td className="px-4 py-3"><input className="border rounded px-2 py-1 text-sm w-full" value={editValues.customer_name ?? ""} onChange={(e) => setEditValues((p) => ({ ...p, customer_name: e.target.value }))} /></td>
                      <td className="px-4 py-3"><input className="border rounded px-2 py-1 text-sm w-full" value={editValues.nip ?? ""} onChange={(e) => setEditValues((p) => ({ ...p, nip: e.target.value }))} /></td>
                      <td className="px-4 py-3 flex gap-2">
                        <button onClick={() => saveEdit(c.id)} disabled={isPending} className="text-green-600 hover:text-green-700"><Check className="h-4 w-4" /></button>
                        <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-mono text-xs">{c.customer_code}</td>
                      <td className="px-4 py-3">{c.customer_name}</td>
                      <td className="px-4 py-3">{c.nip ?? "—"}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => startEdit(c)} className="text-gray-400 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/(dashboard)/[org]/klienci/page.tsx`**

```tsx
// app/(dashboard)/[org]/klienci/page.tsx
import { createServerClient } from "@/lib/supabase/server";
import { ImportButton } from "@/components/import/import-button";
import { CustomersTable } from "@/components/customers/customers-table";
import { importCustomersAction, importCustomersWithMappingAction } from "@/app/actions/import-customers";

interface Props { params: { org: string } }

export default async function KlienciPage({ params }: Props) {
  const supabase = await createServerClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", params.org)
    .single();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, customer_code, customer_name, nip")
    .eq("org_id", org!.id)
    .order("customer_name");

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Baza Klientów</h1>
          <p className="text-gray-500 text-sm mt-1">{customers?.length ?? 0} klientów</p>
        </div>
        <ImportButton
          orgId={org!.id}
          orgSlug={params.org}
          fileType="customers"
          label="Importuj klientów"
          importAction={importCustomersAction}
          importWithMappingAction={importCustomersWithMappingAction}
        />
      </div>

      <CustomersTable
        customers={customers ?? []}
        orgId={org!.id}
        orgSlug={params.org}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify page loads at `/[org]/klienci`**

Open `http://localhost:3000/[org-slug]/klienci` — expect empty table + Import + Dodaj klienta buttons.

- [ ] **Step 4: Commit**

```bash
git add components/customers/customers-table.tsx app/(dashboard)/[org]/klienci/page.tsx
git commit -m "feat: add Baza Klientow page with CRUD table"
```

---

## Task 19: Zestawienia Page

**Files:**
- Create: `app/(dashboard)/[org]/zestawienia/page.tsx`

- [ ] **Step 1: Create page with 3 sub-tabs**

```tsx
// app/(dashboard)/[org]/zestawienia/page.tsx
import { createServerClient } from "@/lib/supabase/server";
import type { ReportByInvoice, ReportByClient, ReportByShipment } from "@/types";

interface Props { params: { org: string }; searchParams: { tab?: string } }

export default async function ZestawieniaPage({ params, searchParams }: Props) {
  const supabase = await createServerClient();
  const tab = searchParams.tab ?? "faktura";

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", params.org)
    .single();

  const orgId = org!.id;

  let reportByInvoice: ReportByInvoice[] = [];
  let reportByClient: ReportByClient[] = [];
  let reportByShipment: ReportByShipment[] = [];

  if (tab === "faktura") {
    const { data } = await supabase
      .from("wz_matches")
      .select("invoice_number, customer_code, customer_name, invoice_date, net_value, shipping_cost, parcels_count, wz_number")
      .eq("org_id", orgId)
      .not("invoice_number", "is", null);

    // Aggregate in JS (Supabase JS client doesn't support GROUP BY directly)
    const byInvoice = new Map<string, ReportByInvoice>();
    for (const row of data ?? []) {
      const key = row.invoice_number!;
      if (!byInvoice.has(key)) {
        byInvoice.set(key, {
          invoice_number: key,
          customer_code: row.customer_code,
          customer_name: row.customer_name,
          invoice_date: row.invoice_date,
          wartosc_fv: 0,
          koszt_transportu: 0,
          liczba_paczek: 0,
          nr_wz: "",
        });
      }
      const agg = byInvoice.get(key)!;
      agg.wartosc_fv += row.net_value ?? 0;
      agg.koszt_transportu += row.shipping_cost ?? 0;
      agg.liczba_paczek += row.parcels_count ?? 0;
      agg.nr_wz = agg.nr_wz ? `${agg.nr_wz}, ${row.wz_number}` : (row.wz_number ?? "");
    }
    reportByInvoice = Array.from(byInvoice.values());
  }

  if (tab === "klient") {
    const { data } = await supabase
      .from("wz_matches")
      .select("customer_code, customer_name, net_value, shipping_cost, parcels_count")
      .eq("org_id", orgId);

    const byClient = new Map<string, ReportByClient>();
    for (const row of data ?? []) {
      const key = row.customer_code ?? "BRAK";
      if (!byClient.has(key)) {
        byClient.set(key, { customer_code: row.customer_code, customer_name: row.customer_name, wartosc_faktur: 0, koszt_transportu: 0, liczba_paczek: 0 });
      }
      const agg = byClient.get(key)!;
      agg.wartosc_faktur += row.net_value ?? 0;
      agg.koszt_transportu += row.shipping_cost ?? 0;
      agg.liczba_paczek += row.parcels_count ?? 0;
    }
    reportByClient = Array.from(byClient.values());
  }

  if (tab === "przesylka") {
    const { data: matches } = await supabase
      .from("wz_matches")
      .select("shipment_id, invoice_number, customer_name, net_value, shipping_cost, carrier_invoice_number")
      .eq("org_id", orgId)
      .not("shipment_id", "is", null);

    const { data: shipments } = await supabase
      .from("shipments")
      .select("id, shipment_number")
      .eq("org_id", orgId);

    const shipmentNumById = new Map((shipments ?? []).map((s) => [s.id, s.shipment_number]));

    const byShipment = new Map<string, ReportByShipment>();
    for (const row of matches ?? []) {
      const key = row.shipment_id!;
      if (!byShipment.has(key)) {
        byShipment.set(key, {
          shipment_number: shipmentNumById.get(key) ?? null,
          nr_faktur: "",
          customer_name: row.customer_name,
          wartosc_fv: 0,
          koszt_paczki: 0,
          carrier_invoice_number: row.carrier_invoice_number,
        });
      }
      const agg = byShipment.get(key)!;
      agg.wartosc_fv += row.net_value ?? 0;
      agg.koszt_paczki += row.shipping_cost ?? 0;
      if (row.invoice_number && !agg.nr_faktur.includes(row.invoice_number)) {
        agg.nr_faktur = agg.nr_faktur ? `${agg.nr_faktur}, ${row.invoice_number}` : row.invoice_number;
      }
    }
    reportByShipment = Array.from(byShipment.values());
  }

  const tabs = [
    { key: "faktura", label: "Po fakturze" },
    { key: "klient", label: "Po kliencie" },
    { key: "przesylka", label: "Po przesyłce" },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Zestawienia</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              tab === t.key
                ? "bg-white border border-b-white border-gray-200 text-blue-600 -mb-px"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {/* Tab content */}
      {tab === "faktura" && (
        <ReportTable
          headers={["Nr faktury", "Klient", "ID klienta", "Data sprzedaży", "Wartość FV", "Koszt transportu", "Liczba paczek", "Nr WZ"]}
          rows={reportByInvoice.map((r) => [
            r.invoice_number,
            r.customer_name ?? "—",
            r.customer_code ?? "—",
            r.invoice_date ?? "—",
            `${r.wartosc_fv.toFixed(2)} zł`,
            `${r.koszt_transportu.toFixed(2)} zł`,
            r.liczba_paczek,
            r.nr_wz || "—",
          ])}
        />
      )}

      {tab === "klient" && (
        <ReportTable
          headers={["ID klienta", "Nazwa klienta", "Wartość faktur", "Koszt transportu", "Liczba paczek"]}
          rows={reportByClient.map((r) => [
            r.customer_code ?? "—",
            r.customer_name ?? "—",
            `${r.wartosc_faktur.toFixed(2)} zł`,
            `${r.koszt_transportu.toFixed(2)} zł`,
            r.liczba_paczek,
          ])}
        />
      )}

      {tab === "przesylka" && (
        <ReportTable
          headers={["Nr przesyłki", "Nr faktur", "Klient", "Wartość FV", "Koszt paczki", "Nr faktury kuriera"]}
          rows={reportByShipment.map((r) => [
            r.shipment_number ?? "—",
            r.nr_faktur || "—",
            r.customer_name ?? "—",
            `${r.wartosc_fv.toFixed(2)} zł`,
            `${r.koszt_paczki.toFixed(2)} zł`,
            r.carrier_invoice_number ?? "—",
          ])}
        />
      )}
    </div>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        Brak danych. Zaimportuj faktury i przesyłki, aby zobaczyć zestawienie.
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify page loads at `/[org]/zestawienia`**

Open `http://localhost:3000/[org-slug]/zestawienia` — expect 3 tabs, empty state message.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/[org]/zestawienia/page.tsx
git commit -m "feat: add Zestawienia page with 3 report tabs"
```

---

## Task 20: Final Verification

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Full flow test**

1. Start dev server: `npm run dev`
2. Login → verify 4 tabs in sidebar
3. Go to Sprzedaż → click "Importuj sprzedaż" → upload test Excel file
4. If mapping modal appears → map columns → confirm → verify rows appear in table
5. Go to Przesyłki → import GLS file → verify rows appear
6. Go to Zestawienia → verify matches appear in all 3 tabs
7. Go to Baza Klientów → add customer manually → verify appears → edit → verify → delete → verify
8. Download each Excel template → verify it opens in Excel with correct headers

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete WZ matching engine and zestawienia UI"
```

---

## Notes

- The old `/[org]/upload` route and `uploadFilesAction` remain in the codebase but are no longer linked from navigation. They can be removed in a future cleanup sprint.
- The `customers.ts` parser has been updated to accept `columnMapping` but its internal aliases still work for common Polish headers — existing imports without mapping should still work.
- `wz_matches` is rebuilt from scratch on each import. For very large datasets (>50k rows), consider replacing the JS aggregation in `rebuildWzMatchesAction` with a single SQL query run via `supabase.rpc()`.
