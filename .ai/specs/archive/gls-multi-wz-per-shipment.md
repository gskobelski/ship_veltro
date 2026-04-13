# GLS — wiele numerów WZ na jedną przesyłkę

## Problem
W pliku GLS jedna komórka "Nr WZ" może zawierać kilka numerów WZ rozdzielonych średnikiem.
Aktualny parser bierze tylko pierwszy (przez `normalizeWz`).

## Rozwiązanie
Zmiana schematu: `shipments.wz_number text` → `shipments.wz_numbers text[]`
Parser GLS używa `extractWzNumbers()` — wszystkie WZ z komórki.
Silnik dopasowań (rebuild-matches) dostosowany do tablicy.

## Zmiany

### Migracja (003_shipments_wz_array.sql)
- Dodaj `wz_numbers text[] NOT NULL DEFAULT '{}'`
- Migruj istniejące dane: `wz_numbers = ARRAY[wz_number]` gdzie `wz_number IS NOT NULL`
- Usuń kolumnę `wz_number`
- Dodaj GIN index na `wz_numbers`

### lib/parsers/gls.ts
- Pole `wzNumber` w `GlsRow` zmień na `wzNumbers: string[]`
- Zamień `normalizeWz(...)` na `extractWzNumbers(...)`
- W insercie: `wz_numbers: extractWzNumbers(...)`

### types/index.ts
- `ShipmentRecord.wz_number: string | null` → `wz_numbers: string[]`

### app/actions/rebuild-matches.ts
- `ShipmentRow.wz_number` → `wz_numbers: string[]`
- `buildShipmentCostByWz`: dla każdego shipment podziel koszt przez `wz_numbers.length`
- `buildShipmentParcelsByWz`: podobnie
- `buildWzMatchRows`: iteruj po `shipment.wz_numbers` zamiast `shipment.wz_number`

### components/przesylki/shipments-table.tsx
- Kolumna "Nr WZ": `s.wz_numbers.join(", ")` zamiast `s.wz_number ?? "—"`

## Edge cases
- Pusty wz_numbers → koszt = 0 w wz_matches (nie blokuje importu)
- Duplikaty WZ w jednej komórce → `extractWzNumbers` już deduplikuje (Set)
