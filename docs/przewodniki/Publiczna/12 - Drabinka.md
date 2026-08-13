---
title: Drabinka
tags: [wyniki, publiczna]
aliases: [Bracket, Live bracket]
---

# Drabinka

## Cel

Podgląd fazy grupowej i pucharowej aktywnego turnieju.

## Wejście

**Na żywo** → **Drabinka** (`#live/bracket`, alias `#drabinka`).

Także w szczegółach turnieju z listy ([[15 - Lista turniejów]]).

## Elementy UI

| Element | Co robi | Efekt |
|---------|---------|-------|
| Zakładki kategorii (dynamiczne) | Filtr kategorii | Przeładowanie drabinki |
| Tabele grup (W/L, sety, gemy) | Standings | Odczyt; wiersze to osoby **albo pary** `"A / B"` |
| Wyniki meczów grupowych | Scoreboardy | Odczyt; grupa `knockout` **nie** pokazuje tabeli RR |
| Drabinka pucharowa | Drzewo KO | Odczyt; strony to pary w Double |
| Podium (1–3) | Gdy są miejsca | Odczyt |

## Dane

- Aktywny: `GET /api/tournament/bracket`
- Historyczny: `GET /api/tournament/{id}/bracket` (+ `access_key` / `etap` jeśli potrzeba)

## Powiązane

- [[11 - Na żywo - korty]]
- [[15 - Lista turniejów]]
- [[28 - Debel w biurze]]
