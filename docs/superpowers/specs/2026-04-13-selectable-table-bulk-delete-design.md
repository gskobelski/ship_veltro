# Selectable Table & Bulk Delete — Design Spec

**Date:** 2026-04-13  
**Scope:** Sprzedaż, Przesyłki, Klienci — tabele z checkboxami i akcją "Usuń zaznaczone"

---

## Problem

Strony Sprzedaż i Przesyłki nie wyświetlają zaimportowanych danych. Klienci ma prostą tabelę bez możliwości selekcji. Użytkownik nie może usuwać rekordów zbiorowo.

---

## Rozwiązanie

Wspólny komponent `SelectableTable` obsługujący zaznaczanie wierszy i bulk delete, używany na wszystkich trzech stronach. Sprzedaż i Przesyłki otrzymują pełne tabele z danymi oraz paginację.

---

## Architektura

### `components/ui/selectable-table.tsx` (nowy, client component)

Generyczny komponent przyjmujący:
- `headers: string[]` — nagłówki kolumn (bez kolumny checkbox — dodawana automatycznie)
- `rows: Array<{ id: string; cells: React.ReactNode[] }>` — wiersze z id i zawartością komórek
- `onDeleteSelected: (ids: string[]) => Promise<void>` — callback wywoływany po kliknięciu "Usuń zaznaczone"
- `isPending?: boolean` — wyłącza przyciski podczas operacji

Zachowanie:
- Checkbox w nagłówku zaznacza/odznacza wszystkie widoczne wiersze
- Checkbox per wiersz toggle selekcji
- Przycisk `Usuń zaznaczone (N)` pojawia się gdy N > 0
- Po wywołaniu `onDeleteSelected` czyści selekcję

### `app/actions/delete-records.ts` (nowy)

Trzy Server Actions, każda waliduje `org_id` z sesji przed usunięciem:

```
deleteInvoicesAction(orgId: string, ids: string[]) → void
deleteShipmentsAction(orgId: string, ids: string[]) → void
deleteCustomersAction(orgId: string, ids: string[]) → void
```

Każda wykonuje `DELETE FROM <table> WHERE id = ANY(ids) AND org_id = orgId`.

### Paginacja

- URL param `?page=N` (domyślnie 0)
- 50 rekordów na stronę (`LIMIT 50 OFFSET page * 50`)
- Fetch zwraca też `count` (Supabase `{ count: 'exact' }`)
- Komponent paginacji: przyciski Poprzednia / Następna, info "Strona N z M"
- Paginacja renderowana w Server Component, przekazuje dane do SelectableTable

---

## Zmiany per strona

### Sprzedaż (`app/(dashboard)/[org]/sprzedaz/page.tsx`)

Nowe: fetch `invoices` z paginacją. Kolumny:
| Nr faktury | Data | ID klienta | Wartość netto | Nr WZ |

Wrapper client component (`InvoicesTable`) wywołuje `deleteInvoicesAction` i `router.refresh()`.

### Przesyłki (`app/(dashboard)/[org]/przesylki/page.tsx`)

Nowe: fetch `shipments` z paginacją. Kolumny:
| Nr WZ | Nr przesyłki | Data | ID klienta | Koszt | Kurier |

Wrapper client component (`ShipmentsTable`) wywołuje `deleteShipmentsAction` i `router.refresh()`.

### Klienci (`app/(dashboard)/[org]/klienci/page.tsx`)

Zmiana: dodać paginację do istniejącego fetcha (było `LIMIT 200`). Kolumny bez zmian:
| ID klienta | Nazwa | NIP |

`CustomersTable` zastąpiony przez `CustomersTableClient` używający `SelectableTable` + `deleteCustomersAction`.

---

## Bezpieczeństwo

Każda Server Action:
1. Pobiera sesję z Supabase (`auth.getUser()`)
2. Weryfikuje że `org_id` należy do zalogowanego użytkownika (`org_members`)
3. Dopiero wtedy wykonuje DELETE

Brak weryfikacji = rzuca błąd, nie wykonuje DELETE.

---

## Komponenty do stworzenia / zmodyfikowania

| Plik | Akcja |
|---|---|
| `components/ui/selectable-table.tsx` | Nowy |
| `app/actions/delete-records.ts` | Nowy |
| `components/sprzedaz/invoices-table.tsx` | Nowy (client wrapper) |
| `components/przesylki/shipments-table.tsx` | Nowy (client wrapper) |
| `components/customers/customers-table.tsx` | Refactor → używa SelectableTable |
| `app/(dashboard)/[org]/sprzedaz/page.tsx` | Dodać fetch + paginacja |
| `app/(dashboard)/[org]/przesylki/page.tsx` | Dodać fetch + paginacja |
| `app/(dashboard)/[org]/klienci/page.tsx` | Dodać paginację |
