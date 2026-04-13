# Selectable Table & Bulk Delete

## Co robimy
Dodajemy checkboxy i akcję "Usuń zaznaczone" na stronach Sprzedaż, Przesyłki i Klienci.
Sprzedaż i Przesyłki otrzymują też tabele z danymi (dotychczas pokazywały tylko formularz importu).

## Jak działa

### Shared komponent `SelectableTable` (`components/ui/selectable-table.tsx`)
- Client component
- Przyjmuje: `headers`, `rows: { id, cells[] }`, `onDeleteSelected(ids[])`, opcjonalnie `isPending`
- Checkbox w nagłówku = zaznacz/odznacz wszystkie
- Przycisk "Usuń zaznaczone (N)" widoczny gdy N > 0
- Po delete: czyści selekcję

### Server Actions (`app/actions/delete-records.ts`)
- `deleteInvoicesAction(orgId, ids[])`
- `deleteShipmentsAction(orgId, ids[])`
- `deleteCustomersAction(orgId, ids[])`
- Każda weryfikuje sesję i przynależność org przed DELETE

### Paginacja
- URL param `?page=N`, domyślnie 0
- 50 rekordów/stronę, LIMIT + OFFSET
- Prev/Next + info "Strona N z M"

## Ekrany / tabele

**Sprzedaż** (tabela `invoices`):
Kolumny: Nr faktury | Data | ID klienta | Wartość netto | Nr WZ

**Przesyłki** (tabela `shipments`):
Kolumny: Nr WZ | Nr przesyłki | Data | ID klienta | Koszt | Kurier

**Klienci** (tabela `customers`):
Kolumny: ID klienta | Nazwa | NIP (bez zmian, tylko refactor + paginacja)

## Flow użytkownika
1. Wchodzi na stronę → widzi tabelę z danymi i paginację
2. Zaznacza checkboxy przy wybranych wierszach
3. Klika "Usuń zaznaczone (N)"
4. Strona odświeża się, zaznaczone rekordy znikają

## Edge cases
- Pusta tabela → komunikat "Brak danych"
- Zaznaczenie wszystkich na stronie nie usuwa rekordów z innych stron
- Delete w toku → przyciski zablokowane (isPending)
- Brak uprawnień → Server Action rzuca błąd, UI pokazuje komunikat

## Pliki do zmiany
| Plik | Akcja |
|---|---|
| `components/ui/selectable-table.tsx` | Nowy |
| `app/actions/delete-records.ts` | Nowy |
| `components/sprzedaz/invoices-table.tsx` | Nowy |
| `components/przesylki/shipments-table.tsx` | Nowy |
| `components/customers/customers-table.tsx` | Refactor |
| `app/(dashboard)/[org]/sprzedaz/page.tsx` | Fetch + paginacja |
| `app/(dashboard)/[org]/przesylki/page.tsx` | Fetch + paginacja |
| `app/(dashboard)/[org]/klienci/page.tsx` | Paginacja |
