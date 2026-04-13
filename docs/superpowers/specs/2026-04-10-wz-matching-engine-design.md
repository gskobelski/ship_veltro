# Design: WZ Matching Engine & Zestawienia
**Date:** 2026-04-10
**Status:** Implemented

**Implementation note (2026-04-13):**
Zakres opisany w tym dokumencie został wdrożony jako docelowy flow operacyjny dla osobnych sekcji
`Sprzedaż`, `Przesyłki`, `Klienci` i `Zestawienia`. Ten dokument pozostaje trwałą specyfikacją
wdrożonego rozwiązania. Roboczy opis z `planned-features` został po merge wycofany z obiegu i nie jest
dokumentacją docelową.

---

## Overview

Implementacja brakującej logiki backendowej z workflow n8n:
- Normalizacja numerów WZ/ZZ
- Parowanie faktur IMPULS ↔ przesyłek GLS po numerze WZ
- Trzy widoki zestawień (po fakturze, po kliencie, po przesyłce)
- Baza Klientów z CRUD
- Mapowanie kolumn przy imporcie z zapamiętywaniem
- Szablony Excel do pobrania

---

## 1. Nawigacja i struktura stron

Nowe zakładki w menu bocznym (zastępują obecny dashboard):

```
/[org]/sprzedaz        → Sprzedaż z systemu (IMPULS)
/[org]/przesylki       → Przesyłki (GLS)
/[org]/klienci         → Baza Klientów
/[org]/zestawienia     → Zestawienia
```

Dotychczasowa strona zbiorczego uploadu `/${org}/upload` przestaje być głównym flow operacyjnym.
Może zostać technicznie w repo jako legacy entrypoint w okresie przejściowym, ale:
- znika z głównej nawigacji,
- nie dostaje nowych funkcji,
- docelowy import odbywa się wyłącznie przez osobne sekcje biznesowe.

Każda strona z importem zawiera:
- Przycisk **Importuj** (upload pliku Excel/CSV)
- Przycisk **Pobierz szablon** (pusty Excel z wymaganymi kolumnami)

---

## 2. Zmiany w bazie danych

### Migracja `002_wz_matching.sql`

**Modyfikacje istniejących tabel:**

```sql
-- invoices: tablica numerów WZ (jedna faktura może mieć wiele WZ)
ALTER TABLE invoices ADD COLUMN wz_numbers text[] DEFAULT '{}';

-- shipments: numer WZ + dane kuriera
ALTER TABLE shipments ADD COLUMN wz_number text;
ALTER TABLE shipments ADD COLUMN carrier_name text;
ALTER TABLE shipments ADD COLUMN carrier_invoice_number text;

CREATE INDEX shipments_wz_idx ON shipments(org_id, wz_number);
CREATE INDEX invoices_wz_idx ON invoices USING GIN(wz_numbers);
```

**Nowe tabele:**

```sql
-- Wynik parowania IMPULS ↔ GLS (przeliczane po każdym imporcie)
CREATE TABLE wz_matches (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wz_number               text NOT NULL,
  invoice_id              uuid REFERENCES invoices(id) ON DELETE SET NULL,
  shipment_id             uuid REFERENCES shipments(id) ON DELETE SET NULL,
  invoice_number          text,
  invoice_date            date,
  customer_code           text,
  customer_name           text,
  net_value               numeric(14,2) NOT NULL DEFAULT 0,
  shipping_cost           numeric(14,2) NOT NULL DEFAULT 0,
  parcels_count           smallint NOT NULL DEFAULT 0,
  carrier_name            text,
  carrier_invoice_number  text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wz_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_can_read_wz_matches"
  ON wz_matches FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE INDEX wz_matches_org_idx      ON wz_matches(org_id);
CREATE INDEX wz_matches_wz_idx       ON wz_matches(org_id, wz_number);
CREATE INDEX wz_matches_invoice_idx  ON wz_matches(org_id, invoice_number);
CREATE INDEX wz_matches_customer_idx ON wz_matches(org_id, customer_code);

-- Zapamiętane mapowania kolumn per organizacja i typ pliku
CREATE TABLE column_mappings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_type   text NOT NULL CHECK (file_type IN ('impuls', 'gls', 'customers')),
  mapping     jsonb NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, file_type)
);

ALTER TABLE column_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_can_manage_column_mappings"
  ON column_mappings FOR ALL
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
```

