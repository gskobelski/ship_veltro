# Design: Repo Workflow, Worktrees, and GitHub Strategy
**Date:** 2026-04-13
**Status:** Proposed

---

## Overview

Ten dokument opisuje docelowy workflow pracy nad `ship_veltro_app`, tak żeby:
- duże zmiany były odizolowane od `main`,
- historia zmian była czytelna i kompletna,
- wdrażanie kolejnych feature'ów było bezpieczne,
- repo mogło zostać bez problemu zsynchronizowane z GitHubem jako głównym źródłem historii i review.

Decyzja dotyczy dwóch poziomów:
- **lokalny workflow developerski** — branch + `git worktree`,
- **zdalne źródło prawdy** — GitHub jako centralne repo historii.

---

## 1. Problem

Obecnie prace odbywają się lokalnie w jednym katalogu roboczym. To działa przy małych zmianach, ale przy większych feature'ach powoduje kilka ryzyk:

- łatwo mieszać prace eksperymentalne z kodem stabilnym,
- trudniej utrzymać czysty `main`,
- trudniej równolegle analizować kod i wdrażać kolejne zadania,
- brak zdalnego repo utrudnia backup historii, code review i śledzenie zmian.

W praktyce oznacza to, że nawet jeśli historia lokalna istnieje, nie ma jeszcze wygodnego i trwałego procesu pracy nad większymi zmianami.

---

## 2. Decision

Przyjmujemy następujący model pracy:

1. `main` pozostaje gałęzią stabilną.
2. Każdy większy feature lub refaktor jest realizowany na osobnym branchu.
3. Branch roboczy powinien być wykonywany w osobnym `git worktree`, a nie przez przełączanie tego samego katalogu.
4. Repo powinno zostać zsynchronizowane z GitHubem i traktowane jako centralne źródło historii.

To oznacza, że lokalna praca nadal odbywa się na maszynie użytkownika, ale w uporządkowanym modelu:
- **lokalnie** izolujemy pracę przez `worktree`,
- **zdalnie** archiwizujemy historię i prowadzimy review przez GitHub.

---

## 3. Recommended Local Workflow

### Branch model

Dla większych zmian używamy schematu:

- `main` — stan stabilny,
- `feature/<nazwa>` — nowe funkcjonalności,
- `fix/<nazwa>` — poprawki błędów,
- `chore/<nazwa>` — porządki techniczne, dokumentacja, tooling.

Przykłady:

- `feature/separate-import-sections`
- `fix/gls-parser-date-handling`
- `chore/github-bootstrap`

### Worktree model

Dla każdego większego branchu tworzymy osobny katalog roboczy przez `git worktree`.

Rekomendowany katalog:

```text
.worktrees/
```

wewnątrz repozytorium, pod warunkiem że katalog jest ignorowany przez git.

Przykład:

```bash
git worktree add .worktrees/feature-separate-imports -b feature/separate-import-sections
```

### Why `.worktrees/`

Ten wariant jest najlepszy dla tego projektu, bo:

- trzyma wszystko blisko repo,
- nie wymaga osobnej globalnej konwencji katalogów,
- ułatwia odnalezienie aktywnych środowisk roboczych,
- pozwala bezpiecznie oddzielić duży feature od bieżącego katalogu.

Warunek:
- `.worktrees/` musi być dodane do `.gitignore`, żeby zawartość nie była przypadkowo śledzona.

---

## 4. Recommended GitHub Strategy

GitHub powinien pełnić rolę:

- centralnego backupu repo,
- miejsca przechowywania pełnej historii commitów,
- źródła pull requestów i review,
- punktu odniesienia dla przyszłych wdrożeń i współpracy.

### Why GitHub should be introduced

Synchronizacja repo z GitHubem rozwiązuje kilka problemów naraz:

- historia zmian nie zostaje wyłącznie na jednym komputerze,
- można robić review większych branchy przed scaleniem,
- łatwiej wrócić do wcześniejszych etapów pracy,
- można w przyszłości podpiąć CI, build checks i release workflow.

### What GitHub does not replace

GitHub nie zastępuje lokalnego `worktree`.

Role są różne:

- `worktree` rozwiązuje **izolację pracy lokalnej**,
- GitHub rozwiązuje **historię, synchronizację i review**.

Najlepszy model to używanie obu naraz.

---

## 5. Default Operating Procedure

Dla każdego większego zadania obowiązuje następująca procedura:

1. Upewnić się, że `main` jest czysty i zawiera ostatni stabilny stan.
2. Utworzyć branch roboczy o czytelnej nazwie.
3. Utworzyć dla niego osobny `worktree` w `.worktrees/`.
4. Implementować zmiany i commitować je w małych, logicznych krokach.
5. Zweryfikować testy i build przed scaleniem.
6. Wypchnąć branch na GitHub.
7. Zrobić review lub self-review przez PR.
8. Scalić do `main` dopiero po weryfikacji.

---

## 6. Merge Policy

`main` nie powinien być miejscem bieżącej implementacji dużych feature'ów.

Do `main` trafiają tylko zmiany:

- zweryfikowane testami,
- spójne ze specem,
- domknięte funkcjonalnie dla danego zakresu.

Nie należy:

- zaczynać dużego feature'a bez osobnego branchu,
- mieszać dokumentacji, eksperymentów i produkcyjnego kodu w jednym nieuporządkowanym ciągu commitów,
- traktować `main` jako bufora roboczego.

---

## 7. Migration Plan for This Repository

Dla `ship_veltro_app` zalecana kolejność jest następująca:

1. Dodać `.worktrees/` do `.gitignore`, jeśli jeszcze tam nie istnieje.
2. Utworzyć branch dla bieżącego feature'a.
3. Utworzyć worktree dla tego branchu.
4. Kontynuować implementację w worktree, nie w katalogu głównym `main`.
5. Skonfigurować zdalne repo GitHub dla projektu.
6. Wypchnąć aktualną historię lokalną do GitHuba.
7. Kontynuować dalsze zmiany już w modelu branch + worktree + GitHub.

---

## 8. Consequences

### Positive

- mniejsze ryzyko przypadkowego psucia `main`,
- czytelniejsza historia commitów,
- łatwiejsze review większych zmian,
- prostsze równoległe utrzymywanie stabilnej i roboczej wersji projektu,
- gotowość pod dalszą automatyzację na GitHubie.

### Trade-offs

- pojawia się dodatkowy krok organizacyjny przed rozpoczęciem pracy,
- trzeba pilnować porządku w branchach i worktree,
- trzeba jednorazowo skonfigurować zdalne repo GitHub.

To są akceptowalne koszty, bo znacząco zmniejszają ryzyko bałaganu przy dalszym rozwoju projektu.

---

## 9. Final Recommendation

Docelowy standard pracy dla tego repo:

- **lokalnie:** branch + `.worktrees/`,
- **zdalnie:** GitHub jako główne źródło historii,
- **operacyjnie:** `main` tylko dla stanu stabilnego,
- **procesowo:** większe zmiany realizowane i weryfikowane poza `main`, a potem scalane.

To jest rekomendowany model dalszego rozwijania `ship_veltro_app`.
