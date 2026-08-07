---
title: Lista turniejów
tags: [wyniki, publiczna]
aliases: [Tournaments tab, Historia turniejów]
---

# Lista turniejów

## Cel

Przegląd turniejów (aktywnych i archiwalnych) oraz wejście w drabinkę / plan / historię wybranego.

## Wejście

Główna zakładka **Turnieje** (`#tournaments`). Deep-link: `?tournament_id=` / `?tid=` otwiera szczegóły (sub: drabinka).

## Lista

| Element | Co robi | Efekt |
|---------|---------|-------|
| Karta turnieju (nazwa, lokalizacja, data, liczba zawodników, badge **Aktywny**) | Otwórz szczegóły | Ładuje bracket/schedule/history |
| Pusty stan **Brak turniejów** | — | — |

## Szczegóły turnieju

| Kontrolka | Co robi |
|-----------|---------|
| **Powrót do listy** | `history.back()` |
| Subtab **Drabinka** | Jak [[12 - Drabinka]] dla tego ID |
| Subtab **Plan turnieju** | Terminarz historyczny |
| Subtab **Historia meczów** | Jak [[14 - Historia meczów]] |

Prywatne turnieje: dołącz `?access_key=` / `?key=` — [[18 - Język, motyw, access_key]].

## Powiązane

- [[12 - Drabinka]]
- [[13 - Terminarz]]