**Modyfikacja tabeli `customers`:**
```sql
-- upload_id staje się nullable (klienci żyją na poziomie org, nie uploadu)
ALTER TABLE customers ALTER COLUMN upload_id DROP NOT NULL;
-- unikalność po (org_id, customer_code) dla UPSERT
ALTER TABLE customers ADD CONSTRAINT customers_org_code_unique UNIQUE (org_id, customer_code);
```

---

## 3. Wymagane kolumny per typ pliku

### Sprzedaż z systemu (IMPULS)
| Pole wewnętrzne | Etykieta dla użytkownika | Wymagane |
|---|---|---|
| `invoice_number` | Numer faktury | ✅ |
| `invoice_date` | Data wystawienia faktury | ✅ |
| `customer_code` | ID płatnika | ✅ |
| `nip` | NIP | ❌ |
| `net_value` | Wartość netto | ✅ |
| `wz_numbers` | Nr WZ | ❌ |

### Przesyłki (GLS)
| Pole wewnętrzne | Etykieta dla użytkownika | Wymagane |
|---|---|---|
| `wz_number` | Nr WZ | ✅ |
| `shipping_cost` | Koszt netto (przesyłki) | ✅ |
| `shipment_number` | Nr przesyłki | ✅ |
| `customer_code` | Nr klienta | ❌ |
| `shipment_date` | Data wysyłki | ✅ |
| `carrier_name` | Nazwa kuriera | ❌ |
| `carrier_invoice_number` | Nr faktury kuriera | ❌ |

### Baza Klientów
| Pole wewnętrzne | Etykieta dla użytkownika | Wymagane |
|---|---|---|
| `customer_code` | ID płatnika | ✅ |
| `customer_name` | Pełna nazwa klienta | ✅ |
| `nip` | NIP | ❌ |

---

## 4. Flow importu z mapowaniem kolumn

```
1. Użytkownik wybiera plik (Excel/CSV)
2. Server Action: odczytaj nagłówki arkusza (bez pełnego parsowania)
3. Sprawdź column_mappings dla tego org_id + file_type
4. Auto-dopasowanie: normalizuj nagłówki + poprzednie mapowanie
5. Jeśli wszystkie wymagane pola dopasowane → od razu importuj
6. Jeśli brakuje dopasowania → zwróć listę niedopasowanych pól
7. Frontend pokazuje modal mappingu (dropdown per brakujące pole)
8. Użytkownik potwierdza → zapisz mapowanie w column_mappings → importuj
9. Po udanym imporcie → uruchom rebuildWzMatches(orgId)
```

### Normalizacja WZ
```
"WZ/000482/2025" → "WZ000482"
"ZZ/000201/..." → "ZZ000201"
"WZ/482"        → "WZ000482"
```
Regex: `/\b(WZ|ZZ)\s*\/\s*(\d{1,6})\b/` → prefiks + 6-cyfrowy numer z dopełnieniem zerami.

---

## 5. Silnik parowania (`rebuildWzMatches`)

Server Action wywoływany po każdym udanym imporcie IMPULS lub GLS.

```
1. DELETE FROM wz_matches WHERE org_id = ?
2. Zbierz wszystkie WZ z invoices.wz_numbers (unnest)
3. Zbierz wszystkie WZ z shipments.wz_number
4. UNION → lista unikalnych WZ dla org
5. Dla każdego WZ:
   a. Znajdź powiązane faktury (invoice.wz_numbers @> ARRAY[wz])
   b. Znajdź powiązaną przesyłkę (shipment.wz_number = wz)
   c. Podziel koszt przesyłki równo między wszystkie WZ tej przesyłki
   d. Wstaw rekord do wz_matches
6. Przypadki brzegowe:
   - WZ bez faktury → invoice_id = null, net_value = 0
   - WZ bez przesyłki → shipment_id = null, shipping_cost = 0
```

Operacja wykonywana jednym zapytaniem SQL (INSERT INTO wz_matches SELECT ...) dla wydajności.

---

## 6. Zestawienia

Zakładka `/[org]/zestawienia` z 3 sub-tabami. Dane z `wz_matches`.

### Po fakturze
Grupowanie: `invoice_number`

Kolumny: NR FAKTURY | KLIENT | DATA SPRZEDAŻY | WARTOŚĆ FV | KOSZT TRANSPORTU | LICZBA PACZEK | NR WZ

