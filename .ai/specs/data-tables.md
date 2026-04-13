# Tabele danych — Selectable Table & Bulk Delete

## Overview

Strony Sprzedaż, Przesyłki i Klienci wyświetlają tabele z zaimportowanymi danymi.
Każda tabela wspiera zaznaczanie wierszy i zbiorcze usuwanie.

## Komponenty

| Komponent | Ścieżka | Opis |
|-----------|---------|------|
| `SelectableTable` | `components/ui/selectable-table.tsx` | Shared — checkboxy, "Usuń zaznaczone (N)" |
| `TablePagination` | `components/ui/table-pagination.tsx` | URL-based, 50 rekordów/stronę |
| `InvoicesTable` | `components/sprzedaz/invoices-table.tsx` | Client wrapper dla faktur |
| `ShipmentsTable` | `components/przesylki/shipments-table.tsx` | Client wrapper dla przesyłek |
| `CustomersTable` | `components/customers/customers-table.tsx` | Client wrapper dla klientów |

## Delete actions

`app/actions/delete-records.ts` — trzy server actions:
- `deleteInvoicesAction(orgId, ids[])`
- `deleteShipmentsAction(orgId, ids[])`
- `deleteCustomersAction(orgId, ids[])`

Każda: weryfikuje org access → `createServiceClient()` → DELETE WHERE id IN (...) AND org_id = ...

## Paginacja

- URL param `?page=N`, domyślnie 0
- `LIMIT 50 OFFSET page * 50` + `count: 'exact'`
- `TablePagination` ukrywa się gdy ≤50 rekordów

## Kolumny

**Sprzedaż:** Nr faktury | Data | ID klienta | Klient | Wartość netto | Nr WZ

**Przesyłki:** Nr WZ | Nr przesyłki | Data | ID klienta | Koszt | Kurier

**Klienci:** ID płatnika | Nazwa klienta | NIP
