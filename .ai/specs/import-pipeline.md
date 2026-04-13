# Import Pipeline

## Overview

Trzy osobne sekcje importu danych, każda z własnym parserem i server action.

## Sekcje

| Sekcja | Plik | Tabela DB | Parser |
|--------|------|-----------|--------|
| Sprzedaż | IMPULS .xlsx | `invoices` | `lib/parsers/impuls.ts` |
| Przesyłki | GLS .xlsx | `shipments` | `lib/parsers/gls.ts` |
| Klienci | dowolny .xlsx | `customers` | `lib/parsers/customers.ts` |

## Flow importu

1. Użytkownik wrzuca plik i wybiera okres (miesiąc/rok)
2. `detectColumns` próbuje automatycznie zmapować nagłówki
3. Jeśli brakuje wymaganych kolumn → modal mapowania (`ColumnMappingModal`)
4. Mapowanie zapisywane per (org, file_type) w `column_mappings`
5. Parser tworzy rekordy, `replaceUploadTableRows` zastępuje dane dla danego `upload_id`
6. Po imporcie sprzedaży lub przesyłek → `rebuildWzMatchesAction`

## Ważne szczegóły

- Sprzedaż i Przesyłki wymagają okresu (month/year) → tworzą `monthly_upload`
- Klienci nie wymagają okresu, żyją na poziomie organizacji (UPSERT po `org_id + customer_code`)
- GLS: `wz_numbers text[]` — jedna komórka może zawierać wiele WZ rozdzielonych średnikiem
- IMPULS: `wz_numbers text[]` — jeden rekord na linię produktową faktury
- Szablony do pobrania: `GET /api/templates/[type]`
