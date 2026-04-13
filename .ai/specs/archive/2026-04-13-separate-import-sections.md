# Separate Import Sections

## Goal

Rozbić dotychczasowy zbiorczy upload na osobne sekcje:
- `Sprzedaż`
- `Przesyłki`
- `Klienci`
- `Zestawienia`

## Scope

- osobne strony dashboardowe dla każdego obszaru,
- osobne server actions dla importów,
- mapowanie kolumn z zapisem per organizacja i typ pliku,
- generator szablonów Excel,
- przebudowa `wz_matches` po imporcie sprzedaży i przesyłek,
- raporty czytane z `wz_matches`,
- tabela klientów,
- nowy sidebar bez promowania legacy `/upload`.

## User Flow

1. Użytkownik wchodzi do wybranej sekcji.
2. Pobiera szablon albo wrzuca plik.
3. System próbuje automatycznie rozpoznać kolumny.
4. Jeśli czegoś brakuje, pokazuje modal mapowania.
5. Po potwierdzeniu importuje dane i zapisuje mapowanie.
6. Dla sprzedaży i przesyłek przebudowuje `wz_matches`.
7. `Zestawienia` od razu pokazują nowy stan danych.

## Edge Cases

- plik z niestandardowymi nagłówkami,
- wiele WZ na jednej fakturze,
- jedna przesyłka obejmująca wiele WZ,
- brak pary invoice/shipment dla części WZ,
- klienci importowani na poziomie organizacji, bez obowiązkowego `monthly_upload`.

## Implementation Notes

- `main` zostaje stabilny,
- implementacja odbywa się na osobnym branchu/worktree,
- zmiana kończy się osobnym PR.
