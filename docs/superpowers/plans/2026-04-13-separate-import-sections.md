# Separate Import Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy combined upload flow with separate Sprzedaz, Przesylki, Klienci, and Zestawienia sections, including WZ matching rebuilds and saved column mappings.

**Architecture:** Keep the existing Next.js dashboard shell and Supabase data model, but split imports into dedicated server actions and dedicated pages. Add a thin shared import layer for header detection and column mappings, rebuild `wz_matches` after invoice and shipment imports, and render reports directly from `wz_matches`.

**Tech Stack:** Next.js 14, TypeScript, Supabase, xlsx, zod, Tailwind CSS, Vitest

---

## File Map

**Create:**
- `app/actions/column-mapping.ts`
- `app/actions/rebuild-matches.ts`
- `app/actions/import-impuls.ts`
- `app/actions/import-gls.ts`
- `app/actions/import-customers.ts`
- `app/api/templates/[type]/route.ts`
- `lib/templates/excel-templates.ts`
- `lib/reports/wz-matches.ts`
- `lib/__tests__/rebuild-matches.test.ts`
- `lib/__tests__/excel-templates.test.ts`
- `components/import/import-button.tsx`
- `components/import/column-mapping-modal.tsx`
- `components/customers/customers-table.tsx`
- `components/zestawienia/report-table.tsx`
- `app/(dashboard)/[org]/sprzedaz/page.tsx`
- `app/(dashboard)/[org]/przesylki/page.tsx`
- `app/(dashboard)/[org]/klienci/page.tsx`
- `app/(dashboard)/[org]/zestawienia/page.tsx`

**Modify:**
- `lib/parsers/impuls.ts`
- `lib/parsers/gls.ts`
- `lib/parsers/customers.ts`
- `types/index.ts`
- `components/layout/sidebar.tsx`
- `app/actions/upload.ts`

## Task 1: Parser support for explicit column mappings

**Files:**
- Modify: `lib/parsers/impuls.ts`
- Modify: `lib/parsers/gls.ts`
- Modify: `lib/parsers/customers.ts`
- Test: `lib/__tests__/column-detector.test.ts`

- [ ] Add optional `mapping: Record<string, string>` support to all three parsers so they can resolve internal fields from user-confirmed headers instead of aliases only.
- [ ] Extend parser behavior to extract `wz_numbers` in IMPULS and `wz_number`, `carrier_name`, `carrier_invoice_number` in GLS using the mapped headers.
- [ ] Keep parser return shape unchanged so existing callers remain compatible during migration.
- [ ] Add or update tests to prove mapped headers override alias detection and that WZ fields are extracted correctly.
- [ ] Run `npm test -- --runInBand` and confirm parser-related tests pass.
- [ ] Commit with `feat: support parser column mappings for separate imports`.

## Task 2: Pure WZ match builder with tests

**Files:**
- Create: `lib/__tests__/rebuild-matches.test.ts`
- Create: `app/actions/rebuild-matches.ts`

- [ ] Write failing unit tests for pure WZ match rebuilding logic covering invoice-only WZ, shipment-only WZ, one invoice with many WZ values, and one shipment cost split across many WZ values.
- [ ] Run `npm test -- lib/__tests__/rebuild-matches.test.ts` and verify the tests fail for missing implementation.
- [ ] Implement a pure helper inside `app/actions/rebuild-matches.ts` that builds `wz_matches` rows from invoice and shipment arrays.
- [ ] Add the server action that loads org data from Supabase, deletes old rows, inserts rebuilt rows in batches, and can be reused by import actions.
- [ ] Re-run `npm test -- lib/__tests__/rebuild-matches.test.ts` and confirm green.
- [ ] Commit with `feat: add rebuild matches action and tests`.

## Task 3: Column mapping persistence and template generation

**Files:**
- Create: `app/actions/column-mapping.ts`
- Create: `lib/templates/excel-templates.ts`
- Create: `app/api/templates/[type]/route.ts`
- Create: `lib/__tests__/excel-templates.test.ts`

- [ ] Write failing tests for Excel template generation that verify expected headers for `impuls`, `gls`, and `customers`.
- [ ] Run `npm test -- lib/__tests__/excel-templates.test.ts` and confirm failure.
- [ ] Implement template builders returning workbook buffers with the required headers for each import type.
- [ ] Implement the API route that streams the selected template as an `.xlsx` file and validates the `type` param.
- [ ] Implement `loadColumnMapping` and `saveColumnMapping` server actions with org membership checks and per-`file_type` upsert behavior.
- [ ] Re-run the template tests and full test suite.
- [ ] Commit with `feat: add column mapping actions and excel templates`.

