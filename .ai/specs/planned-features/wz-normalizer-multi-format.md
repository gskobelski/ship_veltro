# Fix: wieloformatowe wyciąganie numerów WZ z GLS

## Cel zmiany
Naprawić ekstrakcję numerów WZ z kolumny `Nr WZ` w imporcie GLS, tak aby system poprawnie rozpoznawał realne formaty występujące w plikach użytkownika.

## Problem
Obecny normalizer rozpoznaje tylko format z ukośnikiem przed jednym numerem, np. `WZ/482`.
W praktyce w plikach GLS pojawiają się też warianty:
- wiele numerów po jednym prefiksie, np. `WZ/853/854/855/856`
- zapis ze spacją, np. `WZ 015291`
- zapis bez separatora, np. `WZ12`
- wpis z opisowym sufiksem, np. `WZ/37/42/48 AJ SZ`
- historyczny format z rokiem na końcu, np. `WZ/000482/2025`

## Zakres zmian
- `lib/wz-normalizer.ts`
  - rozszerzyć `extractWzNumbers()` o obsługę wielu segmentów liczbowych po prefiksie `WZ` lub `ZZ`
  - zachować normalizację do formatu `WZ000123`
  - nie traktować końcowego roku jako osobnego numeru WZ
- `lib/__tests__/wz-normalizer.test.ts`
  - dodać testy regresyjne dla formatów występujących w GLS

## Flow użytkownika
1. Użytkownik importuje plik GLS.
2. Parser odczytuje kolumnę `Nr WZ`.
3. `extractWzNumbers()` zwraca pełną listę znormalizowanych numerów WZ z danej komórki.
4. Dalej pipeline importu i zestawienia operują już na kompletnym zbiorze numerów zamiast tylko pierwszego dopasowania.

## Edge case'y
- zduplikowane numery w jednej komórce nadal mają być deduplikowane
- prefiks może być zapisany małymi literami
- dopiski tekstowe po numerach nie mogą blokować ekstrakcji wcześniejszych numerów
- rok na końcu starego formatu nie może zostać zapisany jako dodatkowy WZ
- pusta lub `null` wartość nadal ma zwracać pustą tablicę

## Uwagi wdrożeniowe
- zmiana nie wymaga migracji danych ani zmian w schemacie
- po wdrożeniu poprawa dotyczy nowych importów oraz ewentualnego ponownego przeliczenia danych z istniejących plików
