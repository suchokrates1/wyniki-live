---
title: Historia meczów
tags: [wyniki, publiczna]
aliases: [Live history, Match history public]
---

# Historia meczów (publiczna)

## Cel

Lista zakończonych meczów z możliwością rozwinięcia statystyk.

## Wejście

**Na żywo** → **Historia** (`#live/history`) albo w szczegółach turnieju → **Historia meczów**.

## Elementy UI

| Kontrolka | Co robi | Efekt |
|-----------|---------|-------|
| Karty meczów | Lista wyników | Z `GET /api/history` lub `…/tournament/{id}/history` |
| **Szczegóły** / **Zwiń** | Rozwinięcie | `GET /api/match-stats/{id}` — asy, DF, winners, 1. serwis % itd. |

## Powiązane

- [[11 - Na żywo - korty]]
- [[15 - Lista turniejów]]
