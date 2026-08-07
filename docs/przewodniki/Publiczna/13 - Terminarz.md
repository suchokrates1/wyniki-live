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
| Szukaj **Szukaj nazwiska…** | Filtr lokalny | — |
| **Po korcie** / **Po kategorii** | Sort / grupowanie | — |
| Zakładki dnia / grupy | Wybór dnia lub grupy | — |
| Karty / tabela meczów | Wyświetlenie | Statusy: Roboczy / Zaplanowany / W trakcie / Zakończony |
| **Uwagi** (`<details>`) | Notatki meczu | — |
| Archiwum minionych dni | Rozwijane | — |

## Powiązane

- [[26 - Planowanie - terminarz i autoschedule]] (strona biura — edycja)
- [[11 - Na żywo - korty]]