```sql
SELECT
  invoice_number,
  customer_code,
  customer_name,
  invoice_date,
  SUM(net_value)      AS wartosc_fv,
  SUM(shipping_cost)  AS koszt_transportu,
  SUM(parcels_count)  AS liczba_paczek,
  string_agg(wz_number, ', ') AS nr_wz
FROM wz_matches
WHERE org_id = ?
GROUP BY invoice_number, customer_code, customer_name, invoice_date
```

### Po kliencie
Grupowanie: `customer_code`

Kolumny: ID KLIENTA | NAZWA KLIENTA | WARTOŚĆ FAKTUR | KOSZT TRANSPORTU | LICZBA PACZEK

```sql
SELECT
  customer_code,
  customer_name,
  SUM(net_value)      AS wartosc_faktur,
  SUM(shipping_cost)  AS koszt_transportu,
  SUM(parcels_count)  AS liczba_paczek
FROM wz_matches
WHERE org_id = ?
GROUP BY customer_code, customer_name
```

### Po przesyłce
Grupowanie: `shipment_id`

Kolumny: NR PRZESYŁKI | NR FAKTURY | KLIENT | WARTOŚĆ FV | KOSZT PACZKI | NR FAKTURY KURIERA

```sql
SELECT
  s.shipment_number,
  string_agg(DISTINCT wm.invoice_number, ', ') AS nr_faktur,
  wm.customer_name,
  SUM(wm.net_value)     AS wartosc_fv,
  SUM(wm.shipping_cost) AS koszt_paczki,
  wm.carrier_invoice_number
FROM wz_matches wm
LEFT JOIN shipments s ON s.id = wm.shipment_id
WHERE wm.org_id = ?
GROUP BY s.shipment_number, wm.customer_name, wm.carrier_invoice_number
```

Każda tabela z przyciskiem **Eksportuj do Excel**.

---

## 7. Baza Klientów

Zakładka `/[org]/klienci`:

- **Import** (Excel/CSV z mapowaniem) — UPSERT po `customer_code`
- **Pobierz szablon**
- **Dodaj klienta** — modal z polami: ID płatnika, Pełna nazwa, NIP
- **Tabela z checkboxami** — zaznaczanie wielu wierszy
- **Akcje na zaznaczonych:** Usuń zaznaczone (z potwierdzeniem)
- **Edycja inline** — klik w ikonkę ✏️ otwiera edytowalny wiersz

Dane na poziomie organizacji (brak `upload_id`). UPSERT przy imporcie po `(org_id, customer_code)`.

---

## 8. Szablony Excel

Pliki generowane dynamicznie (lub statyczne) z pustymi nagłówkami:

- `szablon-sprzedaz.xlsx` — kolumny: Numer faktury, Data wystawienia faktury, ID płatnika, NIP, Wartość netto, Nr WZ
- `szablon-przesylki.xlsx` — kolumny: Nr WZ, Koszt netto, Nr przesyłki, Nr klienta, Data wysyłki, Nazwa kuriera, Nr faktury kuriera
- `szablon-klienci.xlsx` — kolumny: ID płatnika, Pełna nazwa klienta, NIP

Generowane przez bibliotekę `xlsx` (już jest w projekcie).

---

## 9. Moduły objęte implementacją

```
app/(dashboard)/[org]/sprzedaz/page.tsx
app/(dashboard)/[org]/przesylki/page.tsx
app/(dashboard)/[org]/klienci/page.tsx
app/(dashboard)/[org]/zestawienia/page.tsx
app/actions/import-impuls.ts
app/actions/import-gls.ts
app/actions/import-customers.ts
app/actions/customers-crud.ts
app/actions/rebuild-matches.ts
app/actions/column-mapping.ts
app/api/templates/[type]/route.ts
lib/parsers/column-detector.ts
lib/wz-normalizer.ts
components/import/column-mapping-modal.tsx
components/import/import-button.tsx
components/customers/customers-table.tsx
components/zestawienia/report-table.tsx
supabase/migrations/002_wz_matching.sql
```

Lista ma charakter projektowy i pokazuje docelowe obszary implementacji. Finalny podział plików mógł
zostać dopasowany do istniejącej struktury repo podczas wdrożenia.

---

## 10. Poza zakresem (nie implementujemy teraz)

- Zwroty/reklamacje (ZWROT-REKLAM z n8n) — osobny sprint
- Powiadomienia email po imporcie
- Harmonogram automatycznych importów
- Filtrowanie zestawień po okresie czasu
