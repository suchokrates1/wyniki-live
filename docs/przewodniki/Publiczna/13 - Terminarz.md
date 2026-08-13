---
title: Terminarz
tags: [wyniki, publiczna]
aliases: [Schedule, Plan turnieju publiczny]
---

# Terminarz (publiczny)

## Cel

Podgląd zaplanowanych meczów aktywnego turnieju.

## Wejście

**Na żywo** → **Terminarz** (`#live/schedule`).

## Elementy UI

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| **Odśwież** | Ponowne pobranie | `GET /api/tournament/schedule` |
| Szukaj **Szukaj nazwiska…** | Filtr lokalny | Trafia też w **drugiego** partnera pary (`competitorSearchTokens`) |
| **Po korcie** / **Po kategorii** | Sort / grupowanie | — |
| Zakładki dnia / grupy | Wybór dnia lub grupy | — |
| Karty / tabela meczów | Wyświetlenie | Statusy: Roboczy / Zaplanowany / W trakcie / Zakończony; debel: `"A / B"` z łamaniem po `/` |
| **Uwagi** (`<details>`) | Notatki meczu | — |
| Archiwum minionych dni | Rozwijane | — |

Szczegóły turnieju: `#tournaments/<id>/schedule` (ten sam układ tabeli, bez live-search jeśli mecze nie mają kortu).

## E2E

`14_public_doubles_display.spec.mjs` — payload + zakładka terminarza turnieju z etykietami par.

## Powiązane

- [[26 - Planowanie - terminarz i autoschedule]] (strona biura — edycja)
- [[11 - Na żywo - korty]]
- [[28 - Debel w biurze]]