## Task 4: Dedicated import actions

**Files:**
- Create: `app/actions/import-impuls.ts`
- Create: `app/actions/import-gls.ts`
- Create: `app/actions/import-customers.ts`
- Modify: `app/actions/upload.ts`

- [ ] Extract shared auth and membership validation patterns from the legacy upload action without breaking current code during the transition.
- [ ] Implement `importImpulsAction` to read headers, apply detected or saved mapping, return missing-field metadata when mapping is incomplete, parse the file, insert invoices, and trigger `rebuildWzMatchesAction`.
- [ ] Implement `importGlsAction` with the same flow for shipments, including rebuild.
- [ ] Implement `importCustomersAction` to upsert customers at org scope and save mapping without touching `monthly_uploads`.
- [ ] Leave `uploadFilesAction` as legacy but stop evolving it; only adjust shared helpers if required to keep type safety and reuse clean.
- [ ] Run `npm test`.
- [ ] Commit with `feat: add dedicated import actions`.

## Task 5: Import UI components

**Files:**
- Create: `components/import/import-button.tsx`
- Create: `components/import/column-mapping-modal.tsx`

- [ ] Build a reusable import button/form component that accepts `fileType`, action callback wiring, labels, and template download URL.
- [ ] Build the column mapping modal that lists unmapped required fields and allows selecting source headers for each internal field before retrying import.
- [ ] Ensure the import component handles the two-phase response: immediate success or “mapping required”.
- [ ] Keep the UI aligned with the existing Tailwind patterns in the repo instead of introducing a new design system.
- [ ] Run `npm test`.
- [ ] Commit with `feat: add reusable import ui with column mapping modal`.

## Task 6: Section pages and navigation

**Files:**
- Create: `app/(dashboard)/[org]/sprzedaz/page.tsx`
- Create: `app/(dashboard)/[org]/przesylki/page.tsx`
- Create: `app/(dashboard)/[org]/klienci/page.tsx`
- Modify: `components/layout/sidebar.tsx`

- [ ] Add the new sidebar entries for `Sprzedaz`, `Przesylki`, `Klienci`, and `Zestawienia`, and remove the legacy combined upload link from the main navigation.
- [ ] Build the `Sprzedaz` page around the shared import component and add any lightweight summary text needed for operators.
- [ ] Build the `Przesylki` page with the GLS-specific import configuration.
- [ ] Build the `Klienci` page with customer import controls and space for CRUD table rendering.
- [ ] Verify all new routes render without type or import errors by running `npm run build`.
- [ ] Commit with `feat: add separate import section pages`.

## Task 7: Customers table and report queries

**Files:**
- Create: `components/customers/customers-table.tsx`
- Create: `lib/reports/wz-matches.ts`
- Create: `components/zestawienia/report-table.tsx`
- Create: `app/(dashboard)/[org]/zestawienia/page.tsx`

- [ ] Implement server-side query helpers for the three `wz_matches` report groupings: by invoice, by customer, and by shipment.
- [ ] Build a reusable report table component that renders column definitions and plain sortable rows without overcomplicating client state.
- [ ] Build the `Zestawienia` page with 3 tabs or segmented views backed by the report helpers.
- [ ] Build a basic customers table for the `Klienci` page showing current rows from Supabase and leaving room for later inline edits if the CRUD scope must be narrowed.
- [ ] Run `npm run build` and `npm test`.
- [ ] Commit with `feat: add reports and customer section ui`.

## Task 8: Final migration cleanup and verification

**Files:**
- Modify: `app/actions/upload.ts`
- Modify: `components/layout/sidebar.tsx`
- Review: `app/(dashboard)/[org]/upload/page.tsx`

- [ ] Confirm the legacy combined upload page is no longer discoverable from main navigation.
- [ ] Ensure all new pages revalidate the right routes after successful imports.
- [ ] Run `npm test` and `npm run build` as final verification.
- [ ] Manually inspect route coverage in code for `/${orgSlug}/sprzedaz`, `/${orgSlug}/przesylki`, `/${orgSlug}/klienci`, and `/${orgSlug}/zestawienia`.
- [ ] Commit with `chore: finalize separate import workflow`.
